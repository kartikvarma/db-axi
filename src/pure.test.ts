import { describe, it, expect } from 'vitest';
import { parseFlags, parseLimit } from './args.js';
import { renderCell, buildRows } from './format.js';
import { validateReadOnly, isReadOnlySql } from './validate.js';
import { redactString, redactValue } from './redact.js';
import { inferEngine, resolveConnection } from './connection.js';
import { readEnv } from './env.js';
import { quoteIdent, stripTrailingSemi, isExplainSql } from './engines/types.js';
import { COMMAND_HELP, TOP_LEVEL_HELP } from './help.js';

describe('args', () => {
  it('parses flags and positionals', () => {
    const { flags, positionals } = parseFlags(['query', '--limit', '10', 'select 1']);
    expect(flags.limit).toBe('10');
    expect(positionals).toEqual(['query', 'select 1']);
  });
  it('clamps limits', () => {
    expect(parseLimit('500', 10, 100)).toBe(100);
    expect(parseLimit('invalid', 10, 100)).toBe(10);
  });
});

describe('format', () => {
  it('renders cells', () => {
    expect(renderCell(null)).toBe('');
    expect(renderCell(123)).toBe(123);
    expect(renderCell(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(renderCell('a'.repeat(300))).toContain('…');
  });
  it('respects --full', () => {
    const long = 'a'.repeat(300);
    expect(renderCell(long, true)).toBe(long);
  });
  it('builds rows', () => {
    const out = buildRows(['id', 'name'], [[1, 'alice']], false);
    expect(out.rows).toEqual([{ id: 1, name: 'alice' }]);
  });
  it('falls back for unsafe column names', () => {
    const out = buildRows(['a-b', 'x'], [[1, 2]], false);
    expect(out.columns).toEqual([
      { index: 0, name: 'a-b' },
      { index: 1, name: 'x' },
    ]);
    expect(out.rows).toEqual([{ c0: 1, c1: 2 }]);
  });
});

describe('validate', () => {
  it('allows SELECT', () => {
    expect(() => validateReadOnly('SELECT 1')).not.toThrow();
    expect(() => validateReadOnly('-- comment\nSELECT 1')).not.toThrow();
  });
  it('allows EXPLAIN variants', () => {
    expect(isReadOnlySql('EXPLAIN SELECT 1')).toBe(true);
    expect(isReadOnlySql('EXPLAIN (FORMAT JSON) SELECT 1')).toBe(true);
    expect(isReadOnlySql('EXPLAIN ANALYZE SELECT 1')).toBe(true);
    expect(isReadOnlySql('EXPLAIN PLAN FOR SELECT 1 FROM dual')).toBe(true);
  });
  it('blocks mutations', () => {
    expect(() => validateReadOnly('DROP TABLE users')).toThrow(/only read-only/);
    expect(() => validateReadOnly('SELECT 1; DROP TABLE users')).toThrow(/single statement/);
    expect(() => validateReadOnly('EXPLAIN DROP TABLE users')).toThrow(/only read-only/);
    expect(() => validateReadOnly('WITH x AS (SELECT 1) SELECT * FROM x')).toThrow(/only read-only/);
  });
});

describe('redact', () => {
  it('redacts URLs', () => {
    expect(redactString('postgres://user:pass@host')).toBe('postgres://user:***@host');
  });
  it('redacts values', () => {
    expect(redactValue('password', 'secret')).toBe('***');
  });
});

describe('connection', () => {
  it('infers from scheme', () => {
    expect(inferEngine({ urlScheme: 'postgresql', installed: ['postgres'] })).toBe('postgres');
  });
  it('resolves connection info', () => {
    const { config } = resolveConnection(['pg://u:p@h/db'], {}, {}, ['postgres']);
    expect(config).toEqual({
      engine: 'postgres',
      host: 'h',
      port: 5432,
      user: 'u',
      password: 'p',
      database: 'db',
    });
  });
  it('uses env family engine', () => {
    const { config } = resolveConnection(
      [],
      {},
      { PGHOST: 'db.local', PGUSER: 'app', PGDATABASE: 'appdb' },
      ['postgres', 'mysql'],
    );
    expect(config.engine).toBe('postgres');
    expect(config.host).toBe('db.local');
    expect(config.user).toBe('app');
  });
  it('throws ENGINE_AMBIGUOUS when multi-engine install and no hints', () => {
    expect(() =>
      resolveConnection([], { user: 'u' }, {}, ['postgres', 'mysql']),
    ).toThrow(/cannot infer/);
  });
});

describe('env', () => {
  it('sets engine for single family', () => {
    const e = readEnv({ MYSQL_HOST: 'm', MYSQL_USER: 'root' });
    expect(e.engine).toBe('mysql');
    expect(e.host).toBe('m');
  });
  it('does not set engine when multiple families present', () => {
    const e = readEnv({
      PGHOST: 'p',
      PGUSER: 'pu',
      MYSQL_HOST: 'm',
      MYSQL_USER: 'mu',
    });
    expect(e.engine).toBeUndefined();
    // deterministic field defaults from first family (PG)
    expect(e.host).toBe('p');
  });
  it('keeps DATABASE_URL', () => {
    const e = readEnv({ DATABASE_URL: 'postgresql://u:p@h/db' });
    expect(e.url).toBe('postgresql://u:p@h/db');
  });
});

describe('idents', () => {
  it('quotes identifiers', () => {
    expect(quoteIdent('users', 'double')).toBe('"users"');
    expect(quoteIdent('a"b', 'double')).toBe('"a""b"');
    expect(quoteIdent('users', 'backtick')).toBe('`users`');
    expect(quoteIdent('a`b', 'backtick')).toBe('`a``b`');
  });
  it('strips trailing semis and detects EXPLAIN', () => {
    expect(stripTrailingSemi('select 1;')).toBe('select 1');
    expect(isExplainSql('EXPLAIN SELECT 1')).toBe(true);
    expect(isExplainSql('select 1')).toBe(false);
  });
});

describe('help', () => {
  it('has top-level help and every command', () => {
    expect(TOP_LEVEL_HELP.length).toBeGreaterThan(20);
    for (const cmd of ['home', 'databases', 'tables', 'schema', 'sample', 'query']) {
      expect(COMMAND_HELP[cmd]).toBeTruthy();
    }
  });
});
