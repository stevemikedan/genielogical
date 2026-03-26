import { useState, useCallback, useMemo } from 'react';
import { useAI } from '@/hooks/use-ai.ts';
import { useTree } from '@/hooks/use-tree.ts';
import { getApiKey } from '@/ai/ai-client.ts';
import { parseDateInput } from '@/parser/date-input-parser.ts';
import { parsePlaceInput } from '@/parser/place-input-parser.ts';
import { generatePersonId, generateEdgeId } from '@/utils/id-generator.ts';
import { buildSourceSearchPlan } from '@/ai/genealogy-source-registry.ts';
import type { EnrichSuggestionField } from '@/types/ai.ts';
import type { Person } from '@/types/person.ts';

interface AIEnrichSectionProps {
  personId: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-tier1 bg-tier1/10 border-tier1/30',
  medium: 'text-tier2 bg-tier2/10 border-tier2/30',
  low: 'text-tier3 bg-tier3/10 border-tier3/30',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
};

export function AIEnrichSection({ personId }: AIEnrichSectionProps) {
  const { enrichPerson, getEnrichResult } = useAI();
  const { state, dispatch } = useTree();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [acceptedSinceLastSearch, setAcceptedSinceLastSearch] = useState(false);

  const result = getEnrichResult(personId);
  const hasKey = getApiKey() !== null;
  const person = state.graph?.persons.get(personId);

  // Build source search plan for this person
  const searchPlan = useMemo(() => {
    if (!person) return null;
    return buildSourceSearchPlan(person);
  }, [person]);

  const addReferenceUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (trimmed && !referenceUrls.includes(trimmed)) {
      setReferenceUrls(prev => [...prev, trimmed]);
      setUrlInput('');
    }
  }, [urlInput, referenceUrls]);

  const removeReferenceUrl = useCallback((url: string) => {
    setReferenceUrls(prev => prev.filter(u => u !== url));
  }, []);

  const handleEnrich = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccepted(new Set());
    setRejected(new Set());
    setAcceptedSinceLastSearch(false);
    try {
      const urls = referenceUrls.length > 0 ? referenceUrls : undefined;
      const r = await enrichPerson(personId, urls);
      if (!r) setError('Failed to parse AI response.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI enrichment failed.');
    } finally {
      setLoading(false);
    }
  }, [enrichPerson, personId, referenceUrls]);

  const applySuggestion = useCallback((suggestion: EnrichSuggestionField, index: number) => {
    if (!state.graph || !person) return;

    switch (suggestion.field) {
      case 'birthDate':
        dispatch({
          type: 'UPDATE_PERSON',
          personId,
          updates: {
            birth: {
              ...person.birth,
              date: parseDateInput(suggestion.value),
            },
          },
        });
        break;

      case 'birthPlace':
        dispatch({
          type: 'UPDATE_PERSON',
          personId,
          updates: {
            birth: {
              ...person.birth,
              place: parsePlaceInput(suggestion.value),
            },
          },
        });
        break;

      case 'deathDate':
        dispatch({
          type: 'UPDATE_PERSON',
          personId,
          updates: {
            death: {
              ...person.death,
              date: parseDateInput(suggestion.value),
            },
          },
        });
        break;

      case 'deathPlace':
        dispatch({
          type: 'UPDATE_PERSON',
          personId,
          updates: {
            death: {
              ...person.death,
              place: parsePlaceInput(suggestion.value),
            },
          },
        });
        break;

      case 'sex':
        {
          const sexVal = suggestion.value.toUpperCase().startsWith('M') ? 'M'
            : suggestion.value.toUpperCase().startsWith('F') ? 'F' : 'U';
          dispatch({
            type: 'UPDATE_PERSON',
            personId,
            updates: { sex: sexVal as Person['sex'] },
          });
        }
        break;

      case 'father':
      case 'mother':
      case 'sibling':
        {
          // Create a new person and link appropriately
          const newId = generatePersonId();
          const inferredSex = suggestion.field === 'father' ? 'M'
            : suggestion.field === 'mother' ? 'F' : 'U';
          const newPerson: Person = {
            id: newId,
            name: {
              full: suggestion.value,
              given: suggestion.value.split(' ')[0] ?? '',
              middle: '',
              surname: suggestion.value.split(' ').slice(1).join(' '),
              maidenName: '',
              prefix: '',
              suffix: '',
              raw: suggestion.value,
            },
            alternateNames: [],
            sex: inferredSex as Person['sex'],
            birth: { date: null, place: null },
            death: { date: null, place: null },
            burial: null,
            events: [],
            notes: suggestion.sourceHint ? `Source: ${suggestion.sourceHint}` : '',
            customTags: [],
            confidenceTier: 4,
            confidenceReason: `Created from AI suggestion (${suggestion.sourceDatabase ?? 'records search'})`,
            status: 'tentative',
            sourceIds: [],
            flagIds: [],
            researchStepIds: [],
            conjectureIds: [],
            gedcomXref: null,
            familyIdAsSpouse: [],
            familyIdAsChild: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          dispatch({ type: 'ADD_PERSON', person: newPerson });

          if (suggestion.field === 'father' || suggestion.field === 'mother') {
            // Link as parent → child
            dispatch({
              type: 'ADD_EDGE',
              edge: {
                id: generateEdgeId(),
                parentId: newId,
                childId: personId,
                relationshipType: 'biological',
                legitimacy: 'unknown',
                marriage: null,
                confidenceTier: 4,
                confidenceReason: `Created from AI suggestion (${suggestion.sourceDatabase ?? 'records search'})`,
                parallelGroupId: null,
                isPrimary: true,
                pathLabel: null,
                sourceIds: [],
                flagIds: [],
                familyGedcomXref: null,
                createdAt: new Date(),
              },
            });
          } else if (suggestion.field === 'sibling') {
            // Link as sibling: find this person's parents and add edges from parents → new sibling
            const parentEdges = state.graph.parentEdges.get(personId) ?? [];
            for (const pe of parentEdges) {
              dispatch({
                type: 'ADD_EDGE',
                edge: {
                  id: generateEdgeId(),
                  parentId: pe.parentId,
                  childId: newId,
                  relationshipType: 'biological',
                  legitimacy: 'unknown',
                  marriage: null,
                  confidenceTier: 4,
                  confidenceReason: `Created from AI suggestion (${suggestion.sourceDatabase ?? 'records search'})`,
                  parallelGroupId: null,
                  isPrimary: true,
                  pathLabel: null,
                  sourceIds: [],
                  flagIds: [],
                  familyGedcomXref: null,
                  createdAt: new Date(),
                },
              });
            }
          }
        }
        break;

      case 'spouse':
        {
          const newId = generatePersonId();
          const spouseSex = person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : 'U';
          const newPerson: Person = {
            id: newId,
            name: {
              full: suggestion.value,
              given: suggestion.value.split(' ')[0] ?? '',
              middle: '',
              surname: suggestion.value.split(' ').slice(1).join(' '),
              maidenName: '',
              prefix: '',
              suffix: '',
              raw: suggestion.value,
            },
            alternateNames: [],
            sex: spouseSex as Person['sex'],
            birth: { date: null, place: null },
            death: { date: null, place: null },
            burial: null,
            events: [],
            notes: suggestion.sourceHint ? `Source: ${suggestion.sourceHint}` : '',
            customTags: [],
            confidenceTier: 4,
            confidenceReason: `Created from AI suggestion (${suggestion.sourceDatabase ?? 'records search'})`,
            status: 'tentative',
            sourceIds: [],
            flagIds: [],
            researchStepIds: [],
            conjectureIds: [],
            gedcomXref: null,
            familyIdAsSpouse: [],
            familyIdAsChild: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          dispatch({ type: 'ADD_PERSON', person: newPerson });
        }
        break;

      case 'occupation':
      case 'note':
        if (suggestion.field === 'occupation') {
          dispatch({
            type: 'UPDATE_PERSON',
            personId,
            updates: {
              events: [
                ...person.events,
                {
                  type: 'occupation',
                  date: null,
                  place: null,
                  notes: suggestion.value,
                  sourceIds: [],
                },
              ],
            },
          });
        }
        break;
    }

    setAccepted(prev => new Set(prev).add(index));
    setAcceptedSinceLastSearch(true);
  }, [state.graph, person, personId, dispatch]);

  const rejectSuggestion = useCallback((index: number) => {
    setRejected(prev => new Set(prev).add(index));
  }, []);

  // Determine if the person has sparse data worth enriching
  const isSparse = person && (
    !person.birth.date || !person.birth.place ||
    !person.death.date || !person.death.place ||
    person.sex === 'U'
  );

  return (
    <section>
      <h3 className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide flex items-center gap-2">
        AI Record Search
        {!hasKey && (
          <span className="text-xs text-text-dim font-normal normal-case">(configure API key first)</span>
        )}
      </h3>

      {/* Reference URL input — shown before and after results */}
      <ReferenceUrlInput
        urlInput={urlInput}
        setUrlInput={setUrlInput}
        referenceUrls={referenceUrls}
        addReferenceUrl={addReferenceUrl}
        removeReferenceUrl={removeReferenceUrl}
      />

      {!result && (
        <div className="space-y-2">
          {isSparse && (
            <p className="text-xs text-text-dim">
              Search genealogical databases (FamilySearch, FindAGrave, Ancestry, etc.) for records matching this person.
            </p>
          )}

          {/* Source search panel toggle */}
          {searchPlan && searchPlan.sources.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSourcePanel(!showSourcePanel)}
              className="text-xs text-gold/80 hover:text-gold transition-colors"
            >
              {showSourcePanel ? 'Hide' : 'Show'} {searchPlan.sources.length} searchable databases
            </button>
          )}

          {showSourcePanel && searchPlan && (
            <SourceSearchPanel plan={searchPlan} />
          )}

          <button
            type="button"
            onClick={handleEnrich}
            disabled={loading || !hasKey}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                       hover:text-gold hover:border-gold/40 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-3 h-3 border border-gold/50 border-t-gold rounded-full animate-spin" />
                Searching records...
              </>
            ) : (
              referenceUrls.length > 0
                ? `Search Records (+ ${referenceUrls.length} reference URL${referenceUrls.length > 1 ? 's' : ''})`
                : 'Search Records & Suggest Details'
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-tier4 mt-1">{error}</p>
      )}

      {result && (
        <div className="space-y-3 mt-1">
          {/* Summary */}
          <div className="rounded border border-border bg-bg p-3">
            {result.identifiedAs && (
              <p className="text-sm text-gold font-medium mb-1">
                Identified as: {result.identifiedAs}
              </p>
            )}
            <p className="text-sm text-text-secondary">{result.summary}</p>

            {/* Sources searched */}
            {result.sourcesSearched.length > 0 && (
              <p className="text-xs text-text-dim mt-2">
                Databases checked: {result.sourcesSearched.join(', ')}
              </p>
            )}
          </div>

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-text-dim">
                Review each suggestion — accept to apply, reject to skip:
              </p>
              {result.suggestions.map((s, i) => {
                const isAccepted = accepted.has(i);
                const isRejected = rejected.has(i);
                const isActioned = isAccepted || isRejected;

                return (
                  <div
                    key={i}
                    className={`rounded border p-2.5 transition-opacity ${
                      isActioned ? 'opacity-50' : 'border-border bg-bg'
                    } ${isAccepted ? 'border-tier1/30 bg-tier1/5' : ''} ${isRejected ? 'border-tier4/20 bg-tier4/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">{s.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[s.confidence]}`}>
                          {CONFIDENCE_LABELS[s.confidence]}
                        </span>
                        {s.sourceDatabase && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold/80 border border-gold/20">
                            {s.sourceDatabase}
                          </span>
                        )}
                      </div>
                      {!isActioned && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => applySuggestion(s, i)}
                            className="px-2 py-0.5 text-xs rounded bg-tier1/20 text-tier1
                                       hover:bg-tier1/30 border border-tier1/30 transition-colors"
                            title="Accept and apply"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectSuggestion(i)}
                            className="px-2 py-0.5 text-xs rounded bg-tier4/10 text-tier4
                                       hover:bg-tier4/20 border border-tier4/20 transition-colors"
                            title="Reject"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {isAccepted && <span className="text-xs text-tier1">Applied</span>}
                      {isRejected && <span className="text-xs text-tier4">Skipped</span>}
                    </div>
                    <p className="text-sm text-text-primary">{s.value}</p>
                    {s.reasoning && (
                      <p className="text-xs text-text-dim mt-1">{s.reasoning}</p>
                    )}
                    {s.sourceHint && (
                      <p className="text-xs text-gold/70 mt-0.5">
                        Record: {s.sourceHint}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-0.5">
                      {s.recordUrl && (
                        <a
                          href={s.recordUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-tier1 hover:text-tier1/80 inline-block underline font-medium"
                        >
                          View Record
                        </a>
                      )}
                      {s.searchUrl && (
                        <a
                          href={s.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-xs text-tier2 hover:text-tier2/80 inline-block underline ${s.recordUrl ? 'text-text-dim' : ''}`}
                        >
                          {s.recordUrl ? `Search ${s.sourceDatabase ?? 'collection'}` : `Verify on ${s.sourceDatabase ?? 'source'}`}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.suggestions.length === 0 && (
            <p className="text-xs text-text-dim">
              No matching records found — the name may be too common or the era/location unclear.
            </p>
          )}

          {/* Web citations from live search */}
          {result.webCitations.length > 0 && (
            <div className="rounded border border-border bg-bg p-3 space-y-1.5">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Records Found Online ({result.webCitations.length})
              </p>
              {result.webCitations.map((cite, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-tier2 mt-0.5 flex-shrink-0">&#9679;</span>
                  <div className="min-w-0">
                    <a
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-tier2 hover:text-tier2/80 underline truncate block"
                    >
                      {cite.title ?? cite.url}
                    </a>
                    {cite.citedText && (
                      <p className="text-[11px] text-text-dim mt-0.5 line-clamp-2">
                        &ldquo;{cite.citedText.slice(0, 150)}{cite.citedText.length > 150 ? '...' : ''}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Source search links */}
          {searchPlan && searchPlan.sources.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowSourcePanel(!showSourcePanel)}
                className="text-xs text-gold/80 hover:text-gold transition-colors"
              >
                {showSourcePanel ? 'Hide' : 'Search manually on'} {searchPlan.sources.length} databases
              </button>
              {showSourcePanel && <SourceSearchPanel plan={searchPlan} />}
            </div>
          )}

          {/* Updated data indicator */}
          {acceptedSinceLastSearch && (
            <p className="text-xs text-gold/80 italic">
              Person data updated since last search — search again for refined results.
            </p>
          )}

          {/* Re-run button */}
          <button
            type="button"
            onClick={handleEnrich}
            disabled={loading}
            className="text-xs text-text-dim hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            {loading ? (
              <>
                <span className="w-2.5 h-2.5 border border-text-dim/50 border-t-text-dim rounded-full animate-spin" />
                Searching records...
              </>
            ) : (
              referenceUrls.length > 0
                ? `Search again (+ ${referenceUrls.length} reference URL${referenceUrls.length > 1 ? 's' : ''})`
                : 'Search again'
            )}
          </button>
        </div>
      )}
    </section>
  );
}

// ── Reference URL Input ──────────────────────────────────────────

function ReferenceUrlInput({
  urlInput,
  setUrlInput,
  referenceUrls,
  addReferenceUrl,
  removeReferenceUrl,
}: {
  urlInput: string;
  setUrlInput: (v: string) => void;
  referenceUrls: string[];
  addReferenceUrl: () => void;
  removeReferenceUrl: (url: string) => void;
}) {
  return (
    <div className="space-y-1.5 mb-2">
      <div className="flex gap-1.5">
        <input
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addReferenceUrl(); } }}
          placeholder="Paste a FindAGrave, Ancestry, or other genealogy URL..."
          className="flex-1 px-2 py-1 text-xs rounded border border-border bg-bg text-text-primary
                     placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={addReferenceUrl}
          disabled={!urlInput.trim()}
          className="px-2 py-1 text-xs rounded border border-border text-text-secondary
                     hover:text-gold hover:border-gold/40 transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
      {referenceUrls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {referenceUrls.map(url => (
            <span
              key={url}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full
                         bg-gold/10 text-gold/80 border border-gold/20 max-w-[280px]"
            >
              <span className="truncate">{url.replace(/^https?:\/\//, '').slice(0, 40)}</span>
              <button
                type="button"
                onClick={() => removeReferenceUrl(url)}
                className="text-gold/60 hover:text-gold flex-shrink-0"
                title="Remove"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Source Search Panel ──────────────────────────────────────────

import type { SourceSearchPlan } from '@/ai/genealogy-source-registry.ts';

function SourceSearchPanel({ plan }: { plan: SourceSearchPlan }) {
  return (
    <div className="rounded border border-border bg-bg p-3 space-y-2">
      <p className="text-xs text-text-dim">
        Prioritized databases for {plan.era} era{plan.region !== 'unknown' ? `, ${plan.region}` : ''}:
      </p>
      {plan.sources.map(({ source, searchUrl }) => (
        <div key={source.id} className="flex items-start gap-2">
          <span className={`text-[10px] mt-0.5 px-1 rounded ${source.freeToSearch ? 'bg-tier1/15 text-tier1' : 'bg-tier3/15 text-tier3'}`}>
            {source.freeToSearch ? 'Free' : 'Paid'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-primary">{source.shortName}</span>
              <span className="text-[10px] text-text-dim">{source.recordTypes.slice(0, 3).join(', ')}</span>
            </div>
            {searchUrl && (
              <a
                href={searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-tier2 hover:text-tier2/80 underline truncate block"
              >
                Search {source.shortName}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
