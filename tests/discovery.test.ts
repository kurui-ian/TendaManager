import http from 'http';
import { describe, expect, it } from 'vitest';
import { RouterDiscovery } from '../src-main/network/routerDiscovery';
import { NetworkInspector } from '../src-main/network/networkInspector';
import { TendaF3SimulatorServer } from '../src-main/router/simulatorServer';

describe('NetworkInspector & RouterDiscovery Suite', () => {
  const discovery = new RouterDiscovery();
  const inspector = new NetworkInspector();

  it('derives subnet gateway accurately and inspects OS network interface', async () => {
    expect(inspector.deriveSubnetGateway('192.168.0.105')).toBe('192.168.0.1');
    expect(inspector.deriveSubnetGateway('10.0.0.42')).toBe('10.0.0.1');

    const activeNet = await inspector.getActiveNetworkInterface();
    if (activeNet) {
      expect(activeNet.localIp).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(activeNet.defaultGateway).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
  });

  it('infers F3 hardware versions (v2.0, v3.0, v4.0, v5.0) accurately from firmware/macro signatures', () => {
    expect(discovery.inferF3HardwareVersion('V11.01.01.12', '', '')).toBe('F3 v2.0');
    expect(discovery.inferF3HardwareVersion('V12.01.01.38_en', 'CONFIG_HW_VER="V3.0"', '')).toBe('F3 v3.0');
    expect(discovery.inferF3HardwareVersion('V12.01.01.48', 'CONFIG_HW_VER="4.0"', '')).toBe('F3 v4.0');
    expect(discovery.inferF3HardwareVersion('V12.01.01.52_multi', 'F3 v5.0', '')).toBe('F3 v5.0');
  });

  it('identifies a real Tenda F3 endpoint vs. a non-Tenda Huawei ONT gateway', async () => {
    const sim = new TendaF3SimulatorServer();
    const simUrl = await sim.start(0);

    // 1. Probe Tenda F3
    const tendaProbe = await discovery.probeAddress(simUrl);
    expect(tendaProbe.httpAvailable).toBe(true);
    expect(tendaProbe.isTenda).toBe(true);
    expect(tendaProbe.model).toBe('Tenda F3');
    expect(tendaProbe.firmware).toBe('V12.01.01.48_en');
    await sim.stop();

    // 2. Create a mock Huawei ONT HTTP server and verify non-Tenda detection
    const huaweiServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<script>var IsMaintWan = '0'; function LoadFrame() {}</script>`);
    });

    const huaweiUrl = await new Promise<string>((resolve) => {
      huaweiServer.listen(0, '127.0.0.1', () => {
        const addr = huaweiServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    const nonTendaProbe = await discovery.probeAddress(huaweiUrl);
    expect(nonTendaProbe.httpAvailable).toBe(true);
    expect(nonTendaProbe.isTenda).toBe(false);
    expect(nonTendaProbe.nonTendaVendorHint).toContain('Huawei');

    await new Promise<void>((resolve) => huaweiServer.close(() => resolve()));
  });
});
