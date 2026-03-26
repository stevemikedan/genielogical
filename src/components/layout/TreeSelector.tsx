/**
 * TreeSelector — dropdown in header showing current tree name.
 * Lists all trees with name, count, last opened.
 * "New Tree" and "Import" buttons.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/hooks/use-workspace.ts';
import type { TreeMetadata } from '@/types/tree.ts';

interface TreeSelectorProps {
  onImportFile: (file: File, name: string) => void;
}

function formatDate(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function TreeSelector({ onImportFile }: TreeSelectorProps) {
  const { workspaceState, switchTree, createNewTree, removeTree } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowNewForm(false);
        setConfirmDelete(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const currentTree = workspaceState.trees.find(t => t.id === workspaceState.currentTreeId);

  const handleSwitchTree = useCallback(async (tree: TreeMetadata) => {
    if (tree.id === workspaceState.currentTreeId) {
      setIsOpen(false);
      return;
    }
    await switchTree(tree.id);
    setIsOpen(false);
  }, [workspaceState.currentTreeId, switchTree]);

  const handleCreateTree = useCallback(async () => {
    const name = newTreeName.trim() || 'Untitled Tree';
    await createNewTree(name);
    setNewTreeName('');
    setShowNewForm(false);
    setIsOpen(false);
  }, [newTreeName, createNewTree]);

  const handleDeleteTree = useCallback(async (treeId: string) => {
    await removeTree(treeId);
    setConfirmDelete(null);
  }, [removeTree]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.ged$/i, '').replace(/[_-]/g, ' ');
    onImportFile(file, name);
    setIsOpen(false);
    // Reset input so re-selecting same file triggers onChange
    e.target.value = '';
  }, [onImportFile]);

  const saveStatusLabel = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved',
    error: 'Save error',
  }[workspaceState.saveStatus];

  const saveStatusColor = {
    saved: 'text-tier1',
    saving: 'text-tier3',
    unsaved: 'text-text-dim',
    error: 'text-tier4',
  }[workspaceState.saveStatus];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm
                   border border-border hover:bg-surface transition-colors max-w-[200px]"
      >
        <span className="truncate text-text-primary">
          {currentTree?.name ?? 'No tree'}
        </span>
        <span className={`text-xs ${saveStatusColor}`}>
          {currentTree ? saveStatusLabel : ''}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" className="text-text-dim shrink-0">
          <path d="M1 1 L5 5 L9 1" stroke="currentColor" fill="none" strokeWidth="1.5" />
        </svg>
      </button>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ged,.gedcom"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-surface border border-border
                        rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Tree list */}
          {workspaceState.trees.length > 0 && (
            <div className="max-h-60 overflow-y-auto">
              {workspaceState.trees.map(tree => (
                <div
                  key={tree.id}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer
                              hover:bg-surface-hover transition-colors group
                              ${tree.id === workspaceState.currentTreeId ? 'bg-gold/10' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSwitchTree(tree)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="truncate text-text-primary font-medium">{tree.name}</div>
                    <div className="text-xs text-text-dim">
                      {tree.personCount} people · {formatDate(tree.lastOpenedAt)}
                    </div>
                  </button>

                  {/* Delete button */}
                  {confirmDelete === tree.id ? (
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteTree(tree.id)}
                        className="text-xs px-1.5 py-0.5 rounded bg-tier4/20 text-tier4 hover:bg-tier4/30"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs px-1.5 py-0.5 rounded text-text-dim hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(tree.id); }}
                      className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-tier4
                                 transition-opacity text-sm px-1"
                      title="Delete tree"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {workspaceState.trees.length === 0 && !showNewForm && (
            <div className="px-3 py-4 text-center text-sm text-text-dim">
              No saved trees yet.
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* New tree form */}
          {showNewForm ? (
            <div className="px-3 py-2 flex gap-2">
              <input
                type="text"
                value={newTreeName}
                onChange={e => setNewTreeName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTree();
                  if (e.key === 'Escape') setShowNewForm(false);
                }}
                autoFocus
                placeholder="Tree name..."
                className="flex-1 px-2 py-1 bg-bg border border-border rounded text-sm
                           text-text-primary placeholder-text-dim focus:outline-none focus:border-gold/50"
              />
              <button
                type="button"
                onClick={handleCreateTree}
                className="px-2 py-1 rounded text-xs bg-gold text-bg font-medium hover:bg-gold-light"
              >
                Create
              </button>
            </div>
          ) : (
            <div className="flex">
              <button
                type="button"
                onClick={() => setShowNewForm(true)}
                className="flex-1 px-3 py-2.5 text-sm text-gold hover:bg-surface-hover transition-colors text-left"
              >
                + New Tree
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="flex-1 px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover
                           transition-colors text-left border-l border-border"
              >
                Import GEDCOM
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
