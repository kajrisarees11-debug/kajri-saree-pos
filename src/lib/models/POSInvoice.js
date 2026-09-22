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
    // Client-generated key so a retried/duplicated submission of the same
    // checkout (e.g. the response to a successful create was lost) can be
    // recognized and returned instead of creating a second sale.
    idempotencyKey: { type: String, index: true, sparse: true, unique: true },
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
    // Return tracking
    returnReason: { type: String },
    refundTotal:  { type: Number, default: 0 },

  },
  { timestamps: true }
);

// invoiceNumber is already indexed via unique:true in the schema above.

export default mongoose.models.POSInvoice || mongoose.model('POSInvoice', POSInvoiceSchema);
