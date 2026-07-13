/** Redact passwords in connection URLs or string values. */
export function redactString(str: string): string {
  // Redact URL userinfo: scheme://user:pass@host
  return str.replace(/(\w+:\/\/)([^:@/]+):([^@/]+)@/g, '$1$2:***@');
}

/** Redact password/pwd keys in a flag-like object or suggestion string. */
export function redactValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase();
  if ((k.includes('password') || k === 'pwd') && typeof value === 'string' && value.length > 0) {
    return '***';
  }
  return value;
}
