import { WifiRelayConfig, WifiRelayMode, WifiScanNetwork, WifiSettings } from '../router/types';
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

  public validateWifiRelayInput(config: {
    mode: WifiRelayMode;
    upstreamSsid?: string;
    upstreamSecurityMode?: string;
    upstreamPassword?: string;
  }): { valid: boolean; error?: string } {
    if (config.mode === 'disabled' || config.mode === 'ap') {
      return { valid: true };
    }

    const ssid = (config.upstreamSsid || '').trim();
    if (!ssid) {
      return {
        valid: false,
        error: 'Please select or enter an upstream base station Wi-Fi network (SSID) to repeat.',
      };
    }

    const sec = (config.upstreamSecurityMode || 'wpa2/aes').toLowerCase();
    if (sec !== 'none' && sec !== 'open') {
      const pwd = config.upstreamPassword || '';
      if (!(/^[0-9a-fA-F]{8,64}$/.test(pwd) || /^[\x20-\x7E]{8,63}$/.test(pwd))) {
        return {
          valid: false,
          error: 'The password of the base station router must contain 8–63 ASCII characters or 64 HEX characters.',
        };
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

  public async getWifiRelayConfig(): Promise<WifiRelayConfig> {
    const adapter = this.requireAdapter();
    return adapter.getWifiRelayConfig();
  }

  public async scanWifiNetworks(): Promise<WifiScanNetwork[]> {
    const adapter = this.requireAdapter();
    logger.info('WifiService', 'Scanning nearby Wi-Fi base stations for Wireless Repeating (/goform/getWifiRelay?modules=wifiScan)');
    return adapter.scanWifiNetworks();
  }

  public async setWifiRelayConfig(config: {
    mode: WifiRelayMode;
    upstreamSsid?: string;
    upstreamMac?: string;
    upstreamChannel?: string;
    upstreamSecurityMode?: string;
    upstreamPassword?: string;
  }): Promise<boolean> {
    const adapter = this.requireAdapter();
    const check = this.validateWifiRelayInput(config);
    if (!check.valid) {
      throw new Error(check.error);
    }

    logger.info('WifiService', `Applying Wireless Repeating mode: ${config.mode}`);
    return adapter.setWifiRelayConfig(config);
  }
}

export const wifiService = new WifiService();
