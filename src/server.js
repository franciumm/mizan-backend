import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { logMiddleware } from './middleware/log.js';
import { errorHandler } from './middleware/error.js';
import { connectDb } from './db/client.js';
import { syncRouter } from './routes/sync.js';
import { tasksRouter } from './routes/tasks.js';
import { goalsRouter } from './routes/goals.js';
import { horizonsRouter } from './routes/horizons.js';
import { dailyLogRouter } from './routes/daily-log.js';
import { draftsRouter } from './routes/drafts.js';
import { aiRouter } from './routes/ai.js';
import { migrateRouter } from './routes/migrate.js';
import repsRouter from './routes/reps.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(logMiddleware);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/sync', syncRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/horizons', horizonsRouter);
app.use('/api/daily-log', dailyLogRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/reps', repsRouter);
app.use('/api', aiRouter);  // mounts /api/arrange, /api/coach, /api/insights
app.use('/api/migrate', migrateRouter);

app.use(errorHandler);

if (env.NODE_ENV !== 'test') {
  app.listen(env.PORT, async () => {
    await connectDb();
    console.log(`Mizan API listening on http://127.0.0.1:${env.PORT}`);
  });
}

export { app };
