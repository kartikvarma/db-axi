export type EngineName = 'postgres' | 'mysql' | 'oracle';

export interface ConnectionConfig {
  engine: EngineName;
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
}

export interface DatabaseInfo { name: string; tables: number; }
export interface TableInfo { name: string; rows: number; columns: number; }
export interface ColumnInfo { name: string; type: string; nullable: number; pk: number; default: string; }
export interface IndexInfo { name: string; unique: number; columns: string; }
export interface ForeignKey { column: string; references: string; }
export interface QueryResult { columnNames: string[]; rows: unknown[][]; capped: boolean; }

export interface Connection {
  close(): Promise<void>;
  databases(): Promise<DatabaseInfo[]>;
  tables(database?: string): Promise<TableInfo[]>;
  tableExists(name: string): Promise<boolean>;
  schema(table: string): Promise<{ columns: ColumnInfo[]; indexes: IndexInfo[]; fks: ForeignKey[] }>;
  /** Safe catalog-checked sample; throws NOT_FOUND if missing. */
  sample(name: string, limit: number): Promise<QueryResult>;
  /** Read-only query with server-side limit+1 fetch for capped detection. */
  query(sql: string, limit: number): Promise<QueryResult>;
}

export interface Engine {
  name: EngineName;
  connect(config: ConnectionConfig): Promise<Connection>;
}

/** Quote an identifier after catalog validation (never use on untrusted raw SQL). */
export function quoteIdent(name: string, style: 'double' | 'backtick' = 'double'): string {
  if (!name) {
    throw new Error('empty identifier');
  }
  if (style === 'backtick') {
    return '`' + name.replace(/`/g, '``') + '`';
  }
  return '"' + name.replace(/"/g, '""') + '"';
}

export function stripTrailingSemi(sql: string): string {
  return sql.trim().replace(/;+\s*$/u, '');
}

export function isExplainSql(sql: string): boolean {
  return /^\s*EXPLAIN\b/iu.test(sql);
}
