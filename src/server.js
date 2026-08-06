import express from 'express';
import cors from 'cors';
import { env } from './env.js';

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Mizan API listening on http://127.0.0.1:${env.PORT}`);
});
