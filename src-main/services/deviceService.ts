import { BandwidthRule, RouterDevice } from '../router/types';
import { authenticationService } from './authenticationService';
import { appStorage, normalizeMac } from '../storage/appStorage';
import { logger } from '../logger/logger';

export class DeviceService {
  private seenOnlineMacs: Set<string> = new Set();
  private initialFetchCompleted = false;

  private requireAdapter() {
    const adapter = authenticationService.getActiveAdapter();
    if (!adapter || !adapter.isAuthenticated()) {
      throw new Error('Not authenticated with a Tenda F3 router.');
    }
    return adapter;
  }

  /**
   * Fetches connected (online) devices, blocked (blacklist) devices, and merges them
   * with locally stored friendly device names and previously seen offline devices.
   */
  public async getAllDevices(): Promise<{
    devices: RouterDevice[];
    newlyConnected: RouterDevice[];
  }> {
    const adapter = this.requireAdapter();
    const [onlineDevices, blockedDevices] = await Promise.all([
      adapter.getConnectedDevices(),
      adapter.getBlockedDevices(),
    ]);

    const customNames = appStorage.getAllDeviceNames();
    const knownSnapshot = appStorage.getKnownDevices();
    const mergedMap = new Map<string, RouterDevice>();
    const newlyConnected: RouterDevice[] = [];

    for (const dev of onlineDevices) {
      const mac = normalizeMac(dev.macAddress);
      const enriched: RouterDevice = {
        ...dev,
        id: mac,
        macAddress: mac,
        customName: customNames[mac] || dev.remark || undefined,
      };
      mergedMap.set(mac, enriched);

      if (this.initialFetchCompleted && !this.seenOnlineMacs.has(mac)) {
        newlyConnected.push(enriched);
      }
      this.seenOnlineMacs.add(mac);
    }

    for (const bDev of blockedDevices) {
      const mac = normalizeMac(bDev.macAddress);
      const prev = knownSnapshot[mac];
      const existing = mergedMap.get(mac);
      if (existing) {
        existing.blocked = true;
      } else {
        mergedMap.set(mac, {
          ...bDev,
          id: mac,
          macAddress: mac,
          ipAddress: prev?.ipAddress || bDev.ipAddress || '—',
          hostname:
            bDev.hostname && bDev.hostname !== 'Blocked Device'
              ? bDev.hostname
              : prev?.hostname || 'Blocked Device',
          customName: customNames[mac] || bDev.remark || prev?.customName || undefined,
          online: false,
          blocked: true,
        });
      }
    }

    // Include previously seen devices that are currently offline and not blocked
    for (const [mac, known] of Object.entries(knownSnapshot)) {
      if (!mergedMap.has(mac)) {
        mergedMap.set(mac, {
          ...known,
          id: mac,
          macAddress: mac,
          customName: customNames[mac] || known.customName,
          online: false,
          downloadSpeedKbps: 0,
          uploadSpeedKbps: 0,
        });
      }
    }

    this.initialFetchCompleted = true;
    const allList = Array.from(mergedMap.values());
    appStorage.recordDevicesSnapshot(allList);

    return {
      devices: allList,
      newlyConnected,
    };
  }

  public renameDevice(macAddress: string, customName: string): void {
    const cleanMac = normalizeMac(macAddress);
    const sanitizedName = customName.trim().slice(0, 48);
    appStorage.setDeviceCustomName(cleanMac, sanitizedName);
    logger.info('DeviceService', `Updated local friendly name for ${cleanMac} -> "${sanitizedName || '(cleared)'}"`);
  }

  public async blockDevice(macAddress: string, hostname?: string): Promise<boolean> {
    const adapter = this.requireAdapter();
    const cleanMac = normalizeMac(macAddress);
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(cleanMac)) {
      throw new Error(`Invalid MAC address format: ${macAddress}`);
    }
    const ok = await adapter.blockDevice(cleanMac, hostname);
    if (ok) {
      this.seenOnlineMacs.delete(cleanMac);
    }
    return ok;
  }

  public async unblockDevice(macAddress: string): Promise<boolean> {
    const adapter = this.requireAdapter();
    const cleanMac = normalizeMac(macAddress);
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(cleanMac)) {
      throw new Error(`Invalid MAC address format: ${macAddress}`);
    }
    return adapter.unblockDevice(cleanMac);
  }

  public validateBandwidthLimitKbps(limitKbps: number): { valid: boolean; error?: string } {
    if (!Number.isFinite(limitKbps) || limitKbps < 0) {
      return { valid: false, error: 'Bandwidth limit must be 0 (Unlimited) or a positive number.' };
    }
    if (limitKbps > 38528) {
      return { valid: false, error: 'Bandwidth limit cannot exceed 300 Mbps (38,400 KB/s) on Tenda F3.' };
    }
    return { valid: true };
  }

  public async setBandwidthRule(rule: BandwidthRule): Promise<boolean> {
    const adapter = this.requireAdapter();
    const downCheck = this.validateBandwidthLimitKbps(rule.downloadLimitKbps);
    if (!downCheck.valid) {
      throw new Error(downCheck.error);
    }
    const upCheck = this.validateBandwidthLimitKbps(rule.uploadLimitKbps);
    if (!upCheck.valid) {
      throw new Error(upCheck.error);
    }

    return adapter.setBandwidthRule({
      ...rule,
      macAddress: normalizeMac(rule.macAddress),
    });
  }
}

export const deviceService = new DeviceService();
