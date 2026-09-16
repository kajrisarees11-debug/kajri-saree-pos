import mongoose from 'mongoose';

const BankAccountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  accountNo: { type: String, default: '' },
  ifsc: { type: String, default: '' },
  openingBalance: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.models.BankAccount || mongoose.model('BankAccount', BankAccountSchema);
