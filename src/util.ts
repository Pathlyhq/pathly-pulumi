/**
 * Shared helpers for dynamic resource providers (pure, easy to unit-test).
 */

export function arraysEqual(a?: string[] | null, b?: string[] | null): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function sortedCopy(values?: string[] | null): string[] {
  return [...(values ?? [])].sort();
}

export function changedKeys(
  olds: Record<string, unknown>,
  news: Record<string, unknown>,
  keys: string[],
): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const o = olds[k];
    const n = news[k];
    if (Array.isArray(o) || Array.isArray(n)) {
      if (!arraysEqual(o as string[] | undefined, n as string[] | undefined)) {
        out.push(k);
      }
    } else if (o !== n) {
      out.push(k);
    }
  }
  return out;
}

export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
