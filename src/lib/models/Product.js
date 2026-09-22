import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    barcode: { type: String, unique: true, sparse: true }, // New for POS
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    
    // Pricing
    price: { type: Number }, // Selling Price
    discountPrice: { type: Number },
    purchasePrice: { type: Number }, // New for POS
    mrp: { type: Number }, // New for POS
    taxRate: { type: Number, default: 0 }, // New for POS (e.g. 5 for 5% GST)
    
    // Details
    fabric: { type: String },
    color: { type: [String], default: [] },
    occasion: { type: String },
    description: { type: String },
    
    // New retail classifications
    subCategory: { type: String },
    sareeType: { type: String },
    brand: { type: String },
    
    // Inventory
    stock: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },

    // E-commerce Flags
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    
    // Media
    coverImage: { type: String },
    images: [{ type: String }],
    video: { type: String },
    
    tags: [{ type: String }],
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
    variants: [
      {
        size: String,
        color: String,
        stock: { type: Number, default: 0 },
        barcode: { type: String, sparse: true }, // Barcode for specific variant
      },
    ],
    order: { type: Number, default: 0 },
    seoTitle: { type: String },
    seoDescription: { type: String },
  },
  { timestamps: true }
);

// barcode and sku are already indexed via unique:true in the schema above.
ProductSchema.index({ name: 'text' }); // text search

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
