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
  },
  { timestamps: true }
);

export default mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema);
