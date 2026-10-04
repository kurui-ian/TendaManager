export type F3HardwareVersion = 'F3 v2.0' | 'F3 v3.0' | 'F3 v4.0' | 'F3 v5.0' | 'Tenda F3 (Generic)';

export type WifiRelayMode = 'disabled' | 'wisp' | 'client+ap' | 'ap';

export type WifiRelayConnectStatus = 'bridgeSuccess' | 'disconnect' | 'pwdError';

export interface WifiRelayConfig {
  wifiEnabled: boolean;
  mode: WifiRelayMode;
  upstreamSsid: string;
  upstreamMac: string;
  upstreamChannel: string | number;
  upstreamSecurityMode: string;
  upstreamPassword?: string;
  connectStatus: WifiRelayConnectStatus;
  signalStrengthDbm?: number | null;
  extenderSsid?: string;
}

export interface WifiScanNetwork {
  ssid: string;
  macAddress: string;
  channel: number;
  securityMode: string;
  signalStrengthDbm: number;
  signalPercent: number;
}

export interface RouterCapabilities {
  canViewDevices: boolean;
  canBlockDevices: boolean;
  canControlBandwidth: boolean;
  canChangeWifi: boolean;
  canHideSsid: boolean;
  canWirelessRepeating: boolean;
  canReboot: boolean;
  canViewWanStatus: boolean;
  canViewUptime: boolean;
  requiresUsername: boolean;
  authMethod: 'base64' | 'md5' | 'plain-form';
}

export interface RouterInfo {
  model: string;
  hardwareVersion: F3HardwareVersion;
  firmwareVersion: string;
  adapterName: string;
  routerIp: string;
  macAddress: string;
  uptimeSeconds: number | null;
  systemTime: string | null;
  online: boolean;
  operatingMode: WifiRelayMode;
  capabilities: RouterCapabilities;
}

export interface NetworkStatus {
  internetConnected: boolean;
  connectionStatusText: string;
  wanIp: string;
  wanSubnetMask: string;
  wanGateway: string;
  primaryDns: string;
  secondaryDns: string;
  wanMac: string;
  connectionType:
    | 'Dynamic IP (DHCP)'
    | 'PPPoE'
    | 'Static IP'
    | 'Universal Repeater (Client + AP)'
    | 'Universal Repeater'
    | 'WISP Mode'
    | 'Access Point (AP)'
    | 'AP Mode'
    | 'Bridge / AP'
    | 'Unknown';
  uploadSpeedKbps: number;
  downloadSpeedKbps: number;
  operatingMode?: WifiRelayMode;
  upstreamSsid?: string;
  wifiRateDbm?: number | null;
  upstreamSignalDbm?: number | null;
}

export interface RouterDevice {
  id: string;
  hostname: string;
  customName?: string;
  remark?: string;
  ipAddress: string;
  macAddress: string;
  online: boolean;
  blocked: boolean;
  connectionType: 'Wireless' | 'Wired' | 'Unknown';
  downloadSpeedKbps: number;
  uploadSpeedKbps: number;
  downloadLimitKbps: number;
  uploadLimitKbps: number;
  lastSeen: string;
}

export interface BandwidthRule {
  macAddress: string;
  hostname: string;
  downloadLimitKbps: number;
  uploadLimitKbps: number;
}

export type WifiSecurityMode = 'None' | 'WPA-PSK' | 'WPA2-PSK' | 'WPA/WPA2-PSK';

export interface WifiSettings {
  enabled: boolean;
  ssid: string;
  securityMode: WifiSecurityMode;
  password?: string;
  hideSsid: boolean;
  channel?: string | number;
  bandwidth?: string;
}

export interface NetworkInterfaceInfo {
  interfaceName: string;
  localIp: string;
  subnetMask: string;
  defaultGateway: string;
  macAddress: string;
  dnsServers: string[];
  connectionType: 'Wi-Fi' | 'Ethernet' | 'Unknown';
  ssid?: string;
}

export interface DiscoveryResult {
  connectedToNetwork: boolean;
  networkInterface: NetworkInterfaceInfo | null;
  candidateAddresses: string[];
  reachableGateway: string | null;
  httpAvailable: boolean;
  httpsAvailable: boolean;
  isTendaDetected: boolean;
  detectedModel: string | null;
  detectedFirmware: string | null;
  detectedHardwareVersion: F3HardwareVersion | null;
  recommendedAdapter: string | null;
  requiresUsername: boolean;
  hasLoginPassword?: boolean;
  operatingMode?: WifiRelayMode;
  upstreamSsid?: string;
  extenderSsid?: string;
  nonTendaVendorHint: string | null;
  simulatorActive: boolean;
  simulatorUrl?: string;
}

