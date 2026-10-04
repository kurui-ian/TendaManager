import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  AuthCredentials,
  BandwidthRule,
  SpeedTestProgress,
  WifiSettings,
} from './router/types';

const tendaApi = {
  // Discovery & Auth
  discoverRouter: (customAddress?: string) => ipcRenderer.invoke('router:discover', customAddress),
  setSimulatorMode: (enabled: boolean) => ipcRenderer.invoke('router:set-simulator', enabled),
  login: (credentials: AuthCredentials) => ipcRenderer.invoke('auth:login', credentials),
  tryAutoLogin: (routerAddress?: string) => ipcRenderer.invoke('auth:auto-login', routerAddress),
  logout: (clearSavedCredentials?: boolean) => ipcRenderer.invoke('auth:logout', clearSavedCredentials),
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  hasSavedCredentials: (routerAddress: string) => ipcRenderer.invoke('auth:has-saved', routerAddress),

  // Router & Network Status
  getRouterInfo: () => ipcRenderer.invoke('router:get-info'),
  getNetworkStatus: () => ipcRenderer.invoke('router:get-network-status'),
  restartRouter: () => ipcRenderer.invoke('router:restart'),
  openWebInterface: (routerAddress?: string) => ipcRenderer.invoke('router:open-web-ui', routerAddress),

  // Connected Devices, Blocking & Bandwidth QoS
  getDevices: () => ipcRenderer.invoke('devices:get-all'),
  renameDevice: (macAddress: string, customName: string) =>
    ipcRenderer.invoke('devices:rename', macAddress, customName),
  blockDevice: (macAddress: string, hostname?: string) =>
    ipcRenderer.invoke('devices:block', macAddress, hostname),
  unblockDevice: (macAddress: string) => ipcRenderer.invoke('devices:unblock', macAddress),
  setBandwidthRule: (rule: BandwidthRule) => ipcRenderer.invoke('devices:set-bandwidth', rule),

  // Wi-Fi Management
  getWifiSettings: () => ipcRenderer.invoke('wifi:get-settings'),
  updateWifiSettings: (settings: WifiSettings) => ipcRenderer.invoke('wifi:update-settings', settings),

  // Speed Test
  runSpeedTest: () => ipcRenderer.invoke('speedtest:run'),
  cancelSpeedTest: () => ipcRenderer.invoke('speedtest:cancel'),
  getSpeedTestHistory: () => ipcRenderer.invoke('speedtest:get-history'),
  clearSpeedTestHistory: () => ipcRenderer.invoke('speedtest:clear-history'),
  onSpeedTestProgress: (callback: (progress: SpeedTestProgress) => void) => {
    const listener = (_event: unknown, progress: SpeedTestProgress) => callback(progress);
    ipcRenderer.on('speedtest:progress', listener);
    return () => {
      ipcRenderer.removeListener('speedtest:progress', listener);
    };
  },

  // Diagnostics & Logs
  runDiagnostics: () => ipcRenderer.invoke('diagnostics:run'),
  exportDiagnosticReport: () => ipcRenderer.invoke('diagnostics:export'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),

  // Application Settings & Data
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', partial),
  clearSavedCredentials: () => ipcRenderer.invoke('settings:clear-credentials'),
  clearAllAppData: () => ipcRenderer.invoke('settings:clear-all-data'),

  // Tray & Main Process Events
  onNavigateRequest: (callback: (page: string) => void) => {
    const listener = (_event: unknown, page: string) => callback(page);
    ipcRenderer.on('tray:navigate', listener);
    return () => ipcRenderer.removeListener('tray:navigate', listener);
  },
  onReconnectRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('tray:reconnect', listener);
    return () => ipcRenderer.removeListener('tray:reconnect', listener);
  },
  onLogoutRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('tray:logout', listener);
    return () => ipcRenderer.removeListener('tray:logout', listener);
  },
};

contextBridge.exposeInMainWorld('tendaApi', tendaApi);
