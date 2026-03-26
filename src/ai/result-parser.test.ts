import { describe, it, expect } from 'vitest';
import { parseQuickCheckResult, parseValidationReport, parseDeepResearchRound } from './result-parser.ts';

describe('parseQuickCheckResult', () => {
  it('parses valid JSON response', () => {
    const response = `{
      "plausibility": "plausible",
      "issues": [
        { "type": "date", "description": "Birth year 1500 is unlikely", "correction": "Should be ~1800" }
      ],
      "suggestedTier": 3,
      "tierReason": "No sources attached",
      "quickWin": "Search for census record"
    }`;
    const result = parseQuickCheckResult(response);
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBe('plausible');
    expect(result!.issues).toHaveLength(1);
    expect(result!.issues[0].type).toBe('date');
    expect(result!.issues[0].correction).toBe('Should be ~1800');
    expect(result!.suggestedTier).toBe(3);
    expect(result!.tierReason).toBe('No sources attached');
    expect(result!.quickWin).toBe('Search for census record');
  });

  it('handles JSON wrapped in markdown fence', () => {
    const response = 'Here is the result:\n```json\n{"plausibility":"confirmed","issues":[],"suggestedTier":1,"tierReason":"Well documented","quickWin":null}\n```';
    const result = parseQuickCheckResult(response);
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBe('confirmed');
    expect(result!.issues).toEqual([]);
    expect(result!.quickWin).toBeNull();
  });

  it('handles JSON with surrounding prose', () => {
    const response = 'Based on my analysis:\n{"plausibility":"questionable","issues":[],"suggestedTier":4,"tierReason":"Issues found","quickWin":"Check dates"}\nThat is my assessment.';
    const result = parseQuickCheckResult(response);
    expect(result).not.toBeNull();
    expect(result!.plausibility).toBe('questionable');
  });

  it('defaults invalid plausibility to questionable', () => {
    const response = '{"plausibility":"maybe","issues":[],"suggestedTier":3,"tierReason":"test"}';
    const result = parseQuickCheckResult(response);
    expect(result!.plausibility).toBe('questionable');
  });

  it('clamps invalid tier to 4', () => {
    const response = '{"plausibility":"plausible","issues":[],"suggestedTier":99,"tierReason":"test"}';
    const result = parseQuickCheckResult(response);
    expect(result!.suggestedTier).toBe(4);
  });

  it('returns null for non-JSON response', () => {
    expect(parseQuickCheckResult('This is just text')).toBeNull();
  });

  it('defaults unknown issue type to connection', () => {
    const response = '{"plausibility":"plausible","issues":[{"type":"unknown_type","description":"test"}],"suggestedTier":3,"tierReason":"test"}';
    const result = parseQuickCheckResult(response);
    expect(result!.issues[0].type).toBe('connection');
  });
});

