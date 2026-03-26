import type { Flag, FlagCategory, FlagSeverity } from '@/types/flag.ts';
import type { Person } from '@/types/person.ts';
import type { Edge } from '@/types/edge.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { detectAncestryConflicts } from '@/engine/ancestry-conflict-detector.ts';

// ── Helpers ──────────────────────────────────────────────────────────

function createFlag(
  category: FlagCategory,
  severity: FlagSeverity,
  ruleId: string,
  title: string,
  description: string,
  suggestedAction: string,
  affectedPersonIds: string[],
  affectedEdgeIds: string[] = [],
): Flag {
  return {
    id: crypto.randomUUID(),
    category,
    severity,
    ruleId,
    title,
    description,
    suggestedAction,
    affectedPersonIds,
    affectedEdgeIds,
    userStatus: 'new',
    userNote: null,
    detectedAt: new Date(),
    resolvedAt: null,
  };
}

function getBirthYear(person: Person): number | null {
  return person.birth.date?.year ?? null;
}

function getDeathYear(person: Person): number | null {
  return person.death.date?.year ?? null;
}

const TITLE_PATTERN = /\b(Sir|Lord|Earl|King|Queen|Duke|Baron|Chief|Colonel|Prince|Princess|Duchess|Countess|Lady)\b/i;

// ── Rule implementations ────────────────────────────────────────────

