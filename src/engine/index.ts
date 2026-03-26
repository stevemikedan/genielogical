export { runFlagEngine } from './flag-engine.ts';
export { scoreEdgeConfidence, scorePersonConfidence, scoreAllConfidence } from './confidence-scorer.ts';
export { detectBridgeZones } from './bridge-detector.ts';
export { KNOWN_FIGURES, TITLE_PATTERNS, ROLE_PATTERNS, matchPatterns } from './notable-patterns.ts';
export type { PatternRule } from './notable-patterns.ts';
export { findNotableAncestors } from './story-paths.ts';
export { runDeepScan } from './deep-scanner.ts';
export { computeResearchPriorities } from './impact-scorer.ts';
export { generateResearchSteps } from './research-recommender.ts';
