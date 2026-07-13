import pg from 'pg';
import {
  Engine,
  Connection,
  ConnectionConfig,
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKey,
  QueryResult,
  quoteIdent,
  stripTrailingSemi,
  isExplainSql,
} from './types.js';
import { toQueryError, toConnectionError, notFoundTable } from './errors.js';

class PostgresConnection implements Connection {
  constructor(private client: pg.Client) {}

  async close() {
    await this.client.end();
  }

  async databases(): Promise<DatabaseInfo[]> {
    const res = await this.client.query(`
      SELECT datname as name
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY 1
    `);
    return res.rows.map((r) => ({ name: r.name, tables: 0 }));
  }

  async tables(): Promise<TableInfo[]> {
    const res = await this.client.query(`
      SELECT
        c.relname as name,
        c.reltuples::bigint as rows,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_name = c.relname AND table_schema = n.nspname) as columns
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY 1
    `);
    return res.rows.map((r) => ({
      name: r.name,
      // reltuples is -1 until ANALYZE; treat as unknown → 0 for display
      rows: Math.max(0, Number(r.rows) || 0),
      columns: Number(r.columns),
    }));
  }

  async tableExists(name: string): Promise<boolean> {
    const res = await this.client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
       LIMIT 1`,
      [name],
    );
    return res.rowCount !== null && res.rowCount > 0;
  }

  async schema(table: string) {
    if (!(await this.tableExists(table))) {
      throw notFoundTable(table);
    }

    const cols = await this.client.query<{
      name: string;
      type: string;
      nullable: number;
      pk: number;
      default: string | null;
    }>(
      `
      SELECT
        c.column_name as name,
        c.data_type as type,
        CASE WHEN c.is_nullable = 'YES' THEN 1 ELSE 0 END as nullable,
        CASE WHEN pk.col IS NOT NULL THEN 1 ELSE 0 END as pk,
        c.column_default as default
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT a.attname as col
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        JOIN pg_class cl ON cl.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE i.indisprimary AND n.nspname = 'public' AND cl.relname = $1
      ) pk ON pk.col = c.column_name
      WHERE c.table_name = $1 AND c.table_schema = 'public'
      ORDER BY c.ordinal_position
    `,
      [table],
    );

    const idx = await this.client.query<{ name: string; unique: number; columns: string }>(
      `
      SELECT
        i.relname as name,
        CASE WHEN ix.indisunique THEN 1 ELSE 0 END as unique,
        string_agg(a.attname, ',' ORDER BY array_position(ix.indkey, a.attnum)) as columns
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = 'public' AND t.relname = $1
      GROUP BY i.relname, ix.indisunique
      ORDER BY 1
    `,
      [table],
    );

    const fks = await this.client.query<{ column: string; references: string }>(
      `
      SELECT
        kcu.column_name as column,
        ccu.table_name || '.' || ccu.column_name as references
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public' AND tc.table_name = $1
      ORDER BY 1
    `,
      [table],
    );

    const columns: ColumnInfo[] = cols.rows.map((r) => ({
      name: r.name,
      type: r.type,
      nullable: Number(r.nullable),
      pk: Number(r.pk),
      default: r.default ?? '',
    }));
    const indexes: IndexInfo[] = idx.rows.map((r) => ({
      name: r.name,
      unique: Number(r.unique),
      columns: r.columns,
    }));
    const foreignKeys: ForeignKey[] = fks.rows.map((r) => ({
      column: r.column,
      references: r.references,
    }));

    return { columns, indexes, fks: foreignKeys };
  }

  async sample(name: string, limit: number): Promise<QueryResult> {
    if (!(await this.tableExists(name))) {
      throw notFoundTable(name);
    }
    const q = quoteIdent(name, 'double');
    const fetchLimit = limit + 1;
    try {
      const res = await this.client.query({
        text: `SELECT * FROM ${q} LIMIT $1`,
        values: [fetchLimit],
        rowMode: 'array',
      });
      const capped = res.rows.length > limit;
      return {
        columnNames: res.fields.map((f) => f.name),
        rows: capped ? res.rows.slice(0, limit) : res.rows,
        capped,
      };
    } catch (err) {
      throw toQueryError(err);
    }
  }

  async query(sql: string, limit: number): Promise<QueryResult> {
    const cleaned = stripTrailingSemi(sql);
    const fetchLimit = limit + 1;
    try {
      let text: string;
      let values: unknown[] = [];
      if (isExplainSql(cleaned)) {
        text = cleaned;
      } else {
        text = `SELECT * FROM (${cleaned}) AS _dbaxi_q LIMIT $1`;
        values = [fetchLimit];
      }
      const res = await this.client.query({ text, values, rowMode: 'array' });
      const rows = res.rows as unknown[][];
      if (isExplainSql(cleaned)) {
        return {
          columnNames: res.fields.map((f) => f.name),
          rows,
          capped: false,
        };
      }
      const capped = rows.length > limit;
      return {
        columnNames: res.fields.map((f) => f.name),
        rows: capped ? rows.slice(0, limit) : rows,
        capped,
      };
    } catch (err) {
      throw toQueryError(err);
    }
  }
}

export const postgresEngine: Engine = {
  name: 'postgres',
  async connect(c: ConnectionConfig) {
    const client = new pg.Client({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
    });
    try {
      await client.connect();
      await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    } catch (err) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      throw toConnectionError(err);
    }
    return new PostgresConnection(client);
  },
};
