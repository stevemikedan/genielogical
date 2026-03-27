import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { EchoDuplicate } from '@/types/conflict.ts';

/**
 * Detect "echo duplicates" — the same historical person appearing at different
 * generation depths with slightly different names or dates.
 *
 * Common with Ancestry hint imports: the same person gets entered independently
 * from different hint sources, often with typos or slightly different dates,
 * appearing at different depths because one path has an extra intermediary.
 */
export function detectEchoDuplicates(
  graph: TreeGraph,
  subjectId: string,
): EchoDuplicate[] {
  // Get all ancestors with generation numbers via BFS
  const ancestors = getAllAncestorsWithGen(graph, subjectId);

  // Group by normalized identity key
  const groups = new Map<string, Array<{ personId: string; gen: number }>>();

  for (const [personId, gen] of ancestors) {
    const person = graph.persons.get(personId);
    if (!person) continue;

    const key = normalizeForEchoMatch(person.name.surname, person.name.given, person.birth.date?.year ?? null);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({ personId, gen });
  }

  // Any group with 2+ entries at DIFFERENT generations is suspicious
  const echoes: EchoDuplicate[] = [];

  for (const [key, entries] of groups) {
    if (entries.length < 2) continue;

    const gens = new Set(entries.map(e => e.gen));
    if (gens.size <= 1) continue; // Same generation = normal pedigree collapse, not echo

    // Deduplicate entries (same person reached via multiple paths at same depth)
    const uniqueEntries = deduplicateEntries(entries);
    if (uniqueEntries.length < 2) continue;

    const uniqueGens = new Set(uniqueEntries.map(e => e.gen));
    if (uniqueGens.size <= 1) continue;

    const entryDetails = uniqueEntries.map(e => {
      const person = graph.persons.get(e.personId)!;
      const parents = graph.getParents(e.personId);
      const father = parents.find(p => p.sex === 'M');
      const mother = parents.find(p => p.sex === 'F');
      return {
        personId: e.personId,
        generation: e.gen,
        name: person.name.full,
        fatherName: father?.name.full ?? null,
        motherName: mother?.name.full ?? null,
      };
    });

    const allGens = uniqueEntries.map(e => e.gen);
    echoes.push({
      normalizedKey: key,
      entries: entryDetails,
      generationSpread: Math.max(...allGens) - Math.min(...allGens),
    });
  }

  return echoes;
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Get all ancestors of a person with their generation number.
 * Returns [personId, generation] pairs.
 */
function getAllAncestorsWithGen(
  graph: TreeGraph,
  subjectId: string,
): Array<[string, number]> {
  const result: Array<[string, number]> = [];
  const queue: Array<{ id: string; gen: number }> = [{ id: subjectId, gen: 0 }];
  const seen = new Map<string, number>(); // personId → lowest gen seen

  while (queue.length > 0) {
    const { id, gen } = queue.shift()!;

    // Allow a person to appear at multiple generations (that's what we're detecting)
    // But limit to avoid infinite loops
    const prevGen = seen.get(id);
    if (prevGen !== undefined && prevGen <= gen) continue;
    seen.set(id, gen);

    result.push([id, gen]);

    const parents = graph.getParents(id);
    for (const parent of parents) {
      if (gen < 40) { // Depth limit
        queue.push({ id: parent.id, gen: gen + 1 });
      }
    }
  }

  return result;
}

/**
 * Normalize a person's identity for echo matching.
 * Strips titles, lowercases, uses simplified surname + first 3 chars of given name + birth decade.
 */
function normalizeForEchoMatch(
  surname: string,
  givenName: string,
  birthYear: number | null,
): string | null {
  // Strip titles
  const titlePattern = /\b(Sir|Lord|Earl|King|Queen|Duke|Baron|Chief|Colonel|Prince|Princess|Duchess|Countess|Lady|Rev|Dr|Captain|Major|General|Lt|Hon)\b\.?/gi;

  const cleanSurname = surname.toLowerCase().replace(titlePattern, '').trim();
  const cleanGiven = givenName.toLowerCase().replace(titlePattern, '').trim();

  if (!cleanSurname || !cleanGiven) return null;

  // Use Soundex-like simplification for surname
  const simplifiedSurname = simpleSoundex(cleanSurname);

  // First 3 chars of given name
  const givenPrefix = cleanGiven.slice(0, 3);

  // Birth decade (null → 'unknown')
  const decade = birthYear !== null ? String(Math.floor(birthYear / 10) * 10) : 'unknown';

  return `${simplifiedSurname}|${givenPrefix}|${decade}`;
}

/**
 * Simple Soundex-like encoding for surname matching.
 * Not full Soundex — just strips common variants (Mc/Mac, double letters).
 */
function simpleSoundex(name: string): string {
  let s = name.toLowerCase();
  // Normalize Mc/Mac prefixes
  s = s.replace(/^mac/i, 'mc');
  // Remove double letters
  s = s.replace(/(.)\1+/g, '$1');
  // Remove common silent/variant characters
  s = s.replace(/[aeiouhwy]/g, '');
  // Keep first letter + consonant skeleton
  return name[0].toLowerCase() + s;
}

/**
 * Deduplicate entries where the same personId appears at the same generation.
 * Keep only unique personId entries, preferring the lowest generation.
 */
function deduplicateEntries(entries: Array<{ personId: string; gen: number }>): Array<{ personId: string; gen: number }> {
  const byPerson = new Map<string, { personId: string; gen: number }>();
  for (const entry of entries) {
    const existing = byPerson.get(entry.personId);
    if (!existing || entry.gen < existing.gen) {
      byPerson.set(entry.personId, entry);
    }
  }
  return [...byPerson.values()];
}
