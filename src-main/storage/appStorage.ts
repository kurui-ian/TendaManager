import fs from 'fs';
import path from 'path';
import os from 'os';
import { AppSettings, RouterDevice, SpeedTestRecord } from '../router/types';
import { logger } from '../logger/logger';

export interface PersistedAppData {
  settings: AppSettings;
  deviceNames: Record<string, string>; // Normalized MAC -> Friendly Name
  knownDevices: Record<string, RouterDevice>; // Normalized MAC -> Last seen device snapshot
  speedTestHistory: SpeedTestRecord[];
  knownRouters: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtStartup: false,
  minimizeToTray: true,
  pollingIntervalSeconds: 10,
  requestTimeoutMs: 6000,
  maxRetries: 2,
  enableNotifications: true,
  maskWanIpByDefault: true,
  onboardingCompleted: false,
  lastRouterAddress: '192.168.0.1',
  enableSimulatorMode: false,
};

export function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/-/g, ':');
}

export class AppStorage {
  private readonly filePath: string;
  private data: PersistedAppData;

  constructor(customDir?: string) {
    const baseDir =
      customDir ||
      path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'TendaManager');
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch {
      // Ignore in read-only test contexts
    }
    this.filePath = path.join(baseDir, 'app-data.json');
    this.data = this.load();
  }

  private load(): PersistedAppData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedAppData>;
        return {
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          deviceNames: parsed.deviceNames || {},
          knownDevices: parsed.knownDevices || {},
          speedTestHistory: Array.isArray(parsed.speedTestHistory) ? parsed.speedTestHistory : [],
          knownRouters: Array.isArray(parsed.knownRouters) ? parsed.knownRouters : ['192.168.0.1'],
        };
      }
    } catch (err) {
      logger.warn('AppStorage', 'Failed to load app-data.json, initializing defaults', err);
    }
    return {
      settings: { ...DEFAULT_SETTINGS },
      deviceNames: {},
      knownDevices: {},
      speedTestHistory: [],
      knownRouters: ['192.168.0.1'],
    };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      logger.error('AppStorage', 'Failed to persist app-data.json', err);
    }
  }

  public getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
    return { ...this.data.settings };
  }

  public getDeviceCustomName(macAddress: string): string | undefined {
    return this.data.deviceNames[normalizeMac(macAddress)];
  }

  public setDeviceCustomName(macAddress: string, customName: string): void {
    const key = normalizeMac(macAddress);
    const trimmed = customName.trim();
    if (!trimmed) {
      delete this.data.deviceNames[key];
    } else {
      this.data.deviceNames[key] = trimmed;
    }
    if (this.data.knownDevices[key]) {
      this.data.knownDevices[key].customName = trimmed || undefined;
    }
    this.save();
  }

  public getAllDeviceNames(): Record<string, string> {
    return { ...this.data.deviceNames };
  }

  public recordDevicesSnapshot(devices: RouterDevice[]): void {
    for (const dev of devices) {
      if (!dev.macAddress) continue;
      const key = normalizeMac(dev.macAddress);
      this.data.knownDevices[key] = {
        ...dev,
        macAddress: key,
        customName: this.data.deviceNames[key] || dev.customName,
        lastSeen: dev.online ? new Date().toISOString() : dev.lastSeen || new Date().toISOString(),
      };
    }
    this.save();
  }

  public getKnownDevices(): Record<string, RouterDevice> {
    return { ...this.data.knownDevices };
  }

  public addSpeedTestRecord(record: SpeedTestRecord): SpeedTestRecord[] {
    this.data.speedTestHistory.unshift(record);
    if (this.data.speedTestHistory.length > 50) {
      this.data.speedTestHistory = this.data.speedTestHistory.slice(0, 50);
    }
    this.save();
    return [...this.data.speedTestHistory];
  }

  public getSpeedTestHistory(): SpeedTestRecord[] {
    return [...this.data.speedTestHistory];
  }

  public clearSpeedTestHistory(): void {
    this.data.speedTestHistory = [];
    this.save();
  }

  public addKnownRouter(address: string): void {
    const clean = address.trim();
    if (!clean) return;
    if (!this.data.knownRouters.includes(clean)) {
      this.data.knownRouters.unshift(clean);
      this.data.knownRouters = this.data.knownRouters.slice(0, 10);
      this.save();
    }
  }

  public clearAllLocalData(): void {
    this.data = {
      settings: { ...DEFAULT_SETTINGS },
      deviceNames: {},
      knownDevices: {},
      speedTestHistory: [],
      knownRouters: ['192.168.0.1'],
    };
    this.save();
  }
}

export const appStorage = new AppStorage();
