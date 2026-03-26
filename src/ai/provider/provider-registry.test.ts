import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAvailableProviders,
  getTaskAssignment,
  setTaskConfig,
  setAllTaskConfigs,
  hasConfiguredProvider,
  getProvider,
  getProviderConfig,
  getLegacyApiKey,
  setLegacyApiKey,
  clearLegacyApiKey,
} from './provider-registry.ts';
import type { ProviderConfig } from './types.ts';

// Mock localStorage
const store: Record<string, string> = {};

beforeEach(() => {
  Object.keys(store).forEach(key => delete store[key]);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store[key] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    delete store[key];
  });
});

describe('getAvailableProviders', () => {
  it('returns at least one provider', () => {
    const providers = getAvailableProviders();
    expect(providers.length).toBeGreaterThanOrEqual(1);
  });

  it('includes Anthropic provider', () => {
    const providers = getAvailableProviders();
    expect(providers.find(p => p.id === 'anthropic')).toBeDefined();
  });
});

describe('getTaskAssignment', () => {
  it('returns default assignment with no config stored', () => {
    const assignment = getTaskAssignment();
    expect(assignment.quickCheck.providerId).toBe('anthropic');
    expect(assignment.validation.providerId).toBe('anthropic');
    expect(assignment.deepResearch.providerId).toBe('anthropic');
    expect(assignment.chat.providerId).toBe('anthropic');
  });

  it('defaults are disabled when no API key exists', () => {
    const assignment = getTaskAssignment();
    expect(assignment.quickCheck.enabled).toBe(false);
    expect(assignment.quickCheck.apiKey).toBeNull();
  });

  it('picks up legacy API key', () => {
    store['genielogical_anthropic_api_key'] = 'sk-test-key';
    const assignment = getTaskAssignment();
    expect(assignment.quickCheck.apiKey).toBe('sk-test-key');
    expect(assignment.quickCheck.enabled).toBe(true);
  });

  it('returns stored config when available', () => {
    const customConfig: ProviderConfig = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-custom',
      baseUrl: null,
      enabled: true,
    };
    setAllTaskConfigs(customConfig);

    const assignment = getTaskAssignment();
    expect(assignment.quickCheck.apiKey).toBe('sk-custom');
    expect(assignment.deepResearch.apiKey).toBe('sk-custom');
  });
});

describe('setTaskConfig', () => {
  it('updates a single task config', () => {
    const config: ProviderConfig = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-quick',
      baseUrl: null,
      enabled: true,
    };
    setTaskConfig('quickCheck', config);

    const assignment = getTaskAssignment();
    expect(assignment.quickCheck.apiKey).toBe('sk-quick');
    // Other tasks should still have defaults
    expect(assignment.validation.apiKey).toBeNull();
  });
});

describe('setAllTaskConfigs', () => {
  it('sets the same config for all tasks', () => {
    const config: ProviderConfig = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-all',
      baseUrl: null,
      enabled: true,
    };
    setAllTaskConfigs(config);

    const assignment = getTaskAssignment();
    expect(assignment.quickCheck.apiKey).toBe('sk-all');
    expect(assignment.validation.apiKey).toBe('sk-all');
    expect(assignment.deepResearch.apiKey).toBe('sk-all');
    expect(assignment.chat.apiKey).toBe('sk-all');
  });
});

describe('hasConfiguredProvider', () => {
  it('returns false when no API key is set', () => {
    expect(hasConfiguredProvider()).toBe(false);
  });

  it('returns true when legacy API key is set', () => {
    store['genielogical_anthropic_api_key'] = 'sk-key';
    expect(hasConfiguredProvider()).toBe(true);
  });

  it('returns true when provider config is set', () => {
    setAllTaskConfigs({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-key',
      baseUrl: null,
      enabled: true,
    });
    expect(hasConfiguredProvider()).toBe(true);
  });
});

describe('getProvider', () => {
  it('returns null when no API key configured', () => {
    expect(getProvider('quickCheck')).toBeNull();
  });

  it('returns an AnthropicProvider when configured', () => {
    setAllTaskConfigs({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-test',
      baseUrl: null,
      enabled: true,
    });

    const provider = getProvider('validation');
    expect(provider).not.toBeNull();
    expect(provider!.id).toBe('anthropic');
    expect(provider!.name).toBe('Claude (Anthropic)');
  });

  it('returns null for disabled config', () => {
    setAllTaskConfigs({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-test',
      baseUrl: null,
      enabled: false,
    });

    expect(getProvider('quickCheck')).toBeNull();
  });

  it('returns null for unknown provider', () => {
    setAllTaskConfigs({
      providerId: 'unknown-provider',
      modelId: 'some-model',
      apiKey: 'sk-test',
      baseUrl: null,
      enabled: true,
    });

    expect(getProvider('quickCheck')).toBeNull();
  });
});

describe('getProviderConfig', () => {
  it('returns config for specific task', () => {
    setTaskConfig('deepResearch', {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-deep',
      baseUrl: null,
      enabled: true,
    });

    const config = getProviderConfig('deepResearch');
    expect(config.apiKey).toBe('sk-deep');
  });
});

describe('legacy compatibility', () => {
  it('getLegacyApiKey returns null when nothing stored', () => {
    expect(getLegacyApiKey()).toBeNull();
  });

  it('setLegacyApiKey stores in both legacy and new locations', () => {
    setLegacyApiKey('sk-legacy');

    expect(store['genielogical_anthropic_api_key']).toBe('sk-legacy');
    expect(getLegacyApiKey()).toBe('sk-legacy');

    // Also configures provider
    const provider = getProvider('validation');
    expect(provider).not.toBeNull();
  });

  it('clearLegacyApiKey removes all config', () => {
    setLegacyApiKey('sk-legacy');
    clearLegacyApiKey();

    expect(getLegacyApiKey()).toBeNull();
    expect(hasConfiguredProvider()).toBe(false);
  });
});
