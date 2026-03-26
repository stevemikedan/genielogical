import { useState, useEffect, useCallback } from 'react';
import { getApiKey } from '@/ai/ai-client.ts';
import { AISettingsModal } from './AISettingsModal.tsx';

export function AIStatusIndicator() {
  const [showModal, setShowModal] = useState(false);
  const [hasKey, setHasKey] = useState(() => getApiKey() !== null);

  // Re-check when modal closes
  const handleClose = useCallback(() => {
    setShowModal(false);
    setHasKey(getApiKey() !== null);
  }, []);

  useEffect(() => {
    setHasKey(getApiKey() !== null);
  }, [showModal]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
          hasKey
            ? 'text-tier1 hover:bg-tier1/10'
            : 'text-text-dim hover:bg-surface hover:text-text-secondary'
        }`}
        title={hasKey ? 'AI configured — click to manage' : 'Set up AI features'}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${hasKey ? 'bg-tier1' : 'bg-text-dim'}`}
        />
        {hasKey ? 'AI Ready' : 'Set up AI'}
      </button>
      {showModal && <AISettingsModal onClose={handleClose} />}
    </>
  );
}
