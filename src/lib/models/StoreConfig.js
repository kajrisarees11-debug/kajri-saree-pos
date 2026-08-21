import mongoose from 'mongoose';

const StoreConfigSchema = new mongoose.Schema({
  storeName: { type: String, default: 'Kajri Sarees' },
  gstin: { type: String, default: '24AAAAA0000A1Z5' },
  address: { type: String, default: '123, Textile Market, Surat, Gujarat - 395002' },
  phone: { type: String, default: '+91 9876543210' },
  email: { type: String, default: '' },
  invoicePrefix: { type: String, default: 'INV-' },
  defaultTaxRate: { type: Number, default: 5 }, // Default GST percentage
  pageSize: { type: String, default: '80mm' },
  terms: { type: String, default: '1. Goods once sold will not be taken back or exchanged.\n2. Subject to Surat jurisdiction only.' }
}, { timestamps: true });

export default mongoose.models.StoreConfig || mongoose.model('StoreConfig', StoreConfigSchema);
