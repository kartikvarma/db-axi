import { describe, it, expect } from 'vitest';
import { AxiError } from 'axi-sdk-js';
import { validateReadOnly } from './validate.js';
import { redactString } from './redact.js';
import { inferEngine, resolveConnection } from './connection.js';
import { buildPostgresClientConfig } from './engines/postgres.js';
import { buildMysqlConnectionOptions } from './engines/mysql.js';

function expectReadOnly(sql: string) {
  try {
    validateReadOnly(sql);
    throw new Error(`expected READ_ONLY for: ${sql}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('expected READ_ONLY')) throw err;
    expect(err).toBeInstanceOf(AxiError);
    expect(err).toMatchObject({ code: 'READ_ONLY' });
  }
}

describe('validateReadOnly — write / lock / bypass attempts', () => {
  it('rejects Postgres SELECT INTO', () => {
    expectReadOnly('SELECT * INTO new_users FROM users');
    expectReadOnly('SELECT id INTO TEMP TABLE t FROM users');
  });

  it('rejects MySQL INTO OUTFILE / DUMPFILE', () => {
    expectReadOnly("SELECT * FROM users INTO OUTFILE '/tmp/users.csv'");
    expectReadOnly("SELECT * FROM users INTO DUMPFILE '/tmp/users.bin'");
  });

  it('rejects SELECT FOR UPDATE / SHARE locking clauses', () => {
    expectReadOnly('SELECT * FROM users FOR UPDATE');
    expectReadOnly('SELECT * FROM users FOR SHARE');
    expectReadOnly('SELECT * FROM users FOR NO KEY UPDATE');
    expectReadOnly('SELECT * FROM users FOR KEY SHARE');
  });

  it('rejects MySQL executable comments that can hide writes', () => {
    expectReadOnly('SELECT 1 /*!; DROP TABLE users */');
    expectReadOnly('/*!50000 INSERT INTO users VALUES (1) */');
  });

  it('rejects null bytes in SQL', () => {
    expectReadOnly('SELECT 1\0');
  });

  it('still allows SELECT when INTO appears only inside a string', () => {
    expect(() => validateReadOnly("SELECT 'INTO OUTFILE' AS note")).not.toThrow();
  });

  it('allows a leading hash comment before SELECT (MySQL)', () => {
    expect(() => validateReadOnly('# peek\nSELECT 1')).not.toThrow();
  });
});

describe('redactString — credentials must never appear in output', () => {
  it('redacts URL userinfo passwords', () => {
    expect(redactString('postgresql://app:s3cret@localhost:5432/db')).toBe(
      'postgresql://app:***@localhost:5432/db',
    );
  });

  it('redacts password query parameters', () => {
    const out = redactString('postgresql://app@localhost/db?password=s3cret&sslmode=require');
    expect(out).not.toContain('s3cret');
    expect(out).toMatch(/password=\*\*\*/i);
  });

  it('redacts jdbc-style password keys', () => {
    const out = redactString('user=app;password=s3cret;host=localhost');
    expect(out).not.toContain('s3cret');
  });
});

describe('connection — engine validation and SSL allowlist', () => {
  it('maps engine aliases and rejects unknown engines', () => {
    expect(inferEngine({ engineFlag: 'postgresql', installed: ['postgres'] })).toBe('postgres');
    expect(inferEngine({ engineFlag: 'mariadb', installed: ['mysql'] })).toBe('mysql');
    expect(() => inferEngine({ engineFlag: 'sqlite', installed: ['postgres'] })).toThrow(
      /unknown engine/i,
    );
  });

  it('honors sslmode from the URL and does not pass through options=', () => {
    const { config } = resolveConnection(
      [],
      { url: 'postgresql://app:pw@db.example:5432/appdb?sslmode=require&options=-cdefault_transaction_read_only%3Doff' },
      {},
      ['postgres'],
    );
    expect(config.sslMode).toBe('require');
    expect(config.host).toBe('db.example');
  });

  it('honors --sslmode over the URL', () => {
    const { config } = resolveConnection(
      [],
      {
        url: 'postgresql://app:pw@localhost:5432/appdb?sslmode=disable',
        sslmode: 'verify-full',
      },
      {},
      ['postgres'],
    );
    expect(config.sslMode).toBe('verify-full');
  });

  it('reads PGSSLMODE when no flag or URL sslmode is set', () => {
    const { config } = resolveConnection(
      [],
      { url: 'postgresql://app:pw@localhost:5432/appdb' },
      { PGSSLMODE: 'require' },
      ['postgres'],
    );
    expect(config.sslMode).toBe('require');
  });
});

describe('driver session config — defense in depth', () => {
  const base = {
    engine: 'postgres' as const,
    host: 'db.example',
    port: 5432,
    user: 'app',
    password: 'pw',
    database: 'appdb',
  };

  it('postgres: read-only session, timeouts, and SSL require', () => {
    const cfg = buildPostgresClientConfig({ ...base, sslMode: 'require' });
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
    expect(cfg.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(cfg.statement_timeout).toBeGreaterThan(0);
    expect(String(cfg.options)).toMatch(/default_transaction_read_only=on/);
    expect(String(cfg.options)).not.toMatch(/read_only=off/);
  });

  it('postgres: verify-full enables certificate validation', () => {
    const cfg = buildPostgresClientConfig({ ...base, sslMode: 'verify-full' });
    expect(cfg.ssl).toMatchObject({ rejectUnauthorized: true });
  });

  it('mysql: disables multi-statements and honors SSL require', () => {
    const cfg = buildMysqlConnectionOptions({
      engine: 'mysql',
      host: 'db.example',
      port: 3306,
      user: 'app',
      password: 'pw',
      database: 'appdb',
      sslMode: 'require',
    });
    expect(cfg.multipleStatements).toBe(false);
    expect(cfg.ssl).toMatchObject({ rejectUnauthorized: false });
    expect(cfg.connectTimeout).toBeGreaterThan(0);
  });
});
