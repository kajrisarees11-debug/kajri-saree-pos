import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema(
  {
    category: { type: String, required: true }, // e.g., Rent, Salary, Packaging, etc.
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'Card'] },
    notes: { type: String },
    // Mirrors the SQLite `expenses` table, which uses `description` as the
    // free-text field (plus these two extra columns) — kept distinct from
    // `notes` above rather than renamed, to avoid touching existing data.
    description: { type: String },
    referenceNo: { type: String },
    receiptImage: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);
