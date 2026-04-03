import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApiKey, setApiKey, clearApiKey, testApiKey } from './ai-client.ts';

// Mock the provider registry
vi.mock('./provider/provider-registry.ts', () => {
  let storedKey: string | null = null;
  return {
    getLegacyApiKey: vi.fn(() => storedKey),
    setLegacyApiKey: vi.fn((key: string) => { storedKey = key; }),
    clearLegacyApiKey: vi.fn(() => { storedKey = null; }),
    getProvider: vi.fn(),
  };
});

// Mock AnthropicProvider — must be constructable
let mockTestResult = { ok: true };
vi.mock('./provider/anthropic-provider.ts', () => ({
  AnthropicProvider: class MockAnthropicProvider {
    async testConnection() {
      return mockTestResult;
    }
  },
}));

import { getLegacyApiKey, setLegacyApiKey, clearLegacyApiKey } from './provider/provider-registry.ts';

describe('API key management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLegacyApiKey).mockReturnValue(null);
  });

  it('getApiKey delegates to getLegacyApiKey', () => {
    vi.mocked(getLegacyApiKey).mockReturnValue('sk-ant-test');
    expect(getApiKey()).toBe('sk-ant-test');
    expect(getLegacyApiKey).toHaveBeenCalled();
  });

  it('getApiKey returns null when no key stored', () => {
    expect(getApiKey()).toBeNull();
  });

  it('setApiKey delegates to setLegacyApiKey', () => {
    setApiKey('sk-ant-test-key');
    expect(setLegacyApiKey).toHaveBeenCalledWith('sk-ant-test-key');
  });

  it('clearApiKey delegates to clearLegacyApiKey', () => {
    clearApiKey();
    expect(clearLegacyApiKey).toHaveBeenCalled();
  });
});

describe('testApiKey', () => {
  beforeEach(() => {
    mockTestResult = { ok: true };
  });

  it('returns true for valid key', async () => {
    mockTestResult = { ok: true };
    const result = await testApiKey('sk-ant-valid');
    expect(result).toBe(true);
  });

  it('returns false when provider test fails', async () => {
    mockTestResult = { ok: false };
    const result = await testApiKey('sk-ant-invalid');
    expect(result).toBe(false);
  });
});
