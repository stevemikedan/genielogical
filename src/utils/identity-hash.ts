/**
 * Deterministic fingerprints for duplicate detection.
 *
 * These produce simple canonical strings for comparison.
 * Can be upgraded to SHA-256 when the shared dataset layer is built.
 */

/**
 * Compute a deterministic identity fingerprint for a person.
 * Components: surname, given name, birth decade, birth country, death decade.
 */
export function computeIdentityHash(
  surname: string,
  given: string,
  birthYear: number | null | undefined,
  birthCountry: string | null | undefined,
  deathYear: number | null | undefined,
): string {
  const norm = (s: string) => s.toLowerCase().trim();
  const decade = (y: number | null | undefined) => (y ? `${Math.floor(y / 10) * 10}` : '');
  return `${norm(surname)}|${norm(given)}|${decade(birthYear)}|${norm(birthCountry ?? '')}|${decade(deathYear)}`;
}

/**
 * Compute a deterministic fingerprint for a source record.
 * Components: normalized citation, URL.
 */
export function computeSourceHash(citation: string, url: string | null): string {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${norm(citation)}|${norm(url ?? '')}`;
}

/**
 * Determine default privacy level based on living status.
 * If no death date and birth year is within 120 years, assume living → 'private'.
 */
export function inferPrivacyLevel(
  hasDeath: boolean,
  birthYear: number | null | undefined,
): 'public' | 'private' {
  if (hasDeath) return 'public';
  if (!birthYear) return 'public'; // Unknown birth, can't determine
  const currentYear = new Date().getFullYear();
  return (currentYear - birthYear) < 120 ? 'private' : 'public';
}
