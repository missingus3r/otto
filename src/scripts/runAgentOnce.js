import 'dotenv/config';
import { connectDB } from '../config/db.js';
import { runOnce } from '../services/agent.js';
import mongoose from 'mongoose';

async function main() {
  await connectDB();
  const log = await runOnce();
  console.log('[runAgentOnce] result:', JSON.stringify(log, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[runAgentOnce] failed:', err);
  process.exit(1);
});
