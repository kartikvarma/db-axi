import { Connection } from '../engines/types.js';
import { buildRows } from '../format.js';

export async function tablesCommand(conn: Connection, flags: Record<string, any>) {
  const db = typeof flags.database === 'string' ? flags.database : undefined;
  const tables = await conn.tables(db);

  if (tables.length === 0) {
    return {
      tables: '0 tables in current database',
      count: 0,
      help: [
        'Run `db-axi databases` to switch context or list schemas',
        'Run `db-axi query "select ..."` for ad-hoc SQL',
      ],
    };
  }

  const rows = tables.map((t) => [t.name, t.rows, t.columns]);
  return {
    count: tables.length,
    ...buildRows(['table', 'rows', 'columns'], rows, !!flags.full, 'tables'),
    help: [
      'Run `db-axi schema <table>` for columns, keys, and indexes',
      'Run `db-axi sample <table>` for a peek at rows',
    ],
  };
}
