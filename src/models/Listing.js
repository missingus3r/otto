import mongoose from 'mongoose';

const CATEGORIES = [
  'electronica',
  'hogar',
  'vehiculos',
  'ropa',
  'libros',
  'deportes',
  'musica',
  'servicios',
  'otros',
];

const photoSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    thumbPath: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const listingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['sell', 'swap', 'buy'], required: true },
  priceMin: { type: Number, default: 0 },
  priceMax: { type: Number, default: 0 },
  currency: { type: String, default: 'UYU' },
  swapForDescription: { type: String, default: '' },

  // Backwards compat — first photo mirrored here.
  photoPath: { type: String, default: '' },
  thumbPath: { type: String, default: null },

  // New: up to 6 photos.
  photos: { type: [photoSchema], default: [] },

  category: {
    type: String,
    enum: CATEGORIES,
    default: 'otros',
    index: true,
  },

  // Geo
  city: { type: String, default: '', maxlength: 80, index: true },

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
  // Moderation appeal
  appealReason: { type: String, default: '' },
  appealAt: { type: Date },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

listingSchema.index({ status: 1, type: 1 });
listingSchema.index({ status: 1, category: 1 });
listingSchema.index({ city: 1, status: 1 });

// Text index for manual search
listingSchema.index({ title: 'text', description: 'text' });

listingSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export { CATEGORIES };
export default mongoose.models.Listing || mongoose.model('Listing', listingSchema);
