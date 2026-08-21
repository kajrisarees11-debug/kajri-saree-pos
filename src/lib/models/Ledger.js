import mongoose from 'mongoose';

const LedgerSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['POSCustomer', 'Supplier'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    transactionType: { type: String, enum: ['Credit', 'Debit'], required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    referenceId: { type: mongoose.Schema.Types.ObjectId }, // Invoice ID or Purchase ID
    description: { type: String },
  },
  { timestamps: true }
);

LedgerSchema.index({ entityId: 1, entityType: 1 });

export default mongoose.models.Ledger || mongoose.model('Ledger', LedgerSchema);
