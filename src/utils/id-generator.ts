/**
 * Centralized ID generation for user-created entities.
 * Uses crypto.randomUUID() when available, falls back to timestamp + random.
 */

export function generateId(prefix: string = ''): string {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${uuid}` : uuid;
}

export function generatePersonId(): string {
  return generateId('P');
}

export function generateEdgeId(): string {
  return generateId('E');
}

export function generateSourceId(): string {
  return generateId('src');
}

export function generateTreeId(): string {
  return generateId('tree');
}

export function generateCrossTreeLinkId(): string {
  return generateId('xtl');
}

export function generateReportId(): string {
  return generateId('rpt');
}
