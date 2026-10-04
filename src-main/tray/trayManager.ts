import { app, BrowserWindow, Menu, nativeImage, Notification, Tray } from 'electron';
import path from 'path';
import fs from 'fs';
import { appStorage } from '../storage/appStorage';
import { logger } from '../logger/logger';

// Clean 16x16 PNG data URI fallback for tray icon
const FALLBACK_TRAY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWUlEQVR42mNkoBAwUqifYdQABgYGBv7//89A8gCjAwMDw38S1YMM2L9/PwPJBlCsoRrAwMDAcODAAQaSDaBYQzWAgYGBgZGRkYHkAUYHBgYGBpItGDUAAAw9FAl479cRAAAAAElFTkSuQmCC';

export interface TrayActions {
  onNavigate: (page: string) => void;
  onReconnect: () => void;
  onLogout: () => void;
  onExit: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private actions: TrayActions;

  constructor(mainWindow: BrowserWindow, actions: TrayActions) {
    this.mainWindow = mainWindow;
    this.actions = actions;
  }

  public init(): void {
    try {
      const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');
      let img = fs.existsSync(iconPath)
        ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
        : nativeImage.createFromDataURL(`data:image/png;base64,${FALLBACK_TRAY_PNG_BASE64}`);

      if (img.isEmpty()) {
        img = nativeImage.createFromDataURL(`data:image/png;base64,${FALLBACK_TRAY_PNG_BASE64}`);
      }

      this.tray = new Tray(img);
      this.tray.setToolTip('TendaManager — Tenda F3 Desktop Router Manager');
      this.rebuildMenu();

      this.tray.on('double-click', () => {
        this.showMainWindow();
      });
    } catch (err) {
      logger.warn('TrayManager', 'Could not initialize system tray icon', err);
    }
  }

  public showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  public rebuildMenu(routerOnline = false, routerIp = '192.168.0.1'): void {
    if (!this.tray) return;

    const statusLabel = routerOnline ? `● Router Online (${routerIp})` : '○ Router Disconnected';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'TendaManager v1.0',
        enabled: false,
      },
      {
        label: statusLabel,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => {
          this.showMainWindow();
          this.actions.onNavigate('dashboard');
        },
      },
      {
        label: 'Devices',
        click: () => {
          this.showMainWindow();
          this.actions.onNavigate('devices');
        },
      },
      {
        label: 'Speed Test',
        click: () => {
          this.showMainWindow();
          this.actions.onNavigate('speedtest');
        },
      },
      { type: 'separator' },
      {
        label: 'Reconnect Router',
        click: () => {
          this.showMainWindow();
          this.actions.onReconnect();
        },
      },
      {
        label: 'Logout',
        click: () => {
          this.actions.onLogout();
        },
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          this.actions.onExit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public notify(title: string, body: string): void {
    const settings = appStorage.getSettings();
    if (!settings.enableNotifications) return;

    try {
      if (Notification.isSupported()) {
        const n = new Notification({
          title,
          body,
          silent: false,
        });
        n.show();
      }
    } catch (err) {
      logger.debug('TrayManager', 'Failed to display desktop notification', err);
    }
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
