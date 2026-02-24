import WebSocket from 'ws';
import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────

export interface VaultAgentOptions {
  /** WebSocket URL, e.g. ws://192.168.1.75:3001/ws/agent */
  url: string;
  /** Auth token from Vault */
  token: string;
  /** Agent display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
}

export interface IncomingMessage {
  request_id: string;
  conversation_id: string;
  content: string;
}

export interface Reply {
  /** Send a text chunk to the user */
  chunk(content: string): void;
  /** Signal that the response is complete */
  done(): void;
  /** Send an error */
  error(message: string): void;
}

// Server → Agent events
interface ServerWelcome {
  type: 'server.welcome';
  agent_id: string;
  name: string;
}

interface ServerMessage {
  type: 'server.message';
  request_id: string;
  conversation_id: string;
  content: string;
}

type ServerEvent = ServerWelcome | ServerMessage;

// ─── VaultAgent ─────────────────────────────────────────────────────

export class VaultAgent extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: Required<VaultAgentOptions>;
  private agentId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: VaultAgentOptions) {
    super();
    this.options = {
      description: '',
      autoReconnect: true,
      reconnectDelay: 3000,
      ...opts,
    };
  }

  /** Connect to the Vault server */
  connect(): void {
    this.intentionalClose = false;

    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    ws.on('open', () => {
      // Send hello to authenticate
      this.send({
        type: 'agent.hello',
        token: this.options.token,
        name: this.options.name,
        description: this.options.description,
      });
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const event: ServerEvent = JSON.parse(raw.toString());
        this.handleEvent(event);
      } catch {
        // Ignore unparseable messages
      }
    });

    ws.on('ping', () => {
      ws.pong();
    });

    ws.on('close', (code, reason) => {
      this.cleanup();
      this.emit('disconnected', { code, reason: reason.toString() });

      if (!this.intentionalClose && this.options.autoReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.emit('reconnecting');
          this.connect();
        }, this.options.reconnectDelay);
      }
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  /** Disconnect from the Vault server */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.cleanup();
  }

  /** Check if connected */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** The agent ID assigned by Vault after authentication */
  get id(): string | null {
    return this.agentId;
  }

  private handleEvent(event: ServerEvent) {
    switch (event.type) {
      case 'server.welcome': {
        this.agentId = event.agent_id;
        this.emit('connected', { agent_id: event.agent_id, name: event.name });
        break;
      }

      case 'server.message': {
        const msg: IncomingMessage = {
          request_id: event.request_id,
          conversation_id: event.conversation_id,
          content: event.content,
        };

        const reply: Reply = {
          chunk: (content: string) => {
            this.send({
              type: 'agent.response.chunk',
              request_id: event.request_id,
              content,
              done: false,
            });
          },
          done: () => {
            this.send({
              type: 'agent.response.chunk',
              request_id: event.request_id,
              content: '',
              done: true,
            });
          },
          error: (message: string) => {
            this.send({
              type: 'agent.error',
              request_id: event.request_id,
              message,
            });
          },
        };

        this.emit('message', msg, reply);
        break;
      }
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// Re-export for convenience
export default VaultAgent;
