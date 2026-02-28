import type { AgentProvider } from './types';

export interface ModelOption {
  id: string;
  name: string;
}

export const PROVIDER_MODELS: Record<Exclude<AgentProvider, 'external'>, ModelOption[]> = {
  claude: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'o3-mini', name: 'o3-mini' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro' },
  ],
};

export function getDefaultModel(provider: AgentProvider): string {
  if (provider === 'external') return '';
  return PROVIDER_MODELS[provider][0].id;
}