function checkChronological(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];

  for (const person of graph.persons.values()) {
    const birthYear = getBirthYear(person);
    const deathYear = getDeathYear(person);

    // CHRONO_DEATH_BEFORE_BIRTH
    if (birthYear !== null && deathYear !== null && deathYear < birthYear) {
      flags.push(createFlag(
        'chronological', 'critical', 'CHRONO_DEATH_BEFORE_BIRTH',
        `Death before birth: ${person.name.full}`,
        `${person.name.full} has a death date (${deathYear}) before birth date (${birthYear}).`,
        'Verify birth and death dates against original sources.',
        [person.id],
      ));
    }

    // CHRONO_LIFESPAN_EXTREME
    if (birthYear !== null && deathYear !== null && (deathYear - birthYear) > 110) {
      flags.push(createFlag(
        'chronological', 'critical', 'CHRONO_LIFESPAN_EXTREME',
        `Extreme lifespan: ${person.name.full}`,
        `${person.name.full} has a lifespan of ${deathYear - birthYear} years (${birthYear}–${deathYear}).`,
        'Check for data entry errors in birth or death year.',
        [person.id],
      ));
    }

    // CHRONO_MARRIAGE_IMPOSSIBLE
    for (const event of person.events) {
      if (event.type === 'marriage' && event.date !== null && event.date.year !== null) {
        const marriageYear = event.date.year;
        if (birthYear !== null && (marriageYear - birthYear) < 12) {
          flags.push(createFlag(
            'chronological', 'critical', 'CHRONO_MARRIAGE_IMPOSSIBLE',
            `Marriage too young: ${person.name.full}`,
            `${person.name.full} married at age ${marriageYear - birthYear} (born ${birthYear}, married ${marriageYear}).`,
            'Verify marriage date and birth date.',
            [person.id],
          ));
        }
        if (deathYear !== null && marriageYear > deathYear) {
          flags.push(createFlag(
            'chronological', 'critical', 'CHRONO_MARRIAGE_IMPOSSIBLE',
            `Marriage after death: ${person.name.full}`,
            `${person.name.full} has a marriage date (${marriageYear}) after death (${deathYear}).`,
            'Verify marriage date and death date.',
            [person.id],
          ));
        }
      }
    }
  }

  // Edge-based chronological checks
  for (const edge of graph.edges.values()) {
    const parent = graph.persons.get(edge.parentId);
    const child = graph.persons.get(edge.childId);
    if (!parent || !child) continue;

    const parentBirthYear = getBirthYear(parent);
    const childBirthYear = getBirthYear(child);
    const parentDeathYear = getDeathYear(parent);

    // CHRONO_BIRTH_BEFORE_PARENT
    if (parentBirthYear !== null && childBirthYear !== null) {
      if (childBirthYear <= parentBirthYear || (childBirthYear - parentBirthYear) < 13) {
        flags.push(createFlag(
          'chronological', 'critical', 'CHRONO_BIRTH_BEFORE_PARENT',
          `Child born before/too close to parent: ${child.name.full}`,
          `${child.name.full} (b. ${childBirthYear}) born before or within 13 years of parent ${parent.name.full} (b. ${parentBirthYear}).`,
          'Check birth dates for both parent and child.',
          [child.id, parent.id],
          [edge.id],
        ));
      }
    }

    // CHRONO_BIRTH_AFTER_FATHER_DEATH / CHRONO_BIRTH_AFTER_MOTHER_DEATH
    if (childBirthYear !== null && parentDeathYear !== null && childBirthYear > parentDeathYear) {
      if (parent.sex === 'M' && (childBirthYear - parentDeathYear) > 1) {
        flags.push(createFlag(
          'chronological', 'critical', 'CHRONO_BIRTH_AFTER_FATHER_DEATH',
          `Child born after father's death: ${child.name.full}`,
          `${child.name.full} (b. ${childBirthYear}) born more than 1 year after father ${parent.name.full}'s death (${parentDeathYear}).`,
          'Verify parentage — could be posthumous birth within 9 months, or a data error.',
          [child.id, parent.id],
          [edge.id],
        ));
      }
      if (parent.sex === 'F') {
        flags.push(createFlag(
          'chronological', 'critical', 'CHRONO_BIRTH_AFTER_MOTHER_DEATH',
          `Child born after mother's death: ${child.name.full}`,
          `${child.name.full} (b. ${childBirthYear}) born after mother ${parent.name.full}'s death (${parentDeathYear}).`,
          'This is biologically impossible. Check dates or parentage.',
          [child.id, parent.id],
          [edge.id],
        ));
      }
    }

    // CHRONO_CENTURY_GAP
    if (parentBirthYear !== null && childBirthYear !== null) {
      const gap = childBirthYear - parentBirthYear;
      if (gap > 100 || gap < -10) {
        flags.push(createFlag(
          'chronological', 'critical', 'CHRONO_CENTURY_GAP',
          `Century gap: ${parent.name.full} → ${child.name.full}`,
          `${Math.abs(gap)}-year gap between parent ${parent.name.full} (b. ${parentBirthYear}) and child ${child.name.full} (b. ${childBirthYear}).`,
          'One of these birth dates is likely off by a century or more. Check original sources.',
          [parent.id, child.id],
          [edge.id],
        ));
      }
    }
  }

  // CHRONO_SIBLING_SPAN — children from same mother born >50 years apart
  for (const person of graph.persons.values()) {
    if (person.sex !== 'F') continue;
    const children = graph.getChildren(person.id);
    const childBirthYears = children
      .map(c => getBirthYear(c))
      .filter((y): y is number => y !== null);
    if (childBirthYears.length < 2) continue;
    const minYear = Math.min(...childBirthYears);
    const maxYear = Math.max(...childBirthYears);
    if (maxYear - minYear > 50) {
      flags.push(createFlag(
        'chronological', 'critical', 'CHRONO_SIBLING_SPAN',
        `Sibling span too wide: children of ${person.name.full}`,
        `Children of ${person.name.full} span ${maxYear - minYear} years (${minYear}–${maxYear}).`,
        'Check birth dates of all children. Some may belong to a different mother.',
        [person.id, ...children.map(c => c.id)],
      ));
    }
  }

  return flags;
}

