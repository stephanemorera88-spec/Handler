import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type {
  Agent,
  AgentStatus,
  AgentPermissions,
  AgentConfig,
  Conversation,
  ConversationStatus,
  Message,
  MessageRole,
  ContentType,
  MessageMetadata,
  ActivityLog,
  ActivityStatus,
  Approval,
  ApprovalStatus,
  TokenUsage,
  UsageSummary,
  CreateAgentInput,
} from '@vault/shared';

const DB_PATH = path.join(process.cwd(), 'data', 'vault.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'claude',
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
      system_prompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'stopped',
      container_id TEXT,
      permissions TEXT NOT NULL DEFAULT '{}',
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'text',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      action_detail TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_logs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_id);
  `);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function rowToAgent(row: any): Agent {
  return {
    ...row,
    permissions: parseJson<AgentPermissions>(row.permissions, {
      network: false,
      filesystem: 'none',
      max_tokens_per_message: 4096,
      max_cost_usd: 1.0,
      requires_approval: false,
    }),
    config: parseJson<AgentConfig>(row.config, {}),
  };
}

function rowToMessage(row: any): Message {
  return {
    ...row,
    metadata: parseJson<MessageMetadata>(row.metadata, {}),
  };
}

function rowToActivity(row: any): ActivityLog {
  return {
    ...row,
    metadata: parseJson(row.metadata, {}),
  };
}

// ─── Agents ──────────────────────────────────────────────────────────

const DEFAULT_PERMISSIONS: AgentPermissions = {
  network: false,
  filesystem: 'none',
  max_tokens_per_message: 4096,
  max_cost_usd: 1.0,
  requires_approval: false,
};

export function listAgents(): Agent[] {
  const rows = getDb().prepare('SELECT * FROM agents ORDER BY updated_at DESC').all();
  return rows.map(rowToAgent);
}

export function getAgent(id: string): Agent | null {
  const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id);
  return row ? rowToAgent(row) : null;
}

export function createAgent(input: CreateAgentInput): Agent {
  const id = uuid();
  const permissions = { ...DEFAULT_PERMISSIONS, ...input.permissions };
  const config = input.config || {};

  getDb().prepare(`
    INSERT INTO agents (id, name, description, provider, model, system_prompt, permissions, config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description || '',
    input.provider,
    input.model,
    input.system_prompt || '',
    JSON.stringify(permissions),
    JSON.stringify(config),
  );

  return getAgent(id)!;
}

export function deleteAgent(id: string): void {
  getDb().prepare('DELETE FROM agents WHERE id = ?').run(id);
}

export function updateAgent(id: string, updates: Partial<CreateAgentInput>): Agent | null {
  const agent = getAgent(id);
  if (!agent) return null;

  const name = updates.name ?? agent.name;
  const description = updates.description ?? agent.description;
  const model = updates.model ?? agent.model;
  const system_prompt = updates.system_prompt ?? agent.system_prompt;
  const permissions = updates.permissions
    ? { ...agent.permissions, ...updates.permissions }
    : agent.permissions;
  const config = updates.config
    ? { ...agent.config, ...updates.config }
    : agent.config;

  getDb().prepare(`
    UPDATE agents SET name = ?, description = ?, model = ?, system_prompt = ?,
    permissions = ?, config = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name, description, model, system_prompt, JSON.stringify(permissions), JSON.stringify(config), id);

  return getAgent(id);
}

export function updateAgentStatus(id: string, status: AgentStatus, containerId?: string | null): void {
  getDb().prepare(`
    UPDATE agents SET status = ?, container_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, containerId ?? null, id);
}

// ─── Conversations ───────────────────────────────────────────────────

export function listConversations(agentId: string): Conversation[] {
  return getDb()
    .prepare('SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC')
    .all(agentId) as Conversation[];
}

export function getConversation(id: string): Conversation | null {
  return (getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation) || null;
}

