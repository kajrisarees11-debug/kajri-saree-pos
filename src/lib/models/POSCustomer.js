import mongoose from 'mongoose';

const POSCustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobileNumber: { type: String, required: true, unique: true },
    address: { type: String },
    email: { type: String },
    city: { type: String },
    pincode: { type: String },
    gstin: { type: String },
    customerType: { type: String, default: 'Retail' },
    outstandingBalance: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },
    lastPurchaseDate: { type: Date },
  },
  { timestamps: true }
);

// mobileNumber is already indexed via unique:true in the schema above.
POSCustomerSchema.index({ name: 'text' });

export default mongoose.models.POSCustomer || mongoose.model('POSCustomer', POSCustomerSchema);
