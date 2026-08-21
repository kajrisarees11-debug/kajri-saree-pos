'use client';
import { useState } from 'react';
import { Upload, FileText, AlertTriangle } from 'lucide-react';

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        alert(data.message);
        setFile(null);
      } else {
        alert(`Import failed: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during import.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vyapar Data Migration</h1>
        <p className="text-gray-500 text-sm mt-1">Import your existing products, customers, and inventory from Vyapar CSV export.</p>
      </div>

      <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center bg-gray-50 mb-6">
          <Upload className="w-12 h-12 text-primary mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Upload Vyapar Export File</h3>
          <p className="text-gray-500 text-sm mb-6 text-center max-w-sm">
            Supported formats: .csv, .xlsx. Ensure you are uploading the standard Vyapar &quot;Item Report&quot; or &quot;Party Report&quot;.
          </p>
          <input 
            type="file" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files[0])}
            className="hidden" 
            id="file-upload"
          />
          <label htmlFor="file-upload" className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium cursor-pointer hover:bg-gray-50 transition-colors">
            Select File
          </label>
          
          {file && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800 text-sm w-full max-w-md">
              <span className="font-medium truncate flex-1">{file.name}</span>
            </div>
          )}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 text-sm text-yellow-800 mb-6">
          <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-600" />
          <div>
            <strong className="block mb-1">Important Migration Rules:</strong>
            <ul className="list-disc pl-4 space-y-1">
              <li>If a barcode is missing, the system will automatically generate a new one.</li>
              <li>Products matching an existing SKU will have their stock updated instead of duplicated.</li>
              <li>Retail customers will be saved separately from online e-commerce users.</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            disabled={!file || loading}
            onClick={handleImport}
            className="bg-primary text-white px-8 py-3 rounded-lg font-bold hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Importing...' : 'Start Migration'}
          </button>
        </div>
      </div>
    </div>
  );
}
