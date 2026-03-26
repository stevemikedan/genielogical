import { useCallback, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useGedcomImport } from '@/hooks/index.ts';

export function FileDropZone() {
  const { importFile } = useGedcomImport();
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.ged')) {
      alert('Please drop a .ged (GEDCOM) file.');
      return;
    }
    importFile(file);
  }, [importFile]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const loadFromUrl = useCallback(async (url: string, label: string) => {
    setLoading(label);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${label}`);
      const text = await response.text();
      const file = new File([text], `${label}.ged`, { type: 'text/plain' });
      importFile(file);
    } catch (err) {
      alert(`Failed to load ${label}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(null);
    }
  }, [importFile]);

  const handleLoadDemo = useCallback(() => {
    loadFromUrl('/demo-tree.ged', 'demo-tree');
  }, [loadFromUrl]);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-text-dim text-lg">
        Drop a GEDCOM file to get started
      </p>
      <button
        type="button"
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-16 w-80 transition-colors cursor-pointer
          ${isDragOver
            ? 'border-gold bg-gold/5 scale-[1.02]'
            : 'border-border-hover hover:border-gold'
          }
        `}
      >
        <div className="text-center space-y-3">
          <div className="text-4xl text-text-dim">
            {isDragOver ? '\u2B07' : '\u{1F4C2}'}
          </div>
          <p className="font-[family-name:var(--font-brand)] text-xl text-text-secondary">
            .ged
          </p>
          <p className="text-sm text-text-dim">
            Click or drag &amp; drop
          </p>
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ged"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-2 mt-2">
        <button
          type="button"
          onClick={handleLoadDemo}
          disabled={loading !== null}
          className="text-sm text-gold hover:text-gold-light transition-colors disabled:opacity-50"
        >
          {loading === 'demo-tree' ? 'Loading demo\u2026' : 'Load demo tree (53 people)'}
        </button>

        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
            }}
            className="text-xs text-text-dim hover:text-text-secondary transition-colors"
          >
            Load dev tree (file picker)
          </button>
        )}
      </div>
    </div>
  );
}
