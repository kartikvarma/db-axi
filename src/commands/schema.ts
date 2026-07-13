import { Connection } from '../engines/types.js';
import { buildRows } from '../format.js';
import { AxiError } from 'axi-sdk-js';

export async function schemaCommand(conn: Connection, table: string, flags: Record<string, any>) {
  if (!table) {
    throw new AxiError('table name is required', 'VALIDATION_ERROR', ['db-axi schema <table_name>']);
  }
  const { columns, indexes, fks } = await conn.schema(table);

  return {
    table,
    ...buildRows(
      ['name', 'type', 'nullable', 'pk', 'default'],
      columns.map((c) => [c.name, c.type, c.nullable, c.pk, c.default]),
      !!flags.full,
      'columns',
    ),
    ...buildRows(
      ['name', 'unique', 'columns'],
      indexes.map((i) => [i.name, i.unique, i.columns]),
      !!flags.full,
      'indexes',
    ),
    ...buildRows(
      ['column', 'references'],
      fks.map((f) => [f.column, f.references]),
      !!flags.full,
      'foreignKeys',
    ),
    help: [
      `Run \`db-axi sample ${table}\` for a peek at rows`,
      `Run \`db-axi query "select * from ${table} limit 10"\` for custom SQL`,
    ],
  };
}
