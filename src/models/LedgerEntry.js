import mongoose from 'mongoose';

// Append-only ledger. Do NOT add a remove method; do NOT register removal hooks.
const ledgerSchema = new mongoose.Schema({
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', index: true },
  action: {
    type: String,
    enum: [
      'match_proposed',
      'match_accepted',
      'transaction_completed',
      'transaction_cancelled',
    ],
    required: true,
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

// Block updates after creation. The ledger is append-only.
ledgerSchema.pre('findOneAndUpdate', function () {
  throw new Error('LedgerEntry is append-only — updates are not allowed');
});
ledgerSchema.pre('updateOne', function () {
  throw new Error('LedgerEntry is append-only — updates are not allowed');
});
ledgerSchema.pre('updateMany', function () {
  throw new Error('LedgerEntry is append-only — updates are not allowed');
});

export default mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerSchema);
