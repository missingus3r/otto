import mongoose from 'mongoose';

const MATCH_TTL_HOURS = 48;

const matchSchema = new mongoose.Schema({
  listingA: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  listingB: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  agentScore: { type: Number, min: 0, max: 100, default: 0 },
  agentRationale: { type: String, default: '' },
  proposedPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'UYU' },
  status: {
    type: String,
    enum: ['proposed', 'accepted_a', 'accepted_b', 'accepted_both', 'rejected', 'expired'],
    default: 'proposed',
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + MATCH_TTL_HOURS * 60 * 60 * 1000),
  },
  createdAt: { type: Date, default: Date.now },
});

matchSchema.index({ listingA: 1, listingB: 1 }, { unique: false });

export default mongoose.models.Match || mongoose.model('Match', matchSchema);
