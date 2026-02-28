import OpenAI from 'openai';
import { logger } from '../logger';

export interface OpenAIUsage {
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  model: string;
  duration_ms: number;
}

interface OpenAIChatOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  onChunk?: (text: string) => void;
  onUsage?: (usage: OpenAIUsage) => void;
}

// Cost per 1M tokens (USD) — update as pricing changes
const COST_MAP: Record<string, { input: number; output: number }> = {
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':  { input: 0.15,  output: 0.60  },
  'o3-mini':      { input: 1.10,  output: 4.40  },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = COST_MAP[model] || COST_MAP['gpt-4o'];
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function openaiChat(options: OpenAIChatOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = 'gpt-4o',
    temperature,
    maxTokens,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onChunk,
    onUsage,
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.');
  }

  const client = new OpenAI({ apiKey });
  const startTime = Date.now();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(temperature !== undefined && { temperature }),
    ...(maxTokens !== undefined && { max_tokens: maxTokens }),
  };

  let fullText = '';

  try {
    const stream = await client.chat.completions.create(createParams);

    let usageData: { prompt_tokens: number; completion_tokens: number } | null = null;

    for await (const chunk of stream) {
      // Collect usage from the final chunk (when stream_options.include_usage is true)
      if (chunk.usage) {
        usageData = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
        };
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onChunk?.(delta);
      }
    }

    const durationMs = Date.now() - startTime;

    if (onUsage) {
      const inputTokens = usageData?.prompt_tokens || 0;
      const outputTokens = usageData?.completion_tokens || 0;

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
    logger.error('OpenAI API error: %s', err.message);
    throw new Error(`OpenAI API error: ${err.message}`);
  }
}
