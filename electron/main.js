/**
 * Kajri POS – Electron Main Process
 * 
 * Strategy: Launch the Next.js server as a child process, then open
 * a BrowserWindow pointed at http://localhost:3000. This preserves
 * all Next.js API routes and server-side logic while running natively
 * as a Windows desktop application.
 */

const { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const NEXT_PORT = 3000;
const NEXT_URL  = `http://localhost:${NEXT_PORT}`;
const IS_DEV    = process.env.NODE_ENV !== 'production';
const IS_PROD   = !IS_DEV;

let mainWindow = null;
let nextProcess = null;

// ──────────────────────────────────────────────
// Poll until Next.js is ready
// ──────────────────────────────────────────────
function waitForNextServer(url, retries = 60, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        reject(new Error(`Next.js server did not start at ${url} after ${retries} attempts`));
      } else {
        setTimeout(check, interval);
      }
    };
    check();
  });
}

// ──────────────────────────────────────────────
// Start Next.js server (production only)
// ──────────────────────────────────────────────
function startNextServer() {
  if (IS_DEV) {
    // In dev, Next.js dev server is started separately via `npm run dev`
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const appDir = IS_PROD
      ? path.join(process.resourcesPath, 'app')
      : path.join(__dirname, '..');

    // Start `node server.js` (Next.js built server)
    nextProcess = spawn('node', ['node_modules/.bin/next', 'start', '--port', NEXT_PORT], {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON: 'true',
        PORT: String(NEXT_PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    });

    nextProcess.stdout?.on('data', (data) => {
      const msg = data.toString();
      console.log('[Next]', msg.trim());
      // Next.js signals readiness with "Ready" or "started server"
      if (msg.includes('Ready') || msg.includes('started server')) {
        resolve();
      }
    });

    nextProcess.stderr?.on('data', (data) => {
      console.error('[Next ERR]', data.toString().trim());
    });

    nextProcess.on('error', reject);

    // Fallback: poll HTTP
    waitForNextServer(NEXT_URL).then(resolve).catch(reject);
  });
}

// ──────────────────────────────────────────────
// Create the main BrowserWindow
// ──────────────────────────────────────────────
function createWindow() {
  // Force light mode (POS applications should never go dark unexpectedly)
  nativeTheme.themeSource = 'light';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Kajri POS',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.jpg'),
    backgroundColor: '#f8fafc',
    show: false, // show after ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Remove default menu bar in production
  if (IS_PROD) {
    Menu.setApplicationMenu(null);
  } else {
    // Keep devtools accessible in dev
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Show window gracefully when content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in OS browser, not Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(NEXT_URL);
}

// ──────────────────────────────────────────────
// Application lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
  // Show a simple splash while Next.js boots (production only)
  if (IS_PROD) {
    await showSplash();
  }

  try {
    await startNextServer();
    // Extra wait for full readiness in prod
    if (IS_PROD) await waitForNextServer(NEXT_URL);
    closeSplash();
    createWindow();
  } catch (err) {
    closeSplash();
    dialog.showErrorBox(
      'Kajri POS – Startup Error',
      `Failed to start the application server.\n\n${err.message}\n\nPlease reinstall Kajri POS.`
    );
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});

function cleanup() {
  if (nextProcess) {
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }
}

process.on('exit', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// ──────────────────────────────────────────────
// Splash window (production)
// ──────────────────────────────────────────────
let splashWindow = null;

async function showSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#800000',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.jpg'),
    webPreferences: { contextIsolation: true },
  });

  const splashHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: linear-gradient(135deg, #800000 0%, #4a0000 100%);
          color: #fff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          user-select: none;
        }
        .logo { font-size: 56px; font-weight: 900; letter-spacing: -2px; color: #d4af37; text-shadow: 0 2px 16px rgba(0,0,0,0.4); }
        .sub  { font-size: 15px; color: rgba(255,255,255,0.7); margin-top: 6px; letter-spacing: 4px; text-transform: uppercase; }
        .bar  { width: 160px; height: 3px; background: rgba(255,255,255,0.15); border-radius: 2px; margin-top: 40px; overflow: hidden; }
        .fill { height: 100%; width: 0%; background: #d4af37; border-radius: 2px; animation: load 2.5s ease forwards; }
        .status { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 14px; }
        @keyframes load { 0%{width:0%} 60%{width:75%} 90%{width:92%} 100%{width:100%} }
      </style>
    </head>
    <body>
      <div class="logo">Kajri</div>
      <div class="sub">Point of Sale</div>
      <div class="bar"><div class="fill"></div></div>
      <div class="status">Starting application…</div>
    </body>
    </html>
  `;

  await splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);
  splashWindow.show();
}

function closeSplash() {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ──────────────────────────────────────────────
// IPC Handlers
// ──────────────────────────────────────────────

// Allow renderer to detect that it's running inside Electron
ipcMain.handle('get-app-info', () => ({
  isElectron: true,
  version: app.getVersion(),
  platform: process.platform,
}));

// Get list of available system printers
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers;
  } catch (error) {
    console.error('Failed to get printers:', error);
    return [];
  }
});

// Print the current page
ipcMain.handle('print-page', async (_, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No window' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent ?? false,
        printBackground: true,
        margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
        ...options,
      },
      (success, reason) => resolve({ success, reason })
    );
  });
});

// Export / save PDF
ipcMain.handle('save-pdf', async (_, { defaultName }) => {
  if (!mainWindow) return { success: false };
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Invoice as PDF',
    defaultPath: defaultName || 'invoice.pdf',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });

  if (!filePath) return { success: false, cancelled: true };

  const data = await mainWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  });

  require('fs').writeFileSync(filePath, data);
  shell.openPath(filePath); // Open PDF after saving
  return { success: true, filePath };
});

// Open file/folder in OS explorer
ipcMain.handle('open-path', async (_, filePath) => {
  await shell.openPath(filePath);
  return { success: true };
});
