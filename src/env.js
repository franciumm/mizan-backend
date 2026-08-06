import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 8787),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  MONGODB_URI: required('MONGODB_URI'),
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'mizan',
  OPENROUTER_API_KEY: required('OPENROUTER_API_KEY'),
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash',
};
