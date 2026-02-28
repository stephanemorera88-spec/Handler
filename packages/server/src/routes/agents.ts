import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDefaultModel } from '@handler/shared';
import * as db from '../db';
import { getRuntime } from '../agent/runtime';

const router = Router();

const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  connection_type: z.enum(['builtin', 'external']).default('builtin'),
  provider: z.enum(['claude', 'openai', 'gemini', 'external']).default('claude'),
  model: z.string().optional(),
  system_prompt: z.string().max(10000).optional(),
  permissions: z.object({
    network: z.boolean().optional(),
    filesystem: z.enum(['none', 'read', 'readwrite']).optional(),
    max_tokens_per_message: z.number().int().min(1).max(100000).optional(),
    max_cost_usd: z.number().min(0).max(1000).optional(),
    requires_approval: z.boolean().optional(),
  }).optional(),
  config: z.object({
    temperature: z.number().min(0).max(2).optional(),
    max_turns: z.number().int().min(1).max(100).optional(),
    idle_timeout_ms: z.number().int().min(5000).max(600000).optional(),
    tools: z.array(z.string()).optional(),
  }).optional(),
}).transform((data) => ({
  ...data,
  model: data.model || getDefaultModel(data.provider),
}));

function generateToken(): string {
  return `vlt_${crypto.randomBytes(24).toString('hex')}`;
}

function stripToken(agent: any) {
  const { auth_token, ...safe } = agent;
  return safe;
}

// GET /api/agents
router.get('/', (_req: Request, res: Response) => {
  const agents = db.listAgents();
  res.json(agents.map(stripToken));
});

// GET /api/agents/:id
router.get('/:id', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(stripToken(agent));
});

// POST /api/agents
router.post('/', (req: Request, res: Response) => {
  const parsed = CreateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
  }

  if (parsed.data.connection_type === 'external') {
    const token = generateToken();
    const agent = db.createExternalAgent(
      parsed.data.name,
      parsed.data.description || '',
      token,
    );
    // Return token ONCE on creation
    res.status(201).json({ ...agent, auth_token: token });
    return;
  }

  const agent = db.createAgent(parsed.data);
  res.status(201).json(stripToken(agent));
});

// POST /api/agents/:id/start
router.post('/:id/start', async (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.connection_type === 'external') {
    return res.json({ message: 'External agents are started by connecting via WebSocket', agent: stripToken(agent) });
  }
  if (agent.status === 'running') return res.json({ message: 'Agent already running', agent: stripToken(agent) });

  try {
    const runtime = getRuntime();
    await runtime.startAgent(agent);
    const updated = db.getAgent(agent.id);
    res.json(stripToken(updated));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start agent', detail: err.message });
  }
});

// POST /api/agents/:id/stop
router.post('/:id/stop', async (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status === 'stopped') return res.json({ message: 'Agent already stopped', agent: stripToken(agent) });

  try {
    const runtime = getRuntime();
    await runtime.stopAgent(agent.id);
    const updated = db.getAgent(agent.id);
    res.json(stripToken(updated));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to stop agent', detail: err.message });
  }
});

// POST /api/agents/:id/kill — Force kill
router.post('/:id/kill', async (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  try {
    const runtime = getRuntime();
    await runtime.killAgent(agent.id);
    const updated = db.getAgent(agent.id);
    res.json(stripToken(updated));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to kill agent', detail: err.message });
  }
});

// POST /api/agents/:id/regenerate-token — Regenerate auth token for external agent
router.post('/:id/regenerate-token', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.connection_type !== 'external') {
    return res.status(400).json({ error: 'Only external agents have tokens' });
  }
  const token = generateToken();
  db.updateAgentToken(agent.id, token);
  res.json({ auth_token: token });
});

// PATCH /api/agents/:id — Update agent config
router.patch('/:id', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const updated = db.updateAgent(agent.id, req.body);
  res.json(stripToken(updated));
});

// DELETE /api/agents/:id
router.delete('/:id', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.deleteAgent(agent.id);
  res.json({ message: 'Agent deleted' });
});

export default router;
