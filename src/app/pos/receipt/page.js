'use client';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { Printer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function POSReceipt() {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchInvoice = async () => {
      const id = searchParams.get('id');
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/invoices/${id}`);
        const data = await res.json();
        if (data.success) {
          setInvoice(data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [searchParams]);

  useEffect(() => {
    if (invoice && !loading) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [invoice, loading]);

  if (loading) return <div className="p-10 text-center">Loading receipt...</div>;
  if (!invoice) return <div className="p-10 text-center text-red-500">Invoice not found or no ID provided.</div>;

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col items-center py-10 print:bg-white print:py-0">
      
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
      <div className="bg-white w-[302px] p-4 text-black text-xs font-mono border border-gray-200 shadow-sm print:w-full print:border-none print:shadow-none print:p-0">
        
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold font-serif mb-1 uppercase tracking-wider">KAJRI SAREES</h1>
          <p>123, Textile Market</p>
          <p>Surat, Gujarat - 395002</p>
          <p>Phone: +91 9876543210</p>
          <p>GSTIN: 24AAAAA0000A1Z5</p>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2"></div>
        
        <div className="flex justify-between my-2">
          <div>
            <p>Date: {new Date(invoice.createdAt).toLocaleDateString()}</p>
            <p>Time: {new Date(invoice.createdAt).toLocaleTimeString()}</p>
          </div>
          <div className="text-right">
            <p>Inv: {invoice.invoiceNumber}</p>
            <p>User: {invoice.user?.name || 'Admin'}</p>
          </div>
        </div>
        
        <div className="border-t border-dashed border-gray-400 my-2"></div>

        {/* Items */}
        <div className="mb-2">
          {invoice.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start mb-2">
              <div className="w-1/2 break-words pr-2">
                <span className="font-semibold block">{item.productId?.name || 'Unknown Item'}</span>
                <span className="text-gray-500">{item.quantity} x {item.price}</span>
              </div>
              <div className="w-1/4 text-right pr-2">
                {item.tax > 0 && <span className="text-gray-500 text-[10px]">Tax {item.tax}%</span>}
              </div>
              <div className="w-1/4 text-right font-semibold">
                {(item.total).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2"></div>

        {/* Totals */}
        <div className="flex justify-between font-semibold mb-1">
          <span>Subtotal</span>
          <span>₹{invoice.subTotal.toFixed(2)}</span>
        </div>
        {invoice.taxTotal > 0 && (
          <div className="flex justify-between text-gray-700 mb-1">
            <span>Tax (GST)</span>
            <span>₹{invoice.taxTotal.toFixed(2)}</span>
          </div>
        )}
        {invoice.discountTotal > 0 && (
          <div className="flex justify-between text-gray-700 mb-1">
            <span>Discount</span>
            <span>-₹{invoice.discountTotal.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t border-gray-400">
          <span>Total</span>
          <span>₹{invoice.grandTotal.toFixed(2)}</span>
        </div>
        {invoice.amountPaid < invoice.grandTotal && (
          <div className="flex justify-between font-semibold text-red-600 mt-2">
            <span>Due Balance</span>
            <span>₹{(invoice.grandTotal - invoice.amountPaid).toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-dashed border-gray-400 my-2"></div>

        <div className="text-center mt-4">
          <p>Thank you for shopping with us!</p>
          <p className="mt-1 font-bold">Visit Again</p>
        </div>

        {/* Barcode representation of Invoice */}
        <div className="mt-4 flex flex-col items-center justify-center">
          <div className="w-3/4 h-8 bg-gray-800 flex justify-between px-1 items-center overflow-hidden opacity-80">
            {/* Mock visual barcode */}
            {Array(30).fill(0).map((_, i) => (
              <div key={i} className={`h-full bg-white ${i % 2 === 0 ? 'w-1' : 'w-0.5'}`}></div>
            ))}
          </div>
          <span className="text-[10px] tracking-widest mt-1">{invoice.invoiceNumber}</span>
        </div>

      </div>
    </div>
  );
}

export default function POSReceiptPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <POSReceipt />
    </Suspense>
  );
}
