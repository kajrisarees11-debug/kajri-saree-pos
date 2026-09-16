/**
 * Kajri POS – Electron Preload Script
 *
 * Exposes a safe, curated bridge (window.kajriElectron) from the
 * renderer process (Next.js app) to the Electron main process.
 * All access is via contextBridge — Node.js APIs are NOT exposed directly.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kajriElectron', {
  /** Returns { isElectron: true, version, platform } */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  /** Get list of installed system printers */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  /** Trigger native print dialog for current page */
  printPage: (options) => ipcRenderer.invoke('print-page', options),

  /** Save current page as PDF, returns { success, filePath } */
  savePDF: (opts) => ipcRenderer.invoke('save-pdf', opts),

  /** Open a file or folder in OS Explorer */
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
});

// Expose a simple flag so React code can detect Electron without IPC
contextBridge.exposeInMainWorld('__KAJRI_ELECTRON__', true);
