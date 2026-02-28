// ─── Agent ───────────────────────────────────────────────────────────

export type AgentStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
export type AgentProvider = 'claude' | 'openai' | 'gemini' | 'external';
export type AgentConnectionType = 'builtin' | 'external';

export interface Agent {
  id: string;
  name: string;
  description: string;
  provider: AgentProvider;
  model: string;
  system_prompt: string;
  status: AgentStatus;
  container_id: string | null;
  connection_type: AgentConnectionType;
  auth_token: string | null;
  permissions: AgentPermissions;
  config: AgentConfig;
  created_at: string;
  updated_at: string;
}

export interface AgentPermissions {
  network: boolean;
  filesystem: 'none' | 'read' | 'readwrite';
  max_tokens_per_message: number;
  max_cost_usd: number;
  requires_approval: boolean;
}

export interface AgentConfig {
  temperature?: number;
  max_turns?: number;
  idle_timeout_ms?: number;
  tools?: string[];
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: AgentProvider;
  model: string;
  system_prompt?: string;
  permissions?: Partial<AgentPermissions>;
  config?: Partial<AgentConfig>;
}

// ─── Conversation ────────────────────────────────────────────────────

export type ConversationStatus = 'active' | 'archived';

export interface Conversation {
  id: string;
  agent_id: string;
  title: string;
  session_id: string | null;
  status: ConversationStatus;
  is_group?: boolean;
  agent_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateConversationInput {
  title?: string;
}

// ─── Message ─────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';
export type ContentType = 'text' | 'markdown' | 'code' | 'json' | 'error';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  content_type: ContentType;
  metadata: MessageMetadata;
  created_at: string;
}

export interface MessageMetadata {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  tool_calls?: ToolCallInfo[];
  agent_id?: string;
  agent_name?: string;
}

export interface ToolCallInfo {
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

// ─── Activity ────────────────────────────────────────────────────────

export type ActivityStatus = 'completed' | 'pending_approval' | 'failed';

export interface ActivityLog {
  id: string;
  agent_id: string;
  action: string;
  detail: string;
  metadata: Record<string, unknown>;
  status: ActivityStatus;
  created_at: string;
}

// ─── Approvals ───────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface Approval {
  id: string;
  agent_id: string;
  action_type: string;
  action_detail: string;
  status: ApprovalStatus;
  created_at: string;
  resolved_at: string | null;
}

// ─── Token Usage ─────────────────────────────────────────────────────

export interface TokenUsage {
  id: string;
  agent_id: string;
  conversation_id: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string;
  created_at: string;
}

export interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  message_count: number;
}
