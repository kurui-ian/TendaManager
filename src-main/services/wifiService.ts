import { WifiSettings } from '../router/types';
import { authenticationService } from './authenticationService';
import { logger } from '../logger/logger';

export class WifiService {
  private requireAdapter() {
    const adapter = authenticationService.getActiveAdapter();
    if (!adapter || !adapter.isAuthenticated()) {
      throw new Error('Not authenticated with a Tenda F3 router.');
    }
    return adapter;
  }

  public validateWifiSettings(settings: WifiSettings): { valid: boolean; error?: string } {
    const ssid = (settings.ssid || '').trim();
    if (!ssid) {
      return { valid: false, error: 'Wi-Fi Network Name (SSID) cannot be empty.' };
    }

    const byteLength = Buffer.byteLength(ssid, 'utf8');
    if (byteLength > 32) {
      return { valid: false, error: 'Wi-Fi Network Name (SSID) cannot exceed 32 bytes.' };
    }

    if (/[\r\n\t]/.test(ssid)) {
      return { valid: false, error: 'SSID contains invalid control characters.' };
    }

    if (settings.securityMode !== 'None') {
      const pwd = settings.password || '';
      if (pwd.length < 8) {
        return { valid: false, error: 'Wi-Fi password must be at least 8 characters long.' };
      }
      if (pwd.length > 63) {
        const is64Hex = pwd.length === 64 && /^[0-9A-Fa-f]{64}$/.test(pwd);
        if (!is64Hex) {
          return { valid: false, error: 'Wi-Fi password must be between 8 and 63 ASCII characters.' };
        }
      }
      if (!/^[\x20-\x7E]+$/.test(pwd)) {
        return { valid: false, error: 'Wi-Fi password must contain only printable ASCII characters.' };
      }
    }

    return { valid: true };
  }

  public async getWifiSettings(): Promise<WifiSettings> {
    const adapter = this.requireAdapter();
    return adapter.getWifiSettings();
  }

  public async updateWifiSettings(settings: WifiSettings): Promise<boolean> {
    const adapter = this.requireAdapter();
    const check = this.validateWifiSettings(settings);
    if (!check.valid) {
      throw new Error(check.error);
    }

    logger.info('WifiService', `Applying Wi-Fi settings update for SSID "${settings.ssid}"`);
    return adapter.updateWifiSettings(settings);
  }
}

export const wifiService = new WifiService();
