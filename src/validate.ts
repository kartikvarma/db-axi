import { AxiError } from 'axi-sdk-js';

const READONLY_HELP =
  'only read-only queries are allowed (SELECT, EXPLAIN SELECT, EXPLAIN PLAN FOR SELECT)';

function stripLeadingComments(sql: string): string {
  let s = sql.trim();
  for (;;) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1).trimStart();
      continue;
    }
    if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end === -1 ? '' : s.slice(end + 2).trimStart();
      continue;
    }
    return s;
  }
}

function stripTrailingComments(sql: string): string {
  let s = sql.trimEnd();
  for (;;) {
    const trimmed = s.trimEnd();
    if (trimmed.endsWith('*/')) {
      const start = trimmed.lastIndexOf('/*');
      if (start === -1) return trimmed;
      s = trimmed.slice(0, start);
      continue;
    }
    const lineComment = trimmed.lastIndexOf('--');
    if (lineComment !== -1 && trimmed.slice(lineComment).indexOf('\n') === -1) {
      s = trimmed.slice(0, lineComment);
      continue;
    }
    return trimmed;
  }
}

function hasStackedStatement(sql: string): boolean {
  let quote: "'" | '"' | '`' | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (quote === "'") {
      if (ch === "'" && next === "'") i++;
      else if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"' || quote === '`') {
      if (ch === quote && next === quote) i++;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i + 2);
      if (end === -1) return false;
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return false;
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === ';') {
      return stripTrailingComments(sql.slice(i + 1)).trim() !== '';
    }
  }
  return false;
}

/** True for SELECT / EXPLAIN [opts] SELECT / EXPLAIN PLAN FOR SELECT. */
export function isReadOnlySql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  if (/^SELECT[\s(*]/.test(normalized) || normalized === 'SELECT') return true;
  if (/^EXPLAIN\s+PLAN\s+FOR\s+SELECT[\s(*]/.test(normalized)) return true;

  if (!normalized.startsWith('EXPLAIN')) return false;
  let rest = normalized.slice('EXPLAIN'.length).trimStart();

  // Optional parenthesized options: EXPLAIN (FORMAT JSON, ANALYZE) SELECT ...
  if (rest.startsWith('(')) {
    const close = rest.indexOf(')');
    if (close === -1) return false;
    rest = rest.slice(close + 1).trimStart();
  } else {
    // Optional bare keywords before SELECT (e.g. EXPLAIN ANALYZE SELECT)
    const keywords =
      /^(ANALYZE|VERBOSE|COSTS|SETTINGS|BUFFERS|WAL|TIMING|SUMMARY|GENERIC_PLAN|SERIALIZE|FORMAT)\b/;
    while (keywords.test(rest)) {
      rest = rest.replace(keywords, '').trimStart();
      // FORMAT may take an argument: FORMAT JSON
      if (/^(TEXT|XML|JSON|YAML)\b/.test(rest)) {
        rest = rest.replace(/^(TEXT|XML|JSON|YAML)\b/, '').trimStart();
      }
    }
  }

  return /^SELECT[\s(*]/.test(rest) || rest === 'SELECT';
}

export function validateReadOnly(sql: string): void {
  const trimmed = stripLeadingComments(sql);
  if (!trimmed) {
    throw new AxiError('a SQL query is required', 'VALIDATION_ERROR', [
      'db-axi query "select ..."',
    ]);
  }

  if (hasStackedStatement(trimmed)) {
    throw new AxiError('only a single statement is allowed', 'READ_ONLY', [READONLY_HELP]);
  }

  if (!isReadOnlySql(trimmed)) {
    throw new AxiError(READONLY_HELP, 'READ_ONLY', [
      'Example: db-axi query "select * from users limit 10"',
    ]);
  }
}
