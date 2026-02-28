#!/usr/bin/env node
/**
 * Handler ↔ OpenClaw Bridge
 *
 * Runs on the OpenClaw machine. Connects to:
 *   - Handler agent WS on 192.168.1.75:3001/ws/agent
 *   - OpenClaw via CLI (openclaw agent --message)
 *
 * Usage: node bridge.mjs
 */

import WebSocket from 'ws';
import { spawn, execSync } from 'child_process';

// ─── Config ─────────────────────────────────────────────────────────
const HANDLER_URL = 'ws://192.168.1.75:3001/ws/agent';
const HANDLER_TOKEN = 'vlt_cef6d02d569ffded94f1861b3a48c85e93aac42a2833d41a';
const AGENT_NAME = 'OpenClaw';
// Use full path since openclaw may not be in PATH
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const SYSTEM_CONTEXT = `You are connected to Handler, a mobile messaging app for AI agents built by Stephane Morera. The user is messaging you through the Handler app on their phone. You are NOT on Telegram right now — this is Handler. Respond naturally and helpfully.`;

// ─── State ──────────────────────────────────────────────────────────
let handlerWs = null;
let handlerReady = false;

function log(source, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] [${source}] ${msg}`);
}

// ─── Send message to OpenClaw via CLI ───────────────────────────────
// Rough token estimate: ~4 chars per token (good enough for cost tracking)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function sendToClaw(content, requestId) {
  log('claw', `Running openclaw agent...`);

  // Split OPENCLAW_BIN on spaces so "node /path/to/openclaw.mjs" works
  // spawn() needs command and args separate — it can't parse "node script.mjs" as one string
  const binParts = OPENCLAW_BIN.split(' ').filter(Boolean);
  const cmd = binParts[0];
  const preArgs = binParts.slice(1);

  const fullMessage = `[System: ${SYSTEM_CONTEXT}]\n\nUser message: ${content}`;
  const args = [...preArgs, 'agent', '--local', '--session-id', 'handler', '--message', fullMessage];
  log('claw', `Spawning: ${cmd} ${args.map(a => a.length > 40 ? a.substring(0, 40) + '...' : a).join(' ')}`);

  const proc = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stdoutData = '';
  let stderrData = '';
  let sentAnyContent = false;
  let totalOutputChars = 0;

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutData += text;
    totalOutputChars += text.length;
    log('claw:stdout', JSON.stringify(text).substring(0, 200));

    if (text.trim() && handlerReady) {
      sentAnyContent = true;
      handlerWs.send(JSON.stringify({
        type: 'agent.response.chunk',
        request_id: requestId,
        content: text,
        done: false,
      }));
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    stderrData += text;
    totalOutputChars += text.length;
    log('claw:stderr', JSON.stringify(text).substring(0, 200));

    // Some CLI tools output the actual response on stderr
    if (text.trim() && handlerReady) {
      sentAnyContent = true;
      handlerWs.send(JSON.stringify({
        type: 'agent.response.chunk',
        request_id: requestId,
        content: text,
        done: false,
      }));
    }
  });

  proc.on('close', (code) => {
    log('claw', `Exit code: ${code}`);
    log('claw', `stdout total: ${stdoutData.length} chars`);
    log('claw', `stderr total: ${stderrData.length} chars`);

    if (!sentAnyContent && (stdoutData.trim() || stderrData.trim())) {
      // Send whatever we got
      const response = stdoutData.trim() || stderrData.trim();
      if (handlerReady) {
        handlerWs.send(JSON.stringify({
          type: 'agent.response.chunk',
          request_id: requestId,
          content: response,
          done: false,
        }));
      }
    }

    if (!sentAnyContent && !stdoutData.trim() && !stderrData.trim()) {
      log('claw', 'WARNING: No output from openclaw agent!');
      if (handlerReady) {
        handlerWs.send(JSON.stringify({
          type: 'agent.response.chunk',
          request_id: requestId,
          content: '(No response from OpenClaw — the agent may need configuration)',
          done: false,
        }));
      }
    }

    // Signal done — include estimated token usage
    if (handlerReady) {
      const inputTokens = estimateTokens(fullMessage);
      const outputTokens = estimateTokens(totalOutputChars > 0 ? 'x'.repeat(totalOutputChars) : '');
      // Default pricing: ~$3/$15 per 1M tokens (Claude Sonnet-tier estimate)
      const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

      handlerWs.send(JSON.stringify({
        type: 'agent.response.chunk',
        request_id: requestId,
        content: '',
        done: true,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
          model: 'openclaw',
        },
      }));
      log('claw', `Usage estimate: ${inputTokens} in / ${outputTokens} out — $${costUsd.toFixed(4)}`);
    }
  });

  proc.on('error', (err) => {
    log('claw', `Process error: ${err.message}`);
    if (handlerReady) {
      handlerWs.send(JSON.stringify({
        type: 'agent.error',
        request_id: requestId,
        message: `OpenClaw CLI error: ${err.message}`,
      }));
    }
  });
}

// ─── Handler Connection ─────────────────────────────────────────────
function connectHandler() {
  log('handler', `Connecting to ${HANDLER_URL}...`);
  handlerWs = new WebSocket(HANDLER_URL);

  handlerWs.on('open', () => {
    log('handler', 'Connected, sending hello...');
    handlerWs.send(JSON.stringify({
      type: 'agent.hello',
      token: HANDLER_TOKEN,
      name: AGENT_NAME,
      description: 'OpenClaw agent bridge',
    }));
  });

  handlerWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'server.welcome') {
      handlerReady = true;
      log('handler', `Registered as "${msg.name}" (${msg.agent_id})`);
      log('bridge', '--- BRIDGE ACTIVE --- Send a message in Handler!');
      return;
    }

    if (msg.type === 'server.message') {
      log('bridge', `Message from Handler: "${msg.content.substring(0, 80)}"`);
      sendToClaw(msg.content, msg.request_id);
      return;
    }
  });

  handlerWs.on('ping', () => handlerWs.pong());

  handlerWs.on('close', () => {
    handlerReady = false;
    log('handler', 'Disconnected. Reconnecting in 3s...');
    setTimeout(connectHandler, 3000);
  });

  handlerWs.on('error', (err) => {
    log('handler', `Error: ${err.message}`);
  });
}

// ─── Quick test: check openclaw is available ────────────────────────
try {
  const ver = execSync(`${OPENCLAW_BIN} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  log('bridge', `OpenClaw CLI found: ${ver}`);
} catch {
  log('bridge', `WARNING: openclaw not found at "${OPENCLAW_BIN}". Set OPENCLAW_BIN env var.`);
  log('bridge', 'Examples:');
  log('bridge', '  OPENCLAW_BIN=openclaw node bridge.mjs');
  log('bridge', '  OPENCLAW_BIN="node /Users/archer/openclaw/openclaw.mjs" node bridge.mjs');
}

// ─── Start ──────────────────────────────────────────────────────────
log('bridge', 'Handler <-> OpenClaw Bridge starting (CLI mode with debug)...');
connectHandler();
