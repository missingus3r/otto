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

export default mongoose.models.User || mongoose.model('User', userSchema);
