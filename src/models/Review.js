import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
  },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: '', maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
});

// One review per (transaction, direction). Same transactionId could appear
// twice (one per direction) but only once per fromUserId. We enforce uniqueness
// on the pair (transactionId, fromUserId).
reviewSchema.index({ transactionId: 1, fromUserId: 1 }, { unique: true });

export default mongoose.models.Review || mongoose.model('Review', reviewSchema);
