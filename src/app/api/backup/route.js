import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Product from '@/lib/models/Product';
import POSCustomer from '@/lib/models/POSCustomer';
import POSInvoice from '@/lib/models/POSInvoice';
import Supplier from '@/lib/models/Supplier';
import Purchase from '@/lib/models/Purchase';
import Expense from '@/lib/models/Expense';
import StoreConfig from '@/lib/models/StoreConfig';

export async function GET() {
  try {
    await dbConnect();
    
    // Fetch all collections
    const products = await Product.find({});
    const customers = await POSCustomer.find({});
    const invoices = await POSInvoice.find({});
    const suppliers = await Supplier.find({});
    const purchases = await Purchase.find({});
    const expenses = await Expense.find({});
    const config = await StoreConfig.find({});
    
    const dump = {
      timestamp: new Date().toISOString(),
      data: {
        products,
        customers,
        invoices,
        suppliers,
        purchases,
        expenses,
        config
      }
    };
    
    // Return as a downloadable JSON file
    return new NextResponse(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kajri_pos_backup_${new Date().getTime()}.json"`
      }
    });
  } catch (error) {
    console.error('Backup Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate backup' }, { status: 500 });
  }
}
