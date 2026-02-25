import fs from 'fs';
import path from 'path';

const OUTPUT_START_MARKER = '---HANDLER_OUTPUT_START---';
const OUTPUT_END_MARKER = '---HANDLER_OUTPUT_END---';
const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_POLL_INTERVAL = 500;

interface ContainerInput {
  agent_id: string;
  agent_name: string;
  system_prompt: string;
  model: string;
  provider: string;
  config: {
    temperature?: number;
    max_turns?: number;
    idle_timeout_ms?: number;
  };
  secrets?: Record<string, string>;
}

function writeOutput(data: Record<string, unknown>) {
  const json = JSON.stringify(data);
  process.stdout.write(`\n${OUTPUT_START_MARKER}\n${json}\n${OUTPUT_END_MARKER}\n`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

function drainIpcInput(): Array<{ type: string; content?: string; conversation_id?: string }> {
  const messages: Array<{ type: string; content?: string; conversation_id?: string }> = [];
  try {
    const files = fs.readdirSync(IPC_INPUT_DIR).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      const filepath = path.join(IPC_INPUT_DIR, file);
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        const msg = JSON.parse(content);
        messages.push(msg);
        fs.unlinkSync(filepath);
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // IPC directory may not exist yet
  }
  return messages;
}

function checkClose(): boolean {
  return fs.existsSync(path.join(IPC_INPUT_DIR, '_close'));
}

async function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (checkClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0 && messages[0].content) {
        resolve(messages[0].content);
        return;
      }
      setTimeout(poll, IPC_POLL_INTERVAL);
    };
    poll();
  });
}

async function main() {
  // Read input from stdin (temp file /tmp/input.json)
  let inputRaw: string;
  try {
    inputRaw = fs.readFileSync('/tmp/input.json', 'utf8');
    fs.unlinkSync('/tmp/input.json'); // Delete after reading
  } catch {
    inputRaw = await readStdin();
  }

  const input: ContainerInput = JSON.parse(inputRaw);

  // Set secrets in environment (never persisted to disk)
  if (input.secrets) {
    for (const [key, value] of Object.entries(input.secrets)) {
      process.env[key] = value;
    }
    delete input.secrets; // Clear from memory
  }

  console.error(`[handler-agent] Agent "${input.agent_name}" starting (model: ${input.model})`);

  // Import Claude Code SDK dynamically
  const { query } = await import('@anthropic-ai/claude-code');

  // Query loop: wait for IPC messages and process them
  let sessionId: string | undefined;

  // Initial idle — wait for first message
  writeOutput({ status: 'ready', agent_id: input.agent_id });

  while (true) {
    const message = await waitForIpcMessage();
    if (message === null) {
      // Close sentinel received
      console.error('[handler-agent] Close sentinel received, shutting down');
      break;
    }

    console.error(`[handler-agent] Processing message: ${message.substring(0, 100)}`);

    try {
      let result = '';
      for await (const event of query({
        prompt: message,
        options: {
          systemPrompt: input.system_prompt
            ? { type: 'custom', value: input.system_prompt }
            : undefined,
          model: input.model,
          maxTurns: input.config.max_turns || 10,
          ...(sessionId ? { resume: sessionId } : {}),
          permissionMode: 'bypassPermissions',
        },
      })) {
        if (event.type === 'assistant') {
          // Extract text content from assistant message
          for (const block of event.message.content) {
            if (block.type === 'text') {
              result += block.text;
            }
          }
        } else if (event.type === 'result') {
          if (event.session_id) {
            sessionId = event.session_id;
          }
          result = typeof event.result === 'string' ? event.result : result;
        }
      }

      writeOutput({
        status: 'success',
        result,
        session_id: sessionId,
        agent_id: input.agent_id,
      });
    } catch (err: any) {
      console.error(`[handler-agent] Error: ${err.message}`);
      writeOutput({
        status: 'error',
        error: err.message,
        agent_id: input.agent_id,
      });
    }
  }

  writeOutput({ status: 'shutdown', agent_id: input.agent_id });
  process.exit(0);
}

main().catch((err) => {
  console.error(`[handler-agent] Fatal error: ${err.message}`);
  writeOutput({ status: 'error', error: err.message });
  process.exit(1);
});
