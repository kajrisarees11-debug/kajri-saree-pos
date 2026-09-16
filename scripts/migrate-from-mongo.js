require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function getDbPath() {
  if (process.env.SQLITE_DB_PATH) {
    return process.env.SQLITE_DB_PATH;
  }
  
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'kajri-pos.db');
  }

  const fallbackDir = path.join(os.homedir(), '.kajri-pos');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return path.join(fallbackDir, 'kajri-pos.db');
}

const dbPath = getDbPath();
console.log(`[Migration] Local SQLite database at: ${dbPath}`);
const sqliteDb = new Database(dbPath, { verbose: null });

async function migrate() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set in .env.local");
    
    console.log("[Migration] Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("[Migration] Connected to MongoDB.");

    // Connect to actual collections
    const productsCollection = mongoose.connection.collection('products');
    const customersCollection = mongoose.connection.collection('poscustomers');
    const invoicesCollection = mongoose.connection.collection('posinvoices');
    const suppliersCollection = mongoose.connection.collection('suppliers');
    const expensesCollection = mongoose.connection.collection('expenses');
    
    console.log("[Migration] Fetching data from MongoDB...");
    const products = await productsCollection.find({}).toArray();
    const customers = await customersCollection.find({}).toArray();
    const invoices = await invoicesCollection.find({}).toArray();
    const suppliers = await suppliersCollection.find({}).toArray();
    const expenses = await expensesCollection.find({}).toArray();
    
    console.log(`[Migration] Found:`);
    console.log(`  Products: ${products.length}`);
    console.log(`  Customers: ${customers.length}`);
    console.log(`  Invoices: ${invoices.length}`);
    console.log(`  Suppliers: ${suppliers.length}`);
    console.log(`  Expenses: ${expenses.length}`);

    console.log("[Migration] Inserting into SQLite...");
    
    sqliteDb.transaction(() => {
      // Products
      const insertProduct = sqliteDb.prepare(`
        INSERT INTO products (_id, name, sku, barcode, description, price, purchasePrice, stock, minStock, categoryId, subCategory, supplierId, images, fabric, colour, sareeType, brand, design, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(_id) DO UPDATE SET
          name=excluded.name, sku=excluded.sku, barcode=excluded.barcode, description=excluded.description,
          price=excluded.price, purchasePrice=excluded.purchasePrice, stock=excluded.stock, minStock=excluded.minStock,
          categoryId=excluded.categoryId, subCategory=excluded.subCategory, supplierId=excluded.supplierId,
          images=excluded.images, fabric=excluded.fabric, colour=excluded.colour, sareeType=excluded.sareeType,
          brand=excluded.brand, design=excluded.design, status=excluded.status, updatedAt=excluded.updatedAt
      `);
      for (const p of products) {
        insertProduct.run(
          p._id.toString(), p.name, p.sku || null, p.barcode || null, p.description || null, p.price || 0, p.purchasePrice || 0,
          p.stock || 0, p.minStock || 5, p.category ? p.category.toString() : p.categoryId?.toString() || null, p.subCategory || null, p.supplierId?.toString() || null,
          JSON.stringify(p.images || []), p.fabric || null, p.colour || null, p.sareeType || null, p.brand || null, p.design || null,
          p.status || 'Active', p.createdAt ? new Date(p.createdAt).toISOString() : null, p.updatedAt ? new Date(p.updatedAt).toISOString() : null
        );
      }

      // Customers
      const insertCustomer = sqliteDb.prepare(`
        INSERT INTO customers (_id, name, mobileNumber, email, address, city, pincode, outstandingBalance, totalPurchases, gstin, customerType, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(_id) DO UPDATE SET
          name=excluded.name, mobileNumber=excluded.mobileNumber, email=excluded.email, address=excluded.address,
          city=excluded.city, pincode=excluded.pincode, outstandingBalance=excluded.outstandingBalance,
          totalPurchases=excluded.totalPurchases, gstin=excluded.gstin, customerType=excluded.customerType, updatedAt=excluded.updatedAt
      `);
      for (const c of customers) {
        insertCustomer.run(
          c._id.toString(), c.name, c.mobileNumber || c.mobile || null, c.email || null, c.address || null, c.city || null, c.pincode || null,
          c.outstandingBalance || 0, c.totalPurchases || 0, c.gstin || null, c.customerType || 'Retail',
          c.createdAt ? new Date(c.createdAt).toISOString() : null, c.updatedAt ? new Date(c.updatedAt).toISOString() : null
        );
      }

      // Invoices
      const insertInvoice = sqliteDb.prepare(`
        INSERT INTO invoices (_id, invoiceNumber, customerId, items, subTotal, taxTotal, discountTotal, grandTotal, paymentMethod, amountPaid, balance, status, returnReason, refundTotal, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(_id) DO UPDATE SET
          invoiceNumber=excluded.invoiceNumber, customerId=excluded.customerId, items=excluded.items, subTotal=excluded.subTotal,
          taxTotal=excluded.taxTotal, discountTotal=excluded.discountTotal, grandTotal=excluded.grandTotal, paymentMethod=excluded.paymentMethod,
          amountPaid=excluded.amountPaid, balance=excluded.balance, status=excluded.status, returnReason=excluded.returnReason,
          refundTotal=excluded.refundTotal, updatedAt=excluded.updatedAt
      `);
      for (const inv of invoices) {
        insertInvoice.run(
          inv._id.toString(), inv.invoiceNumber, inv.customerId?.toString() || null, JSON.stringify(inv.items || []),
          inv.subTotal || 0, inv.taxTotal || 0, inv.discountTotal || 0, inv.grandTotal || 0, inv.paymentMethod || 'Cash',
          inv.amountPaid || 0, inv.balance || 0, inv.status || 'Completed', inv.returnReason || null, inv.refundTotal || 0,
          inv.createdAt ? new Date(inv.createdAt).toISOString() : null, inv.updatedAt ? new Date(inv.updatedAt).toISOString() : null
        );
      }
      
      // Suppliers
      const insertSupplier = sqliteDb.prepare(`
        INSERT INTO suppliers (_id, name, contactNumber, phone, email, address, city, gstin, payableBalance, outstandingBalance, purchaseHistory, bankName, accountNumber, ifscCode, upiId, notes, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(_id) DO UPDATE SET
          name=excluded.name, contactNumber=excluded.contactNumber, phone=excluded.phone, email=excluded.email, address=excluded.address, city=excluded.city,
          gstin=excluded.gstin, payableBalance=excluded.payableBalance, outstandingBalance=excluded.outstandingBalance, purchaseHistory=excluded.purchaseHistory,
          bankName=excluded.bankName, accountNumber=excluded.accountNumber, ifscCode=excluded.ifscCode, upiId=excluded.upiId, notes=excluded.notes, updatedAt=excluded.updatedAt
      `);
      for (const s of suppliers) {
        insertSupplier.run(
          s._id.toString(), s.name, s.contactNumber || null, s.phone || null, s.email || null, s.address || null, s.city || null,
          s.gstin || s.gstNumber || null, s.payableBalance || 0, s.outstandingBalance || 0, s.purchaseHistory || 0,
          s.bankName || null, s.accountNumber || null, s.ifscCode || null, s.upiId || null, s.notes || null,
          s.createdAt ? new Date(s.createdAt).toISOString() : null, s.updatedAt ? new Date(s.updatedAt).toISOString() : null
        );
      }
      
      // Expenses
      const insertExpense = sqliteDb.prepare(`
        INSERT INTO expenses (_id, date, category, amount, paymentMethod, description, referenceNo, receiptImage, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(_id) DO UPDATE SET
          date=excluded.date, category=excluded.category, amount=excluded.amount, paymentMethod=excluded.paymentMethod,
          description=excluded.description, referenceNo=excluded.referenceNo, receiptImage=excluded.receiptImage, updatedAt=excluded.updatedAt
      `);
      for (const e of expenses) {
        insertExpense.run(
          e._id.toString(), e.date ? new Date(e.date).toISOString() : new Date().toISOString(), e.category || 'Other', e.amount || 0,
          e.paymentMethod || 'Cash', e.description || e.title || null, e.referenceNo || null, e.receiptImage || null,
          e.createdAt ? new Date(e.createdAt).toISOString() : null, e.updatedAt ? new Date(e.updatedAt).toISOString() : null
        );
      }

    })();

    console.log("[Migration] Success! All data migrated to local SQLite database.");
    process.exit(0);
  } catch (error) {
    console.error("[Migration] Error:", error);
    process.exit(1);
  }
}

migrate();
