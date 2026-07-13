import { Connection } from '../engines/types.js';
import { validateReadOnly } from '../validate.js';
import { buildRows } from '../format.js';
import { parseLimit } from '../args.js';
import { AxiError } from 'axi-sdk-js';

export async function queryCommand(conn: Connection, sql: string, flags: Record<string, any>) {
  if (!sql) {
    throw new AxiError('a SQL query is required', 'VALIDATION_ERROR', [
      'db-axi query "select ..."',
    ]);
  }
  validateReadOnly(sql);
  const limit = parseLimit(flags.limit, 100, 1000);
  const result = await conn.query(sql, limit);
  const status = result.capped
    ? `${result.rows.length} (capped, more rows available)`
    : `${result.rows.length} (complete)`;
  return {
    rows: status,
    ...buildRows(result.columnNames, result.rows, !!flags.full, 'result'),
  };
}