function checkPrestigeInflation(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];

  for (const person of graph.persons.values()) {
    const nameText = `${person.name.full} ${person.name.given} ${person.name.raw}`;
    if (TITLE_PATTERN.test(nameText)) {
      flags.push(createFlag(
        'prestige_inflation', 'warning', 'PRESTIGE_TITLE_IN_NAME',
        `Title in name: ${person.name.full}`,
        `"${person.name.full}" contains a title that may have been added without verification.`,
        'Verify that the title is documented in primary sources, not just inherited from an online tree.',
        [person.id],
      ));

      // PRESTIGE_MEDIEVAL_ROYAL_UNSOURCED
      const birthYear = getBirthYear(person);
      if (birthYear !== null && birthYear < 1500 && person.sourceIds.length === 0) {
        flags.push(createFlag(
          'prestige_inflation', 'warning', 'PRESTIGE_MEDIEVAL_ROYAL_UNSOURCED',
          `Unsourced medieval royal: ${person.name.full}`,
          `${person.name.full} (b. ${birthYear}) has a title but no sources. Medieval royal claims require careful sourcing.`,
          'Add sources from published peerage or academic genealogy to support this claim.',
          [person.id],
        ));
      }
    }
  }

  return flags;
}

function checkDuplicateSuspects(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];
  const persons = [...graph.persons.values()];
  const seen = new Set<string>();

  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i];
      const b = persons[j];

      // Compare surname (case-insensitive) + first 3 chars of given name
      const aSurname = a.name.surname.toLowerCase().trim();
      const bSurname = b.name.surname.toLowerCase().trim();
      if (!aSurname || !bSurname) continue;
      if (aSurname !== bSurname) continue;

      const aGiven = a.name.given.toLowerCase().trim().slice(0, 3);
      const bGiven = b.name.given.toLowerCase().trim().slice(0, 3);
      if (!aGiven || !bGiven) continue;
      if (aGiven !== bGiven) continue;

      // Check overlapping dates (±10 years)
      const aBirth = getBirthYear(a);
      const bBirth = getBirthYear(b);
      if (aBirth !== null && bBirth !== null && Math.abs(aBirth - bBirth) > 10) continue;

      const pairKey = [a.id, b.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      flags.push(createFlag(
        'duplicate_suspect', 'warning', 'DUP_NAME_DATE_MATCH',
        `Possible duplicate: ${a.name.full} / ${b.name.full}`,
        `"${a.name.full}" (b. ${aBirth ?? '?'}) and "${b.name.full}" (b. ${bBirth ?? '?'}) have similar names and overlapping dates.`,
        'Compare these individuals to determine if they are the same person.',
        [a.id, b.id],
      ));
    }
  }

  return flags;
}

function checkSourceDeserts(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];
  const leaves = graph.getLeaves(); // Start from the bottom of the tree

  for (const leaf of leaves) {
    // Walk up through primary parent edges
    let current: Person | undefined = leaf;
    const unsourcedRun: Person[] = [];
    const visited = new Set<string>();
    let frontierPerson: Person | null = null;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);

      if (current.sourceIds.length > 0) {
        frontierPerson = current;
        // Reset run — we found a sourced person
        unsourcedRun.length = 0;
      } else {
        unsourcedRun.push(current);
      }

      // Move to first primary parent
      const parents = graph.getParents(current.id);
      current = parents[0];
    }

    // SOURCE_DESERT: 5+ consecutive unsourced ancestors
    if (unsourcedRun.length >= 5) {
      const alreadyFlagged = flags.some(
        f => f.ruleId === 'SOURCE_DESERT' &&
        f.affectedPersonIds.some(id => unsourcedRun.some(p => p.id === id))
      );
      if (!alreadyFlagged) {
        flags.push(createFlag(
          'source_desert', 'warning', 'SOURCE_DESERT',
          `Source desert: ${unsourcedRun.length} unsourced ancestors`,
          `${unsourcedRun.length} consecutive ancestors have no sources, starting from ${unsourcedRun[0].name.full}.`,
          'Begin sourcing from the most recent unsourced ancestor and work backward.',
          unsourcedRun.map(p => p.id),
        ));
      }
    }

    // SOURCE_FRONTIER
    if (frontierPerson && unsourcedRun.length > 0) {
      const alreadyFlagged = flags.some(
        f => f.ruleId === 'SOURCE_FRONTIER' && f.affectedPersonIds.includes(frontierPerson!.id)
      );
      if (!alreadyFlagged) {
        flags.push(createFlag(
          'source_desert', 'info', 'SOURCE_FRONTIER',
          `Source frontier: ${frontierPerson.name.full}`,
          `${frontierPerson.name.full} is the last sourced ancestor in this line. ${unsourcedRun.length} unsourced ancestors follow.`,
          'Focus research on the generation just beyond this person.',
          [frontierPerson.id],
        ));
      }
    }
  }

  return flags;
}

