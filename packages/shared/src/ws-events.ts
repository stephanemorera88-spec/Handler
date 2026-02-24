import type { AgentStatus, MessageRole, ContentType, ApprovalStatus } from './types';

// ─── Client → Server ─────────────────────────────────────────────────

export interface WsSendMessage {
  type: 'send_message';
  conversation_id: string;
  content: string;
}

export interface WsStartAgent {
  type: 'start_agent';
  agent_id: string;
}

export interface WsStopAgent {
  type: 'stop_agent';
  agent_id: string;
  force?: boolean;
}

export type ClientEvent = WsSendMessage | WsStartAgent | WsStopAgent;

// ─── Server → Client ─────────────────────────────────────────────────

export interface WsMessageChunk {
  type: 'message_chunk';
  conversation_id: string;
  message_id: string;
  role: MessageRole;
  content: string;
  content_type: ContentType;
  done: boolean;
}

export interface WsAgentStatus {
  type: 'agent_status';
  agent_id: string;
  status: AgentStatus;
  container_id?: string;
}

export interface WsActivity {
  type: 'activity';
  agent_id: string;
  action: string;
  detail: string;
}

export interface WsApprovalRequest {
  type: 'approval_request';
  approval_id: string;
  agent_id: string;
  action_type: string;
  action_detail: string;
}

export interface WsTokenUsage {
  type: 'token_usage';
  agent_id: string;
  conversation_id: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface WsError {
  type: 'error';
  message: string;
  agent_id?: string;
  conversation_id?: string;
}

export type ServerEvent =
  | WsMessageChunk
  | WsAgentStatus
  | WsActivity
  | WsApprovalRequest
  | WsTokenUsage
  | WsError;
