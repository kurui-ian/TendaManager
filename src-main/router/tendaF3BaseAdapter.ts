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
  WifiRelayConfig,
  WifiRelayMode,
  WifiScanNetwork,
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
  localhost?: { localhost?: string; mac?: string; lanMask?: string };
  onlineList?: TendaQosOnlineItem[];
  blackList?: TendaQosBlackItem[];
  macFilter?: { curFilterMode?: string };
}

export function dbmToSignalPercent(dbm: number): number {
  if (dbm >= -30) return 100;
  if (dbm >= -45) return Math.round(100 - (-30 - dbm) / 1.5);
  if (dbm >= -55) return Math.round(90 - (-45 - dbm) * 2);
  if (dbm >= -70) return Math.round(70 - (-55 - dbm) * 2);
  if (dbm >= -85) return Math.round(40 - (-70 - dbm) * 2);
  if (dbm >= -95) return Math.round(10 - (-85 - dbm));
  return 0;
}

export abstract class TendaF3BaseAdapter implements RouterAdapter {
  public abstract readonly adapterName: string;
  public abstract readonly hardwareVersion: F3HardwareVersion;

  protected client: TendaHttpClient;
  protected routerAddress = '192.168.0.1';
  protected authenticated = false;
  protected lastCredentials: { username: string; password: string } | null = null;
  protected detectedFirmware = 'V12.01.01.xx';
  protected operatingMode: WifiRelayMode = 'disabled';
  protected hasLoginPassword = true;

