import oracledb from 'oracledb';
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
  CONNECT_TIMEOUT_MS,
  STATEMENT_TIMEOUT_MS,
} from './types.js';
import { toQueryError, toConnectionError, notFoundTable } from './errors.js';

class OracleConnection implements Connection {
  constructor(private conn: oracledb.Connection) {}

  async close() {
    await this.conn.close();
  }

  async databases(): Promise<DatabaseInfo[]> {
    const res = await this.conn.execute<{ NAME: string }>(
      'SELECT username as name FROM all_users ORDER BY 1',
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (res.rows || []).map((r) => ({ name: r.NAME, tables: 0 }));
  }

  async tables(): Promise<TableInfo[]> {
    const res = await this.conn.execute<{ NAME: string; ROWS_COUNT: number; COL_COUNT: number }>(
      `SELECT t.table_name as name,
              t.num_rows as rows_count,
              (SELECT count(*) FROM user_tab_columns c WHERE c.table_name = t.table_name) as col_count
       FROM user_tables t
       ORDER BY 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (res.rows || []).map((r) => ({
      name: r.NAME,
      rows: r.ROWS_COUNT || 0,
      columns: r.COL_COUNT || 0,
    }));
  }

  async tableExists(name: string): Promise<boolean> {
    const res = await this.conn.execute(
      `SELECT 1 FROM user_tables WHERE table_name = :t OR table_name = UPPER(:t2)`,
      { t: name, t2: name },
    );
    return (res.rows?.length ?? 0) > 0;
  }

  private async resolveTableName(name: string): Promise<string | null> {
    const res = await this.conn.execute<{ NAME: string }>(
      `SELECT table_name as name FROM user_tables
       WHERE table_name = :t OR table_name = UPPER(:t2)`,
      { t: name, t2: name },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return res.rows?.[0]?.NAME ?? null;
  }

  async schema(table: string) {
    const resolved = await this.resolveTableName(table);
    if (!resolved) throw notFoundTable(table);

    const cols = await this.conn.execute<{
      NAME: string;
      TYPE: string;
      NULLABLE: number;
      PK: number;
      DEF: string | null;
    }>(
      `SELECT
         c.column_name as name,
         c.data_type as type,
         CASE WHEN c.nullable = 'Y' THEN 1 ELSE 0 END as nullable,
         CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as pk,
         c.data_default as def
       FROM user_tab_columns c
       LEFT JOIN (
         SELECT cc.column_name
         FROM user_constraints uc
         JOIN user_cons_columns cc ON uc.constraint_name = cc.constraint_name
         WHERE uc.constraint_type = 'P' AND uc.table_name = :t
       ) pk ON pk.column_name = c.column_name
       WHERE c.table_name = :t2
       ORDER BY c.column_id`,
      { t: resolved, t2: resolved },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const idx = await this.conn.execute<{ NAME: string; UNQ: number; COLS: string }>(
      `SELECT
         i.index_name as name,
         CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END as unq,
         LISTAGG(ic.column_name, ',') WITHIN GROUP (ORDER BY ic.column_position) as cols
       FROM user_indexes i
       JOIN user_ind_columns ic ON i.index_name = ic.index_name
       WHERE i.table_name = :t
       GROUP BY i.index_name, i.uniqueness
       ORDER BY 1`,
      { t: resolved },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const fks = await this.conn.execute<{ COL: string; REF: string }>(
      `SELECT
         a.column_name as col,
         c_pk.table_name || '.' || b.column_name as ref
       FROM user_cons_columns a
       JOIN user_constraints c ON a.constraint_name = c.constraint_name
       JOIN user_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name
       JOIN user_cons_columns b ON c_pk.constraint_name = b.constraint_name AND b.position = a.position
       WHERE c.constraint_type = 'R' AND c.table_name = :t
       ORDER BY 1`,
      { t: resolved },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const columns: ColumnInfo[] = (cols.rows || []).map((r) => ({
      name: r.NAME,
      type: r.TYPE,
      nullable: Number(r.NULLABLE),
      pk: Number(r.PK),
      default: r.DEF != null ? String(r.DEF) : '',
    }));
    const indexes: IndexInfo[] = (idx.rows || []).map((r) => ({
      name: r.NAME,
      unique: Number(r.UNQ),
      columns: r.COLS,
    }));
    const foreignKeys: ForeignKey[] = (fks.rows || []).map((r) => ({
      column: r.COL,
      references: r.REF,
    }));

    return { columns, indexes, fks: foreignKeys };
  }

  async sample(name: string, limit: number): Promise<QueryResult> {
    const resolved = await this.resolveTableName(name);
    if (!resolved) throw notFoundTable(name);
    const q = quoteIdent(resolved, 'double');
    const fetchLimit = limit + 1;
    try {
      const res = await this.conn.execute(
        `SELECT * FROM ${q} FETCH FIRST :n ROWS ONLY`,
        { n: fetchLimit },
        { outFormat: oracledb.OUT_FORMAT_ARRAY },
      );
      const rows = (res.rows as unknown[][]) || [];
      const capped = rows.length > limit;
      return {
        columnNames: (res.metaData || []).map((m) => m.name),
        rows: capped ? rows.slice(0, limit) : rows,
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
      let binds: oracledb.BindParameters = [];
      if (isExplainSql(cleaned)) {
        text = cleaned;
      } else {
        text = `SELECT * FROM (${cleaned}) _dbaxi_q FETCH FIRST :n ROWS ONLY`;
        binds = { n: fetchLimit };
      }
      const res = await this.conn.execute(text, binds, {
        outFormat: oracledb.OUT_FORMAT_ARRAY,
      });
      const rows = (res.rows as unknown[][]) || [];
      if (isExplainSql(cleaned)) {
        return {
          columnNames: (res.metaData || []).map((m) => m.name),
          rows,
          capped: false,
        };
      }
      const capped = rows.length > limit;
      return {
        columnNames: (res.metaData || []).map((m) => m.name),
        rows: capped ? rows.slice(0, limit) : rows,
        capped,
      };
    } catch (err) {
      throw toQueryError(err);
    }
  }
}

export const oracleEngine: Engine = {
  name: 'oracle',
  async connect(c: ConnectionConfig) {
    try {
      const conn = await oracledb.getConnection({
        user: c.user,
        password: c.password,
        connectionString: `${c.host}:${c.port}/${c.database || ''}`,
        connectTimeout: Math.ceil(CONNECT_TIMEOUT_MS / 1000),
      });
      conn.callTimeout = STATEMENT_TIMEOUT_MS;
      await conn.execute('SET TRANSACTION READ ONLY');
      return new OracleConnection(conn);
    } catch (err) {
      throw toConnectionError(err);
    }
  },
};
