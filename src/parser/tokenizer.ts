/**
 * Line-level tokenizer for GEDCOM text.
 * Each GEDCOM line follows the pattern: level [xref] tag [value]
 */

export interface GedcomToken {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  lineNumber: number;
}

/**
 * Remove BOM (byte order mark) from the start of file content.
 */
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

// GEDCOM line regex: level [xref] tag [value]
// Level is a non-negative integer
// Xref is @something@ (optional)
// Tag is alphanumeric or starts with _
// Value is everything after the tag (optional)
const LINE_REGEX = /^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z_]\w*)\s?(.*)$/;

/**
 * Tokenize a GEDCOM text string into an array of GedcomTokens.
 * Handles BOM, CONT/CONC lines, and blank lines.
 */
export function tokenize(text: string): GedcomToken[] {
  const cleaned = stripBom(text);
  const rawLines = cleaned.split(/\r?\n/);
  const tokens: GedcomToken[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const lineNumber = i + 1;

    // Skip blank lines
    if (line.trim() === '') {
      continue;
    }

    const match = LINE_REGEX.exec(line.trim());
    if (!match) {
      // Malformed line — skip silently (errors will be caught at higher levels)
      continue;
    }

    const level = parseInt(match[1], 10);
    const xref = match[2] ?? null;
    const tag = match[3].toUpperCase();
    const value = match[4] ?? '';

    // Handle CONT and CONC by appending to the previous token's value
    if ((tag === 'CONT' || tag === 'CONC') && tokens.length > 0) {
      const prev = tokens[tokens.length - 1];
      if (tag === 'CONT') {
        prev.value += '\n' + value;
      } else {
        // CONC: concatenation without newline or space
        prev.value += value;
      }
      continue;
    }

    tokens.push({
      level,
      xref,
      tag,
      value,
      lineNumber,
    });
  }

  return tokens;
}
