import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as db from '../db';

const router = Router();

const ResolveSchema = z.object({
  status: z.enum(['approved', 'denied']),
});

// GET /api/approvals
router.get('/', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  if (status && !['pending', 'approved', 'denied'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status filter' });
  }
  const approvals = db.listApprovals(status as any);
  res.json(approvals);
});

// POST /api/approvals/:id/resolve
router.post('/:id/resolve', (req: Request, res: Response) => {
  const parsed = ResolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
  }

  const approval = db.resolveApproval(req.params.id as string, parsed.data.status);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });
  res.json(approval);
});

export default router;
