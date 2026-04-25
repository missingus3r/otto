import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true,
  },
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  body: { type: String, required: true, maxlength: 1000 },
  seenAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
});

messageSchema.index({ matchId: 1, createdAt: 1 });

export default mongoose.models.Message || mongoose.model('Message', messageSchema);
