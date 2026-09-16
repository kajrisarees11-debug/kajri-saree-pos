import { NextResponse } from 'next/server';
import { bankAccounts } from '@/lib/dataAdapter';

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await bankAccounts.delete(id);
    return NextResponse.json({ success: true, message: 'Bank account deleted' });
  } catch (error) {
    console.error('API Error [bank/accounts/:id DELETE]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
