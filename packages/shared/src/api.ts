import type {
  Agent,
  CreateAgentInput,
  Conversation,
  CreateConversationInput,
  Message,
  ActivityLog,
  Approval,
  TokenUsage,
  UsageSummary,
} from './types';

// ─── Request / Response types for REST API ───────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Agents
export type ListAgentsResponse = Agent[];
export type CreateAgentRequest = CreateAgentInput;
export type CreateAgentResponse = Agent;
export type GetAgentResponse = Agent;

// Conversations
export type ListConversationsResponse = Conversation[];
export type CreateConversationRequest = CreateConversationInput;
export type CreateConversationResponse = Conversation;

// Messages
export type ListMessagesResponse = PaginatedResponse<Message>;

// Activity
export type ListActivityResponse = ActivityLog[];

// Approvals
export type ListApprovalsResponse = Approval[];
export interface ResolveApprovalRequest {
  status: 'approved' | 'denied';
}

// Usage
export type GetUsageResponse = UsageSummary;
export type ListUsageResponse = TokenUsage[];
