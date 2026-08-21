import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema(
  {
    category: { type: String, required: true }, // e.g., Rent, Salary, Packaging, etc.
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'Card'] },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);
