import { app } from '../src/server.js';
import { connectDb } from '../src/db/client.js';

export default async function handler(req, res) {
  await connectDb();
  return app(req, res);
}
