import mongoose from 'mongoose';

const PurchaseItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  purchasePrice: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
});

const PurchaseSchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    invoiceNumber: { type: String, required: true },
    date: { type: Date, default: Date.now },
    items: [PurchaseItemSchema],
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Paid', 'Partial', 'Pending'], default: 'Pending' },
    // Completion/return status — mirrors the SQLite `purchases.status` column.
    // Distinct from paymentStatus above (which tracks whether it's been paid).
    status: { type: String, default: 'Completed' },
    // How much of totalAmount was actually refunded on return — a purchase
    // with even a single-item partial return is marked status='Returned' in
    // full, so this (mirroring POSInvoice.refundTotal) is what lets reports
    // net out only the genuinely-returned portion instead of excluding the
    // whole purchase's cost from COGS.
    refundTotal: { type: Number, default: 0 },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema);
