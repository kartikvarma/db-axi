/**
 * Optional live-DB integration tests.
 *
 * Enable with env URLs (default suite stays pure / offline):
 *   DBAXI_IT_PG_URL=postgresql://app:app@localhost:5432/appdb
 *   DBAXI_IT_MYSQL_URL=mysql://app:app@localhost:3306/appdb
 *
 * Oracle is intentionally omitted from the default IT matrix.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveConnection } from './connection.js';
import { getEngine, installedEngines } from './engines/index.js';
import type { Connection } from './engines/types.js';
import { homeCommand } from './home.js';
import { tablesCommand } from './commands/tables.js';
import { schemaCommand } from './commands/schema.js';
import { sampleCommand } from './commands/sample.js';
import { queryCommand } from './commands/query.js';
import { AxiError } from 'axi-sdk-js';

const pgUrl = process.env.DBAXI_IT_PG_URL;
const mysqlUrl = process.env.DBAXI_IT_MYSQL_URL;

async function open(url: string): Promise<{ conn: Connection; config: ReturnType<typeof resolveConnection>['config'] }> {
  const installed = installedEngines();
  const { config } = resolveConnection([], { url }, process.env, installed);
  const engine = await getEngine(config.engine);
  const conn = await engine.connect(config);
  return { conn, config };
}

function suite(label: string, url: string | undefined) {
  describe.skipIf(!url)(`integration: ${label}`, () => {
    let conn: Connection;
    let config: Awaited<ReturnType<typeof open>>['config'];

    beforeAll(async () => {
      ({ conn, config } = await open(url!));
    });

    afterAll(async () => {
      await conn?.close();
    });

    it('home returns engine and table summary', async () => {
      const out = await homeCommand(conn, config, {});
      expect(out.engine).toBe(config.engine);
      expect(out.server).toContain(String(config.port));
      expect(out.tables).toBeTruthy();
      expect(Array.isArray(out.help)).toBe(true);
    });

    it('tables lists without throwing', async () => {
      const out = await tablesCommand(conn, {});
      expect(out.count === undefined || typeof out.count === 'number' || out.tables).toBeTruthy();
    });

    it('query select 1 works and reports complete', async () => {
      const out = await queryCommand(conn, 'SELECT 1 AS n', {});
      expect(String(out.rows)).toMatch(/complete|capped/);
      expect(out.result).toBeDefined();
    });

    it('rejects mutations via query path', async () => {
      await expect(queryCommand(conn, 'DELETE FROM users', {})).rejects.toBeInstanceOf(AxiError);
    });

    it('schema/sample work when users table exists', async () => {
      const tables = await conn.tables();
      const hasUsers = tables.some((t) => t.name.toLowerCase() === 'users');
      if (!hasUsers) return;

      const schema = await schemaCommand(conn, 'users', {});
      expect(schema.table).toBe('users');
      expect(schema.columns).toBeDefined();

      const sample = await sampleCommand(conn, 'users', { limit: '5' });
      expect(sample.table).toBe('users');
      expect(String(sample.rows)).toMatch(/complete|capped/);
    });

    it('NOT_FOUND for missing table', async () => {
      await expect(schemaCommand(conn, '__dbaxi_missing_table__', {})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
}

suite('postgres', pgUrl);
suite('mysql', mysqlUrl);

describe('integration env documentation', () => {
  it('documents optional IT env vars (always runs)', () => {
    // Keeps the file non-empty in pure CI and documents the contract.
    expect(['DBAXI_IT_PG_URL', 'DBAXI_IT_MYSQL_URL']).toHaveLength(2);
  });
});
