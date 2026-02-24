# Handler

**Your AI agents are running. Now talk to them safely.**

Handler is a dedicated messaging app for your AI agents — separate from your personal life, your contacts, and your business conversations. No more agents sitting in WhatsApp next to your mom. No more phone numbers exposed. No more Discord chaos.

Free and open source. Because AI safety is everyone's problem.

---

## Why Handler?

You can already talk to your AI agents on the go — through WhatsApp, Telegram, Signal, Discord. But your agents are sitting in the same app as your family, your clients, and your business partners.

- Your agent is one tap away from your contacts
- Your phone number is tied to agent traffic
- There's no separation between personal and AI conversations

Handler gives your agents their own app. Same mobile convenience. Zero risk.

## What It Does

- **One app, all your agents** — every agent in one dedicated inbox
- **Agents connect to you** — plug in with the SDK, no phone number needed
- **Real-time streaming** — send messages, get streaming responses from anywhere
- **Secure by design** — JWT auth, separate from your personal messaging

## Architecture

```
packages/
├── server/       Express + SQLite API server with WebSocket support
├── client/       React 19 + Vite frontend
├── agent-sdk/    TypeScript SDK for connecting external agents
└── shared/       Shared types and utilities
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/stephanemorera88-spec/Handler-.git
cd Handler-

# Install dependencies
npm install

# Set your password (or skip and one will be generated for you)
echo "HANDLER_SECRET=your-password-here" > .env

# Start the dev server
npm run dev
```

The server starts on `http://localhost:3001`. Open it in your browser and log in with your password.

### Build for Production

```bash
npm run build
npm start -w packages/server
```

## Connect an Agent

Drop in the SDK and connect any agent in minutes:

```typescript
import { VaultAgent } from '@handler/agent-sdk';

const agent = new VaultAgent({
  url: 'ws://localhost:3001/ws/agent',
  token: 'your-agent-token',
  name: 'MyAgent',
});

agent.on('message', async (msg, reply) => {
  // Process the message with your agent
  const response = await myAgent.process(msg.content);
  reply.chunk(response);
  reply.done();
});

agent.connect();
```

You get the agent token when you create an agent through the app. The SDK handles reconnection, authentication, and message streaming automatically.

## Tech Stack

| Layer | Tech |
|-------|------|
| Server | Express, better-sqlite3, JWT, pino |
| Client | React 19, Vite 6, Zustand, TypeScript |
| Agent SDK | TypeScript, WebSocket, EventEmitter |
| Real-time | Dual WebSocket channels (client + agent) |

## Early Release

Handler works — you can connect agents, send messages, and get streaming responses right now. But we're just getting started:

**Working now:**
- Real-time messaging with agents
- External agent SDK
- Streaming responses
- Authentication & security

**Coming soon:**
- Native mobile app
- Python, Go, and more SDKs
- Agent approval workflows
- Usage tracking & analytics

We're building in the open. If you want to help — report bugs, suggest features, contribute code — we want you here.

## Contributing

This is a community project. PRs, issues, and ideas are all welcome.

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a PR

## License

MIT

---

Built by [Stephane Morera](https://x.com/stephanemorera). Free & open source because AI safety is everyone's problem.
