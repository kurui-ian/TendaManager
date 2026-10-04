import { DiscoveryResult, F3HardwareVersion, WifiRelayMode } from '../router/types';
import { TendaHttpClient } from '../router/httpClient';
import { networkInspector } from './networkInspector';
import { logger } from '../logger/logger';

export interface ProbeOutcome {
  address: string;
  httpAvailable: boolean;
  httpsAvailable: boolean;
  isTenda: boolean;
  model: string | null;
  firmware: string | null;
  hardwareVersion: F3HardwareVersion | null;
  requiresUsername: boolean;
  hasLoginPassword: boolean;
  operatingMode: WifiRelayMode | null;
  upstreamSsid: string | null;
  extenderSsid: string | null;
  nonTendaVendorHint: string | null;
}

/**
 * Discovers the local Tenda F3 router in both standard Router/WISP mode (at the Default Gateway / 192.168.0.1)
 * and Universal Repeater (`client+ap`) / AP mode (where the Tenda F3 resides on an ARP neighbor IP on the upstream subnet).
 */
export class RouterDiscovery {
  public async discover(
    customAddress?: string,
    simulatorInfo?: { active: boolean; url: string }
  ): Promise<DiscoveryResult> {
    const netInterface = await networkInspector.getActiveNetworkInterface();

    if (simulatorInfo?.active && simulatorInfo.url) {
      logger.info('RouterDiscovery', `Probing active Tenda F3 Simulator at ${simulatorInfo.url}`);
      const simProbe = await this.probeAddress(simulatorInfo.url);
      return {
        connectedToNetwork: true,
        networkInterface: netInterface,
        candidateAddresses: [simulatorInfo.url, '192.168.0.1'],
        reachableGateway: simulatorInfo.url,
        httpAvailable: simProbe.httpAvailable,
        httpsAvailable: false,
        isTendaDetected: simProbe.isTenda,
        detectedModel: simProbe.model || 'Tenda F3',
        detectedFirmware: simProbe.firmware || 'V12.01.01.48_en',
        detectedHardwareVersion: simProbe.hardwareVersion || 'F3 v3.0',
        recommendedAdapter: this.mapHardwareToAdapterName(simProbe.hardwareVersion || 'F3 v3.0'),
        requiresUsername: simProbe.requiresUsername,
        hasLoginPassword: simProbe.hasLoginPassword,
        operatingMode: simProbe.operatingMode || 'disabled',
        upstreamSsid: simProbe.upstreamSsid,
        extenderSsid: simProbe.extenderSsid,
        nonTendaVendorHint: null,
        simulatorActive: true,
        simulatorUrl: simulatorInfo.url,
      };
    }

    const candidatesSet = new Set<string>();
    if (customAddress && customAddress.trim()) {
      candidatesSet.add(customAddress.trim());
    }

    // Inspect ARP table for Tenda OUI devices (e.g. Tenda F3 in Universal Repeater mode on 192.168.100.8)
    const arpNeighbors = await networkInspector.getArpNeighbors(netInterface?.localIp);
    for (const neighbor of arpNeighbors) {
      if (neighbor.isTendaOui) {
        candidatesSet.add(neighbor.ip);
      }
    }

    if (netInterface?.defaultGateway) {
      candidatesSet.add(netInterface.defaultGateway);
    }
    candidatesSet.add('192.168.0.1');
    candidatesSet.add('tendawifi.com');

    // Add remaining ARP neighbors in case the Tenda router uses a custom/cloned MAC
    for (const neighbor of arpNeighbors) {
      candidatesSet.add(neighbor.ip);
    }

    const candidateAddresses = Array.from(candidatesSet);
    logger.info('RouterDiscovery', `Starting router discovery across candidates: ${candidateAddresses.join(', ')}`);

    let firstReachableOutcome: ProbeOutcome | null = null;
    let tendaOutcome: ProbeOutcome | null = null;

    for (const addr of candidateAddresses) {
      const outcome = await this.probeAddress(addr);
      if ((outcome.httpAvailable || outcome.httpsAvailable) && !firstReachableOutcome) {
        firstReachableOutcome = outcome;
      }
      if (outcome.isTenda) {
        tendaOutcome = outcome;
        break;
      }
    }

    const bestOutcome = tendaOutcome || firstReachableOutcome;

    if (!bestOutcome) {
      return {
        connectedToNetwork: Boolean(netInterface),
        networkInterface: netInterface,
        candidateAddresses,
        reachableGateway: netInterface?.defaultGateway || null,
        httpAvailable: false,
        httpsAvailable: false,
        isTendaDetected: false,
        detectedModel: null,
        detectedFirmware: null,
        detectedHardwareVersion: null,
        recommendedAdapter: null,
        requiresUsername: false,
        hasLoginPassword: true,
        operatingMode: null,
        upstreamSsid: null,
        extenderSsid: null,
        nonTendaVendorHint: null,
        simulatorActive: false,
      };
    }

    const hwVer = bestOutcome.hardwareVersion || (bestOutcome.isTenda ? 'F3 v3.0' : null);

    return {
      connectedToNetwork: Boolean(netInterface),
      networkInterface: netInterface,
      candidateAddresses,
      reachableGateway: bestOutcome.address,
      httpAvailable: bestOutcome.httpAvailable,
      httpsAvailable: bestOutcome.httpsAvailable,
      isTendaDetected: bestOutcome.isTenda,
      detectedModel: bestOutcome.model,
      detectedFirmware: bestOutcome.firmware,
      detectedHardwareVersion: hwVer,
      recommendedAdapter: hwVer ? this.mapHardwareToAdapterName(hwVer) : null,
      requiresUsername: bestOutcome.requiresUsername,
      hasLoginPassword: bestOutcome.hasLoginPassword,
      operatingMode: bestOutcome.operatingMode,
      upstreamSsid: bestOutcome.upstreamSsid,
      extenderSsid: bestOutcome.extenderSsid,
      nonTendaVendorHint: bestOutcome.nonTendaVendorHint,
      simulatorActive: false,
    };
  }

