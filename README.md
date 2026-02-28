# Handler

**One place for all your AI agents.**

Handler is a dedicated messaging app for AI agents — separate from your personal messages, your contacts, and your private life. Chat with Claude, GPT, Gemini, Open Claw, and any custom agent, all in one interface.

Free and open source. Self-host it anywhere.

---

## Why Handler?

AI agents live in your personal messaging apps — WhatsApp, Telegram, Signal, iMessage. Your agents sit next to your family, your clients, and your business conversations.

Handler gives your agents their own dedicated space:

- **All agents, one inbox** — Claude, GPT, Gemini, Open Claw, custom agents
- **Multi-provider** — switch between AI providers per agent
- **Group chat** — put multiple agents in one conversation
- **Real-time streaming** — responses stream in as they're generated
- **Private & self-hosted** — your data stays on your machine
- **Mobile-ready PWA** — add to your home screen, use like a native app

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+

### Install & Run

```bash
git clone https://github.com/stephanemorera88-spec/Handler-.git
cd Handler-
npm install
```

Create a `.env` file (or copy the example):

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```env
HANDLER_SECRET=your-login-password
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
```

You only need **one** API key to get started. Add more as needed.

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. Log in with your `HANDLER_SECRET` (or check the server console for the auto-generated password).

### Production Build

```bash
npm run build
node packages/server/dist/index.js
```

The server serves both the API and the client on port 3001.

---

## Deploy with Docker

```bash
docker compose up -d
```

Or deploy to Railway, Render, Fly.io, or any Docker host:

```bash
docker build -t handler .
docker run -p 3001:3001 --env-file .env handler
```

### Deploy to Railway

```bash
npm install -g @railway/cli
railway login
cd Handler-
railway init
railway vars set HANDLER_SECRET=your-password
railway vars set ANTHROPIC_API_KEY=sk-ant-...
railway up
railway domain
```

---

## Supported Providers

| Provider | Models | API Key |
|----------|--------|---------|
| **Claude** (Anthropic) | Sonnet 4, Opus 4, Haiku 4.5 | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-4o, GPT-4o Mini, o3-mini | `OPENAI_API_KEY` |
| **Gemini** (Google) | Gemini 2.0 Flash, Gemini 2.5 Pro | `GEMINI_API_KEY` |
| **External** | Any (via SDK) | Agent token |

Create agents from any provider in the same app. Mix and match in group chats.

---

## Connect an External Agent

Handler supports connecting any external agent via WebSocket. Create an external agent in the UI, copy the token, and use the SDK:

```typescript
import { HandlerAgent } from '@handler/agent-sdk';

const agent = new HandlerAgent({
  url: 'ws://localhost:3001/ws/agent',
  token: 'vlt_your-token-here',
  name: 'MyAgent',
});

agent.on('message', async (msg, reply) => {
  const response = await myAgent.process(msg.content);
  reply.chunk(response);
  reply.done();
});

agent.connect();
```

The SDK handles reconnection, authentication, and message streaming automatically.

---

## Bridge Open Claw to Handler

[Open Claw](https://github.com/ArcadeLabsInc/openclaw) agents can communicate through Telegram, WhatsApp, Signal, and iMessage. Handler gives them a dedicated home.

### Setup

1. **Create an external agent** in Handler called "OpenClaw" and copy the token

2. **Create `bridge.mjs`** on the machine running Open Claw:

```javascript
import WebSocket from 'ws';
import { spawn } from 'child_process';

const HANDLER_URL = 'wss://your-handler-domain.up.railway.app/ws/agent';
const HANDLER_TOKEN = 'vlt_your-token-here';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

let ws = null;
let ready = false;

function connectHandler() {
  ws = new WebSocket(HANDLER_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'agent.hello',
      token: HANDLER_TOKEN,
      name: 'OpenClaw',
      description: 'OpenClaw agent bridge',
    }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'server.welcome') {
      ready = true;
      console.log('Bridge active!');
      return;
    }

    if (msg.type === 'server.message') {
      // Run openclaw CLI and stream response back
      const proc = spawn(OPENCLAW_BIN, [
        'agent', '--local', '--session-id', 'handler',
        '--message', msg.content,
      ]);

      proc.stdout.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'agent.response.chunk',
          request_id: msg.request_id,
          content: data.toString(),
          done: false,
        }));
      });

      proc.on('close', () => {
        ws.send(JSON.stringify({
          type: 'agent.response.chunk',
          request_id: msg.request_id,
          content: '',
          done: true,
        }));
      });
    }
  });

  ws.on('close', () => {
    ready = false;
    setTimeout(connectHandler, 3000);
  });

  ws.on('ping', () => ws.pong());
}

connectHandler();
```

3. **Run the bridge:**

```bash
node bridge.mjs
```

Open Claw will appear as a connected agent in Handler. Messages route through the bridge automatically.

---

## Architecture

```
packages/
  shared/       Shared types, model registry
  server/       Express API + SQLite + WebSocket (client + agent channels)
  client/       React 19 + Vite + Zustand (PWA-ready)
  agent-sdk/    TypeScript SDK for external agents
```

### Tech Stack

| Layer | Tech |
|-------|------|
| Server | Express, better-sqlite3, JWT, Pino |
| Client | React 19, Vite 6, Zustand, TypeScript |
| Real-time | Dual WebSocket channels (client + agent) |
| Database | SQLite with WAL mode |
| Deployment | Docker, Railway, any Node.js host |

---

## Features

- **Multi-provider agents** — Claude, OpenAI, Gemini, and external agents
- **Group conversations** — multiple agents in one chat, responding in parallel
- **Real-time streaming** — WebSocket-based message streaming
- **Token usage tracking** — input/output tokens and cost per agent
- **Approval workflows** — require approval before agent actions
- **External agent SDK** — connect any agent via WebSocket
- **Mobile PWA** — add to home screen, works offline
- **Self-hosted** — SQLite database, no external services required
- **Single-password auth** — simple JWT-based authentication
- **Rate limiting** — brute-force protection on login

---

## Contributing

PRs, issues, and ideas are welcome.

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a PR

---

## License

[MIT](LICENSE)

---

Built by [Stephane Morera](https://github.com/stephanemorera88-spec). Free and open source.
