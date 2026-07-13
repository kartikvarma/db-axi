import { AxiError } from 'axi-sdk-js';
import { redactString } from '../redact.js';

export function toQueryError(err: unknown): AxiError {
  if (err instanceof AxiError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  return new AxiError(redactString(raw), 'QUERY_ERROR', [
    'Fix the SQL or run `db-axi schema <table>` to inspect columns',
  ]);
}

export function toConnectionError(err: unknown): AxiError {
  if (err instanceof AxiError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  return new AxiError(redactString(raw), 'CONNECTION_ERROR', [
    'Check host, port, user, password, and database',
    'Pass --url or --engine/--host/--user flags',
  ]);
}

export function notFoundTable(table: string): AxiError {
  return new AxiError(`table not found: ${table}`, 'NOT_FOUND', [
    'Run `db-axi tables` to list tables',
  ]);
}
