/**
 * Kajri POS – Electron Main Process
 * 
 * Strategy: Launch the Next.js server as a child process, then open
 * a BrowserWindow pointed at http://localhost:3000. This preserves
 * all Next.js API routes and server-side logic while running natively
 * as a Windows desktop application.
 */

const { app, BrowserWindow, ipcMain, Menu, shell, dialog, nativeTheme, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// ──────────────────────────────────────────────
// Single instance lock
//
// Without this, double-clicking the desktop icon twice (or launching again
// after forgetting a window is already open) starts a second process that
// tries to spawn its own Next.js server on the same port and open a second
// better-sqlite3 handle on the same database file, which can produce
// SQLITE_BUSY errors or a confusing "failed to start" dialog on the second
// launch while the first instance keeps running fine.
// ──────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────
const NEXT_PORT = 3000;
const NEXT_URL  = `http://localhost:${NEXT_PORT}`;
const IS_PROD   = app.isPackaged;
const IS_DEV    = !IS_PROD;

let mainWindow = null;
let nextProcess = null;
let isShuttingDown = false; // distinguishes an intentional kill from a real crash

// ──────────────────────────────────────────────
// Persistent file logging
//
// In production the app is launched by double-clicking a desktop shortcut —
// there is no attached console, so console.log/console.error previously
// went nowhere a user or support could ever see. This mirrors them to a
// log file in the per-user app-data folder.
// ──────────────────────────────────────────────
function setupFileLogging() {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'main.log');

    try {
      const stat = fs.statSync(logPath);
      if (stat.size > 5 * 1024 * 1024) {
        fs.renameSync(logPath, path.join(logDir, 'main.log.old'));
      }
    } catch {
      // no existing log file yet — fine
    }

    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    const origLog = console.log.bind(console);
    const origError = console.error.bind(console);
    const writeLine = (level, args) => {
      try {
        const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        stream.write(`[${new Date().toISOString()}] [${level}] ${line}\n`);
      } catch {
        // best effort — never let logging itself crash the app
      }
    };
    console.log = (...args) => { origLog(...args); writeLine('INFO', args); };
    console.error = (...args) => { origError(...args); writeLine('ERROR', args); };
    console.log(`[Kajri POS] Logging to ${logPath}`);
  } catch (err) {
    console.error('[Kajri POS] Failed to set up file logging:', err);
  }
}

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
// Local auth credentials
//
// The desktop build has no way for a shop owner to set environment
// variables, so a JWT signing secret and a login PIN are generated once
// on first launch and persisted in the per-user app-data folder. The PIN
// is shown to the owner a single time (on generation) via a dialog.
// ──────────────────────────────────────────────
function ensureLocalCredentials() {
  const credsPath = path.join(app.getPath('userData'), 'auth-credentials.json');

  // Distinguishes "no file at all" (genuine first run) from "file exists but
  // failed to read/parse" (corruption — e.g. a crash/power-loss mid-write on
  // a retail PC that's frequently power-cycled uncleanly). Silently treating
  // the latter as first-run used to mint a brand-new random PIN with no
  // warning, locking the owner out of their own POS if the one-time "new
  // PIN" dialog was missed.
  const fileExisted = fs.existsSync(credsPath);
  let creds = null;
  let corrupted = false;
  if (fileExisted) {
    try {
      creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (!creds || !creds.jwtSecret || !creds.adminPin) {
        corrupted = true;
        creds = null;
      }
    } catch {
      corrupted = true;
      creds = null;
    }
  }

  if (creds) {
    return creds;
  }

  if (corrupted) {
    const response = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Kajri POS — Credentials File Unreadable',
      message: `Kajri POS could not read its saved login credentials at:\n\n${credsPath}\n\nThis usually means the file was corrupted (e.g. by an unclean shutdown). Your existing PIN cannot be recovered.\n\nGenerate a brand-new login PIN now? (Choosing Cancel will quit the app so you can investigate the file yourself.)`,
      buttons: ['Generate New PIN', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) {
      app.quit();
      process.exit(0);
    }
  }

  creds = {
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    adminPin: String(crypto.randomInt(10000, 100000)),
  };

  try {
    fs.mkdirSync(path.dirname(credsPath), { recursive: true });
    // Write atomically (temp file + rename) so a crash mid-write can never
    // leave a truncated/corrupt credentials file behind — the exact failure
    // mode this whole distinction exists to guard against.
    const tmpPath = `${credsPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, credsPath);
  } catch (err) {
    console.error('[Kajri POS] Failed to persist auth credentials:', err);
  }

  dialog.showMessageBoxSync({
    type: 'info',
    title: 'Kajri POS — Login PIN Created',
    message: `A login PIN has been generated for this installation:\n\n${creds.adminPin}\n\nWrite this down — you'll need it every time you open Kajri POS. It is stored only on this computer, in ${credsPath}.`,
    buttons: ['OK'],
  });

  return creds;
}

