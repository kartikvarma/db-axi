export const TOP_LEVEL_HELP = `
AXI-compliant database CLI for PostgreSQL, MySQL, and Oracle.

USAGE
  db-axi <command> [args] [flags]

COMMANDS
  home         Show connection summary and available tables
  databases    List accessible databases/schemas
  tables       List tables in the current database
  schema       Show columns, indexes, and FKs for a table
  sample       Show sample rows from a table
  query        Execute a read-only SQL query

GLOBAL FLAGS
  --engine     Engine type (postgres, mysql, oracle)
  --host       Database host (default: localhost)
  --port       Database port
  --user       Database user
  --password   Database password
  --database   Database name
  --url        Connection URL
  --full       Show full cell content (no truncation)
  --limit      Row limit for query/sample (default: 100/10)

EXAMPLES
  db-axi home --url postgresql://user:pass@localhost:5432/mydb
  db-axi tables --engine mysql --user root --password secret
  db-axi query "SELECT * FROM users LIMIT 5"
`.trim();

export const COMMAND_HELP: Record<string, string> = {
  home: `
Show connection summary and available tables.
USAGE: db-axi home [flags]
`.trim(),
  databases: `
List accessible databases/schemas.
USAGE: db-axi databases [flags]
`.trim(),
  tables: `
List tables in the current database.
USAGE: db-axi tables [flags]
`.trim(),
  schema: `
Show columns, indexes, and FKs for a table.
USAGE: db-axi schema <table_name> [flags]
`.trim(),
  sample: `
Show sample rows from a table.
USAGE: db-axi sample <table_name> [flags]
`.trim(),
  query: `
Execute a read-only SQL query.
USAGE: db-axi query "<sql>" [flags]
`.trim(),
};
