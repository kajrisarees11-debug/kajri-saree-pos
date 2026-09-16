import mongoose from 'mongoose';

const CashTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['in', 'out'], required: true },
  amount: { type: Number, required: true },
  category: { type: String, default: 'Other' },
  description: { type: String, default: '' },
  date: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.models.CashTransaction || mongoose.model('CashTransaction', CashTransactionSchema);