export function createConversation(agentId: string, title?: string): Conversation {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO conversations (id, agent_id, title) VALUES (?, ?, ?)
  `).run(id, agentId, title || 'New Conversation');
  return getConversation(id)!;
}

export function deleteConversation(id: string): void {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function renameConversation(id: string, title: string): Conversation | null {
  getDb().prepare(`
    UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?
  `).run(title, id);
  return getConversation(id);
}

export function updateConversationSession(id: string, sessionId: string): void {
  getDb().prepare(`
    UPDATE conversations SET session_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(sessionId, id);
}

export function searchMessages(agentId: string, query: string, limit = 20): (Message & { conversation_title: string })[] {
  return getDb().prepare(`
    SELECT m.*, c.title as conversation_title
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.agent_id = ? AND m.content LIKE ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(agentId, `%${query}%`, limit) as any[];
}

// ─── Messages ────────────────────────────────────────────────────────

export function listMessages(
  conversationId: string,
  limit = 50,
  offset = 0,
): { data: Message[]; total: number } {
  const total = (getDb()
    .prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?')
    .get(conversationId) as any).count;

  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?')
    .all(conversationId, limit, offset);

  return { data: rows.map(rowToMessage), total };
}

export function createMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  contentType: ContentType = 'text',
  metadata: MessageMetadata = {},
): Message {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO messages (id, conversation_id, role, content, content_type, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, role, content, contentType, JSON.stringify(metadata));

  // Touch conversation
  getDb().prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(conversationId);

  return rowToMessage(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id));
}

export function updateMessageContent(id: string, content: string): void {
  getDb().prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
}

// ─── Activity Logs ───────────────────────────────────────────────────

export function listActivity(agentId: string, limit = 50): ActivityLog[] {
  const rows = getDb()
    .prepare('SELECT * FROM activity_logs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(agentId, limit);
  return rows.map(rowToActivity);
}

export function createActivity(
  agentId: string,
  action: string,
  detail: string = '',
  status: ActivityStatus = 'completed',
  metadata: Record<string, unknown> = {},
): ActivityLog {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO activity_logs (id, agent_id, action, detail, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, agentId, action, detail, status, JSON.stringify(metadata));
  return rowToActivity(getDb().prepare('SELECT * FROM activity_logs WHERE id = ?').get(id));
}

// ─── Approvals ───────────────────────────────────────────────────────

export function getApproval(id: string): Approval | null {
  return (getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Approval) || null;
}

export function listApprovals(status?: ApprovalStatus): Approval[] {
  if (status) {
    return getDb()
      .prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC')
      .all(status) as Approval[];
  }
  return getDb()
    .prepare('SELECT * FROM approvals ORDER BY created_at DESC')
    .all() as Approval[];
}

export function createApproval(
  agentId: string,
  actionType: string,
  actionDetail: string,
): Approval {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO approvals (id, agent_id, action_type, action_detail)
    VALUES (?, ?, ?, ?)
  `).run(id, agentId, actionType, actionDetail);
  return getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Approval;
}

export function resolveApproval(id: string, status: 'approved' | 'denied'): Approval | null {
  getDb().prepare(`
    UPDATE approvals SET status = ?, resolved_at = datetime('now') WHERE id = ?
  `).run(status, id);
  return (getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Approval) || null;
}

// ─── Token Usage ─────────────────────────────────────────────────────

export function recordUsage(
  agentId: string,
  conversationId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  model: string,
): TokenUsage {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO token_usage (id, agent_id, conversation_id, input_tokens, output_tokens, cost_usd, model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, agentId, conversationId, inputTokens, outputTokens, costUsd, model);
  return getDb().prepare('SELECT * FROM token_usage WHERE id = ?').get(id) as TokenUsage;
}

export function getUsageSummary(agentId: string): UsageSummary {
  const row = getDb().prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost_usd,
      COUNT(*) as message_count
    FROM token_usage WHERE agent_id = ?
  `).get(agentId) as any;
  return row;
}
