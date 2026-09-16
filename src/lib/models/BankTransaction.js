import mongoose from 'mongoose';

const BankTransactionSchema = new mongoose.Schema({
  bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  type: { type: String, enum: ['in', 'out'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'Manual' },
  date: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.models.BankTransaction || mongoose.model('BankTransaction', BankTransactionSchema);
