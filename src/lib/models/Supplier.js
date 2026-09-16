import mongoose from 'mongoose';

const SupplierSchema = new mongoose.Schema(
  {
    name:             { type: String, required: true },
    contactNumber:    { type: String },
    phone:            { type: String }, // alias
    email:            { type: String },
    address:          { type: String },
    city:             { type: String },
    gstin:            { type: String },
    // Financial tracking
    payableBalance:       { type: Number, default: 0 }, // original field
    outstandingBalance:   { type: Number, default: 0 }, // alias used by payment APIs
    purchaseHistory:  { type: Number, default: 0 }, // Total value of purchases
    // Bank details for payments
    bankName:         { type: String },
    accountNumber:    { type: String },
    ifscCode:         { type: String },
    upiId:            { type: String },
    // Meta
    notes:            { type: String },
  },
  { timestamps: true }
);

SupplierSchema.index({ name: 'text' });

export default mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);

