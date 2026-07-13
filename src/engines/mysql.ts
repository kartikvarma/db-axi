import mysql from 'mysql2/promise';
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

class MySqlConnection implements Connection {
  constructor(private conn: mysql.Connection) {}

  async close() {
    await this.conn.end();
  }

  async databases(): Promise<DatabaseInfo[]> {
    const [rows] = await this.conn.query(
      `SELECT schema_name as name FROM information_schema.schemata
       WHERE schema_name NOT IN ('mysql', 'sys', 'performance_schema', 'information_schema')
       ORDER BY 1`,
    );
    return (rows as { name: string }[]).map((r) => ({ name: r.name, tables: 0 }));
  }

  async tables(): Promise<TableInfo[]> {
    // Avoid bare alias `rows` (reserved-ish in some MySQL modes)
    const [rows] = await this.conn.query(
      `SELECT t.table_name AS name,
              t.table_rows AS row_est,
              (SELECT COUNT(*) FROM information_schema.columns c
               WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS col_count
       FROM information_schema.tables t
       WHERE t.table_schema = DATABASE() AND t.table_type = 'BASE TABLE'
       ORDER BY 1`,
    );
    return (rows as { name: string; row_est: number; col_count: number }[]).map((r) => ({
      name: r.name,
      rows: Math.max(0, Number(r.row_est) || 0),
      columns: Number(r.col_count) || 0,
    }));
  }

  async tableExists(name: string): Promise<boolean> {
    const [rows] = await this.conn.query(
      `SELECT 1 as ok FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?
       LIMIT 1`,
      [name],
    );
    return (rows as unknown[]).length > 0;
  }

  async schema(table: string) {
    if (!(await this.tableExists(table))) {
      throw notFoundTable(table);
    }

    const [cols] = await this.conn.query(
      `SELECT
         column_name as name,
         data_type as type,
         CASE WHEN is_nullable = 'YES' THEN 1 ELSE 0 END as nullable,
         CASE WHEN column_key = 'PRI' THEN 1 ELSE 0 END as pk,
         IFNULL(column_default, '') as \`default\`
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?
       ORDER BY ordinal_position`,
      [table],
    );

    const [idx] = await this.conn.query(
      `SELECT
         index_name as name,
         CASE WHEN non_unique = 0 THEN 1 ELSE 0 END as \`unique\`,
         group_concat(column_name ORDER BY seq_in_index) as columns
       FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ?
       GROUP BY index_name, non_unique
       ORDER BY 1`,
      [table],
    );

    const [fks] = await this.conn.query(
      `SELECT
         column_name as \`column\`,
         concat(referenced_table_name, '.', referenced_column_name) as \`references\`
       FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE()
         AND table_name = ?
         AND referenced_table_name IS NOT NULL
       ORDER BY 1`,
      [table],
    );

    const columns: ColumnInfo[] = (cols as any[]).map((c) => ({
      name: c.name,
      type: c.type,
      nullable: Number(c.nullable),
      pk: Number(c.pk),
      default: String(c.default ?? ''),
    }));
    const indexes: IndexInfo[] = (idx as any[]).map((i) => ({
      name: i.name,
      unique: Number(i.unique),
      columns: i.columns,
    }));
    const foreignKeys: ForeignKey[] = (fks as any[]).map((f) => ({
      column: f.column,
      references: f.references,
    }));

    return { columns, indexes, fks: foreignKeys };
  }

  async sample(name: string, limit: number): Promise<QueryResult> {
    if (!(await this.tableExists(name))) {
      throw notFoundTable(name);
    }
    const q = quoteIdent(name, 'backtick');
    const fetchLimit = limit + 1;
    try {
      const [rows, fields] = await this.conn.query({
        sql: `SELECT * FROM ${q} LIMIT ?`,
        values: [fetchLimit],
        rowsAsArray: true,
      });
      const r = rows as unknown[][];
      const capped = r.length > limit;
      return {
        columnNames: (fields as { name: string }[]).map((f) => f.name),
        rows: capped ? r.slice(0, limit) : r,
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
        text = `SELECT * FROM (${cleaned}) AS _dbaxi_q LIMIT ?`;
        values = [fetchLimit];
      }
      const [rows, fields] = await this.conn.query({
        sql: text,
        values,
        rowsAsArray: true,
      });
      const r = rows as unknown[][];
      if (isExplainSql(cleaned)) {
        return {
          columnNames: (fields as { name: string }[]).map((f) => f.name),
          rows: r,
          capped: false,
        };
      }
      const capped = r.length > limit;
      return {
        columnNames: (fields as { name: string }[]).map((f) => f.name),
        rows: capped ? r.slice(0, limit) : r,
        capped,
      };
    } catch (err) {
      throw toQueryError(err);
    }
  }
}

export const mysqlEngine: Engine = {
  name: 'mysql',
  async connect(c: ConnectionConfig) {
    try {
      const conn = await mysql.createConnection({
        host: c.host,
        port: c.port,
        user: c.user,
        password: c.password,
        database: c.database,
      });
      await conn.query('SET SESSION TRANSACTION READ ONLY');
      return new MySqlConnection(conn);
    } catch (err) {
      throw toConnectionError(err);
    }
  },
};
