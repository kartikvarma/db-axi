import { Connection, ConnectionConfig } from './engines/types.js';
import { redactString } from './redact.js';

export async function homeCommand(
  conn: Connection,
  config: ConnectionConfig,
  _flags: Record<string, any>,
) {
  const tables = await conn.tables();
  const totalRows = tables.reduce((sum, t) => sum + (Number.isFinite(t.rows) ? t.rows : 0), 0);
  const largest = [...tables]
    .sort((a, b) => b.rows - a.rows)
    .slice(0, 5)
    .map((t) => ({ table: t.name, rows: t.rows }));

  const userinfo = config.password
    ? `${config.user}:***`
    : config.user;
  const server = `${config.host}:${config.port}/${config.database || ''} (user ${config.user})`;
  const urlRedacted = redactString(
    `${config.engine}://${userinfo}@${config.host}:${config.port}/${config.database || ''}`,
  );

  if (tables.length === 0) {
    return {
      engine: config.engine,
      server,
      urlRedacted,
      tables: '0 tables in current database',
      help: [
        'Run `db-axi databases` to list databases/schemas',
        'Run `db-axi query "select ..."` to run a read-only query',
      ],
    };
  }

  return {
    engine: config.engine,
    server,
    urlRedacted,
    tables: `${tables.length} (~${Math.round(totalRows)} rows est.)`,
    largest,
    help: [
      'Run `db-axi schema <table>` for columns, keys, and indexes',
      'Run `db-axi query "select ..."` to run a read-only query',
    ],
  };
}
