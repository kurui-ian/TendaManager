import crypto from 'crypto';
import {
  AuthCredentials,
  BandwidthRule,
  DiagnosticStepResult,
  F3HardwareVersion,
  NetworkStatus,
  RouterAdapter,
  RouterCapabilities,
  RouterDevice,
  RouterInfo,
  WifiSecurityMode,
  WifiSettings,
} from './types';
import { TendaHttpClient } from './httpClient';
import { normalizeMac } from '../storage/appStorage';
import { logger } from '../logger/logger';

interface TendaQosOnlineItem {
  qosListHostname?: string;
  qosListRemark?: string;
  qosListIP?: string;
  qosListConnectType?: string;
  qosListMac?: string;
  qosListDownSpeed?: string | number;
  qosListUpSpeed?: string | number;
  qosListDownLimit?: string | number;
  qosListUpLimit?: string | number;
  qosListAccess?: string | boolean;
}

interface TendaQosBlackItem {
  qosListHostname?: string;
  qosListRemark?: string;
  qosListMac?: string;
}

interface TendaQosResponse {
  localhost?: { localhost?: string; mac?: string };
  onlineList?: TendaQosOnlineItem[];
  blackList?: TendaQosBlackItem[];
}

export abstract class TendaF3BaseAdapter implements RouterAdapter {
  public abstract readonly adapterName: string;
  public abstract readonly hardwareVersion: F3HardwareVersion;

  protected client: TendaHttpClient;
  protected routerAddress = '192.168.0.1';
  protected authenticated = false;
  protected lastCredentials: { username: string; password: string } | null = null;
  protected detectedFirmware = 'V12.01.01.xx';
  protected capabilities: RouterCapabilities = {
    canViewDevices: true,
    canBlockDevices: true,
    canControlBandwidth: true,
    canChangeWifi: true,
    canHideSsid: true,
    canReboot: true,
    canViewWanStatus: true,
    canViewUptime: true,
    requiresUsername: false,
    authMethod: 'base64',
  };

  constructor(client?: TendaHttpClient) {
    this.client = client || new TendaHttpClient({ timeoutMs: 6000, maxRetries: 2 });
  }

  public getCapabilities(): RouterCapabilities {
    return { ...this.capabilities };
  }

  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  public getSessionCookiePreview(): string {
    return this.client.getMaskedCookieSummary();
  }

  public setHttpConfig(timeoutMs: number, maxRetries: number): void {
    this.client.setConfig(timeoutMs, maxRetries);
  }

  public async connect(routerAddress: string): Promise<boolean> {
    this.routerAddress = routerAddress.trim();
    this.client.setBaseUrl(this.routerAddress);
    try {
      const res = await this.client.request('GET', '/');
      return res.statusCode >= 200 && res.statusCode < 500;
    } catch (err) {
      logger.warn(this.adapterName, `Failed to connect to ${this.routerAddress}`, err);
      return false;
    }
  }

  protected encodePassword(password: string, method: 'base64' | 'md5' | 'plain-form'): string {
    if (method === 'base64') {
      return Buffer.from(password, 'utf8').toString('base64');
    }
    if (method === 'md5') {
      return crypto.createHash('md5').update(password, 'utf8').digest('hex');
    }
    return password;
  }

