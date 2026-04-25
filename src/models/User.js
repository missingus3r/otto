import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const SUPPORTED_LANGS = ['es', 'pt', 'en', 'fr', 'it'];

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  passwordHash: { type: String, required: true },
  displayName: { type: String, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  lang: { type: String, enum: SUPPORTED_LANGS, default: 'es' },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },

  // Bans (permanent and temporary)
  banned: { type: Boolean, default: false },
  bannedUntil: { type: Date },
  banReason: { type: String, default: '' },

  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: { type: String, default: null, index: true },
  emailVerifyExpiresAt: { type: Date },

  // Pending email change (verified separately)
  pendingEmail: { type: String, default: null },
  pendingEmailToken: { type: String, default: null, index: true },
  pendingEmailExpiresAt: { type: Date },

  // Password reset
  passwordResetToken: { type: String, default: null, index: true },
  passwordResetExpiresAt: { type: Date },

  // Geo
  city: { type: String, default: '', maxlength: 80 },
  country: { type: String, default: '', maxlength: 2 },

  // Push notification preferences
  pushPrefs: {
    matches: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    reviews: { type: Boolean, default: true },
  },

  // Account deletion (GDPR-ish soft delete)
  deletionRequestedAt: { type: Date },
});

userSchema.methods.comparePassword = async function (plain) {
  if (!plain || !this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

// Aggregate reputation from Review collection.
// Returns { avgRating: number|null, count: number }.
userSchema.methods.reputation = async function () {
  // Lazy import to avoid circular references at model load time.
  const Review = (await import('./Review.js')).default;
  const agg = await Review.aggregate([
    { $match: { toUserId: this._id } },
    { $group: { _id: '$toUserId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  if (!agg.length) return { avgRating: null, count: 0 };
  return {
    avgRating: Math.round(agg[0].avg * 10) / 10,
    count: agg[0].count,
  };
};

// Same logic, callable statically by user id (for view helpers/profile pages).
userSchema.statics.reputationFor = async function (userId) {
  const Review = (await import('./Review.js')).default;
  const agg = await Review.aggregate([
    { $match: { toUserId: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: '$toUserId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  if (!agg.length) return { avgRating: null, count: 0 };
  return {
    avgRating: Math.round(agg[0].avg * 10) / 10,
    count: agg[0].count,
  };
};

// Helper: are we currently banned (perm or temp)?
userSchema.methods.isBlocked = function () {
  if (this.banned) return true;
  if (this.bannedUntil && this.bannedUntil.getTime() > Date.now()) return true;
  return false;
};

export default mongoose.models.User || mongoose.model('User', userSchema);
