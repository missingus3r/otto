import mongoose from 'mongoose';

const priceCacheSchema = new mongoose.Schema({
  queryHash: { type: String, required: true, unique: true, index: true },
  query: { type: String, required: true },
  median: { type: Number, default: null },
  samples: { type: Number, default: 0 },
  source: { type: String, default: '' },
  fetchedAt: { type: Date, default: Date.now },
});

export default mongoose.models.PriceCache ||
  mongoose.model('PriceCache', priceCacheSchema);
