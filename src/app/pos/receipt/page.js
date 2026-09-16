'use client';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function POSReceipt() {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const fetchInvoiceAndSettings = async () => {
      const id = searchParams.get('id');
      const isOffline = searchParams.get('offline') === '1';

      // Bills completed while offline have no server _id yet to fetch by —
      // the POS page stashes the full invoice (with items already enriched
      // with product names) in sessionStorage before opening this tab, so a
      // receipt still gets printed at time of sale instead of never at all.
      if (isOffline) {
        try {
          const raw = sessionStorage.getItem('kajri_offline_receipt');
          if (raw) setInvoice(JSON.parse(raw));
        } catch (err) {
          console.error('[Receipt] Failed to read offline invoice data:', err);
        }
        // Settings are a nice-to-have (autoPrint config) — don't block the
        // receipt on this fetch, which may itself fail while genuinely offline.
        try {
          const setRes = await fetch('/api/settings');
          const setData = await setRes.json();
          if (setData.success) setSettings(setData.data);
        } catch { /* render with defaults */ }
        setLoading(false);
        return;
      }

      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const [invRes, setRes] = await Promise.all([
          fetch(`/api/invoices/${id}`),
          fetch(`/api/settings`)
        ]);
        const invData = await invRes.json();
        const setData = await setRes.json();

        if (invData.success) setInvoice(invData.data);
        if (setData.success) setSettings(setData.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoiceAndSettings();
  }, [searchParams]);

  useEffect(() => {
    if (invoice && !loading) {
      const timer = setTimeout(async () => {
        // If Electron is available and autoPrint is true with a selected printer
        if (typeof window !== 'undefined' && window.kajriElectron && settings?.autoPrint && settings?.printerName) {
          try {
            await window.kajriElectron.printPage({
              silent: true,
              deviceName: settings.printerName
            });
            console.log(`Silently printed to ${settings.printerName}`);
          } catch (err) {
            console.error("Silent print failed:", err);
            window.print(); // fallback
          }
        } else {
          // Standard browser print dialog
          window.print();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [invoice, loading, settings]);

  if (loading) return <div className="p-10 text-center">Loading receipt...</div>;
  if (!invoice) return <div className="p-10 text-center text-red-500">Invoice not found or no ID provided.</div>;

  const totalQty = invoice.items.reduce((sum, item) => sum + item.quantity, 0);
  const amountPaid = invoice.amountPaid || invoice.grandTotal;
  const balance = invoice.grandTotal - amountPaid;

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col items-center py-10 print:bg-white print:min-h-0 print:py-0">
      
      {/* Printer specific CSS for EPSON TM-T82X (80mm) */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            margin: 0;
            size: 80mm auto; /* Standard 80mm roll width, dynamic height */
          }
          body {
            margin: 0;
            padding: 0;
          }
          /* Hide all browser headers/footers */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />

      {/* Controls (Hidden in Print) */}
      <div className="mb-6 flex gap-4 print:hidden">
        <button onClick={() => window.print()} className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Printer className="w-4 h-4" /> Print Receipt
        </button>
        <button onClick={() => window.history.back()} className="bg-white border border-gray-300 px-4 py-2 rounded-lg">
          Back to POS
        </button>
      </div>

      {/* Receipt Paper Wrapper - 80mm width (approx 302px) */}
      <div className="bg-white w-[302px] p-4 text-black text-[11px] font-mono leading-tight shadow-sm print:w-full print:max-w-[80mm] print:border-none print:shadow-none print:p-2 print:pb-10">
        
        {/* Logo */}
        <div className="text-center mb-2">
          <h1 
            className="text-6xl font-bold tracking-tighter" 
            style={{ fontFamily: "'Brush Script MT', 'Bickham Script Pro', cursive, serif", letterSpacing: "-4px" }}
          >
            KS
          </h1>
        </div>

        {/* Header Information */}
        <div className="text-center mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-1">KAJRI SAREES</h2>
          <p>SR .NO 167, SANTA NAGAR ,NEAR SHUBHAM MANGAL KAR</p>
          <p>YALAY, WAGHOLI- LOHGAON ROAD PUNE</p>
          <p>State: 27-Maharashtra</p>
          <p>Ph.No.: 9920176603</p>
          <p>Email: kajrisarees99@gmail.com</p>
          <p>GSTIN: 27DKXPR8703P1ZU</p>
        </div>

        <div className="border-t border-dashed border-gray-500 my-1"></div>
        
        {/* Invoice Info */}
        <div className="text-center my-1 font-semibold">
          <p>Tax Invoice</p>
        </div>
        <div className="flex justify-between items-end my-1">
          <div>Invoice No.: {invoice.invoiceNumber || '---'}</div>
          <div>Date: {new Date(invoice.createdAt).toLocaleDateString('en-GB')}</div>
        </div>
        
        <div className="border-t border-dashed border-gray-500 my-1"></div>

        {/* Table Header */}
        <div className="mb-1">
          <div className="flex">
            <span className="w-6">#</span>
            <span>Item Name</span>
          </div>
          <div className="flex justify-between pl-6 mt-1">
            <span className="w-12 text-left">Qty</span>
            <span className="w-16 text-right">Price</span>
            <span className="w-20 text-right">Amount</span>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-500 my-1"></div>

        {/* Items */}
        <div className="mb-1">
          {invoice.items.map((item, idx) => (
            <div key={idx} className="mb-2">
              <div className="flex">
                <span className="w-6">{idx + 1}</span>
                <span className="flex-1 truncate">{item.productId?.name || item.name || 'Unknown Item'}</span>
              </div>
              <div className="flex justify-between pl-6 mt-0.5">
                <span className="w-12 text-left">{item.quantity}</span>
                <span className="w-16 text-right">{(item.price).toFixed(2)}</span>
                <span className="w-20 text-right">{(item.total).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-500 my-1"></div>

        {/* Footer / Totals */}
        <div className="flex justify-between mt-1 items-start">
          <div className="w-1/3">
            <span>Qty: {totalQty}</span>
          </div>
          <div className="w-2/3 flex flex-col items-end">
            <div className="flex justify-between w-full mb-0.5">
              <span>Total</span>
              <span>:</span>
              <span className="w-20 text-right">{(invoice.grandTotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between w-full mb-0.5">
              <span>Received</span>
              <span>:</span>
              <span className="w-20 text-right">{(amountPaid).toFixed(2)}</span>
            </div>
            <div className="flex justify-between w-full">
              <span>Balance</span>
              <span>:</span>
              <span className="w-20 text-right">{(balance > 0 ? balance : 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-500 my-1"></div>

        {/* Terms */}
        <div className="text-center mt-2">
          <p className="font-semibold">Terms &amp; Conditions</p>
          <p>Thanks for doing business with us!</p>
        </div>

      </div>
    </div>
  );
}

export default function POSReceiptPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <POSReceipt />
    </Suspense>
  );
}
