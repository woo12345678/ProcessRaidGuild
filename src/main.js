const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const si = require('systeminformation');
const { buildRaidState } = require('./processModel');
const { planInteraction } = require('./interactionModel');
const { createCoalescedCollector } = require('./telemetryCollector');
const { guardIpcHandler, installNavigationGuards } = require('./securityPolicy');

const rendererPath = path.join(__dirname, 'renderer', 'index.html');
const trustedRendererUrl = pathToFileURL(rendererPath).href;

let mainWindow;
let pollingTimer;

async function readRaidState() {
  try {
    const [load, memory, processData, graphics, os] = await Promise.all([
      si.currentLoad(), si.mem(), si.processes(), si.graphics(), si.osInfo(),
    ]);
    const controller = graphics.controllers && graphics.controllers[0];
    const raidState = buildRaidState(processData.list, {
      cpuLoad: load.currentLoad,
      memoryUsed: memory.active / 1024 ** 3,
      memoryTotal: memory.total / 1024 ** 3,
      gpuLoad: controller?.utilizationGpu,
      gpuTemp: controller?.temperatureGpu,
      timestamp: Date.now(),
      hostname: os.hostname,
      platform: `${os.distro || os.platform} ${os.release || ''}`.trim(),
    });
    raidState.interaction = planInteraction(raidState.hunters, Math.floor(Date.now() / 7000));
    return raidState;
  } catch (error) {
    return { error: '실시간 시스템 정보를 읽지 못했습니다.', detail: error.message, timestamp: Date.now() };
  }
}

const collectRaidState = createCoalescedCollector(readRaidState);

async function publishState() {
  const state = await collectRaidState();
  if (state && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('raid-state', state);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#15120e',
    title: 'Process Raid Guild',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  installNavigationGuards(mainWindow.webContents, trustedRendererUrl);
  mainWindow.loadFile(rendererPath);
  mainWindow.webContents.on('did-finish-load', publishState);
  pollingTimer = setInterval(publishState, 2500);
}

ipcMain.handle('refresh-now', guardIpcHandler(trustedRendererUrl, collectRaidState));
ipcMain.handle('app-version', guardIpcHandler(trustedRendererUrl, () => app.getVersion()));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  clearInterval(pollingTimer);
  if (process.platform !== 'darwin') app.quit();
});
