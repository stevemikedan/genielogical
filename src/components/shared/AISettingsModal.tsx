import { useState, useCallback } from 'react';
import { getApiKey, setApiKey, clearApiKey, testApiKey } from '@/ai/ai-client.ts';

interface AISettingsModalProps {
  onClose: () => void;
}

export function AISettingsModal({ onClose }: AISettingsModalProps) {
  const existing = getApiKey();
  const [key, setKey] = useState(existing ?? '');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'valid' | 'invalid'>(
    existing ? 'valid' : 'idle'
  );

  const handleTest = useCallback(async () => {
    if (!key.trim()) return;
    setTesting(true);
    setStatus('idle');
    const valid = await testApiKey(key.trim());
    setStatus(valid ? 'valid' : 'invalid');
    setTesting(false);
  }, [key]);

  const handleSave = useCallback(() => {
    if (key.trim()) {
      setApiKey(key.trim());
      setStatus('valid');
    }
    onClose();
  }, [key, onClose]);

  const handleClear = useCallback(() => {
    clearApiKey();
    setKey('');
    setStatus('idle');
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61]
                      bg-surface border border-border rounded-lg shadow-2xl w-[440px] max-w-[90vw]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-[family-name:var(--font-heading)] text-lg text-text-primary">
            AI Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dim hover:text-text-primary text-xl leading-none p-1"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={e => { setKey(e.target.value); setStatus('idle'); }}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text-primary
                         placeholder-text-dim focus:outline-none focus:border-gold/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!key.trim() || testing}
              className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                         hover:text-text-primary hover:border-gold/40 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing...' : 'Test Key'}
            </button>

            {status === 'valid' && (
              <span className="text-sm text-tier1">Key is valid</span>
            )}
            {status === 'invalid' && (
              <span className="text-sm text-tier4">Invalid key</span>
            )}
          </div>

          <p className="text-xs text-text-dim">
            Your API key is stored locally in your browser and never sent to our servers.
            AI features use Claude Sonnet for genealogy validation.
          </p>

          <div className="border border-border rounded p-3 space-y-2">
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              AI Features
            </h4>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-tier1 mt-0.5">&#x2713;</span>
                <span><strong className="text-text-primary">Person Validation</strong> — AI checks dates, locations, and plausibility</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tier1 mt-0.5">&#x2713;</span>
                <span><strong className="text-text-primary">Edge Validation</strong> — AI evaluates parent-child connections</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tier1 mt-0.5">&#x2713;</span>
                <span><strong className="text-text-primary">Notable Context</strong> — AI provides historical context for notable ancestors</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-tier1 mt-0.5">&#x2713;</span>
                <span><strong className="text-text-primary">Batch Validation</strong> — Validate multiple persons at once</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-tier4 hover:text-tier4-text transition-colors"
          >
            Clear Key
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-border text-text-secondary
                         hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!key.trim()}
              className="px-3 py-1.5 text-sm rounded bg-gold text-bg font-medium
                         hover:bg-gold-light transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
