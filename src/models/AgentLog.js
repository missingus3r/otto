import mongoose from 'mongoose';

const agentLogSchema = new mongoose.Schema({
  runId: { type: String, index: true },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date },
  listingsScanned: { type: Number, default: 0 },
  matchesProposed: { type: Number, default: 0 },
  llmTokensUsed: { type: Number, default: 0 },
  error: { type: String, default: '' },
});

export default mongoose.models.AgentLog || mongoose.model('AgentLog', agentLogSchema);
