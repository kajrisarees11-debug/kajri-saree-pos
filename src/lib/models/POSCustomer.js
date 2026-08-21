import mongoose from 'mongoose';

const POSCustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobileNumber: { type: String, required: true, unique: true },
    address: { type: String },
    email: { type: String },
    outstandingBalance: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },
    lastPurchaseDate: { type: Date },
  },
  { timestamps: true }
);

POSCustomerSchema.index({ mobileNumber: 1 });
POSCustomerSchema.index({ name: 'text' });

export default mongoose.models.POSCustomer || mongoose.model('POSCustomer', POSCustomerSchema);
