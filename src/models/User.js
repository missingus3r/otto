import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
  lang: { type: String, enum: ['es', 'pt', 'en'], default: 'es' },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
  banned: { type: Boolean, default: false },
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

export default mongoose.models.User || mongoose.model('User', userSchema);
