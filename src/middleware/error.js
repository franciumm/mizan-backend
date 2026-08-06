import { ZodError } from 'zod';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
  }
  if (err.name === 'HttpError') {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
}
