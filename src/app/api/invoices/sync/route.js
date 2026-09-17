import { NextResponse } from 'next/server';
import { invoices } from '@/lib/dataAdapter';

/**
 * POST /api/invoices/sync
 *
 * Accepts an array of offline invoices collected from IndexedDB (queued by a
 * browser client that lost connectivity, or the desktop app) and reconciles
 * them against whichever backend is active — MongoDB on Vercel, SQLite on
 * desktop — updating stock and customer balances along the way.
 *
 * Delegates to invoices.createWithEffects() per invoice — the exact same
 * atomic create+stock+ledger path the online checkout uses — instead of
 * re-implementing those effects here. That's what gives an offline sync the
 * same stock-floor guarantee (reject an oversell instead of driving stock
 * negative) and server-side price/total validation as the online path,
 * rather than a separate, weaker copy of the same logic.
 */
function isUniqueConstraintError(err) {
  return err.code === 11000 || err.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export async function POST(request) {
  try {
    const { invoices: offlineInvoices } = await request.json();

    if (!Array.isArray(offlineInvoices) || offlineInvoices.length === 0) {
      return NextResponse.json({ success: false, error: 'No invoices to sync' }, { status: 400 });
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const offlineInvoice of offlineInvoices) {
      try {
        // createWithEffects() itself already treats a repeat call with the
        // same idempotencyKey as "already applied" (isNew: false) rather
        // than reapplying stock/balance effects a second time — exactly the
        // dedupe this endpoint needs for a retried sync batch.
        await invoices.createWithEffects(offlineInvoice);
        synced++;
      } catch (err) {
        // A legacy queued invoice with no idempotencyKey (from before that
        // feature existed) can still collide on the invoiceNumber's own
        // unique constraint on a retried sync — that collision means it was
        // already synced, not a real failure.
        if (isUniqueConstraintError(err)) {
          synced++;
          continue;
        }
        console.error('[Sync] Failed to sync invoice:', offlineInvoice.invoiceNumber, err.message);
        errors.push({ invoiceNumber: offlineInvoice.invoiceNumber, error: err.message });
        failed++;
      }
    }

    return NextResponse.json({ success: true, synced, failed, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Bulk Sync API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
