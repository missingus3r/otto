import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, default: '' },
    auth: { type: String, default: '' },
  },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.PushSubscription ||
  mongoose.model('PushSubscription', pushSubscriptionSchema);
