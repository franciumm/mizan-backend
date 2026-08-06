import mongoose from 'mongoose';
import { env } from '../env.js';

let connected = false;

export async function connectDb() {
  if (connected) return;
  // Atlas replica sets support transactions (needed by ripple + rollover).
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });
  connected = true;
}

export async function disconnectDb() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

// For tests that need a fresh connection state.
export function __resetConnected() { connected = false; }
