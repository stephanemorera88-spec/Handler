import { Router, Request, Response } from 'express';
import * as db from '../db';

const router = Router();

// GET /api/agents/:id/conversations
router.get('/agents/:id/conversations', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const conversations = db.listConversations(agent.id);
  res.json(conversations);
});

// POST /api/agents/:id/conversations
router.post('/agents/:id/conversations', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const conversation = db.createConversation(agent.id, req.body.title);
  res.status(201).json(conversation);
});

// POST /api/conversations/group
router.post('/conversations/group', (req: Request, res: Response) => {
  const { agent_ids, title } = req.body;
  if (!Array.isArray(agent_ids) || agent_ids.length < 2) {
    return res.status(400).json({ error: 'Group chat requires at least 2 agents' });
  }
  // Verify all agents exist
  for (const id of agent_ids) {
    const agent = db.getAgent(id);
    if (!agent) return res.status(404).json({ error: `Agent ${id} not found` });
  }
  const conversation = db.createGroupConversation(agent_ids, title);
  res.status(201).json(conversation);
});

// GET /api/conversations/:id/agents
router.get('/conversations/:id/agents', (req: Request, res: Response) => {
  const conversation = db.getConversation(req.params.id as string);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const agentIds = db.getConversationAgents(conversation.id);
  const agents = agentIds.map((id) => db.getAgent(id)).filter(Boolean);
  res.json(agents);
});

// DELETE /api/conversations/:id
router.delete('/conversations/:id', (req: Request, res: Response) => {
  const conversation = db.getConversation(req.params.id as string);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  db.deleteConversation(conversation.id);
  res.json({ message: 'Conversation deleted' });
});

// PATCH /api/conversations/:id — Rename conversation
router.patch('/conversations/:id', (req: Request, res: Response) => {
  const conversation = db.getConversation(req.params.id as string);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const updated = db.renameConversation(conversation.id, req.body.title);
  res.json(updated);
});

// GET /api/conversations/:id/messages
router.get('/conversations/:id/messages', (req: Request, res: Response) => {
  const conversation = db.getConversation(req.params.id as string);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  const { data, total } = db.listMessages(conversation.id, limit, offset);
  res.json({ data, total, limit, offset });
});

// GET /api/agents/:id/search — Search messages for an agent
router.get('/agents/:id/search', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const query = (req.query.q as string) || '';
  if (!query) return res.json([]);
  const results = db.searchMessages(agent.id, query);
  res.json(results);
});

export default router;