  protected capabilities: RouterCapabilities = {
    canViewDevices: true,
    canBlockDevices: true,
    canControlBandwidth: true,
    canChangeWifi: true,
    canHideSsid: true,
    canWirelessRepeat: true,
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
    const password = credentials.password || '';

    // Check if the router has no login password configured (hasLoginPwd === "false")
    try {
      const homeCheck = await this.client.getJson<Record<string, unknown>>(
        `/goform/getHomePageInfo?random=${Math.random()}&modules=loginAuth,wifiRelay`
      );
      const loginAuth = (homeCheck.data?.loginAuth || {}) as Record<string, string>;
      const relay = (homeCheck.data?.wifiRelay || {}) as Record<string, string>;
      if (relay.wifiRelayType) {
        this.operatingMode = relay.wifiRelayType as WifiRelayMode;
      }

      if (!homeCheck.sessionExpired && loginAuth.hasLoginPwd === 'false' && !password) {
        const statusVerify = await this.client.getJson<Record<string, unknown>>(
          `/goform/getStatus?random=${Math.random()}&modules=systemInfo,internetStatus,wifiRelay`
        );
        if (!statusVerify.sessionExpired && statusVerify.data?.systemInfo) {
          this.authenticated = true;
          this.hasLoginPassword = false;
          this.lastCredentials = { username, password: '' };
          const sysInfo = (statusVerify.data.systemInfo || {}) as Record<string, string>;
          if (sysInfo.softVersion) {
            this.detectedFirmware = sysInfo.softVersion;
          }
          logger.info(
            this.adapterName,
            `Authenticated with ${this.routerAddress} (No router admin password configured)`
          );
          return true;
        }
      }
    } catch {
      // Proceed to standard /login/Auth flow
    }

    const methodsToTry: Array<'base64' | 'md5' | 'plain-form'> = [this.capabilities.authMethod];
    if (!methodsToTry.includes('base64')) methodsToTry.push('base64');
    if (!methodsToTry.includes('md5')) methodsToTry.push('md5');

    for (const method of methodsToTry) {
      const encodedPassword = this.encodePassword(password, method);

      this.client.setCookie('bLanguage', 'en');
      if (password) {
        this.client.setCookie('ecos_pw', `${encodedPassword}`);
      }

      try {
        const authRes = await this.client.postForm('/login/Auth', {
          username,
          password: encodedPassword,
        });

        const redirectedToLogin =
          Boolean(authRes.redirectLocation && /login\.html\?error|login\.asp/i.test(authRes.redirectLocation)) ||
          /loginError|password error|wrong password/i.test(authRes.body);

        if (!redirectedToLogin) {
          const verify = await this.client.getJson<Record<string, unknown>>(
            `/goform/getStatus?random=${Math.random()}&modules=systemInfo,internetStatus,wifiRelay`
          );

          if (!verify.sessionExpired && verify.data && (verify.data.systemInfo || verify.data.internetStatus)) {
            this.authenticated = true;
            this.capabilities.authMethod = method;
            this.lastCredentials = { username, password };
            const sysInfo = (verify.data.systemInfo || {}) as Record<string, string>;
            const relay = (verify.data.wifiRelay || {}) as Record<string, string>;
            if (sysInfo.softVersion) {
              this.detectedFirmware = sysInfo.softVersion;
            }
            if (relay.wifiRelayType) {
              this.operatingMode = relay.wifiRelayType as WifiRelayMode;
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
        await this.client.postForm('/goform/loginOut', { action: 'loginout' }).catch(() => undefined);
      }
    } finally {
      this.authenticated = false;
      this.lastCredentials = null;
      this.client.clearCookies();
      logger.info(this.adapterName, `Disconnected session from ${this.routerAddress}`);
    }
  }

  protected async getJsonWithAutoRenew<T = Record<string, unknown>>(
    endpointPath: string,
    customTimeoutMs?: number
  ): Promise<T> {
    const res = customTimeoutMs
      ? await this.client.request('GET', endpointPath, undefined, customTimeoutMs)
      : null;

    let result = res
      ? (() => {
          try {
            return {
              data: JSON.parse(res.body.trim()) as T,
              sessionExpired: false,
            };
          } catch {
            return { data: null, sessionExpired: /login/i.test(res.redirectLocation || res.body) };
          }
        })()
      : await this.client.getJson<T>(endpointPath);

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
      `/goform/getStatus?random=${Math.random()}&modules=internetStatus,deviceStatistics,systemInfo,wanAdvCfg,wifiRelay,sysTime`
    );

    const sysInfo = (data.systemInfo || {}) as Record<string, string>;
    const inet = (data.internetStatus || {}) as Record<string, string>;
    const wanAdv = (data.wanAdvCfg || {}) as Record<string, string>;
    const relay = (data.wifiRelay || {}) as Record<string, string>;
    const devStats = ((data.deviceStastics || data.deviceStatistics) || {}) as Record<string, string>;
    const sysTime = (data.sysTime || {}) as Record<string, string>;

    const firmware = sysInfo.softVersion || this.detectedFirmware || 'V12.01.01.xx';
    this.detectedFirmware = firmware;

    const mode: WifiRelayMode = (relay.wifiRelayType as WifiRelayMode) || this.operatingMode || 'disabled';
    this.operatingMode = mode;

    const uptimeRaw = Number(sysInfo.runTime || sysInfo.wanConnectTime || inet.wanConnectTime || relay.connectDuration || 0);
    const activeIp = this.routerAddress.replace(/^https?:\/\//, '');
    const wifiRateNum = devStats.wifiRate ? Number(devStats.wifiRate) : null;

    return {
      model: sysInfo.productName || 'Tenda F3',
      hardwareVersion: this.hardwareVersion,
      firmwareVersion: firmware,
      adapterName: this.adapterName,
      routerIp: activeIp,
      lanIp: sysInfo.lanIP || '192.168.0.1',
      macAddress: normalizeMac(
        sysInfo.statusWanMAC || wanAdv.macRouter || sysInfo.macAddr || inet.wanMac || 'D8:32:14:00:00:01'
      ),
      operatingMode: mode,
      upstreamSsid: relay.wifiRelaySSID || relay.upperWifiSsid || devStats.routerName || undefined,
      extenderSsid: relay.extenderSsid || devStats.extendName || undefined,
      bridgeStatus: relay.wifiRelayConnectStatus || relay.connectState || undefined,
      signalStrengthDbm: Number.isFinite(wifiRateNum) ? wifiRateNum : null,
      hasLoginPassword: this.hasLoginPassword,
      uptimeSeconds: Number.isFinite(uptimeRaw) && uptimeRaw > 0 ? uptimeRaw : null,
      systemTime: sysTime.sysTimecurrentTime || sysTime.sysTime || sysInfo.sysTime || null,
      online: true,
      capabilities: this.getCapabilities(),
    };
  }

  public async getNetworkStatus(): Promise<NetworkStatus> {
    const data = await this.getJsonWithAutoRenew<Record<string, unknown>>(
      `/goform/getStatus?random=${Math.random()}&modules=internetStatus,deviceStatistics,systemInfo,wanAdvCfg,wifiRelay`
    );

    const inet = (data.internetStatus || {}) as Record<string, string>;
    const sysInfo = (data.systemInfo || {}) as Record<string, string>;
    const wanAdv = (data.wanAdvCfg || {}) as Record<string, string>;
    const relay = (data.wifiRelay || {}) as Record<string, string>;
    const devStats = ((data.deviceStastics || data.deviceStatistics) || {}) as Record<string, string>;

    const mode: WifiRelayMode = (relay.wifiRelayType as WifiRelayMode) || 'disabled';
    const rawStatus = String(inet.wanConnectStatus || '');
    const wanIpRaw = sysInfo.statusWanIP || inet.wanIp || '0.0.0.0';
    const activeRouterHost = this.routerAddress.replace(/^https?:\/\//, '');

    const downKbps = Number(devStats.statusDownSpeed ?? inet.wanDownSpeed ?? 0);
    const upKbps = Number(devStats.statusUpSpeed ?? inet.wanUpSpeed ?? 0);
    const wifiRateDbm = devStats.wifiRate ? Number(devStats.wifiRate) : null;

    if (mode === 'client+ap') {
      const bridged =
        relay.wifiRelayConnectStatus === 'bridgeSuccess' || relay.connectState === 'bridgeSuccess';
      const upstreamSsid = relay.wifiRelaySSID || relay.upperWifiSsid || devStats.routerName || 'Upstream Wi-Fi';
      const subnetPrefix = activeRouterHost.split('.').slice(0, 3).join('.');
      const derivedGateway = subnetPrefix ? `${subnetPrefix}.1` : '192.168.0.1';

      return {
        internetConnected: bridged,
        connectionStatusText: bridged
          ? `Universal Repeater — Bridged to "${upstreamSsid}"`
          : relay.wifiRelayConnectStatus === 'pwdError'
          ? `Universal Repeater — Password Error on "${upstreamSsid}"`
          : 'Universal Repeater — Disconnected',
        wanIp: wanIpRaw !== '0.0.0.0' ? wanIpRaw : activeRouterHost,
        wanSubnetMask:
          sysInfo.statusWanMask && sysInfo.statusWanMask !== '0.0.0.0'
            ? sysInfo.statusWanMask
            : '255.255.255.0',
        wanGateway:
          sysInfo.statusWanGaterway && sysInfo.statusWanGaterway !== '0.0.0.0'
            ? sysInfo.statusWanGaterway
            : derivedGateway,
        primaryDns: sysInfo.statusWanDns1 || derivedGateway,
        secondaryDns: sysInfo.statusWanDns2 || '8.8.8.8',
        wanMac: normalizeMac(sysInfo.statusWanMAC || wanAdv.macRouter || 'D8:32:14:00:00:01'),
        connectionType: 'Universal Repeater (Client + AP)',
        uploadSpeedKbps: upKbps,
        downloadSpeedKbps: downKbps,
        operatingMode: mode,
        upstreamSsid,
        wifiRateDbm,
      };
    }

    if (mode === 'ap') {
      return {
        internetConnected: true,
        connectionStatusText: 'Access Point (AP) Mode Active',
        wanIp: activeRouterHost,
        wanSubnetMask: '255.255.255.0',
        wanGateway: sysInfo.lanIP || '192.168.0.1',
        primaryDns: sysInfo.lanIP || '192.168.0.1',
        secondaryDns: '8.8.8.8',
        wanMac: normalizeMac(sysInfo.statusWanMAC || wanAdv.macRouter || 'D8:32:14:00:00:01'),
        connectionType: 'Access Point (AP)',
        uploadSpeedKbps: upKbps,
        downloadSpeedKbps: downKbps,
        operatingMode: mode,
      };
    }

    const isConnected =
      (wanIpRaw !== '0.0.0.0' && wanIpRaw !== '') ||
      rawStatus === '1' ||
      rawStatus.slice(2, 3) === '1' ||
      rawStatus.endsWith('103') ||
      rawStatus.endsWith('102') ||
      relay.wifiRelayConnectStatus === 'bridgeSuccess';

    const rawType = String(sysInfo.wanType || inet.wanType || 'dhcp').toLowerCase();
    let connectionType: NetworkStatus['connectionType'] = 'Dynamic IP (DHCP)';
    if (mode === 'wisp') {
      connectionType = 'WISP Repeater';
    } else if (rawType === '2' || rawType.includes('pppoe')) {
      connectionType = 'PPPoE';
    } else if (rawType === '1' || rawType.includes('static')) {
      connectionType = 'Static IP';
    }

    const dns1 = sysInfo.statusWanDns1 || inet.wanDns1 || '8.8.8.8';
    const dns2 = sysInfo.statusWanDns2 || inet.wanDns2 || '8.8.4.4';

    return {
      internetConnected: isConnected,
      connectionStatusText: isConnected ? 'Connected to Internet' : 'No Internet Connection',
      wanIp: wanIpRaw,
      wanSubnetMask: sysInfo.statusWanMask || inet.wanMask || '255.255.255.0',
      wanGateway: sysInfo.statusWanGaterway || inet.wanGw || '0.0.0.0',
      primaryDns: String(dns1),
      secondaryDns: String(dns2),
      wanMac: normalizeMac(
        sysInfo.statusWanMAC || wanAdv.macCurrentWan || wanAdv.macWan || inet.wanMac || 'C8:3A:35:00:00:02'
      ),
      connectionType,
      uploadSpeedKbps: upKbps,
      downloadSpeedKbps: downKbps,
      operatingMode: mode,
      upstreamSsid: relay.wifiRelaySSID || undefined,
      wifiRateDbm,
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
    const localhostIp = qos.localhost?.localhost || '';
    const nowIso = new Date().toISOString();

    return onlineList.map((item, idx) => {
      const mac = normalizeMac(item.qosListMac || `00:00:00:00:00:${String(idx + 1).padStart(2, '0')}`);
      const downLimit = Number(item.qosListDownLimit ?? 0);
      const upLimit = Number(item.qosListUpLimit ?? 0);
      const accessAllowed = item.qosListAccess !== 'false' && item.qosListAccess !== false;
      const connTypeRaw = String(item.qosListConnectType || 'wifi').toLowerCase();
      const ip = item.qosListIP || '0.0.0.0';

      return {
        id: mac,
        hostname: item.qosListHostname || 'Unknown Device',
        remark: item.qosListRemark || undefined,
        ipAddress: ip,
        macAddress: mac,
        online: true,
        blocked: !accessAllowed,
        isNativeHost: Boolean(localhostIp && ip === localhostIp),
        connectionType: connTypeRaw.includes('wire') || connTypeRaw.includes('lan') ? 'Wired' : 'Wireless',
        downloadSpeedKbps: Number(item.qosListDownSpeed ?? 0),
        uploadSpeedKbps: Number(item.qosListUpSpeed ?? 0),
        downloadLimitKbps: downLimit >= 38250 || downLimit <= 0 ? 0 : downLimit,
        uploadLimitKbps: upLimit >= 38250 || upLimit <= 0 ? 0 : upLimit,
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
   * Submits the complete QoS and MAC filter list to /goform/setQos.
   * Compatible with both Tenda F3 V12.01.01.52_multi (`qosList` combined format from net-control.js / userManage.js)
   * and earlier F3 firmware revisions (`onlineList` + `blackList`).
   */
  protected async saveQosLists(
    onlineItems: TendaQosOnlineItem[],
    blackItems: TendaQosBlackItem[],
    unblockedPermitItems: TendaQosBlackItem[] = []
  ): Promise<boolean> {
    const attachedRows = onlineItems.map((item) => {
      const host = (item.qosListHostname || 'Unknown').replace(/[\t\r\n]/g, ' ');
      const remark = (item.qosListRemark || '').replace(/[\t\r\n]/g, ' ');
      const mac = normalizeMac(item.qosListMac || '');
      const access = item.qosListAccess === 'false' || item.qosListAccess === false ? 'false' : 'true';
      const up = access === 'false' ? 0 : Number(item.qosListUpLimit ?? 0) <= 0 ? 38528 : Number(item.qosListUpLimit);
      const down =
        access === 'false' ? 0 : Number(item.qosListDownLimit ?? 0) <= 0 ? 38528 : Number(item.qosListDownLimit);
      return `${host}\t${remark}\t${mac}\t${up}\t${down}\t${access}`;
    });

    const permitRows = unblockedPermitItems.map((item) => {
      const host = (item.qosListHostname || 'UnKnown').replace(/[\t\r\n]/g, ' ');
      const remark = (item.qosListRemark || '').replace(/[\t\r\n]/g, ' ');
      const mac = normalizeMac(item.qosListMac || '');
      return `${host}\t${remark}\t${mac}\t38528\t38528\ttrue`;
    });

    const forbidRows = blackItems.map((item) => {
      const host = (item.qosListHostname || 'UnKnown').replace(/[\t\r\n]/g, ' ');
      const remark = (item.qosListRemark || '').replace(/[\t\r\n]/g, ' ');
      const mac = normalizeMac(item.qosListMac || '');
      return `${host}\t${remark}\t${mac}\t0\t0\tfalse`;
    });

    const combinedQosList = [...attachedRows, ...permitRows, ...forbidRows].join('\n');

    const blackLegacySerialized = blackItems
      .map((item) => {
        const host = (item.qosListHostname || 'Blocked').replace(/[\t\r\n]/g, ' ');
        const remark = (item.qosListRemark || '').replace(/[\t\r\n]/g, ' ');
        const mac = normalizeMac(item.qosListMac || '');
        return `${host}\t${remark}\t${mac}`;
      })
      .join('\n');

    const res = await this.client.postForm('/goform/setQos', {
      module1: 'qosList',
      qosList: combinedQosList,
      onlineList: attachedRows.join('\n'),
      blackList: blackLegacySerialized,
    });

    if (res.statusCode >= 200 && res.statusCode < 400) {
      logger.info(
        this.adapterName,
        `Updated QoS & MAC filter lists (${onlineItems.length} online, ${blackItems.length} blocked)`
      );
      return true;
    }
    return false;
  }

  public async blockDevice(macAddress: string, hostname?: string): Promise<boolean> {
    const targetMac = normalizeMac(macAddress);
    const qos = await this.fetchRawQos();
    const onlineList = Array.isArray(qos.onlineList) ? [...qos.onlineList] : [];
    const blackList = Array.isArray(qos.blackList) ? [...qos.blackList] : [];

    let foundHost = hostname || 'UnKnown';
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

    const unblockedPermit: TendaQosBlackItem[] = [];
    const filteredBlack: TendaQosBlackItem[] = [];

    for (const b of blackList) {
      if (normalizeMac(b.qosListMac || '') === targetMac) {
        unblockedPermit.push(b);
      } else {
        filteredBlack.push(b);
      }
    }

    for (const item of onlineList) {
      if (normalizeMac(item.qosListMac || '') === targetMac) {
        item.qosListAccess = 'true';
      }
    }

    return this.saveQosLists(onlineList, filteredBlack, unblockedPermit);
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
      `/goform/getWifi?random=${Math.random()}&modules=wifiEn,wifiBasicCfg,wifiAdvCfg,wifiPower`
    );

    const wifiEnObj = (data.wifiEn || {}) as Record<string, string>;
    const basic = (data.wifiBasicCfg || {}) as Record<string, string>;
    const adv = (data.wifiAdvCfg || {}) as Record<string, string>;
    const power = (data.wifiPower || {}) as Record<string, string>;

    const rawSec = String(basic.wifiSecurityMode || 'wpa&wpa2').toLowerCase();
    let securityMode: WifiSecurityMode = 'WPA/WPA2-PSK';
    if (rawSec === 'none' || rawSec === 'open' || basic.wifiNoPwd === 'true') {
      securityMode = 'None';
    } else if (rawSec === 'wpa-psk') {
      securityMode = 'WPA-PSK';
    } else if (rawSec === 'wpa2-psk') {
      securityMode = 'WPA2-PSK';
    } else {
      securityMode = 'WPA/WPA2-PSK';
    }

    return {
      enabled: wifiEnObj.wifiEn ? wifiEnObj.wifiEn !== 'false' : basic.wifiEn !== 'false',
      ssid: basic.wifiSSID || 'Tenda_F3',
      securityMode,
      password: basic.wifiPwd || '',
      hideSsid: basic.wifiHideSSID === 'true',
      channel: adv.wifiChannelCurrent && adv.wifiChannelCurrent !== '0' ? adv.wifiChannelCurrent : adv.wifiChannel || 'Auto',
      bandwidth: adv.wifiBandwidthCurrent ? `${adv.wifiBandwidthCurrent} MHz` : adv.wifiBandwidth || '20 MHz',
      transmitPower: power.wifiPower === 'normal' ? 'normal' : 'high',
    };
  }

  public async updateWifiSettings(settings: WifiSettings): Promise<boolean> {
    let firmwareSecMode = 'wpa&wpa2';
    if (settings.securityMode === 'None') {
      firmwareSecMode = 'none';
    } else if (settings.securityMode === 'WPA-PSK') {
      firmwareSecMode = 'wpa-psk';
    } else if (settings.securityMode === 'WPA2-PSK') {
      firmwareSecMode = 'wpa2-psk';
    } else {
      firmwareSecMode = 'wpa&wpa2';
    }

    const payload: Record<string, string> = {
      module1: 'wifiEn',
      wifiEn: settings.enabled ? 'true' : 'false',
      module2: 'wifiBasicCfg',
      wifiSSID: settings.ssid.trim(),
      wifiSecurityMode: firmwareSecMode,
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

  /**
   * Retrieves the current Wireless Repeating (Universal Repeater / WISP / AP) configuration.
   */
  public async getWifiRelayConfig(): Promise<WifiRelayConfig> {
    const [relayData, statusData] = await Promise.all([
      this.getJsonWithAutoRenew<Record<string, unknown>>(
        `/goform/getWifiRelay?random=${Math.random()}&modules=wifiEn,wifiRelay`
      ),
      this.getJsonWithAutoRenew<Record<string, unknown>>(
        `/goform/getStatus?random=${Math.random()}&modules=deviceStatistics,wifiRelay`
      ).catch(() => ({} as Record<string, unknown>)),
    ]);

    const wifiEnObj = (relayData.wifiEn || {}) as Record<string, string>;
    const relay = (relayData.wifiRelay || statusData.wifiRelay || {}) as Record<string, string>;
    const devStats = ((statusData.deviceStastics || statusData.deviceStatistics) || {}) as Record<string, string>;

    const mode = ((relay.wifiRelayType as WifiRelayMode) || 'disabled');
    this.operatingMode = mode;

    const signalDbm = devStats.wifiRate ? Number(devStats.wifiRate) : null;

    return {
      wifiEn: wifiEnObj.wifiEn !== 'false',
      mode,
      upstreamSsid: relay.wifiRelaySSID || relay.upperWifiSsid || '',
      upstreamMac: relay.wifiRelayMAC || '',
      upstreamChannel: relay.wifiRelayChannel || 'Auto',
      upstreamSecurityMode: relay.wifiRelaySecurityMode || 'wpa2/AES',
      upstreamPassword: relay.wifiRelayPwd || '',
      extenderSsid: relay.extenderSsid || devStats.extendName || '',
      connectStatus: relay.wifiRelayConnectStatus || relay.connectState || 'disconnect',
      signalStrengthDbm: Number.isFinite(signalDbm) ? signalDbm : null,
    };
  }

  /**
   * Triggers a live wireless site survey (/goform/getWifiRelay?modules=wifiScan) on the Tenda F3
   * to list nearby base stations for Universal Repeater / WISP mode.
   */
  public async scanWifiNetworks(): Promise<WifiScanNetwork[]> {
    const data = await this.getJsonWithAutoRenew<Record<string, unknown>>(
      `/goform/getWifiRelay?random=${Math.random()}&modules=wifiScan`,
      12000
    );

    const rawList = Array.isArray(data.wifiScan)
      ? (data.wifiScan as Array<Record<string, string>>)
      : [];

    const networks: WifiScanNetwork[] = rawList.map((item) => {
      let dbm = Number(item.wifiScanSignalStrength || -80);
      if (dbm > 0) dbm = -dbm;
      return {
        ssid: item.wifiScanSSID || '',
        macAddress: normalizeMac(item.wifiScanMAC || '00:00:00:00:00:00'),
        channel: String(item.wifiScanChannel || '1'),
        securityMode: item.wifiScanSecurityMode || 'WPA2/AES',
        signalStrengthDbm: dbm,
        signalPercent: dbmToSignalPercent(dbm),
      };
    });

    networks.sort((a, b) => b.signalStrengthDbm - a.signalStrengthDbm);
    return networks;
  }

  /**
   * Configures Wireless Repeating mode (`disabled`, `wisp`, `client+ap` Universal Repeater, or `ap`).
   * Note: Changing the repeating mode causes the Tenda F3 to reboot automatically.
   */
  public async setWifiRelayConfig(config: {
    mode: WifiRelayMode;
    upstreamSsid?: string;
    upstreamMac?: string;
    upstreamChannel?: string;
    upstreamSecurityMode?: string;
    upstreamPassword?: string;
  }): Promise<boolean> {
    const securityLower =
      !config.upstreamSecurityMode || config.upstreamSecurityMode.toLowerCase() === 'none'
        ? 'none'
        : config.upstreamSecurityMode.toLowerCase();

    const payload: Record<string, string> = {
      module1: 'wifiRelay',
      wifiRelayType: config.mode,
      wifiRelaySSID: config.upstreamSsid || '',
      wifiRelayMAC: config.upstreamMac || '',
      wifiRelaySecurityMode: securityLower,
      wifiRelayChannel: config.upstreamChannel || '1',
      wifiRelayPwd: securityLower === 'none' ? '' : config.upstreamPassword || '',
    };

    const res = await this.client.postForm('/goform/setWifiRelay', payload);
    if (res.statusCode >= 200 && res.statusCode < 400) {
      this.operatingMode = config.mode;
      logger.info(
        this.adapterName,
        `Applied Wireless Repeating mode "${config.mode}"${
          config.upstreamSsid ? ` -> upstream SSID "${config.upstreamSsid}"` : ''
        }`
      );
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

    steps.push({
      id: 'auth-session',
      label: 'Authentication Valid',
      status: this.authenticated ? 'pass' : 'warn',
      detail: this.authenticated
        ? `Active session (${this.adapterName}, Mode: ${this.operatingMode})`
        : 'Not currently logged in',
      durationMs: 1,
    });

    const tStatus = Date.now();
    try {
      const info = await this.getRouterInfo();
      steps.push({
        id: 'status-endpoint',
        label: 'Status Endpoint (/goform/getStatus)',
        status: 'pass',
        detail: `Model: ${info.model}, Firmware: ${info.firmwareVersion}, Mode: ${info.operatingMode}`,
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

    const tRelay = Date.now();
    try {
      const relay = await this.getWifiRelayConfig();
      steps.push({
        id: 'repeater-endpoint',
        label: 'Wireless Repeating Endpoint (/goform/getWifiRelay)',
        status: 'pass',
        detail: `Mode: ${relay.mode}${relay.upstreamSsid ? `, Base Station: "${relay.upstreamSsid}" (${relay.connectStatus})` : ''}`,
        durationMs: Date.now() - tRelay,
      });
    } catch (err) {
      steps.push({
        id: 'repeater-endpoint',
        label: 'Wireless Repeating Endpoint (/goform/getWifiRelay)',
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Wireless Repeating query failed',
        durationMs: Date.now() - tRelay,
      });
    }

    return steps;
  }
}
