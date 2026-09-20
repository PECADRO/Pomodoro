const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let saveQueue = Promise.resolve();
let forceClose = false;
let closeFallbackTimer;

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'focusflow-state.json');
}

async function loadStateFromDisk() {
  try {
    const raw = await fs.readFile(getStateFilePath(), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function saveStateToDisk(state) {
  const writeState = async () => {
    await fs.mkdir(path.dirname(getStateFilePath()), { recursive: true });
    const stateFile = getStateFilePath();
    const temporaryFile = `${stateFile}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.rm(stateFile, { force: true });
    await fs.rename(temporaryFile, stateFile);
    return true;
  };

  saveQueue = saveQueue.then(writeState, writeState);
  return saveQueue;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false, // Frameless modern window
    transparent: true,
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    win.loadURL('http://localhost:5173');
  }

  win.on('close', (event) => {
    if (forceClose || win.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send('focusflow:before-close');
    if (!closeFallbackTimer) {
      closeFallbackTimer = setTimeout(() => {
        if (!win.isDestroyed()) {
          forceClose = true;
          win.close();
        }
      }, 2000);
    }
  });
}

ipcMain.handle('focusflow:load-state', async () => {
  return loadStateFromDisk();
});

ipcMain.handle('focusflow:save-state', async (_event, state) => {
  try {
    return await saveStateToDisk(state);
  } catch (error) {
    console.error('FocusFlow state could not be saved:', error);
    return false;
  }
});

ipcMain.handle('focusflow:save-and-close', async (event, state) => {
  try {
    await saveStateToDisk(state);
  } catch (error) {
    console.error('Final FocusFlow state could not be saved:', error);
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (closeFallbackTimer) clearTimeout(closeFallbackTimer);
    forceClose = true;
    win.close();
  }
  return true;
});

ipcMain.handle('focusflow:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('focusflow:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