// ──────────────────────────────────────────────
// Start Next.js server (production only)
// ──────────────────────────────────────────────
function startNextServer() {
  if (IS_DEV) {
    // In dev, Next.js dev server is started separately via `npm run dev`
    return Promise.resolve();
  }

  return new Promise((resolveOuter, rejectOuter) => {
    // Tracks whether this promise has already settled — the exit handler
    // below needs to know whether a crash happened DURING startup (in which
    // case it must reject so app.whenReady()'s .catch() shows the startup
    // error dialog) or AFTER (in which case rejecting a promise nobody is
    // still awaiting would do nothing, and it should show its own dialog
    // instead).
    let settled = false;
    const resolve = (...args) => { settled = true; resolveOuter(...args); };
    const reject = (...args) => { settled = true; rejectOuter(...args); };

    const appDir = IS_PROD
      ? path.join(process.resourcesPath, 'app')
      : path.join(__dirname, '..');

    const { jwtSecret, adminPin } = ensureLocalCredentials();

    // Start Next.js built server using Electron's embedded Node.js
    // --hostname 127.0.0.1 — without it, Next's production server binds to
    // 0.0.0.0 (every network interface), so anyone else on the same shop
    // LAN/Wi-Fi could reach this cashier's backend directly, not just this
    // window. There's no legitimate reason for another device to talk to it.
    nextProcess = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', NEXT_PORT, '--hostname', '127.0.0.1'], {
      cwd: appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON: 'true',
        PORT: String(NEXT_PORT),
        JWT_SECRET: jwtSecret,
        ADMIN_PIN: adminPin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
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

    // Handles the server dying both AFTER startup succeeded (the window was
    // showing its last-rendered page while every request silently failed,
    // with nothing telling the cashier the backend was gone) AND DURING
    // startup itself (previously fell through with no dialog and no reject
    // — e.g. a leftover process from a prior run left port 3000 bound,
    // `next start` exits almost instantly with EADDRINUSE before any
    // "Ready" output, and the whole app just silently vanished on launch).
    nextProcess.on('exit', (code, signal) => {
      const wasIntentional = isShuttingDown;
      nextProcess = null;
      if (wasIntentional) return;

      const message = `Next.js server exited unexpectedly (code=${code}, signal=${signal}).`;
      console.error(`[Kajri POS] ${message}`);

      if (!settled) {
        // Still inside startNextServer() — reject so app.whenReady()'s own
        // catch handler shows the startup-error dialog and quits, instead
        // of a second, redundant one from here.
        reject(new Error(message));
        return;
      }

      dialog.showErrorBox(
        'Kajri POS — Server Stopped',
        `The application server stopped unexpectedly and Kajri POS can no longer function.\n\nPlease close and reopen the app. If this keeps happening, contact support with the log file:\n${path.join(app.getPath('userData'), 'logs', 'main.log')}`
      );
      app.quit();
    });

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
// Auto-update
//
// Checks GitHub Releases (via the "publish" config in package.json, baked
// into the packaged app as app-update.yml at build time — nothing to
// configure here) once per launch. Downloads any newer version quietly in
// the background and only installs it the next time the app is closed and
// reopened, or when the cashier clicks the notification — never a surprise
// restart in the middle of a sale.
// ──────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdate] Error checking/downloading update:', err.message);
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdate] Update available: v${info.version} — downloading in the background.`);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdate] Already on the latest version.');
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdate] v${info.version} downloaded — will install on next restart.`);
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Kajri POS Update Ready',
        body: `Version ${info.version} has been downloaded. Restart Kajri POS to install it — or it'll install automatically next time you close the app.`,
      });
      notification.on('click', () => autoUpdater.quitAndInstall());
      notification.show();
    }
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdate] checkForUpdates failed:', err.message);
  });
}

