import { Router } from 'express';
import { arrangePlan } from '../services/arrange.js';
import { coachReply } from '../services/coach.js';
import { generateInsights } from '../services/insights.js';

export const aiRouter = Router();

aiRouter.post('/arrange', async (req, res, next) => {
  try {
    if (!req.body?.brainDump && req.body?.brainDump !== '') return res.status(400).json({ error: 'brainDump required' });
    const result = await arrangePlan(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

aiRouter.post('/coach', async (req, res, next) => {
  try {
    const { message, context, mode } = req.body ?? {};
    if (!message && mode !== 'stuck') return res.status(400).json({ error: 'message required' });
    if (message && message.length > 2000) return res.status(413).json({ error: 'message too long' });
    const result = await coachReply({ message, context, mode });
    res.json(result);
  } catch (err) { next(err); }
});

aiRouter.post('/insights', async (req, res, next) => {
  try {
    if (!req.body?.context) return res.status(400).json({ error: 'context required' });
    const { context, weekKey, force } = req.body;
    const result = await generateInsights({ context, weekKey, force });
    res.json(result);
  } catch (err) { next(err); }
});