function checkStructural(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];

  // STRUCT_CIRCULAR — cycle detection via DFS
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(personId: string): boolean {
    if (inStack.has(personId)) return true; // cycle found
    if (visited.has(personId)) return false;
    visited.add(personId);
    inStack.add(personId);

    const parents = graph.parentEdges.get(personId);
    if (parents) {
      for (const edge of parents) {
        if (dfs(edge.parentId)) {
          flags.push(createFlag(
            'structural', 'critical', 'STRUCT_CIRCULAR',
            `Circular reference detected`,
            `A circular parent-child loop was detected involving ${graph.persons.get(personId)?.name.full ?? personId}.`,
            'Remove or correct the circular parent-child connection.',
            [personId, edge.parentId],
            [edge.id],
          ));
          return false; // Report but don't propagate further
        }
      }
    }

    inStack.delete(personId);
    return false;
  }

  for (const personId of graph.persons.keys()) {
    dfs(personId);
  }

  // STRUCT_ORPHAN — person not in any family relationship
  for (const person of graph.persons.values()) {
    const parentE = graph.parentEdges.get(person.id);
    const childE = graph.childEdges.get(person.id);
    const spouses = graph.spouseMap.get(person.id);
    const hasParents = parentE && parentE.length > 0;
    const hasChildren = childE && childE.length > 0;
    const hasSpouses = spouses && spouses.length > 0;

    if (!hasParents && !hasChildren && !hasSpouses) {
      flags.push(createFlag(
        'structural', 'warning', 'STRUCT_ORPHAN',
        `Orphan record: ${person.name.full}`,
        `${person.name.full} is not connected to any family relationships.`,
        'Link this person to their family or verify if this is a duplicate.',
        [person.id],
      ));
    }
  }

  // STRUCT_MISSING_GENDER — parent with sex = "U"
  for (const edge of graph.edges.values()) {
    const parent = graph.persons.get(edge.parentId);
    if (parent && parent.sex === 'U') {
      // Avoid duplicate flags for same person
      const alreadyFlagged = flags.some(
        f => f.ruleId === 'STRUCT_MISSING_GENDER' && f.affectedPersonIds.includes(parent.id)
      );
      if (!alreadyFlagged) {
        flags.push(createFlag(
          'structural', 'warning', 'STRUCT_MISSING_GENDER',
          `Missing gender: ${parent.name.full}`,
          `${parent.name.full} is listed as a parent but has unknown sex.`,
          'Set the sex field based on their role (HUSB/WIFE) or available records.',
          [parent.id],
        ));
      }
    }
  }

  return flags;
}

function checkUnresolvedParentage(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];

  // Group edges by parallelGroupId
  const parallelGroups = new Map<string, Edge[]>();
  for (const edge of graph.edges.values()) {
    if (edge.parallelGroupId) {
      const group = parallelGroups.get(edge.parallelGroupId);
      if (group) {
        group.push(edge);
      } else {
        parallelGroups.set(edge.parallelGroupId, [edge]);
      }
    }
  }

  for (const [groupId, edges] of parallelGroups) {
    const hasStrongEdge = edges.some(e => e.confidenceTier <= 2);
    if (!hasStrongEdge) {
      const childId = edges[0].childId;
      const child = graph.persons.get(childId);
      flags.push(createFlag(
        'unresolved_parentage', 'warning', 'PARENTAGE_UNRESOLVED',
        `Unresolved parentage: ${child?.name.full ?? childId}`,
        `Parallel path group "${groupId}" has no edge at Tier 1 or 2. All candidate parentages are weakly supported.`,
        'Research primary or secondary sources to strengthen one of the candidate parent connections.',
        [childId, ...edges.map(e => e.parentId)],
        edges.map(e => e.id),
      ));
    }
  }

  return flags;
}