// ──────────────────────────────────────────────
// Application lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
  setupFileLogging();

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
    // Only meaningful for a real packaged install — there's no published
    // build to compare against when running from source in dev mode.
    if (IS_PROD) setupAutoUpdater();
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
  isShuttingDown = true;
  if (!nextProcess || !nextProcess.pid) return;

  if (process.platform === 'win32') {
    // `shell: true` spawns node.exe as a grandchild of a cmd.exe wrapper.
    // A plain SIGTERM only reaches cmd.exe — it does not reliably kill the
    // grandchild node.exe (and its open better-sqlite3 / port 3000 handle),
    // which can leave an orphaned process blocking the next launch.
    // `/T` kills the whole process tree.
    try {
      spawn('taskkill', ['/pid', String(nextProcess.pid), '/T', '/F']);
    } catch (err) {
      console.error('[Kajri POS] taskkill failed, falling back to SIGKILL:', err);
      try { nextProcess.kill('SIGKILL'); } catch { /* already gone */ }
    }
  } else {
    nextProcess.kill('SIGTERM');
  }
  nextProcess = null;
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
  try {
    return await new Promise((resolve) => {
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
  } catch (err) {
    console.error('[Kajri POS] print-page failed:', err);
    return { success: false, error: err.message };
  }
});

// Export / save PDF
ipcMain.handle('save-pdf', async (_, { defaultName } = {}) => {
  if (!mainWindow) return { success: false, error: 'No window' };
  try {
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

    fs.writeFileSync(filePath, data);
    const openError = await shell.openPath(filePath); // resolves with '' on success, an error string on failure
    if (openError) console.error('[Kajri POS] Saved PDF but failed to open it:', openError);
    return { success: true, filePath };
  } catch (err) {
    console.error('[Kajri POS] save-pdf failed:', err);
    return { success: false, error: err.message };
  }
});

// Open a file/folder in the OS file explorer. Restricted to locations this
// app itself could plausibly have written to — the renderer is sandboxed
// and has no other route to the filesystem, but this bridge would
// otherwise happily open (and for executables, effectively run) any path
// it's handed.
ipcMain.handle('open-path', async (_, filePath) => {
  if (typeof filePath !== 'string' || !filePath) {
    return { success: false, error: 'Invalid path' };
  }

  const allowedRoots = [
    app.getPath('userData'),
    app.getPath('temp'),
    app.getPath('downloads'),
    app.getPath('documents'),
  ].map((p) => path.resolve(p) + path.sep);

  const resolved = path.resolve(filePath) + (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory() ? path.sep : '');
  const isAllowed = allowedRoots.some((root) => resolved.startsWith(root));
  if (!isAllowed) {
    console.error('[Kajri POS] Refused to open-path outside allowed directories:', filePath);
    return { success: false, error: 'Path not allowed' };
  }

  try {
    const openError = await shell.openPath(filePath);
    if (openError) return { success: false, error: openError };
    return { success: true };
  } catch (err) {
    console.error('[Kajri POS] open-path failed:', err);
    return { success: false, error: err.message };
  }
});
