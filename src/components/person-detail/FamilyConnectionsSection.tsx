import { useState } from 'react';
import type { Person } from '@/types/person.ts';
import type { ParentWithEdge } from '@/hooks/use-person-detail.ts';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import { PersonLink } from './PersonLink.tsx';
import { ConfidenceBadge } from './ConfidenceBadge.tsx';
import { AddEdgeModal } from '@/components/shared/AddEdgeModal.tsx';
import { AddPersonModal } from '@/components/shared/AddPersonModal.tsx';
import { useTree } from '@/hooks/index.ts';
import { generateEdgeId } from '@/utils/id-generator.ts';

interface FamilyConnectionsSectionProps {
  person: Person;
  parents: ParentWithEdge[];
  children: Person[];
  siblings: Person[];
  spouses: Person[];
  graph: TreeGraph;
  onNavigate: (personId: string) => void;
}

type AddMode = 'addParent' | 'addChild' | 'addSpouseExisting' | null;

function FamilyGroup({ label, action, children: content }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs text-text-dim uppercase tracking-wide">{label}</h4>
        {action}
      </div>
      <div className="space-y-1">{content}</div>
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-gold hover:text-gold-light transition-colors"
    >
      + {label}
    </button>
  );
}

export function FamilyConnectionsSection({
  person,
  parents,
  children,
  siblings,
  spouses,
  graph,
  onNavigate,
}: FamilyConnectionsSectionProps) {
  const { dispatch } = useTree();
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [showNewPersonForRole, setShowNewPersonForRole] = useState<'parent' | 'child' | null>(null);

  const handleNewPersonCreated = (newPersonId: string, role: 'parent' | 'child') => {
    // Create edge between the new person and current person
    const edge = {
      id: generateEdgeId(),
      parentId: role === 'parent' ? newPersonId : person.id,
      childId: role === 'parent' ? person.id : newPersonId,
      relationshipType: 'biological' as const,
      legitimacy: 'unknown' as const,
      marriage: null,
      confidenceTier: 4 as const,
      confidenceReason: 'Newly created, no sources',
      parallelGroupId: null,
      isPrimary: true,
      pathLabel: null,
      sourceIds: [],
      flagIds: [],
      familyGedcomXref: null,
      createdAt: new Date(),
    };
    dispatch({ type: 'ADD_EDGE', edge });
    setShowNewPersonForRole(null);
  };

  return (
    <section>
      <h3 className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
        Family
      </h3>
      <div className="space-y-3">
        <FamilyGroup
          label="Parents"
          action={
            <div className="flex gap-2">
              <AddButton onClick={() => setAddMode('addParent')} label="Existing" />
              <AddButton onClick={() => setShowNewPersonForRole('parent')} label="New" />
            </div>
          }
        >
          {parents.length > 0 ? (
            parents.map(({ person: p, edge }) => (
              <div key={p.id} className="flex items-center gap-2">
                <PersonLink person={p} onClick={onNavigate} />
                <ConfidenceBadge tier={edge.confidenceTier} />
                {!edge.isPrimary && (
                  <span className="text-xs text-text-dim">(alt)</span>
                )}
                {edge.pathLabel && (
                  <span className="text-xs text-text-dim">({edge.pathLabel})</span>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-text-dim italic">No parents recorded</p>
          )}
        </FamilyGroup>

        {spouses.length > 0 && (
          <FamilyGroup label="Spouses">
            {spouses.map(spouse => (
              <div key={spouse.id}>
                <PersonLink person={spouse} onClick={onNavigate} />
              </div>
            ))}
          </FamilyGroup>
        )}

        <FamilyGroup
          label={`Children${children.length > 0 ? ` (${children.length})` : ''}`}
          action={
            <div className="flex gap-2">
              <AddButton onClick={() => setAddMode('addChild')} label="Existing" />
              <AddButton onClick={() => setShowNewPersonForRole('child')} label="New" />
            </div>
          }
        >
          {children.length > 0 ? (
            children.map(child => (
              <div key={child.id}>
                <PersonLink person={child} onClick={onNavigate} />
              </div>
            ))
          ) : (
            <p className="text-xs text-text-dim italic">No children recorded</p>
          )}
        </FamilyGroup>

        {siblings.length > 0 && (
          <FamilyGroup label={`Siblings (${siblings.length})`}>
            {siblings.map(sib => (
              <div key={sib.id}>
                <PersonLink person={sib} onClick={onNavigate} />
              </div>
            ))}
          </FamilyGroup>
        )}
      </div>

      {/* Add existing person as parent */}
      {addMode === 'addParent' && (
        <AddEdgeModal
          graph={graph}
          presetChildId={person.id}
          onClose={() => setAddMode(null)}
        />
      )}

      {/* Add existing person as child */}
      {addMode === 'addChild' && (
        <AddEdgeModal
          graph={graph}
          presetParentId={person.id}
          onClose={() => setAddMode(null)}
        />
      )}

      {/* Create new person and link as parent/child */}
      {showNewPersonForRole && (
        <AddPersonModal
          onClose={() => setShowNewPersonForRole(null)}
          onCreated={(newId) => handleNewPersonCreated(newId, showNewPersonForRole)}
        />
      )}
    </section>
  );
}