function checkAncestryConflicts(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];
  const conflicts = detectAncestryConflicts(graph);

  for (const conflict of conflicts) {
    const personA = graph.persons.get(conflict.personIdA);
    const personB = graph.persons.get(conflict.personIdB);
    const nameA = personA?.name.full ?? conflict.personIdA;
    const nameB = personB?.name.full ?? conflict.personIdB;

    const affectedPersonIds = [conflict.personIdA, conflict.personIdB];
    // Collect affected edge IDs from both versions
    const affectedEdgeIds: string[] = [];
    const addEdgesForPerson = (personId: string) => {
      const edges = graph.parentEdges.get(personId);
      if (edges) {
        for (const edge of edges) {
          affectedEdgeIds.push(edge.id);
        }
      }
    };
    addEdgesForPerson(conflict.personIdA);
    addEdgesForPerson(conflict.personIdB);

    switch (conflict.conflictType) {
      case 'different_parents':
        flags.push(createFlag(
          'ancestry_conflict', 'critical', 'ANCESTRY_CONFLICT_DIFFERENT_PARENTS',
          `Conflicting parents: ${nameA} / ${nameB}`,
          `"${nameA}" and "${nameB}" appear to be the same person but have completely different parents. ` +
          `Version A: ${conflict.pathA.fatherName ?? '?'} & ${conflict.pathA.motherName ?? '?'}. ` +
          `Version B: ${conflict.pathB.fatherName ?? '?'} & ${conflict.pathB.motherName ?? '?'}. ` +
          `${conflict.sharedDescendants.length} shared descendants affected.`,
          'Compare both parent sets against primary sources. Use AI-assisted research to determine which lineage is correct.',
          affectedPersonIds,
          affectedEdgeIds,
        ));
        break;

      case 'different_father':
      case 'different_mother':
        flags.push(createFlag(
          'ancestry_conflict', 'critical', 'ANCESTRY_CONFLICT_DIFFERENT_PARENTS',
          `Different ${conflict.conflictType === 'different_father' ? 'father' : 'mother'}: ${nameA} / ${nameB}`,
          `"${nameA}" and "${nameB}" share one parent but differ on the ${conflict.conflictType === 'different_father' ? 'father' : 'mother'}. ` +
          `${conflict.sharedDescendants.length} shared descendants affected.`,
          'Research which parent assignment is correct using vital records.',
          affectedPersonIds,
          affectedEdgeIds,
        ));
        break;

      case 'upstream_divergence':
        flags.push(createFlag(
          'ancestry_conflict', 'warning', 'ANCESTRY_CONFLICT_UPSTREAM_DIVERGENCE',
          `Upstream divergence: ${nameA}`,
          `"${nameA}" and "${nameB}" have the same immediate parents, but those parents have conflicting ancestry upstream.`,
          'Check the parents and grandparents for duplicate entries or conflicting parent assignments.',
          affectedPersonIds,
          affectedEdgeIds,
        ));
        break;

      case 'additional_parents':
        flags.push(createFlag(
          'ancestry_conflict', 'warning', 'ANCESTRY_CONFLICT_PARTIAL',
          `Partial parent data: ${nameA} / ${nameB}`,
          `"${nameA}" and "${nameB}" appear to be the same person. One has parent data, the other doesn't. ` +
          `This may indicate incomplete merging of records.`,
          'Merge the two entries, keeping the one with parent data as primary.',
          affectedPersonIds,
          affectedEdgeIds,
        ));
        break;
    }
  }

  return flags;
}

// ── Main entry point ─────────────────────────────────────────────────

export function runFlagEngine(graph: TreeGraph): Flag[] {
  const flags: Flag[] = [];

  flags.push(...checkChronological(graph));
  flags.push(...checkPrestigeInflation(graph));
  flags.push(...checkDuplicateSuspects(graph));
  flags.push(...checkSourceDeserts(graph));
  flags.push(...checkStructural(graph));
  flags.push(...checkUnresolvedParentage(graph));
  flags.push(...checkAncestryConflicts(graph));

  return flags;
}
