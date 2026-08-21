import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Expense from '@/lib/models/Expense';

export async function GET() {
  try {
    await dbConnect();
    const expenses = await Expense.find().sort({ date: -1 }).limit(100);
    return NextResponse.json({ success: true, data: expenses });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const expense = await Expense.create(body);
    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