describe('parseValidationReport', () => {
  it('parses full validation report', () => {
    const response = `{
      "personAssessment": {
        "plausibility": "plausible",
        "summary": "Person is historically plausible for the era."
      },
      "parentalLink": {
        "status": "questionable",
        "summary": "No records confirm this connection."
      },
      "recordsFound": [
        {
          "type": "census",
          "title": "1850 Census Cabarrus County",
          "url": "https://familysearch.org/ark:/123",
          "repository": "FamilySearch",
          "confirms": ["residence in Cabarrus County"],
          "contradicts": [],
          "sourceClass": "primary"
        }
      ],
      "recordsExpectedButNotFound": [
        {
          "type": "vital",
          "description": "Birth record in NC vital records",
          "significance": "Would confirm birth date and parents"
        }
      ],
      "dateDiscrepancies": [
        {
          "gedcomClaim": "Born 1850",
          "evidenceSays": "Census shows born ~1848",
          "source": "1850 Census"
        }
      ],
      "suggestedTier": 2,
      "nextStep": {
        "action": "Check NC marriage bonds",
        "repository": "NC State Archives",
        "expectedCost": "free",
        "impactIfFound": "Would confirm parents and wife"
      }
    }`;
    const result = parseValidationReport(response);
    expect(result).not.toBeNull();
    expect(result!.personAssessment.plausibility).toBe('plausible');
    expect(result!.parentalLink?.status).toBe('questionable');
    expect(result!.recordsFound).toHaveLength(1);
    expect(result!.recordsFound[0].type).toBe('census');
    expect(result!.recordsFound[0].sourceClass).toBe('primary');
    expect(result!.recordsExpectedButNotFound).toHaveLength(1);
    expect(result!.dateDiscrepancies).toHaveLength(1);
    expect(result!.suggestedTier).toBe(2);
    expect(result!.nextStep?.action).toBe('Check NC marriage bonds');
    expect(result!.nextStep?.expectedCost).toBe('free');
  });

  it('handles missing parentalLink', () => {
    const response = '{"personAssessment":{"plausibility":"confirmed","summary":"ok"},"recordsFound":[],"recordsExpectedButNotFound":[],"dateDiscrepancies":[],"suggestedTier":1}';
    const result = parseValidationReport(response);
    expect(result).not.toBeNull();
    expect(result!.parentalLink).toBeNull();
    expect(result!.nextStep).toBeNull();
  });

  it('defaults invalid record type to other', () => {
    const response = '{"personAssessment":{"plausibility":"plausible","summary":"ok"},"recordsFound":[{"type":"weird","title":"test","repository":"test","confirms":[],"contradicts":[],"sourceClass":"secondary"}],"recordsExpectedButNotFound":[],"dateDiscrepancies":[],"suggestedTier":3}';
    const result = parseValidationReport(response);
    expect(result!.recordsFound[0].type).toBe('other');
  });

  it('returns null for non-JSON response', () => {
    expect(parseValidationReport('No JSON here')).toBeNull();
  });
});

describe('parseDeepResearchRound', () => {
  it('parses a research round', () => {
    const response = `STATUS: CONTINUE — I found some promising leads.

{
  "round": 1,
  "searchesPerformed": ["John Smith 1850 NC census", "Smith Cabarrus County land grant"],
  "findings": [
    {
      "type": "confirmation",
      "description": "Found census record listing John Smith in Cabarrus County",
      "url": "https://familysearch.org/ark:/123",
      "sourceClass": "primary",
      "relevantTo": "residence and approximate birth year"
    },
    {
      "type": "absence",
      "description": "No marriage record found in Cabarrus County",
      "url": null,
      "sourceClass": null,
      "relevantTo": "marriage to Jane Doe"
    }
  ],
  "status": "CONTINUE"
}`;
    const result = parseDeepResearchRound(response);
    expect(result).not.toBeNull();
    expect(result!.round).toBe(1);
    expect(result!.searchesPerformed).toHaveLength(2);
    expect(result!.findings).toHaveLength(2);
    expect(result!.findings[0].type).toBe('confirmation');
    expect(result!.findings[0].sourceClass).toBe('primary');
    expect(result!.findings[1].type).toBe('absence');
    expect(result!.findings[1].sourceClass).toBeNull();
    expect(result!.status).toBe('CONTINUE');
  });

  it('parses COMPLETE status', () => {
    const response = '{"round":3,"searchesPerformed":[],"findings":[],"status":"COMPLETE"}';
    const result = parseDeepResearchRound(response);
    expect(result!.status).toBe('COMPLETE');
  });

  it('parses DEAD_END status', () => {
    const response = '{"round":2,"searchesPerformed":["query"],"findings":[],"status":"DEAD_END"}';
    const result = parseDeepResearchRound(response);
    expect(result!.status).toBe('DEAD_END');
  });

  it('falls back to STATUS: line in prose when JSON status missing', () => {
    const response = `STATUS: COMPLETE — I have enough information.

{"round":2,"searchesPerformed":[],"findings":[]}`;
    const result = parseDeepResearchRound(response);
    expect(result!.status).toBe('COMPLETE');
  });

  it('defaults unknown finding type to new_lead', () => {
    const response = '{"round":1,"searchesPerformed":[],"findings":[{"type":"unknown","description":"test","relevantTo":"test"}],"status":"CONTINUE"}';
    const result = parseDeepResearchRound(response);
    expect(result!.findings[0].type).toBe('new_lead');
  });

  it('returns null for non-JSON response', () => {
    expect(parseDeepResearchRound('No JSON here')).toBeNull();
  });
});
