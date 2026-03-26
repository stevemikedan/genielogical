import type { Person } from '@/types/person.ts';
import type { Source } from '@/types/source.ts';
import type { Flag } from '@/types/flag.ts';
import type { LocationContext } from '@/ai/era-context.ts';

/**
 * Shared formatting functions used by all three prompt tiers.
 * Consolidates the person/source/flag formatting from validation-prompts.ts.
 */

function formatDate(person: Person, type: 'birth' | 'death'): string {
  const event = person[type];
  if (!event.date) return 'unknown';
  if (event.date.year) {
    const place = event.place?.raw ? ` in ${event.place.raw}` : '';
    return `${event.date.raw}${place}`;
  }
  return event.date.raw || 'unknown';
}

function formatPlace(person: Person, type: 'birth' | 'death'): string {
  const event = person[type];
  return event.place?.raw ?? 'unknown';
}

export function formatPersonBlock(
  person: Person,
  parents: { father: Person | null; mother: Person | null },
  children: Person[],
): string {
  const altNames = person.alternateNames.length > 0
    ? ` (also known as: ${person.alternateNames.map(a => a.name.full).join(', ')})`
    : '';

  const fatherLine = parents.father
    ? `${parents.father.name.full} (${formatDate(parents.father, 'birth')} - ${formatDate(parents.father, 'death')})`
    : 'Unknown';

  const motherLine = parents.mother
    ? `${parents.mother.name.full} (${formatDate(parents.mother, 'birth')} - ${formatDate(parents.mother, 'death')})`
    : 'Unknown';

  const childList = children.length > 0
    ? children.map(c => `    - ${c.name.full} (${formatDate(c, 'birth')} - ${formatDate(c, 'death')})`).join('\n')
    : '    None recorded';

  return `PERSON:
  Name: ${person.name.full}${altNames}
  Sex: ${person.sex}
  Birth: ${formatDate(person, 'birth')}
  Birth place: ${formatPlace(person, 'birth')}
  Death: ${formatDate(person, 'death')}
  Death place: ${formatPlace(person, 'death')}

PARENTS (per GEDCOM):
  Father: ${fatherLine}
  Mother: ${motherLine}

CHILDREN (per GEDCOM):
${childList}`;
}

export function formatSourcesSummary(sources: Source[]): string {
  if (sources.length === 0) return 'No sources attached.';
  return sources.map(s =>
    `  - [${s.sourceClass}/${s.sourceType}] ${s.title}${s.citation ? `: ${s.citation}` : ''}${s.url ? ` (${s.url})` : ''}`
  ).join('\n');
}

export function formatFlagsSummary(flags: Flag[]): string {
  if (flags.length === 0) return 'No flags.';
  return flags.map(f => `  - [${f.severity}/${f.category}] ${f.title}: ${f.description}`).join('\n');
}

export function formatLocationContext(location: LocationContext): string {
  const lines: string[] = [];
  lines.push(`  Country: ${location.country}`);
  if (location.region) {
    lines.push(`  Region: ${location.region}`);
  }

  if (location.availableRepositories.length > 0) {
    lines.push('  Available repositories:');
    for (const repo of location.availableRepositories) {
      lines.push(`    - ${repo.name} [${repo.accessLevel}]: ${repo.coverage}`);
    }
  }

  if (location.knownGaps.length > 0) {
    lines.push('  Known record gaps:');
    for (const gap of location.knownGaps) {
      lines.push(`    - ${gap}`);
    }
  }

  return lines.join('\n');
}
