import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Purchase from '@/lib/models/Purchase';
import Product from '@/lib/models/Product';
import Supplier from '@/lib/models/Supplier';

export async function GET() {
  try {
    await dbConnect();
    const purchases = await Purchase.find().populate('supplierId').sort({ date: -1 });
    return NextResponse.json({ success: true, data: purchases });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    // Create the purchase record
    const purchase = await Purchase.create(body);

    // Update Product Inventory
    const bulkOps = body.items.map(item => ({
      updateOne: {
        filter: { _id: item.productId },
        update: { 
          $inc: { stock: item.quantity },
          $set: { purchasePrice: item.purchasePrice } // Update latest purchase price
        }
      }
    }));

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }

    // Update Supplier Balance (if not fully paid)
    if (body.paymentStatus !== 'Paid') {
      const balanceAdded = body.totalAmount - (body.amountPaid || 0);
      await Supplier.findByIdAndUpdate(body.supplierId, {
        $inc: { 
          payableBalance: balanceAdded,
          purchaseHistory: body.totalAmount 
        }
      });
    } else {
      await Supplier.findByIdAndUpdate(body.supplierId, {
        $inc: { purchaseHistory: body.totalAmount }
      });
    }

    return NextResponse.json({ success: true, data: purchase }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
