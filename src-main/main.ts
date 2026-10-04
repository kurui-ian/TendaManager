import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { authenticationService } from './services/authenticationService';
import { routerService } from './services/routerService';
import { deviceService } from './services/deviceService';
import { wifiService } from './services/wifiService';
import { speedTestService } from './services/speedTestService';
import { diagnosticService } from './services/diagnosticService';
import { appStorage } from './storage/appStorage';
import { credentialStore } from './storage/credentialStore';
import { tendaSimulator } from './router/simulatorServer';
import { TrayManager } from './tray/trayManager';
import { logger } from './logger/logger';
import { AppSettings, AuthCredentials, BandwidthRule, WifiRelayMode, WifiSettings } from './router/types';

let mainWindow: BrowserWindow | null = null;
let trayManager: TrayManager | null = null;
let isQuitting = false;

function createMainWindow(): BrowserWindow {
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');

  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    title: 'TendaManager',
    backgroundColor: '#0f1116',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  win.on('close', (event) => {
    const settings = appStorage.getSettings();
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      win.hide();
      trayManager?.notify(
        'TendaManager is still running',
        'Minimized to the Windows system tray. Right-click the tray icon to exit.'
      );
    }
  });

  return win;
}

function registerIpcHandlers(): void {
  // Discovery & Auth
  ipcMain.handle('router:discover', async (_evt, customAddress?: string) => {
    return authenticationService.discoverRouter(customAddress);
  });

  ipcMain.handle('router:set-simulator', async (_evt, enabled: boolean) => {
    return authenticationService.setSimulatorMode(enabled);
  });

  ipcMain.handle('auth:login', async (_evt, credentials: AuthCredentials) => {
    const res = await authenticationService.login(credentials);
    if (res.success && res.session) {
      trayManager?.rebuildMenu(true, res.session.routerAddress);
    }
    return res;
  });

  ipcMain.handle('auth:auto-login', async (_evt, routerAddress?: string) => {
    const res = await authenticationService.tryAutoLogin(routerAddress);
    if (res.success && res.session) {
      trayManager?.rebuildMenu(true, res.session.routerAddress);
    }
    return res;
  });

  ipcMain.handle('auth:logout', async (_evt, clearSavedCredentials?: boolean) => {
    await authenticationService.logout(clearSavedCredentials);
    trayManager?.rebuildMenu(false);
    return { success: true };
  });

  ipcMain.handle('auth:get-session', async () => {
    return authenticationService.getSession();
  });

  ipcMain.handle('auth:has-saved', async (_evt, routerAddress: string) => {
    return credentialStore.hasSavedCredentials(routerAddress);
  });

  // Router & Network Status
  ipcMain.handle('router:get-info', async () => {
    return routerService.getRouterInfo();
  });

  ipcMain.handle('router:get-network-status', async () => {
    return routerService.getNetworkStatus();
  });

  ipcMain.handle('router:restart', async () => {
    return routerService.restartRouter();
  });

  ipcMain.handle('router:open-web-ui', async (_evt, routerAddress?: string) => {
    const session = authenticationService.getSession();
    const target = routerAddress || session?.routerAddress || appStorage.getSettings().lastRouterAddress || '192.168.0.1';
    const url = target.startsWith('http') ? target : `http://${target}`;
    await shell.openExternal(url);
    return { opened: url };
  });

  // Connected Devices, Blocking & Bandwidth Control
  ipcMain.handle('devices:get-all', async () => {
    const res = await deviceService.getAllDevices();
    if (res.newlyConnected.length > 0) {
      for (const dev of res.newlyConnected) {
        const label = dev.customName || dev.hostname || dev.macAddress;
        trayManager?.notify('New Device Connected', `${label} (${dev.ipAddress}) joined the router network.`);
      }
    }
    return res.devices;
  });

  ipcMain.handle('devices:rename', async (_evt, macAddress: string, customName: string) => {
    deviceService.renameDevice(macAddress, customName);
    return { success: true };
  });

  ipcMain.handle('devices:block', async (_evt, macAddress: string, hostname?: string) => {
    return deviceService.blockDevice(macAddress, hostname);
  });

  ipcMain.handle('devices:unblock', async (_evt, macAddress: string) => {
    return deviceService.unblockDevice(macAddress);
  });

  ipcMain.handle('devices:set-bandwidth', async (_evt, rule: BandwidthRule) => {
    return deviceService.setBandwidthRule(rule);
  });

  // Wi-Fi Management & Wireless Repeating (Universal Repeater / WISP / AP)
  ipcMain.handle('wifi:get-settings', async () => {
    return wifiService.getWifiSettings();
  });

  ipcMain.handle('wifi:update-settings', async (_evt, settings: WifiSettings) => {
    return wifiService.updateWifiSettings(settings);
  });

  ipcMain.handle('wifi:get-relay', async () => {
    return wifiService.getWifiRelayConfig();
  });

  ipcMain.handle('wifi:scan-networks', async () => {
    return wifiService.scanWifiNetworks();
  });

  ipcMain.handle(
    'wifi:set-relay',
    async (
      _evt,
      config: {
        mode: WifiRelayMode;
        upstreamSsid?: string;
        upstreamMac?: string;
        upstreamChannel?: string;
        upstreamSecurityMode?: string;
        upstreamPassword?: string;
      }
    ) => {
      return wifiService.setWifiRelayConfig(config);
    }
  );

  // Speed Test
  ipcMain.handle('speedtest:run', async () => {
    return speedTestService.runSpeedTest((progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('speedtest:progress', progress);
      }
    });
  });

  ipcMain.handle('speedtest:cancel', async () => {
    speedTestService.cancel();
    return { cancelled: true };
  });

  ipcMain.handle('speedtest:get-history', async () => {
    return speedTestService.getHistory();
  });

  ipcMain.handle('speedtest:clear-history', async () => {
    speedTestService.clearHistory();
    return { cleared: true };
  });

  // Diagnostics & Logs
  ipcMain.handle('diagnostics:run', async () => {
    return diagnosticService.runFullDiagnostics();
  });

  ipcMain.handle('diagnostics:export', async () => {
    const report = await diagnosticService.buildSanitizedDiagnosticReport();
    if (!mainWindow) return { saved: false };

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Sanitized Diagnostic Report',
      defaultPath: `TendaManager-Diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON Diagnostic Report', extensions: ['json'] }],
    });

    if (canceled || !filePath) {
      return { saved: false };
    }

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    logger.info('Main', `Exported sanitized diagnostic report to ${filePath}`);
    return { saved: true, filePath };
  });

  ipcMain.handle('logs:get', async () => {
    return logger.getRecentEntries(200);
  });

  ipcMain.handle('logs:export', async () => {
    if (!mainWindow) return { saved: false };
    const lines = logger.getFormattedLogs(500).join('\n');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export TendaManager Application Logs',
      defaultPath: `TendaManager-Logs-${new Date().toISOString().slice(0, 10)}.log`,
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
    });

    if (canceled || !filePath) {
      return { saved: false };
    }

    fs.writeFileSync(filePath, lines, 'utf8');
    return { saved: true, filePath };
  });

  ipcMain.handle('logs:clear', async () => {
    logger.clearLogs();
    return { cleared: true };
  });

  // Settings & Local Data
  ipcMain.handle('settings:get', async () => {
    return appStorage.getSettings();
  });

  ipcMain.handle('settings:update', async (_evt, partial: Partial<AppSettings>) => {
    const updated = appStorage.updateSettings(partial);

    if (partial.launchAtStartup !== undefined) {
      try {
        app.setLoginItemSettings({
          openAtLogin: updated.launchAtStartup,
        });
      } catch (err) {
        logger.warn('Main', 'Could not update Windows startup setting', err);
      }
    }

    const adapter = authenticationService.getActiveAdapter();
    if (adapter) {
      adapter.setHttpConfig(updated.requestTimeoutMs, updated.maxRetries);
    }

    return updated;
  });

  ipcMain.handle('settings:clear-credentials', async () => {
    credentialStore.clearCredentials();
    return { cleared: true };
  });

  ipcMain.handle('settings:clear-all-data', async () => {
    await authenticationService.logout(true);
    credentialStore.clearCredentials();
    appStorage.clearAllLocalData();
    logger.clearLogs();
    return { cleared: true };
  });
}

app.whenReady().then(() => {
  logger.info('Main', 'Starting TendaManager v1.0.0');
  registerIpcHandlers();
  mainWindow = createMainWindow();

  trayManager = new TrayManager(mainWindow, {
    onNavigate: (page) => {
      mainWindow?.webContents.send('tray:navigate', page);
    },
    onReconnect: () => {
      mainWindow?.webContents.send('tray:reconnect');
    },
    onLogout: async () => {
      await authenticationService.logout(false);
      trayManager?.rebuildMenu(false);
      mainWindow?.webContents.send('tray:logout');
    },
    onExit: () => {
      isQuitting = true;
      app.quit();
    },
  });
  trayManager.init();
});

app.on('before-quit', async () => {
  isQuitting = true;
  trayManager?.destroy();
  await tendaSimulator.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  } else {
    mainWindow?.show();
  }
});