  public async probeAddress(address: string): Promise<ProbeOutcome> {
    const client = new TendaHttpClient({ timeoutMs: 2400, maxRetries: 0 });
    client.setBaseUrl(address);

    let httpAvailable = false;
    let httpsAvailable = false;
    let rootHtml = '';
    let headersCombined = '';

    try {
      const rootRes = await client.request('GET', '/', undefined, 2200);
      httpAvailable = true;
      rootHtml = rootRes.body;
      headersCombined = JSON.stringify(rootRes.headers);

      if (rootRes.redirectLocation || rootHtml.length < 150) {
        try {
          const targetPage = rootRes.redirectLocation?.includes('index.html') ? '/index.html' : '/login.html';
          const secondRes = await client.request('GET', targetPage, undefined, 2000);
          if (secondRes.statusCode === 200) {
            rootHtml += '\n' + secondRes.body;
          }
        } catch {
          // Ignore secondary probe failure
        }
      }
    } catch {
      httpAvailable = false;
    }

    if (!httpAvailable && !address.startsWith('http://')) {
      try {
        const httpsClient = new TendaHttpClient({ timeoutMs: 2200, maxRetries: 0 });
        httpsClient.setBaseUrl(`https://${address.replace(/^https?:\/\//, '')}`);
        const httpsRes = await httpsClient.request('GET', '/', undefined, 2200);
        httpsAvailable = true;
        rootHtml = httpsRes.body;
        headersCombined = JSON.stringify(httpsRes.headers);
      } catch {
        httpsAvailable = false;
      }
    }

    if (!httpAvailable && !httpsAvailable) {
      return {
        address,
        httpAvailable: false,
        httpsAvailable: false,
        isTenda: false,
        model: null,
        firmware: null,
        hardwareVersion: null,
        requiresUsername: false,
        hasLoginPassword: true,
        operatingMode: null,
        upstreamSsid: null,
        extenderSsid: null,
        nonTendaVendorHint: null,
      };
    }

    const isTendaInHtml =
      /tenda/i.test(rootHtml) ||
      /ecos_pw/i.test(headersCombined) ||
      /goform\/getStatus/i.test(rootHtml) ||
      /reasyui|reasy-ui/i.test(rootHtml) ||
      /bLanguage/i.test(headersCombined);

    let macroText = '';
    let statusJson: Record<string, unknown> | null = null;
    let homePageJson: Record<string, unknown> | null = null;

    if (httpAvailable) {
      try {
        const homeRes = await client.getJson<Record<string, unknown>>(
          `/goform/getHomePageInfo?random=${Math.random()}&modules=loginAuth,wifiRelay`
        );
        if (homeRes.data) {
          homePageJson = homeRes.data;
        }
      } catch {
        // Ignore
      }

      try {
        const statusRes = await client.getJson<Record<string, unknown>>(
          `/goform/getStatus?random=${Math.random()}&modules=systemInfo,internetStatus,wifiRelay,deviceStatistics`
        );
        if (statusRes.data) {
          statusJson = statusRes.data;
        }
      } catch {
        // Ignore
      }

      try {
        const macroRes = await client.request('GET', '/common/macro_config.js', undefined, 1600);
        if (macroRes.statusCode === 200 && /CONFIG_/i.test(macroRes.body)) {
          macroText = macroRes.body;
        }
      } catch {
        // Ignore
      }
    }

    const isTenda =
      isTendaInHtml ||
      Boolean(macroText) ||
      Boolean(statusJson?.systemInfo) ||
      Boolean(homePageJson?.wifiRelay);

    if (!isTenda) {
      const nonTendaVendorHint = this.detectOtherVendor(rootHtml, headersCombined);
      return {
        address,
        httpAvailable,
        httpsAvailable,
        isTenda: false,
        model: null,
        firmware: null,
        hardwareVersion: null,
        requiresUsername: false,
        hasLoginPassword: true,
        operatingMode: null,
        upstreamSsid: null,
        extenderSsid: null,
        nonTendaVendorHint,
      };
    }

    const sysInfo = (statusJson?.systemInfo || {}) as Record<string, string>;
    const relayInfo = ((statusJson?.wifiRelay || homePageJson?.wifiRelay) || {}) as Record<string, string>;
    const loginAuth = (homePageJson?.loginAuth || {}) as Record<string, string>;

    let firmware = sysInfo.softVersion || null;
    if (!firmware && macroText) {
      const fwMatch = macroText.match(/CONFIG_FIRMWARE_VERSION\s*=\s*["']([^"']+)["']/i);
      if (fwMatch) firmware = fwMatch[1];
    }
    if (!firmware) {
      const htmlFwMatch = rootHtml.match(/V\d{2}\.\d{2}\.\d{2}\.\d{1,3}[A-Za-z0-9_]*/);
      if (htmlFwMatch) firmware = htmlFwMatch[0];
    }

    const hardwareVersion = this.inferF3HardwareVersion(firmware, macroText, rootHtml);
    const requiresUsername =
      /id=["']username["']/i.test(rootHtml) && !/type=["']hidden["'][^>]*id=["']username["']/i.test(rootHtml);
    const hasLoginPassword = loginAuth.hasLoginPwd ? loginAuth.hasLoginPwd === 'true' : true;
    const operatingMode = (relayInfo.wifiRelayType as WifiRelayMode) || null;
    const upstreamSsid = relayInfo.wifiRelaySSID || relayInfo.upperWifiSsid || null;
    const extenderSsid = relayInfo.extenderSsid || null;

    return {
      address,
      httpAvailable,
      httpsAvailable,
      isTenda: true,
      model: 'Tenda F3',
      firmware: firmware || 'V12.01.01.xx',
      hardwareVersion,
      requiresUsername,
      hasLoginPassword,
      operatingMode,
      upstreamSsid,
      extenderSsid,
      nonTendaVendorHint: null,
    };
  }

