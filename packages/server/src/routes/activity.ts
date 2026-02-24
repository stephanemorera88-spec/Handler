import { Router, Request, Response } from 'express';
import * as db from '../db';

const router = Router();

// GET /api/agents/:id/activity
router.get('/:id/activity', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const activity = db.listActivity(agent.id, limit);
  res.json(activity);
});

// GET /api/agents/:id/usage
router.get('/:id/usage', (req: Request, res: Response) => {
  const agent = db.getAgent(req.params.id as string);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const summary = db.getUsageSummary(agent.id);
  res.json(summary);
});

export default router;
