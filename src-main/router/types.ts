export type F3HardwareVersion = 'F3 v2.0' | 'F3 v3.0' | 'F3 v4.0' | 'F3 v5.0' | 'Tenda F3 (Generic)';

export type WifiRelayMode = 'disabled' | 'wisp' | 'client+ap' | 'ap';

export interface WifiRelayConfig {
  wifiEn: boolean;
  mode: WifiRelayMode;
  upstreamSsid: string;
  upstreamMac: string;
  upstreamChannel: string;
  upstreamSecurityMode: string;
  upstreamPassword?: string;
  extenderSsid?: string;
  connectStatus: 'bridgeSuccess' | 'disconnect' | 'pwdError' | string;
  signalStrengthDbm?: number | null;
}

export interface WifiScanNetwork {
  ssid: string;
  macAddress: string;
  channel: string;
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
  canWirelessRepeat: boolean;
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
  lanIp: string;
  macAddress: string;
  operatingMode: WifiRelayMode;
  upstreamSsid?: string;
  extenderSsid?: string;
  bridgeStatus?: string;
  signalStrengthDbm?: number | null;
  hasLoginPassword?: boolean;
  uptimeSeconds: number | null;
  systemTime: string | null;
  online: boolean;
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
    | 'WISP Repeater'
    | 'Access Point (AP)'
    | 'Unknown';
  uploadSpeedKbps: number;
  downloadSpeedKbps: number;
  operatingMode?: WifiRelayMode;
  upstreamSsid?: string;
  wifiRateDbm?: number | null;
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
  isNativeHost?: boolean;
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

export type WifiSecurityMode =
  | 'None'
  | 'WPA-PSK'
  | 'WPA2-PSK'
  | 'WPA/WPA2-PSK';

export interface WifiSettings {
  enabled: boolean;
  ssid: string;
  securityMode: WifiSecurityMode;
  password?: string;
  hideSsid: boolean;
  channel?: string | number;
  bandwidth?: string;
  transmitPower?: 'high' | 'normal';
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
  hasLoginPassword: boolean;
  operatingMode: WifiRelayMode | null;
  upstreamSsid: string | null;
  extenderSsid: string | null;
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
  operatingMode: WifiRelayMode;
  hasLoginPassword: boolean;
  loggedInAt: string;
  sessionCookiePreview: string;
  isSimulator: boolean;
}

export interface AuthCredentials {
  routerAddress: string;
  username?: string;
  password: string;
  rememberSession?: boolean;
  useSimulator?: boolean;
}

export type SpeedTestPhase =
  | 'idle'
  | 'connecting'
  | 'selecting_server'
  | 'ping'
  | 'download'
  | 'upload'
  | 'calculating'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface SpeedTestProgress {
  phase: SpeedTestPhase;
  pingMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  currentMbps?: number | null;
  downloadSamples?: number[];
  uploadSamples?: number[];
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

export interface DiagnosticReport {
  generatedAt: string;
  appVersion: string;
  osPlatform: string;
  osRelease: string;
  networkInterface: NetworkInterfaceInfo | null;
  steps: DiagnosticStepResult[];
  routerInfo: Partial<RouterInfo> | null;
  recentLogs: string[];
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

export interface RouterAdapter {
  readonly adapterName: string;
  readonly hardwareVersion: F3HardwareVersion;
  connect(routerAddress: string): Promise<boolean>;
  authenticate(credentials: AuthCredentials): Promise<boolean>;
  disconnect(): Promise<void>;
  isAuthenticated(): boolean;
  getCapabilities(): RouterCapabilities;
  getRouterInfo(): Promise<RouterInfo>;
  getConnectedDevices(): Promise<RouterDevice[]>;
  getWifiSettings(): Promise<WifiSettings>;
  updateWifiSettings(settings: WifiSettings): Promise<boolean>;
  getWifiRelayConfig(): Promise<WifiRelayConfig>;
  scanWifiNetworks(): Promise<WifiScanNetwork[]>;
  setWifiRelayConfig(config: {
    mode: WifiRelayMode;
    upstreamSsid?: string;
    upstreamMac?: string;
    upstreamChannel?: string;
    upstreamSecurityMode?: string;
    upstreamPassword?: string;
  }): Promise<boolean>;
  getBlockedDevices(): Promise<RouterDevice[]>;
  blockDevice(macAddress: string, hostname?: string): Promise<boolean>;
  unblockDevice(macAddress: string): Promise<boolean>;
  getBandwidthRules(): Promise<BandwidthRule[]>;
  setBandwidthRule(rule: BandwidthRule): Promise<boolean>;
  getNetworkStatus(): Promise<NetworkStatus>;
  restartRouter(): Promise<boolean>;
  runDiagnostics(): Promise<DiagnosticStepResult[]>;
}