export interface AuthSession {
  authenticated: boolean;
  routerAddress: string;
  adapterName: string;
  hardwareVersion: F3HardwareVersion;
  firmwareVersion: string;
  loggedInAt: string;
  sessionCookiePreview: string;
  isSimulator: boolean;
  hasLoginPassword?: boolean;
}

export interface AuthCredentials {
  routerAddress: string;
  username?: string;
  password: string;
  rememberSession?: boolean;
  useSimulator?: boolean;
}

export interface SpeedTestProgress {
  phase: 'idle' | 'ping' | 'download' | 'upload' | 'complete' | 'cancelled' | 'error';
  pingMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  progressPercent: number;
  serverLocation: string;
  errorMessage?: string;
}

export interface SpeedTestRecord {
  id: string;
  timestamp: string;
  pingMs: number;
  jitterMs: number;
  downloadMbps: number;
  uploadMbps: number;
  routerIp: string;
  serverName: string;
}

export interface DiagnosticStepResult {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'pass' | 'warn' | 'fail';
  detail: string;
  durationMs?: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  component: string;
  message: string;
  meta?: string;
}

export interface AppSettings {
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  pollingIntervalSeconds: 5 | 10 | 30 | 60;
  requestTimeoutMs: number;
  maxRetries: number;
  enableNotifications: boolean;
  maskWanIpByDefault: boolean;
  onboardingCompleted: boolean;
  lastRouterAddress: string;
  enableSimulatorMode: boolean;
}

export type NavPage =
  | 'dashboard'
  | 'devices'
  | 'wifi'
  | 'repeater'
  | 'speedtest'
  | 'network'
  | 'router'
  | 'diagnostics'
  | 'settings'
  | 'help';

export interface TendaDesktopApi {
  discoverRouter: (customAddress?: string) => Promise<DiscoveryResult>;
  setSimulatorMode: (enabled: boolean) => Promise<DiscoveryResult>;
  login: (credentials: AuthCredentials) => Promise<{
    success: boolean;
    session: AuthSession | null;
    errorMessage?: string;
  }>;
  tryAutoLogin: (routerAddress?: string) => Promise<{
    success: boolean;
    session: AuthSession | null;
  }>;
  logout: (clearSavedCredentials?: boolean) => Promise<{ success: boolean }>;
  getSession: () => Promise<AuthSession | null>;
  hasSavedCredentials: (routerAddress: string) => Promise<boolean>;

  getRouterInfo: () => Promise<RouterInfo>;
  getNetworkStatus: () => Promise<NetworkStatus>;
  restartRouter: () => Promise<boolean>;
  openWebInterface: (routerAddress?: string) => Promise<{ opened: string }>;

  getDevices: () => Promise<RouterDevice[]>;
  renameDevice: (macAddress: string, customName: string) => Promise<{ success: boolean }>;
  blockDevice: (macAddress: string, hostname?: string) => Promise<boolean>;
  unblockDevice: (macAddress: string) => Promise<boolean>;
  setBandwidthRule: (rule: BandwidthRule) => Promise<boolean>;

  getWifiSettings: () => Promise<WifiSettings>;
  updateWifiSettings: (settings: WifiSettings) => Promise<boolean>;
  getWifiRelayConfig: () => Promise<WifiRelayConfig>;
  scanWifiNetworks: () => Promise<WifiScanNetwork[]>;
  setWifiRelayConfig: (config: Partial<WifiRelayConfig> & { mode: WifiRelayMode }) => Promise<{
    applied: boolean;
    requiresReboot: boolean;
  }>;

  runSpeedTest: () => Promise<SpeedTestRecord | null>;
  cancelSpeedTest: () => Promise<{ cancelled: boolean }>;
  getSpeedTestHistory: () => Promise<SpeedTestRecord[]>;
  clearSpeedTestHistory: () => Promise<{ cleared: boolean }>;
  onSpeedTestProgress: (callback: (progress: SpeedTestProgress) => void) => () => void;

  runDiagnostics: () => Promise<DiagnosticStepResult[]>;
  exportDiagnosticReport: () => Promise<{ saved: boolean; filePath?: string }>;
  getLogs: () => Promise<LogEntry[]>;
  exportLogs: () => Promise<{ saved: boolean; filePath?: string }>;
  clearLogs: () => Promise<{ cleared: boolean }>;

  getSettings: () => Promise<AppSettings>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  clearSavedCredentials: () => Promise<{ cleared: boolean }>;
  clearAllAppData: () => Promise<{ cleared: boolean }>;

  onNavigateRequest: (callback: (page: string) => void) => () => void;
  onReconnectRequest: (callback: () => void) => () => void;
  onLogoutRequest: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    tendaApi: TendaDesktopApi;
  }
}