  public inferF3HardwareVersion(
    firmware: string | null,
    macroText: string,
    html: string
  ): F3HardwareVersion {
    const combined = `${firmware || ''} ${macroText} ${html}`;
    if (/F3\s*v5|V12\.01\.01\.5\d|HW_VER.*5\.0/i.test(combined)) {
      return 'F3 v5.0';
    }
    if (/F3\s*v4|V12\.01\.01\.4[5-9]|HW_VER.*4\.0/i.test(combined)) {
      return 'F3 v4.0';
    }
    if (/F3\s*v2|V11\.|V5\.07|HW_VER.*2\.0/i.test(combined)) {
      return 'F3 v2.0';
    }
    if (/V12\.01\.01/i.test(combined) || /F3\s*v3/i.test(combined)) {
      return 'F3 v3.0';
    }
    return 'F3 v3.0';
  }

  public mapHardwareToAdapterName(hw: F3HardwareVersion): string {
    switch (hw) {
      case 'F3 v2.0':
        return 'F3V2Adapter';
      case 'F3 v3.0':
        return 'F3V3Adapter';
      case 'F3 v4.0':
        return 'F3V4Adapter';
      case 'F3 v5.0':
        return 'F3V5Adapter';
      default:
        return 'F3V3Adapter';
    }
  }

  private detectOtherVendor(html: string, headers: string): string {
    const text = `${html} ${headers}`;
    if (/IsMaintWan|LoadFrame|Huawei|EchoLife|HG8/i.test(text)) {
      return 'Huawei Optical Network Terminal (ONT) / Gateway';
    }
    if (/tp-link|tplink/i.test(text)) {
      return 'TP-Link Router';
    }
    if (/mikrotik|routeros/i.test(text)) {
      return 'MikroTik RouterOS';
    }
    if (/netgear/i.test(text)) {
      return 'Netgear Router';
    }
    if (/d-link/i.test(text)) {
      return 'D-Link Router';
    }
    if (/asuswrt|asus/i.test(text)) {
      return 'ASUS Router';
    }
    if (/zxhn|zte/i.test(text)) {
      return 'ZTE Gateway';
    }
    return 'Non-Tenda Network Gateway';
  }
}

export const routerDiscovery = new RouterDiscovery();
