import mongoose from 'mongoose';

const InvoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true }, // Selling Price
  mrp: { type: Number },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
});

const POSInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'POSCustomer' },
    date: { type: Date, default: Date.now },
    items: [InvoiceItemSchema],
    subTotal: { type: Number, required: true },
    taxTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Card', 'Udhaar', 'Split'], required: true },
    amountPaid: { type: Number, required: true },
    balance: { type: Number, default: 0 }, // For return of change
    status: { type: String, enum: ['Completed', 'Returned', 'Cancelled'], default: 'Completed' },
  },
  { timestamps: true }
);

POSInvoiceSchema.index({ invoiceNumber: 1 });

export default mongoose.models.POSInvoice || mongoose.model('POSInvoice', POSInvoiceSchema);
