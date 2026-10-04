import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { maskIpAddress, sanitizeLogString } from '../src-main/logger/logger';
import { AppStorage } from '../src-main/storage/appStorage';
import { CredentialStore } from '../src-main/storage/credentialStore';
import { WifiService } from '../src-main/services/wifiService';
import { DeviceService } from '../src-main/services/deviceService';

describe('Security, Credential Vault, Storage & Service Validation Suite', () => {
  const tempDirs: string[] = [];

  const createTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tendamanager-test-'));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const d of tempDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
    tempDirs.length = 0;
  });

  it('redacts passwords, Wi-Fi keys, and session cookies in log strings and masks WAN IPs', () => {
    const raw =
      'POST /login/Auth password=SuperSecretAdmin123&wifiPwd=MyHomeWifi999 Cookie: ecos_pw=U3VwZXJTZWNyZXQ=';
    const sanitized = sanitizeLogString(raw);
    expect(sanitized).not.toContain('SuperSecretAdmin123');
    expect(sanitized).not.toContain('MyHomeWifi999');
    expect(sanitized).not.toContain('U3VwZXJTZWNyZXQ=');
    expect(sanitized).toContain('[REDACTED]');

    expect(maskIpAddress('105.163.42.198')).toBe('105.163.xxx.xxx');
  });

  it('encrypts router credentials on disk and never stores plaintext passwords', () => {
    const dir = createTempDir();
    const store = new CredentialStore(dir);

    store.saveCredentials('192.168.0.1', 'MyTopSecretRouterPass!2026', 'admin');
    expect(store.hasSavedCredentials('192.168.0.1')).toBe(true);

    // Inspect raw vault file on disk to verify plaintext password is never present
    const vaultFile = path.join(dir, 'credentials.vault.json');
    const rawDiskContent = fs.readFileSync(vaultFile, 'utf8');
    expect(rawDiskContent).not.toContain('MyTopSecretRouterPass!2026');

    const loaded = store.getCredentials('192.168.0.1');
    expect(loaded).toEqual({
      username: 'admin',
      password: 'MyTopSecretRouterPass!2026',
    });

    store.clearCredentials('192.168.0.1');
    expect(store.hasSavedCredentials('192.168.0.1')).toBe(false);
  });

  it('persists custom friendly device names and speed test history in AppStorage', () => {
    const dir = createTempDir();
    const storage = new AppStorage(dir);

    storage.setDeviceCustomName('a4-77-33-89-10-b2', "Ian's Galaxy A25");
    expect(storage.getDeviceCustomName('A4:77:33:89:10:B2')).toBe("Ian's Galaxy A25");

    storage.addSpeedTestRecord({
      id: 'test-1',
      timestamp: new Date().toISOString(),
      pingMs: 18,
      jitterMs: 2,
      downloadMbps: 42.5,
      uploadMbps: 19.8,
      routerIp: '192.168.0.1',
      serverName: 'Cloudflare',
    });

    expect(storage.getSpeedTestHistory()).toHaveLength(1);
    storage.clearSpeedTestHistory();
    expect(storage.getSpeedTestHistory()).toHaveLength(0);
  });

  it('validates Wi-Fi SSID and WPA/WPA2 password constraints accurately', () => {
    const wifiSvc = new WifiService();

    expect(
      wifiSvc.validateWifiSettings({
        enabled: true,
        ssid: '',
        securityMode: 'WPA2-PSK',
        password: 'ValidPassword123',
        hideSsid: false,
      }).valid
    ).toBe(false);

    expect(
      wifiSvc.validateWifiSettings({
        enabled: true,
        ssid: 'MyTendaWiFi',
        securityMode: 'WPA/WPA2-PSK',
        password: 'short',
        hideSsid: false,
      }).valid
    ).toBe(false);

    expect(
      wifiSvc.validateWifiSettings({
        enabled: true,
        ssid: 'MyTendaWiFi',
        securityMode: 'WPA/WPA2-PSK',
        password: 'StrongPassword2026!',
        hideSsid: false,
      }).valid
    ).toBe(true);
  });

  it('validates per-device bandwidth QoS limits accurately', () => {
    const devSvc = new DeviceService();
    expect(devSvc.validateBandwidthLimitKbps(0).valid).toBe(true);
    expect(devSvc.validateBandwidthLimitKbps(1024).valid).toBe(true);
    expect(devSvc.validateBandwidthLimitKbps(-5).valid).toBe(false);
    expect(devSvc.validateBandwidthLimitKbps(99999).valid).toBe(false);
  });
});
