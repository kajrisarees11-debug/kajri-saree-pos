import mongoose from 'mongoose';

const SupplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contactNumber: { type: String },
    address: { type: String },
    gstin: { type: String },
    payableBalance: { type: Number, default: 0 },
    purchaseHistory: { type: Number, default: 0 }, // Total value of items purchased
  },
  { timestamps: true }
);

SupplierSchema.index({ name: 'text' });

export default mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);
