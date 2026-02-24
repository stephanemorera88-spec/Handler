import { spawn } from 'child_process';
import { logger } from '../logger';

interface ClaudeCodeOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  onChunk?: (text: string) => void;
}

/**
 * Direct mode: Runs Claude via the Claude Code CLI on the host machine.
 * Used when Docker is not available or for development.
 * Streams output via stdout parsing.
 */
export async function claudeCode(options: ClaudeCodeOptions): Promise<string> {
  const { prompt, systemPrompt, model, onChunk } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--output-format', 'text',
    ];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    if (model) {
      args.push('--model', model);
    }

    args.push(prompt);

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let output = '';
    let error = '';

    proc.stdout!.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      onChunk?.(text);
    });

    proc.stderr!.on('data', (data: Buffer) => {
      error += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        logger.error('Claude CLI error (code %s): %s', String(code), error);
        reject(new Error(error || `Claude CLI exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}
