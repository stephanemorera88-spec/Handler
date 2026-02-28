import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../logger';

export interface GeminiUsage {
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  model: string;
  duration_ms: number;
}

interface GeminiChatOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  onChunk?: (text: string) => void;
  onUsage?: (usage: GeminiUsage) => void;
}

// Cost per 1M tokens (USD) — update as pricing changes
const COST_MAP: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash':              { input: 0.10, output: 0.40 },
  'gemini-2.5-pro-preview-06-05':  { input: 1.25, output: 10.00 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = COST_MAP[model] || COST_MAP['gemini-2.0-flash'];
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export async function geminiChat(options: GeminiChatOptions): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = 'gemini-2.0-flash',
    temperature,
    maxTokens,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onChunk,
    onUsage,
  } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const startTime = Date.now();

  const generativeModel = genAI.getGenerativeModel({
    model,
    ...(systemPrompt && { systemInstruction: systemPrompt }),
    generationConfig: {
      ...(temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { maxOutputTokens: maxTokens }),
    },
  });

  let fullText = '';

  try {
    const result = await generativeModel.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullText += text;
        onChunk?.(text);
      }
    }

    const durationMs = Date.now() - startTime;

    if (onUsage) {
      const response = await result.response;
      const usage = response.usageMetadata;
      const inputTokens = usage?.promptTokenCount || 0;
      const outputTokens = usage?.candidatesTokenCount || 0;

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
    logger.error('Gemini API error: %s', err.message);
    throw new Error(`Gemini API error: ${err.message}`);
  }
}
