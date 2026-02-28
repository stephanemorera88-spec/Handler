import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  model: string;
  duration_ms: number;
}

interface AnthropicChatOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  onChunk?: (text: string) => void;
  onUsage?: (usage: AnthropicUsage) => void;
}

// Cost per 1M tokens (USD) — update as pricing changes
const COST_MAP: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514':  { input: 3.00,  output: 15.00 },
  'claude-opus-4-20250514':    { input: 15.00, output: 75.00 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = COST_MAP[model] || COST_MAP['claude-sonnet-4-20250514'];
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function anthropicChat(options: AnthropicChatOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = 'claude-sonnet-4-20250514',
    temperature,
    maxTokens = 4096,
    onChunk,
    onUsage,
  } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  }

  const client = new Anthropic({ apiKey });
  const startTime = Date.now();

  let fullText = '';

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      ...(systemPrompt && { system: systemPrompt }),
      ...(temperature !== undefined && { temperature }),
    });

    stream.on('text', (text) => {
      fullText += text;
      onChunk?.(text);
    });

    const finalMessage = await stream.finalMessage();
    const durationMs = Date.now() - startTime;

    if (onUsage) {
      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;

      onUsage({
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_cost_usd: estimateCost(model, inputTokens, outputTokens),
        model,
        duration_ms: durationMs,
      });
    }

    return fullText;
  } catch (err: any) {
    logger.error('Anthropic API error: %s', err.message);
    throw new Error(`Anthropic API error: ${err.message}`);
  }
}
