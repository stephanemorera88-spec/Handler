import { spawn } from 'child_process';
import { logger } from '../logger';

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_cost_usd: number;
  model: string;
  duration_ms: number;
}

// Default timeout: 5 minutes
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

interface ClaudeCodeOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  onChunk?: (text: string) => void;
  onUsage?: (usage: ClaudeUsage) => void;
}

/**
 * Direct mode: Runs Claude via the Claude Code CLI on the host machine.
 * Uses stream-json format to get both streaming text and token usage.
 */
export async function claudeCode(options: ClaudeCodeOptions): Promise<string> {
  const { prompt, systemPrompt, model, maxBudgetUsd, timeoutMs = DEFAULT_TIMEOUT_MS, onChunk, onUsage } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    if (model) {
      args.push('--model', model);
    }

    if (maxBudgetUsd) {
      args.push('--max-budget-usd', String(maxBudgetUsd));
    }

    args.push(prompt);

    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE_SESSION;

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    });

    proc.stdin!.end();

    let fullText = '';
    let error = '';
    let buffer = '';
    let timedOut = false;

    // Kill the process if it exceeds the timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    }, timeoutMs);

    proc.stdout!.on('data', (data: Buffer) => {
      buffer += data.toString();

      // Parse newline-delimited JSON
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          handleEvent(event);
        } catch {
          // Skip unparseable lines
        }
      }
    });

    function handleEvent(event: any) {
      switch (event.type) {
        case 'assistant': {
          // Extract text content from assistant message
          const content = event.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                fullText += block.text;
                onChunk?.(block.text);
              }
            }
          }
          break;
        }

        case 'result': {
          // Final result with usage data
          const usage = event.usage || {};
          const modelUsage = event.modelUsage || {};
          const modelKey = Object.keys(modelUsage)[0] || model || 'unknown';
          const modelData = modelUsage[modelKey] || {};

          onUsage?.({
            input_tokens: modelData.inputTokens || usage.input_tokens || 0,
            output_tokens: modelData.outputTokens || usage.output_tokens || 0,
            cache_read_tokens: modelData.cacheReadInputTokens || usage.cache_read_input_tokens || 0,
            cache_creation_tokens: modelData.cacheCreationInputTokens || usage.cache_creation_input_tokens || 0,
            total_cost_usd: event.total_cost_usd || modelData.costUSD || 0,
            model: modelKey,
            duration_ms: event.duration_ms || 0,
          });

          // Use result text if we didn't get streaming content
          if (!fullText && event.result) {
            fullText = event.result;
            onChunk?.(event.result);
          }
          break;
        }
      }
    }

    proc.stderr!.on('data', (data: Buffer) => {
      error += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer));
        } catch { /* ignore */ }
      }

      if (timedOut) {
        logger.error('Claude CLI timed out after %dms', timeoutMs);
        reject(new Error(`Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s. The request may have been too large or the API may be unresponsive.`));
      } else if (code === 0) {
        resolve(fullText);
      } else {
        logger.error('Claude CLI error (code %s): %s', String(code), error);
        reject(new Error(error || `Claude CLI exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}
