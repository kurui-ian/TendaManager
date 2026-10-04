import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NetworkInterfaceInfo } from '../router/types';
import { logger } from '../logger/logger';

const execFileAsync = promisify(execFile);

/**
 * Inspects OS network interfaces and Windows routing/wireless state to determine
 * the active local IPv4 address, subnet mask, default gateway, DNS servers, and SSID.
 */
export class NetworkInspector {
  public async getActiveNetworkInterface(): Promise<NetworkInterfaceInfo | null> {
    const interfaces = os.networkInterfaces();
    const candidates: Array<{
      name: string;
      address: string;
      netmask: string;
      mac: string;
    }> = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      // Skip virtual/loopback adapters where possible
      if (/loopback|vmware|vbox|virtualbox|vethernet|wsl|docker|hyper-v/i.test(name)) {
        continue;
      }
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
          candidates.push({
            name,
            address: addr.address,
            netmask: addr.netmask,
            mac: addr.mac ? addr.mac.toUpperCase() : '00:00:00:00:00:00',
          });
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Prefer Wi-Fi or Ethernet interface
    candidates.sort((a, b) => {
      const aScore = /wi-fi|wlan|wireless/i.test(a.name) ? 2 : /ethernet|eth/i.test(a.name) ? 1 : 0;
      const bScore = /wi-fi|wlan|wireless/i.test(b.name) ? 2 : /ethernet|eth/i.test(b.name) ? 1 : 0;
      return bScore - aScore;
    });

    const primary = candidates[0];
    const winDetails = await this.parseWindowsNetworkDetails(primary.address);
    const wlanSsid = await this.getConnectedWifiSsid();

    const connectionType: 'Wi-Fi' | 'Ethernet' | 'Unknown' =
      /wi-fi|wlan|wireless/i.test(primary.name) || Boolean(wlanSsid)
        ? 'Wi-Fi'
        : /ethernet|eth|lan/i.test(primary.name)
        ? 'Ethernet'
        : 'Unknown';

    const fallbackGateway = this.deriveSubnetGateway(primary.address);

    return {
      interfaceName: primary.name,
      localIp: primary.address,
      subnetMask: primary.netmask || '255.255.255.0',
      defaultGateway: winDetails.gateway || fallbackGateway,
      macAddress: primary.mac,
      dnsServers: winDetails.dnsServers.length > 0 ? winDetails.dnsServers : [winDetails.gateway || fallbackGateway],
      connectionType,
      ssid: wlanSsid || undefined,
    };
  }

  public deriveSubnetGateway(localIp: string): string {
    const parts = localIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    }
    return '192.168.0.1';
  }

  private async parseWindowsNetworkDetails(
    targetLocalIp: string
  ): Promise<{ gateway: string | null; dnsServers: string[] }> {
    if (process.platform !== 'win32') {
      return { gateway: null, dnsServers: [] };
    }

    try {
      const { stdout } = await execFileAsync('ipconfig', ['/all'], { timeout: 4000 });
      const blocks = stdout.split(/\r?\n\r?\n/);
      let matchedGateway: string | null = null;
      const dnsServers: string[] = [];

      // Look through adapter sections for the one containing targetLocalIp
      let currentBlockText = '';
      for (const line of stdout.split(/\r?\n/)) {
        if (/^[A-Za-z0-9].*adapter /i.test(line)) {
          if (currentBlockText.includes(targetLocalIp)) {
            break;
          }
          currentBlockText = line + '\n';
        } else {
          currentBlockText += line + '\n';
        }
      }

      const relevantText = currentBlockText.includes(targetLocalIp) ? currentBlockText : blocks.join('\n');
      const lines = relevantText.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Default Gateway/i.test(line)) {
          const ipMatch = line.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
          if (ipMatch) {
            matchedGateway = ipMatch[1];
          } else if (i + 1 < lines.length) {
            const nextMatch = lines[i + 1].match(/(\d{1,3}(?:\.\d{1,3}){3})/);
            if (nextMatch) matchedGateway = nextMatch[1];
          }
        }
        if (/DNS Servers/i.test(line)) {
          const ipMatch = line.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
          if (ipMatch) dnsServers.push(ipMatch[1]);
          if (i + 1 < lines.length) {
            const nextMatch = lines[i + 1].match(/^\s+(\d{1,3}(?:\.\d{1,3}){3})/);
            if (nextMatch) dnsServers.push(nextMatch[1]);
          }
        }
      }

      return { gateway: matchedGateway, dnsServers };
    } catch (err) {
      logger.debug('NetworkInspector', 'ipconfig inspection failed, using subnet fallback', err);
      return { gateway: null, dnsServers: [] };
    }
  }

  private async getConnectedWifiSsid(): Promise<string | null> {
    if (process.platform !== 'win32') return null;
    try {
      const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'interfaces'], { timeout: 3000 });
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (/^\s*SSID\s*:/i.test(line) && !/BSSID/i.test(line)) {
          const idx = line.indexOf(':');
          if (idx > -1) {
            const ssid = line.slice(idx + 1).trim();
            if (ssid) return ssid;
          }
        }
      }
    } catch {
      // Ignore if wireless service is not running
    }
    return null;
  }
}

export const networkInspector = new NetworkInspector();
