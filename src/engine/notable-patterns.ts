import type { NotableCategory } from '@/types/story-path.ts';

export interface PatternRule {
  pattern: RegExp;
  category: NotableCategory;
  significance: string;
}

// ── Name-based matching ─────────────────────────────────────────────

export const KNOWN_FIGURES: PatternRule[] = [
  { pattern: /charlemagne/i, category: 'royalty', significance: 'Emperor of the Carolingian Empire (800–814)' },
  { pattern: /william\s*(the\s*)?conqueror/i, category: 'royalty', significance: 'King of England (1066–1087)' },
  { pattern: /alfred\b.*\bgreat/i, category: 'royalty', significance: 'King of Wessex (871–899)' },
  { pattern: /robert\s*(the\s*)?bruce/i, category: 'royalty', significance: 'King of Scotland (1306–1329)' },
  { pattern: /eleanor\b.*\baquitaine/i, category: 'royalty', significance: 'Queen of France and England (1122–1204)' },
  { pattern: /pocahontas/i, category: 'indigenous_leader', significance: 'Powhatan woman, key figure in early Virginia colony' },
  { pattern: /shakespeare/i, category: 'author_theologian', significance: 'English playwright and poet (1564–1616)' },
  { pattern: /mayflower/i, category: 'colonial_gentry', significance: 'Mayflower passenger (1620)' },
];

// ── Title-based matching ────────────────────────────────────────────

export const TITLE_PATTERNS: PatternRule[] = [
  { pattern: /knight\s*templar/i, category: 'military_order', significance: 'Member of the Knights Templar' },
  { pattern: /\bregicide\b/i, category: 'political', significance: 'Signed the death warrant of a monarch' },
  { pattern: /\bcovenanter\b/i, category: 'clergy', significance: 'Scottish Presbyterian Covenanter' },
  { pattern: /lord\s*high\s*chancellor/i, category: 'legal_scholar', significance: 'Lord High Chancellor of England' },
  { pattern: /\bchief\b.*\b(cornstalk|shawnee|cherokee|creek|chickasaw|choctaw)/i, category: 'indigenous_leader', significance: 'Native American chief' },
  { pattern: /\bking\s*of\s*(england|scotland|france|jerusalem|norway|sweden|denmark)/i, category: 'royalty', significance: 'Monarch' },
  { pattern: /\bqueen\s*of\s*(england|scotland|france)/i, category: 'royalty', significance: 'Queen consort or regnant' },
  { pattern: /\bprince\b|\bprincess\b/i, category: 'royalty', significance: 'Royal prince or princess' },
  { pattern: /\bduke\s*of\b/i, category: 'royalty', significance: 'Duke' },
  { pattern: /\bearl\s*of\b/i, category: 'royalty', significance: 'Earl' },
  { pattern: /\bbaron\s*of\b/i, category: 'royalty', significance: 'Baron' },
];

// ── Role-based matching ─────────────────────────────────────────────

export const ROLE_PATTERNS: PatternRule[] = [
  { pattern: /\bauthor\b|\bpoet\b|\bwriter\b|\bplaywright\b/i, category: 'author_theologian', significance: 'Writer or poet' },
  { pattern: /\bphysician\b|\bsurgeon\b|\bdoctor\b/i, category: 'scientist_physician', significance: 'Physician or surgeon' },
  { pattern: /\bbishop\b|\barchbishop\b/i, category: 'clergy', significance: 'Church bishop or archbishop' },
  { pattern: /\bminister\b|\bpastor\b|\breverend\b/i, category: 'clergy', significance: 'Minister or pastor' },
  { pattern: /\bgeneral\b|\bcolonel\b|\bcaptain\b/i, category: 'military', significance: 'Military officer' },
  { pattern: /\bgovernor\b/i, category: 'political', significance: 'Colonial or state governor' },
  { pattern: /\bsenator\b|\bcongressman\b/i, category: 'political', significance: 'Legislator' },
  { pattern: /\bjudge\b|\bjustice\b/i, category: 'legal_scholar', significance: 'Judge or justice' },
];

// ── Matching function ───────────────────────────────────────────────

export function matchPatterns(text: string): PatternRule[] {
  const matches: PatternRule[] = [];
  for (const rule of KNOWN_FIGURES) {
    if (rule.pattern.test(text)) matches.push(rule);
  }
  for (const rule of TITLE_PATTERNS) {
    if (rule.pattern.test(text)) matches.push(rule);
  }
  for (const rule of ROLE_PATTERNS) {
    if (rule.pattern.test(text)) matches.push(rule);
  }
  return matches;
}
