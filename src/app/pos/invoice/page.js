'use client';
import { useEffect, useState, Suspense } from 'react';
import { Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

// Used only when Settings hasn't been fetched successfully yet — never the
// silent, permanent header every store printed regardless of what they'd
// actually configured.
const DEFAULT_SETTINGS = {
  storeName: 'Kajri Sarees',
  address: '123, Textile Market, Ring Road, Surat, Gujarat - 395002',
  gstin: '24AAAAA0000A1Z5',
  phone: '+91 9876543210',
  terms: '1. Goods once sold will not be taken back or exchanged.\n2. Subject to Surat jurisdiction only.',
};

function A4InvoiceContent() {
  const [invoice, setInvoice] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchInvoice = async () => {
      const id = searchParams.get('id');
      if (!id) {
        setError('No invoice ID provided.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/invoices/${id}`);
        const data = await res.json();
        if (data.success) {
          setInvoice(data.data);
        } else {
          setError(data.error || 'Invoice not found.');
        }
      } catch (err) {
        console.error(err);
        setError(err.message || 'Network error.');
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();

    // Tax invoices must show the store's ACTUAL configured details, not a
    // hardcoded placeholder — GSTIN in particular is a statutory-compliance
    // requirement, not cosmetic. Falls back to the defaults above only if
    // this fetch fails, rather than blocking printing on it.
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => { if (data.success && data.data) setSettings((prev) => ({ ...prev, ...data.data })); })
      .catch((err) => console.error('Failed to load store settings for invoice print:', err));
  }, [searchParams]);

  useEffect(() => {
    if (invoice && !loading) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [invoice, loading]);

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (error || !invoice) return <div className="p-10 text-center text-red-500">{error || 'Invoice not found.'}</div>;

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col items-center py-10 print:bg-white print:py-0">
      
      {/* Controls (Hidden in Print) */}
      <div className="mb-6 flex gap-4 print:hidden">
        <button onClick={() => window.print()} className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Printer className="w-4 h-4" /> Print A4 Invoice
        </button>
        <button onClick={() => window.history.back()} className="bg-white border border-gray-300 px-4 py-2 rounded-lg">
          Back
        </button>
      </div>

      {/* A4 Paper Wrapper */}
      <div className="bg-white w-[210mm] min-h-[297mm] p-[15mm] text-black border border-gray-200 shadow-lg print:w-full print:h-auto print:border-none print:shadow-none print:p-0">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
          <div>
            <h1 className="text-4xl font-bold font-serif uppercase tracking-widest text-gray-900 mb-2">{settings.storeName || DEFAULT_SETTINGS.storeName}</h1>
            <p className="text-sm text-gray-600 whitespace-pre-line">{settings.address || DEFAULT_SETTINGS.address}</p>
            <p className="text-sm text-gray-600 font-medium mt-1">GSTIN: {settings.gstin || DEFAULT_SETTINGS.gstin}</p>
            <p className="text-sm text-gray-600 mt-1">Phone: {settings.phone || DEFAULT_SETTINGS.phone}</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-300 uppercase tracking-widest mb-2">TAX INVOICE</h2>
            <div className="text-sm mt-4">
              <p><span className="font-semibold text-gray-700">Invoice No:</span> {invoice.invoiceNumber}</p>
              <p><span className="font-semibold text-gray-700">Date:</span> {new Date(invoice.createdAt).toLocaleDateString()}</p>
              <p><span className="font-semibold text-gray-700">Place of Supply:</span> Gujarat (24)</p>
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-800 uppercase border-b border-gray-300 pb-1 mb-2 inline-block">Billed To</h3>
          <p className="font-bold text-gray-900 text-lg">{invoice.customerId?.name || 'Walk-in Customer'}</p>
          <p className="text-gray-600 text-sm">{invoice.customerId?.address || ''}</p>
          <p className="text-gray-600 text-sm">Phone: {invoice.customerId?.mobile || ''}</p>
        </div>

        {/* Items Table */}
        <table className="w-full mb-8 border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100 text-sm text-gray-800">
              <th className="border border-gray-300 px-4 py-2 text-left w-12 text-center">#</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Item Description</th>
              <th className="border border-gray-300 px-4 py-2 text-center w-24">HSN</th>
              <th className="border border-gray-300 px-4 py-2 text-center w-20">Qty</th>
              <th className="border border-gray-300 px-4 py-2 text-right w-32">Rate (₹)</th>
              <th className="border border-gray-300 px-4 py-2 text-right w-32">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="text-sm">
                <td className="border border-gray-300 px-4 py-3 text-center">{idx + 1}</td>
                <td className="border border-gray-300 px-4 py-3 font-medium">{item.productId?.name || 'Unknown Item'}</td>
                <td className="border border-gray-300 px-4 py-3 text-center">-</td>
                <td className="border border-gray-300 px-4 py-3 text-center">{item.quantity}</td>
                <td className="border border-gray-300 px-4 py-3 text-right">{item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td className="border border-gray-300 px-4 py-3 text-right">{(item.price * item.quantity).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              </tr>
            ))}
            {/* Fill empty space if few items */}
            {Array.from({ length: Math.max(0, 10 - invoice.items.length) }).map((_, i) => (
              <tr key={`empty-${i}`} className="text-sm">
                <td className="border-l border-r border-gray-300 px-4 py-4 text-transparent">.</td>
                <td className="border-l border-r border-gray-300 px-4 py-4"></td>
                <td className="border-l border-r border-gray-300 px-4 py-4"></td>
                <td className="border-l border-r border-gray-300 px-4 py-4"></td>
                <td className="border-l border-r border-gray-300 px-4 py-4"></td>
                <td className="border-l border-r border-gray-300 px-4 py-4"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-12">
          <div className="w-1/2">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-2 text-right font-semibold text-gray-700 pr-6 border-b border-gray-200">Subtotal</td>
                  <td className="py-2 text-right font-medium border-b border-gray-200">₹{invoice.subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
                <tr>
                  <td className="py-2 text-right font-semibold text-gray-700 pr-6 border-b border-gray-200">Tax Total</td>
                  <td className="py-2 text-right font-medium border-b border-gray-200">₹{invoice.taxTotal?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}</td>
                </tr>
                <tr>
                  <td className="py-2 text-right font-semibold text-gray-700 pr-6 border-b border-gray-200">Discount</td>
                  <td className="py-2 text-right font-medium border-b border-gray-200">- ₹{invoice.discountTotal?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}</td>
                </tr>
                <tr className="bg-gray-100">
                  <td className="py-3 text-right font-bold text-gray-900 pr-6 text-lg">Grand Total</td>
                  <td className="py-3 text-right font-bold text-gray-900 text-lg">₹{invoice.grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end mt-auto pt-8 border-t border-gray-300">
          <div className="text-xs text-gray-600">
            <p className="font-bold mb-1">Terms & Conditions:</p>
            {(settings.terms || DEFAULT_SETTINGS.terms).split('\n').map((line, i) => <p key={i}>{line}</p>)}
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-8">For {settings.storeName || DEFAULT_SETTINGS.storeName}</p>
            <p className="text-sm font-bold text-gray-800 border-t border-gray-400 pt-2 w-48 mx-auto">Authorized Signatory</p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function A4InvoicePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <A4InvoiceContent />
    </Suspense>
  );
}
