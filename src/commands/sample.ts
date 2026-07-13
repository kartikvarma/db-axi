import { Connection } from '../engines/types.js';
import { buildRows } from '../format.js';
import { AxiError } from 'axi-sdk-js';
import { parseLimit } from '../args.js';

export async function sampleCommand(conn: Connection, table: string, flags: Record<string, any>) {
  if (!table) {
    throw new AxiError('table name is required', 'VALIDATION_ERROR', ['db-axi sample <table_name>']);
  }
  const limit = parseLimit(flags.limit, 10, 100);
  const result = await conn.sample(table, limit);
  const status = result.capped
    ? `${result.rows.length} (capped, more rows available)`
    : `${result.rows.length} (complete)`;
  return {
    table,
    rows: status,
    ...buildRows(result.columnNames, result.rows, !!flags.full, 'sample'),
    help: [
      `Run \`db-axi schema ${table}\` for columns, keys, and indexes`,
      'Run `db-axi query "select ..." --limit 50` for custom read-only SQL',
    ],
  };
}
