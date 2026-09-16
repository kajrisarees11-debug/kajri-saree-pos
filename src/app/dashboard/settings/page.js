'use client';
import { useState, useEffect } from 'react';
import { Save, Download } from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [systemPrinters, setSystemPrinters] = useState([]);
  // Real settings haven't loaded yet — the form is still just showing
  // hardcoded placeholders. Saving now would overwrite whatever the real,
  // already-saved settings are with those placeholders, so Save stays
  // disabled (and a banner shown) until a load actually succeeds.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [formData, setFormData] = useState({
    storeName: 'Kajri Sarees',
    phone: '',
    address: '',
    email: '',
    gstin: '24AAAAA0000A1Z5',
    invoicePrefix: 'INV-',
    defaultTaxRate: 5,
    terms: '1. Goods once sold will not be taken back or exchanged.\n2. Subject to Surat jurisdiction only.',
    pageSize: '80mm',
    printerName: '',
    autoPrint: false
  });

  const fetchSettings = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setFormData(prev => ({ ...prev, ...data.data }));
        setSettingsLoaded(true);
      } else {
        setLoadError(data.error || 'Server returned an unsuccessful response.');
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
      setLoadError(err.message || 'Network error.');
    }
  };

  useEffect(() => {
    // Fetch installed printers if in Electron environment
    const loadPrinters = async () => {
      if (typeof window !== 'undefined' && window.kajriElectron?.getPrinters) {
        try {
          const printers = await window.kajriElectron.getPrinters();
          setSystemPrinters(printers);
        } catch (err) {
          console.error("Failed to load printers:", err);
        }
      }
    };
    loadPrinters();

    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!settingsLoaded) {
      alert("Can't save yet — your current settings haven't finished loading, so saving now would overwrite them with blank placeholders. Click Retry and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        alert('Settings saved successfully!');
      } else {
        alert('Failed to save settings: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error saving settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Configure your store details, taxes, and print settings.</p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !settingsLoaded}
          title={!settingsLoaded ? "Waiting for current settings to load before this can save safely" : undefined}
          className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg hover:bg-primary-light transition-colors disabled:opacity-70"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {loadError && (
        <div className="mb-6 flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <span>Couldn&apos;t load your current settings ({loadError}) — editing and saving is disabled until this succeeds, to avoid overwriting your real settings with blank placeholders.</span>
          <button type="button" onClick={fetchSettings} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        
        {/* Store Details */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Store Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
              <input required type="text" value={formData.storeName || ''} onChange={e => setFormData({...formData, storeName: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
              <input type="text" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none" placeholder="22AAAAA0000A1Z5" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Address</label>
              <textarea rows="3" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none" />
            </div>
          </div>
        </div>

        {/* Invoicing & Tax */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Invoicing & Tax Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Prefix</label>
              <input type="text" value={formData.invoicePrefix} onChange={e => setFormData({...formData, invoicePrefix: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none" placeholder="e.g., INV-" />
            </div>
            
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
              <textarea rows="4" value={formData.terms} onChange={e => setFormData({...formData, terms: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"></textarea>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default GST Rate (%)</label>
                <select value={formData.defaultTaxRate} onChange={e => setFormData({...formData, defaultTaxRate: Number(e.target.value)})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white">
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
            </div>
        </div>

        {/* Printer & Backup Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Hardware & System Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Printing configuration */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default POS Receipt Size</label>
                <select value={formData.pageSize} onChange={e => setFormData({...formData, pageSize: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white">
                  <option value="80mm">Thermal 80mm (Standard POS)</option>
                  <option value="58mm">Thermal 58mm (Small POS)</option>
                  <option value="A4">A4 Size (Laser/Inkjet)</option>
                </select>
              </div>
              
              {systemPrinters.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thermal Printer</label>
                  <select value={formData.printerName || ''} onChange={e => setFormData({...formData, printerName: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white">
                    <option value="">-- Select Installed Printer --</option>
                    {systemPrinters.map(p => (
                      <option key={p.name} value={p.name}>{p.name} {p.isDefault ? '(Default)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <input 
                  type="checkbox" 
                  id="autoPrint"
                  checked={formData.autoPrint || false}
                  onChange={e => setFormData({...formData, autoPrint: e.target.checked})}
                  className="w-5 h-5 text-primary rounded focus:ring-primary accent-primary cursor-pointer"
                />
                <label htmlFor="autoPrint" className="text-sm font-medium text-gray-800 cursor-pointer flex-1">
                  Enable Auto / Silent Printing
                  <span className="block text-xs text-gray-500 font-normal mt-0.5">Prints receipts directly to the Thermal Printer without showing a popup dialog.</span>
                </label>
              </div>
            </div>

            {/* Backup configuration */}
            <div className="flex flex-col border-l border-gray-200 pl-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Management</label>
              <a href="/api/backup" download className="flex items-center justify-center gap-2 bg-gray-800 text-white px-4 py-2.5 rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium">
                <Download className="w-4 h-4" /> Download Database Backup
              </a>
              <p className="text-xs text-gray-500 mt-2">Export a complete JSON snapshot of all products, customers, and invoices.</p>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}
