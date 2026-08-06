import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { logMiddleware } from './middleware/log.js';
import { errorHandler } from './middleware/error.js';

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(logMiddleware);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Mizan API listening on http://127.0.0.1:${env.PORT}`);
});
