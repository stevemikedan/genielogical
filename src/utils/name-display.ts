import type { PersonName } from '@/types/person.ts';

/**
 * Build a display name including maiden name (nee) when present.
 * e.g. "Mary Hannah Gibson (nee McRee)"
 */
export function formatDisplayName(name: PersonName): string {
  const base = name.full || [name.prefix, name.given, name.middle, name.surname, name.suffix]
    .filter(Boolean).join(' ') || '(unnamed)';

  if (name.maidenName) {
    return `${base} (nee ${name.maidenName})`;
  }

  return base;
}
