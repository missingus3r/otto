import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['sell', 'swap', 'buy'], required: true },
  priceMin: { type: Number, default: 0 },
  priceMax: { type: Number, default: 0 },
  currency: { type: String, default: 'UYU' },
  swapForDescription: { type: String, default: '' },
  photoPath: { type: String, default: '' },
  thumbPath: { type: String, default: null },
  status: {
    type: String,
    enum: ['open', 'matched', 'closed', 'cancelled'],
    default: 'open',
  },
  tags: [{ type: String }],
  flagged: { type: Boolean, default: false },
  flaggedAt: { type: Date },
  flagReason: { type: String, default: '' },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

listingSchema.index({ status: 1, type: 1 });

listingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Listing || mongoose.model('Listing', listingSchema);
