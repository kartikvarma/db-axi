import { Connection } from '../engines/types.js';
import { buildRows } from '../format.js';

export async function databasesCommand(conn: Connection, flags: Record<string, any>) {
  const dbs = await conn.databases();

  if (dbs.length === 0) {
    return {
      databases: '0 databases/schemas accessible',
      count: 0,
      help: ['Check credentials and --database / connection URL'],
    };
  }

  const rows = dbs.map((db) => [db.name, db.tables]);
  return {
    count: dbs.length,
    ...buildRows(['name', 'tables'], rows, !!flags.full, 'databases'),
    help: [
      'Run `db-axi tables` to list tables in the current database',
      'Run `db-axi schema <table>` for column details',
    ],
  };
}