  public async authenticate(credentials: AuthCredentials): Promise<boolean> {
    this.routerAddress = credentials.routerAddress.trim();
    this.client.setBaseUrl(this.routerAddress);
    this.client.clearCookies();

    const username = credentials.username?.trim() || 'admin';
    const password = credentials.password;

    // Order of auth encodings to try based on adapter preference
    const methodsToTry: Array<'base64' | 'md5' | 'plain-form'> = [this.capabilities.authMethod];
    if (!methodsToTry.includes('base64')) methodsToTry.push('base64');
    if (!methodsToTry.includes('md5')) methodsToTry.push('md5');

    for (const method of methodsToTry) {
      const encodedPassword = this.encodePassword(password, method);

      // Tenda F3 eCos sets cookie ecos_pw or submits /login/Auth
      this.client.setCookie('bLanguage', 'en');
      this.client.setCookie('ecos_pw', `${encodedPassword}`);

      try {
        const authRes = await this.client.postForm('/login/Auth', {
          username,
          password: encodedPassword,
        });

        const redirectedToLogin =
          Boolean(authRes.redirectLocation && /login\.html\?error|login\.asp/i.test(authRes.redirectLocation)) ||
          /loginError|password error|wrong password/i.test(authRes.body);

        if (!redirectedToLogin) {
          // Verify authenticated session by querying /goform/getStatus
          const verify = await this.client.getJson<Record<string, unknown>>(
            `/goform/getStatus?random=${Math.random()}&modules=systemInfo,internetStatus`
          );

          if (!verify.sessionExpired && verify.data && (verify.data.systemInfo || verify.data.internetStatus)) {
            this.authenticated = true;
            this.capabilities.authMethod = method;
            this.lastCredentials = { username, password };
            const sysInfo = (verify.data.systemInfo || {}) as Record<string, string>;
            if (sysInfo.softVersion) {
              this.detectedFirmware = sysInfo.softVersion;
            }
            logger.info(this.adapterName, `Authenticated successfully with ${this.routerAddress} (${method})`);
            return true;
          }
        }
      } catch (err) {
        logger.debug(this.adapterName, `Auth attempt (${method}) threw error`, err);
      }
    }

    this.authenticated = false;
    logger.warn(this.adapterName, `Authentication failed against ${this.routerAddress}`);
    return false;
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.authenticated) {
        await this.client.request('GET', '/goform/loginOut').catch(() => undefined);
      }
    } finally {
      this.authenticated = false;
      this.lastCredentials = null;
      this.client.clearCookies();
      logger.info(this.adapterName, `Disconnected session from ${this.routerAddress}`);
    }
  }

  protected async getJsonWithAutoRenew<T = Record<string, unknown>>(endpointPath: string): Promise<T> {
    let result = await this.client.getJson<T>(endpointPath);
    if (result.sessionExpired && this.lastCredentials) {
      logger.info(this.adapterName, 'Router session expired; attempting automatic session renewal');
      const renewed = await this.authenticate({
        routerAddress: this.routerAddress,
        username: this.lastCredentials.username,
        password: this.lastCredentials.password,
      });
      if (renewed) {
        result = await this.client.getJson<T>(endpointPath);
      }
    }

    if (result.sessionExpired) {
      this.authenticated = false;
      throw new Error('Router session expired. Please log in again.');
    }

    if (!result.data) {
      throw new Error(`Router returned non-JSON or empty response from ${endpointPath}`);
    }

    return result.data;
  }

  public async getRouterInfo(): Promise<RouterInfo> {
    const data = await this.getJsonWithAutoRenew<Record<string, unknown>>(
      `/goform/getStatus?random=${Math.random()}&modules=systemInfo,internetStatus,deviceStatistics,sysTime`
    );

    const sysInfo = (data.systemInfo || {}) as Record<string, string>;
    const inet = (data.internetStatus || {}) as Record<string, string>;
    const sysTime = (data.sysTime || {}) as Record<string, string>;

    const firmware = sysInfo.softVersion || this.detectedFirmware || 'V12.01.01.xx';
    this.detectedFirmware = firmware;

    const uptimeRaw = Number(sysInfo.runTime || inet.wanConnectTime || 0);

    return {
      model: sysInfo.productName || 'Tenda F3',
      hardwareVersion: this.hardwareVersion,
      firmwareVersion: firmware,
      adapterName: this.adapterName,
      routerIp: sysInfo.lanIP || this.routerAddress.replace(/^https?:\/\//, ''),
      macAddress: normalizeMac(sysInfo.macAddr || inet.wanMac || 'C8:3A:35:00:00:01'),
      uptimeSeconds: Number.isFinite(uptimeRaw) && uptimeRaw > 0 ? uptimeRaw : null,
      systemTime: sysTime.sysTime || sysInfo.sysTime || null,
      online: true,
      capabilities: this.getCapabilities(),
    };
  }

  public async getNetworkStatus(): Promise<NetworkStatus> {
    const data = await this.getJsonWithAutoRenew<Record<string, unknown>>(
      `/goform/getStatus?random=${Math.random()}&modules=internetStatus,wanAdvCfg,systemInfo`
    );

    const inet = (data.internetStatus || {}) as Record<string, string>;
    const wanAdv = (data.wanAdvCfg || {}) as Record<string, string>;

    // Tenda F3 wanConnectStatus: e.g. '0' disconnected, '1'/'2'/'3' or code string where 3rd digit is status
    const rawStatus = String(inet.wanConnectStatus || '');
    const wanIp = inet.wanIp || '0.0.0.0';
    const isConnected =
      (wanIp !== '0.0.0.0' && wanIp !== '') ||
      rawStatus === '1' ||
      rawStatus.endsWith('103') ||
      rawStatus.endsWith('102') ||
      /connected/i.test(rawStatus);

    const rawType = String(inet.wanType || '0').toLowerCase();
    let connectionType: NetworkStatus['connectionType'] = 'Dynamic IP (DHCP)';
    if (rawType === '2' || rawType.includes('pppoe')) {
      connectionType = 'PPPoE';
    } else if (rawType === '1' || rawType.includes('static')) {
      connectionType = 'Static IP';
    } else if (rawType.includes('ap') || rawType.includes('bridge')) {
      connectionType = 'Bridge / AP';
    }

    const dns1 = inet.wanDns1 || ( Array.isArray(inet.dns) ? inet.dns[0] : '' ) || '8.8.8.8';
    const dns2 = inet.wanDns2 || ( Array.isArray(inet.dns) ? inet.dns[1] : '' ) || '8.8.4.4';

    return {
      internetConnected: isConnected,
      connectionStatusText: isConnected ? 'Connected to Internet' : 'No Internet Connection',
      wanIp,
      wanSubnetMask: inet.wanMask || '255.255.255.0',
      wanGateway: inet.wanGw || '0.0.0.0',
      primaryDns: String(dns1),
      secondaryDns: String(dns2),
      wanMac: normalizeMac(wanAdv.macWan || inet.wanMac || 'C8:3A:35:00:00:02'),
      connectionType,
      uploadSpeedKbps: Number(inet.wanUpSpeed || 0),
      downloadSpeedKbps: Number(inet.wanDownSpeed || 0),
    };
  }

  protected async fetchRawQos(): Promise<TendaQosResponse> {
    return this.getJsonWithAutoRenew<TendaQosResponse>(
      `/goform/getQos?random=${Math.random()}&modules=localhost,onlineList,blackList,macFilter`
    );
  }

  public async getConnectedDevices(): Promise<RouterDevice[]> {
    const qos = await this.fetchRawQos();
    const onlineList = Array.isArray(qos.onlineList) ? qos.onlineList : [];
    const nowIso = new Date().toISOString();

    return onlineList.map((item, idx) => {
      const mac = normalizeMac(item.qosListMac || `00:00:00:00:00:${String(idx + 1).padStart(2, '0')}`);
      const downLimit = Number(item.qosListDownLimit ?? 0);
      const upLimit = Number(item.qosListUpLimit ?? 0);
      const accessAllowed = item.qosListAccess !== 'false' && item.qosListAccess !== false;
      const connTypeRaw = String(item.qosListConnectType || 'wifi').toLowerCase();

      return {
        id: mac,
        hostname: item.qosListHostname || 'Unknown Device',
        remark: item.qosListRemark || undefined,
        ipAddress: item.qosListIP || '0.0.0.0',
        macAddress: mac,
        online: true,
        blocked: !accessAllowed,
        connectionType: connTypeRaw.includes('wired') || connTypeRaw.includes('lan') ? 'Wired' : 'Wireless',
        downloadSpeedKbps: Number(item.qosListDownSpeed ?? 0),
        uploadSpeedKbps: Number(item.qosListUpSpeed ?? 0),
        // Tenda F3 uses 38528 or 0 to represent "Unlimited" in some firmware builds (38528 KB/s ~ 300Mbps)
        downloadLimitKbps: downLimit >= 38400 || downLimit <= 0 ? 0 : downLimit,
        uploadLimitKbps: upLimit >= 38400 || upLimit <= 0 ? 0 : upLimit,
        lastSeen: nowIso,
      };
    });
  }

  public async getBlockedDevices(): Promise<RouterDevice[]> {
    const qos = await this.fetchRawQos();
    const blackList = Array.isArray(qos.blackList) ? qos.blackList : [];
    const nowIso = new Date().toISOString();

    return blackList.map((item, idx) => {
      const mac = normalizeMac(item.qosListMac || `00:00:00:00:FF:${String(idx + 1).padStart(2, '0')}`);
      return {
        id: mac,
        hostname: item.qosListHostname || item.qosListRemark || 'Blocked Device',
        remark: item.qosListRemark || undefined,
        ipAddress: '—',
        macAddress: mac,
        online: false,
        blocked: true,
        connectionType: 'Unknown',
        downloadSpeedKbps: 0,
        uploadSpeedKbps: 0,
        downloadLimitKbps: 0,
        uploadLimitKbps: 0,
        lastSeen: nowIso,
      };
    });
  }

  /**
   * Submits the complete onlineList and blackList state to /goform/setQos.
   * Tenda F3 expects:
   * - onlineList rows: `${hostname}\t${remark}\t${mac}\t${upLimit}\t${downLimit}\t${access}` separated by `\n`
   * - blackList rows: `${hostname}\t${remark}\t${mac}` separated by `\n`
   */
  protected async saveQosLists(
    onlineItems: TendaQosOnlineItem[],
    blackItems: TendaQosBlackItem[]
  ): Promise<boolean> {
    const onlineSerialized = onlineItems
      .map((item) => {
        const host = (item.qosListHostname || 'Unknown').replace(/[\t\r\n]/g, ' ');
        const remark = (item.qosListRemark || '').replace(/[\t\r\n]/g, ' ');
        const mac = normalizeMac(item.qosListMac || '');
        const up = Number(item.qosListUpLimit ?? 0) <= 0 ? 38528 : Number(item.qosListUpLimit);
        const down = Number(item.qosListDownLimit ?? 0) <= 0 ? 38528 : Number(item.qosListDownLimit);
        const access = item.qosListAccess === 'false' || item.qosListAccess === false ? 'false' : 'true';
        return `${host}\t${remark}\t${mac}\t${up}\t${down}\t${access}`;
      })
      .join('\n');

    const blackSerialized = blackItems
      .map((item) => {
        const host = (item.qosListHostname || 'Blocked').replace(/[\t\r\n]/g, ' ');
        const remark = (item.qosListRemark || '').replace(/[\t\r\n]/g, ' ');
        const mac = normalizeMac(item.qosListMac || '');
        return `${host}\t${remark}\t${mac}`;
      })
      .join('\n');

    const res = await this.client.postForm('/goform/setQos', {
      module1: 'qosList',
      onlineList: onlineSerialized,
      blackList: blackSerialized,
    });

    if (res.statusCode >= 200 && res.statusCode < 400) {
      logger.info(this.adapterName, `Updated QoS & MAC filter lists (${onlineItems.length} online, ${blackItems.length} blocked)`);
      return true;
    }
    return false;
  }

  public async blockDevice(macAddress: string, hostname?: string): Promise<boolean> {
    const targetMac = normalizeMac(macAddress);
    const qos = await this.fetchRawQos();
    const onlineList = Array.isArray(qos.onlineList) ? [...qos.onlineList] : [];
    const blackList = Array.isArray(qos.blackList) ? [...qos.blackList] : [];

    let foundHost = hostname || 'Blocked Device';
    let foundRemark = '';

    const remainingOnline: TendaQosOnlineItem[] = [];
    for (const item of onlineList) {
      if (normalizeMac(item.qosListMac || '') === targetMac) {
        foundHost = item.qosListHostname || foundHost;
        foundRemark = item.qosListRemark || '';
      } else {
        remainingOnline.push(item);
      }
    }

    const alreadyBlocked = blackList.some((b) => normalizeMac(b.qosListMac || '') === targetMac);
    if (!alreadyBlocked) {
      blackList.push({
        qosListHostname: foundHost,
        qosListRemark: foundRemark,
        qosListMac: targetMac,
      });
    }

    return this.saveQosLists(remainingOnline, blackList);
  }

  public async unblockDevice(macAddress: string): Promise<boolean> {
    const targetMac = normalizeMac(macAddress);
    const qos = await this.fetchRawQos();
    const onlineList = Array.isArray(qos.onlineList) ? [...qos.onlineList] : [];
    const blackList = Array.isArray(qos.blackList) ? [...qos.blackList] : [];

    const filteredBlack = blackList.filter((b) => normalizeMac(b.qosListMac || '') !== targetMac);
    for (const item of onlineList) {
      if (normalizeMac(item.qosListMac || '') === targetMac) {
        item.qosListAccess = 'true';
      }
    }

    return this.saveQosLists(onlineList, filteredBlack);
  }

  public async getBandwidthRules(): Promise<BandwidthRule[]> {
    const devices = await this.getConnectedDevices();
    return devices.map((d) => ({
      macAddress: d.macAddress,
      hostname: d.customName || d.hostname,
      downloadLimitKbps: d.downloadLimitKbps,
      uploadLimitKbps: d.uploadLimitKbps,
    }));
  }

  public async setBandwidthRule(rule: BandwidthRule): Promise<boolean> {
    const targetMac = normalizeMac(rule.macAddress);
    const qos = await this.fetchRawQos();
    const onlineList = Array.isArray(qos.onlineList) ? [...qos.onlineList] : [];
    const blackList = Array.isArray(qos.blackList) ? [...qos.blackList] : [];

    let matched = false;
    for (const item of onlineList) {
      if (normalizeMac(item.qosListMac || '') === targetMac) {
        item.qosListDownLimit = rule.downloadLimitKbps <= 0 ? 38528 : Math.round(rule.downloadLimitKbps);
        item.qosListUpLimit = rule.uploadLimitKbps <= 0 ? 38528 : Math.round(rule.uploadLimitKbps);
        item.qosListAccess = 'true';
        matched = true;
      }
    }

    if (!matched) {
      onlineList.push({
        qosListHostname: rule.hostname || 'Device',
        qosListRemark: '',
        qosListMac: targetMac,
        qosListDownLimit: rule.downloadLimitKbps <= 0 ? 38528 : Math.round(rule.downloadLimitKbps),
        qosListUpLimit: rule.uploadLimitKbps <= 0 ? 38528 : Math.round(rule.uploadLimitKbps),
        qosListAccess: 'true',
      });
    }

    return this.saveQosLists(onlineList, blackList);
  }

  public async getWifiSettings(): Promise<WifiSettings> {
    const data = await this.getJsonWithAutoRenew<Record<string, unknown>>(
      `/goform/getWifi?random=${Math.random()}&modules=wifiBasicCfg,wifiAdvCfg`
    );

    const basic = (data.wifiBasicCfg || {}) as Record<string, string>;
    const adv = (data.wifiAdvCfg || {}) as Record<string, string>;

    const rawSec = String(basic.wifiSecurityMode || 'WPA/WPA2-PSK').toUpperCase();
    let securityMode: WifiSecurityMode = 'WPA/WPA2-PSK';
    if (rawSec === 'NONE' || rawSec === 'OPEN') {
      securityMode = 'None';
    } else if (rawSec === 'WPA-PSK') {
      securityMode = 'WPA-PSK';
    } else if (rawSec === 'WPA2-PSK') {
      securityMode = 'WPA2-PSK';
    } else {
      securityMode = 'WPA/WPA2-PSK';
    }

    return {
      enabled: basic.wifiEn !== 'false',
      ssid: basic.wifiSSID || 'Tenda_F3',
      securityMode,
      password: basic.wifiPwd || '',
      hideSsid: basic.wifiHideSSID === 'true',
      channel: adv.wifiChannel || 'Auto',
      bandwidth: adv.wifiBandwidth || '20/40 MHz',
    };
  }

  public async updateWifiSettings(settings: WifiSettings): Promise<boolean> {
    const payload: Record<string, string> = {
      module1: 'wifiBasicCfg',
      wifiEn: settings.enabled ? 'true' : 'false',
      wifiSSID: settings.ssid.trim(),
      wifiSecurityMode: settings.securityMode === 'None' ? 'NONE' : settings.securityMode,
      wifiPwd: settings.securityMode === 'None' ? '' : settings.password || '',
      wifiHideSSID: settings.hideSsid ? 'true' : 'false',
    };

    const res = await this.client.postForm('/goform/setWifi', payload);
    if (res.statusCode >= 200 && res.statusCode < 400) {
      logger.info(this.adapterName, `Updated Wi-Fi settings for SSID "${settings.ssid}" (${settings.securityMode})`);
      return true;
    }
    return false;
  }

  public async restartRouter(): Promise<boolean> {
    try {
      const res = await this.client.postForm('/goform/sysReboot', {
        module1: 'sysOperate',
        action: 'reboot',
      });
      if (res.statusCode >= 200 && res.statusCode < 400) {
        logger.info(this.adapterName, 'Triggered router reboot via /goform/sysReboot');
        return true;
      }
    } catch {
      // Try alternate Tenda reboot endpoint
    }

    try {
      const alt = await this.client.request('GET', '/goform/SysToolReboot');
      logger.info(this.adapterName, 'Triggered router reboot via /goform/SysToolReboot');
      return alt.statusCode >= 200 && alt.statusCode < 400;
    } catch (err) {
      logger.error(this.adapterName, 'Failed to trigger router reboot', err);
      return false;
    }
  }

  public async runDiagnostics(): Promise<DiagnosticStepResult[]> {
    const steps: DiagnosticStepResult[] = [];

    // 1. HTTP Reachability
    const t0 = Date.now();
    try {
      const rootRes = await this.client.request('GET', '/');
      steps.push({
        id: 'http-reachability',
        label: 'Router HTTP Reachable',
        status: rootRes.statusCode < 500 ? 'pass' : 'fail',
        detail: `HTTP ${rootRes.statusCode} received from ${this.client.getBaseUrl()}`,
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      steps.push({
        id: 'http-reachability',
        label: 'Router HTTP Reachable',
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Unreachable',
        durationMs: Date.now() - t0,
      });
      return steps;
    }

    // 2. Authentication status
    steps.push({
      id: 'auth-session',
      label: 'Authentication Valid',
      status: this.authenticated ? 'pass' : 'warn',
      detail: this.authenticated
        ? `Active authenticated session (${this.adapterName}, ${this.capabilities.authMethod})`
        : 'Not currently logged in',
      durationMs: 1,
    });

    // 3. Status endpoint check
    const tStatus = Date.now();
    try {
      const info = await this.getRouterInfo();
      steps.push({
        id: 'status-endpoint',
        label: 'Status Endpoint (/goform/getStatus)',
        status: 'pass',
        detail: `Model: ${info.model}, Firmware: ${info.firmwareVersion}`,
        durationMs: Date.now() - tStatus,
      });
    } catch (err) {
      steps.push({
        id: 'status-endpoint',
        label: 'Status Endpoint (/goform/getStatus)',
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Status query failed',
        durationMs: Date.now() - tStatus,
      });
    }

    // 4. Device / QoS endpoint check
    const tQos = Date.now();
    try {
      const devices = await this.getConnectedDevices();
      steps.push({
        id: 'device-endpoint',
        label: 'Device & QoS Endpoint (/goform/getQos)',
        status: 'pass',
        detail: `Retrieved ${devices.length} connected device(s)`,
        durationMs: Date.now() - tQos,
      });
    } catch (err) {
      steps.push({
        id: 'device-endpoint',
        label: 'Device & QoS Endpoint (/goform/getQos)',
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Device list query failed',
        durationMs: Date.now() - tQos,
      });
    }

    // 5. Wi-Fi endpoint check
    const tWifi = Date.now();
    try {
      const wifi = await this.getWifiSettings();
      steps.push({
        id: 'wifi-endpoint',
        label: 'Wi-Fi Endpoint (/goform/getWifi)',
        status: 'pass',
        detail: `SSID: "${wifi.ssid}", Security: ${wifi.securityMode}`,
        durationMs: Date.now() - tWifi,
      });
    } catch (err) {
      steps.push({
        id: 'wifi-endpoint',
        label: 'Wi-Fi Endpoint (/goform/getWifi)',
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Wi-Fi query failed',
        durationMs: Date.now() - tWifi,
      });
    }

    return steps;
  }
}
