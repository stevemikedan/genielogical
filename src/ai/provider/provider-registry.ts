import type {
  LLMProvider,
  ProviderConfig,
  TaskAssignment,
  AITaskType,
} from './types.ts';
import { AnthropicProvider } from './anthropic-provider.ts';

const PROVIDER_CONFIG_KEY = 'genielogical_provider_config';
const LEGACY_API_KEY = 'genielogical_anthropic_api_key';

/**
 * Registry for LLM providers.
 *
 * Manages provider configuration per AI task type (quickCheck, validation,
 * deepResearch, chat). Stores config in localStorage. Defaults all tasks
 * to Anthropic if an API key is set.
 */

// ── Provider Info ───────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  requiresApiKey: boolean;
  apiKeyLabel: string;
  defaultModelId: string;
}

const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    requiresApiKey: true,
    apiKeyLabel: 'Anthropic API Key',
    defaultModelId: 'claude-sonnet-4-20250514',
  },
  // Future providers will be added here:
  // { id: 'openai', name: 'GPT-4o (OpenAI)', ... },
  // { id: 'ollama', name: 'Local (Ollama)', ... },
  // { id: 'google', name: 'Gemini (Google)', ... },
];

export function getAvailableProviders(): ProviderInfo[] {
  return AVAILABLE_PROVIDERS;
}

// ── Config Management ────────────────────────────────────────────────

function makeDefaultConfig(apiKey: string | null): ProviderConfig {
  return {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    apiKey,
    baseUrl: null,
    enabled: apiKey !== null,
  };
}

function loadTaskAssignment(): TaskAssignment | null {
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TaskAssignment;
  } catch {
    return null;
  }
}

function saveTaskAssignment(assignment: TaskAssignment): void {
  localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(assignment));
}

/**
 * Get the current task assignment, falling back to defaults.
 *
 * If no explicit config exists but a legacy Anthropic API key is stored,
 * creates a default assignment using that key for all tasks.
 */
export function getTaskAssignment(): TaskAssignment {
  const stored = loadTaskAssignment();
  if (stored) return stored;

  // Check for legacy API key
  const legacyKey = localStorage.getItem(LEGACY_API_KEY);
  const defaultConfig = makeDefaultConfig(legacyKey);

  return {
    quickCheck: { ...defaultConfig },
    validation: { ...defaultConfig },
    deepResearch: { ...defaultConfig },
    chat: { ...defaultConfig },
  };
}

/**
 * Update the provider config for a specific task type.
 */
export function setTaskConfig(task: AITaskType, config: ProviderConfig): void {
  const current = getTaskAssignment();
  current[task] = config;
  saveTaskAssignment(current);
}

/**
 * Update the provider config for ALL task types at once.
 * Useful when setting a single API key for everything.
 */
export function setAllTaskConfigs(config: ProviderConfig): void {
  const assignment: TaskAssignment = {
    quickCheck: { ...config },
    validation: { ...config },
    deepResearch: { ...config },
    chat: { ...config },
  };
  saveTaskAssignment(assignment);
}

/**
 * Check if any provider is configured and enabled.
 */
export function hasConfiguredProvider(): boolean {
  const assignment = getTaskAssignment();
  return Object.values(assignment).some(c => c.enabled && (c.apiKey || !providerRequiresKey(c.providerId)));
}

function providerRequiresKey(providerId: string): boolean {
  const info = AVAILABLE_PROVIDERS.find(p => p.id === providerId);
  return info?.requiresApiKey ?? true;
}

// ── Provider Instantiation ──────────────────────────────────────────

/**
 * Get an LLMProvider instance configured for the given task type.
 * Returns null if no provider is configured/enabled for that task.
 */
export function getProvider(task: AITaskType): LLMProvider | null {
  const config = getTaskAssignment()[task];
  if (!config.enabled || (!config.apiKey && providerRequiresKey(config.providerId))) {
    return null;
  }
  return createProviderFromConfig(config);
}

/**
 * Get the ProviderConfig for a specific task type.
 */
export function getProviderConfig(task: AITaskType): ProviderConfig {
  return getTaskAssignment()[task];
}

function createProviderFromConfig(config: ProviderConfig): LLMProvider | null {
  switch (config.providerId) {
    case 'anthropic':
      if (!config.apiKey) return null;
      return new AnthropicProvider(config.apiKey, config.modelId);
    // Future providers:
    // case 'openai': return new OpenAIProvider(config.apiKey!, config.modelId);
    // case 'ollama': return new OllamaProvider(config.baseUrl ?? 'http://localhost:11434', config.modelId);
    default:
      return null;
  }
}

// ── Legacy Compatibility ────────────────────────────────────────────

/**
 * Legacy helper: get the API key for the default provider.
 * Used by existing UI components until they migrate to the provider interface.
 */
export function getLegacyApiKey(): string | null {
  const config = getTaskAssignment().validation;
  return config.apiKey;
}

/**
 * Legacy helper: set the API key and configure all tasks to use it.
 */
export function setLegacyApiKey(key: string): void {
  // Also store in legacy location for backwards compat
  localStorage.setItem(LEGACY_API_KEY, key);
  setAllTaskConfigs(makeDefaultConfig(key));
}

/**
 * Legacy helper: clear the API key and disable all providers.
 */
export function clearLegacyApiKey(): void {
  localStorage.removeItem(LEGACY_API_KEY);
  localStorage.removeItem(PROVIDER_CONFIG_KEY);
}
