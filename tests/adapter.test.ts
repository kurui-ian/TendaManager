import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TendaF3SimulatorServer } from '../src-main/router/simulatorServer';
import { AdapterFactory } from '../src-main/router/adapterFactory';
import { F3V2Adapter } from '../src-main/router/f3v2Adapter';
import { F3V3Adapter } from '../src-main/router/f3v3Adapter';
import { F3V4Adapter } from '../src-main/router/f3v4Adapter';
import { F3V5Adapter } from '../src-main/router/f3v5Adapter';

describe('Tenda F3 Router Adapters (v2, v3, v4, v5) Integration Suite', () => {
  const simulator = new TendaF3SimulatorServer();
  let simUrl = '';

  beforeAll(async () => {
    simUrl = await simulator.start(0);
    simulator.setAdminPassword('TendaAdmin2026');
  });

  afterAll(async () => {
    await simulator.stop();
  });

  it('selects the correct hardware version adapter via AdapterFactory', () => {
    expect(AdapterFactory.createAdapter('F3 v2.0')).toBeInstanceOf(F3V2Adapter);
    expect(AdapterFactory.createAdapter('F3 v3.0')).toBeInstanceOf(F3V3Adapter);
    expect(AdapterFactory.createAdapter('F3 v4.0')).toBeInstanceOf(F3V4Adapter);
    expect(AdapterFactory.createAdapter('F3 v5.0')).toBeInstanceOf(F3V5Adapter);
  });

  it('rejects invalid administrator passwords cleanly', async () => {
    const adapter = AdapterFactory.createAdapter('F3 v3.0');
    const connected = await adapter.connect(simUrl);
    expect(connected).toBe(true);

    const authOk = await adapter.authenticate({
      routerAddress: simUrl,
      password: 'WrongPassword123',
    });
    expect(authOk).toBe(false);
    expect(adapter.isAuthenticated()).toBe(false);
  });

  it('authenticates with F3V3Adapter (Base64) and F3V4Adapter (MD5) and retrieves router & WAN status', async () => {
    const v3 = AdapterFactory.createAdapter('F3 v3.0');
    expect(
      await v3.authenticate({
        routerAddress: simUrl,
        password: 'TendaAdmin2026',
      })
    ).toBe(true);

    const info = await v3.getRouterInfo();
    expect(info.model).toBe('Tenda F3');
    expect(info.firmwareVersion).toContain('V12.01.01');
    expect(info.online).toBe(true);

    const net = await v3.getNetworkStatus();
    expect(net.internetConnected).toBe(true);
    expect(net.wanIp).toBe('105.163.42.198');
    expect(net.connectionType).toBe('Dynamic IP (DHCP)');

    // Also test F3V4Adapter which negotiates MD5 auth
    const v4 = AdapterFactory.createAdapter('F3 v4.0');
    expect(
      await v4.authenticate({
        routerAddress: simUrl,
        password: 'TendaAdmin2026',
      })
    ).toBe(true);
  });

  it('automatically renews expired router session when querying endpoints', async () => {
    const adapter = AdapterFactory.createAdapter('F3 v5.0');
    await adapter.authenticate({
      routerAddress: simUrl,
      password: 'TendaAdmin2026',
    });

    // Force session expiration on the router
    simulator.expireSession();

    // Subsequent call should detect 302 redirect to /login.html, re-authenticate automatically, and succeed
    const info = await adapter.getRouterInfo();
    expect(info.model).toBe('Tenda F3');
    expect(adapter.isAuthenticated()).toBe(true);
  });

  it('manages connected devices, MAC blocking/unblocking, and per-device bandwidth QoS limits', async () => {
    const adapter = AdapterFactory.createAdapter('F3 v3.0');
    await adapter.authenticate({
      routerAddress: simUrl,
      password: 'TendaAdmin2026',
    });

    const initialDevices = await adapter.getConnectedDevices();
    expect(initialDevices.length).toBeGreaterThanOrEqual(4);

    const targetMac = 'A4:77:33:89:10:B2';
    // Apply bandwidth limit (Download 2048 KB/s, Upload 512 KB/s)
    const bwSuccess = await adapter.setBandwidthRule({
      macAddress: targetMac,
      hostname: 'Galaxy-A25',
      downloadLimitKbps: 2048,
      uploadLimitKbps: 512,
    });
    expect(bwSuccess).toBe(true);

    const updatedDevices = await adapter.getConnectedDevices();
    const targetDevice = updatedDevices.find((d) => d.macAddress === targetMac);
    expect(targetDevice?.downloadLimitKbps).toBe(2048);
    expect(targetDevice?.uploadLimitKbps).toBe(512);

    // Block the device via MAC filter
    const blockOk = await adapter.blockDevice(targetMac, 'Galaxy-A25');
    expect(blockOk).toBe(true);

    const blockedList = await adapter.getBlockedDevices();
    expect(blockedList.some((b) => b.macAddress === targetMac)).toBe(true);

    // Unblock the device
    const unblockOk = await adapter.unblockDevice(targetMac);
    expect(unblockOk).toBe(true);

    const blockedAfter = await adapter.getBlockedDevices();
    expect(blockedAfter.some((b) => b.macAddress === targetMac)).toBe(false);
  });

  it('reads and updates Wi-Fi SSID, security mode, password, and hidden SSID', async () => {
    const adapter = AdapterFactory.createAdapter('F3 v3.0');
    await adapter.authenticate({
      routerAddress: simUrl,
      password: 'TendaAdmin2026',
    });

    const initialWifi = await adapter.getWifiSettings();
    expect(initialWifi.ssid).toBe('Tenda_F3_Home');

    const saveOk = await adapter.updateWifiSettings({
      enabled: true,
      ssid: 'Tenda_F3_Office',
      securityMode: 'WPA2-PSK',
      password: 'NewSecurePassword99!',
      hideSsid: true,
    });
    expect(saveOk).toBe(true);

    const updatedWifi = await adapter.getWifiSettings();
    expect(updatedWifi.ssid).toBe('Tenda_F3_Office');
    expect(updatedWifi.securityMode).toBe('WPA2-PSK');
    expect(updatedWifi.password).toBe('NewSecurePassword99!');
    expect(updatedWifi.hideSsid).toBe(true);
  });

  it('executes router diagnostics and reboot command', async () => {
    const adapter = AdapterFactory.createAdapter('F3 v3.0');
    await adapter.authenticate({
      routerAddress: simUrl,
      password: 'TendaAdmin2026',
    });

    const diag = await adapter.runDiagnostics();
    expect(diag.length).toBeGreaterThanOrEqual(4);
    expect(diag.every((s) => s.status === 'pass')).toBe(true);

    const rebootOk = await adapter.restartRouter();
    expect(rebootOk).toBe(true);
  });
});
