import os from 'os';
import { DiagnosticReport, DiagnosticStepResult, RouterInfo } from '../router/types';
import { networkInspector } from '../network/networkInspector';
import { routerDiscovery } from '../network/routerDiscovery';
import { authenticationService } from './authenticationService';
import { appStorage } from '../storage/appStorage';
import { tendaSimulator } from '../router/simulatorServer';
import { logger, maskIpAddress } from '../logger/logger';

export class DiagnosticService {
  public async runFullDiagnostics(): Promise<DiagnosticStepResult[]> {
    const steps: DiagnosticStepResult[] = [];

    // Step 1: Local Network Connected
    const tNet = Date.now();
    const netInterface = await networkInspector.getActiveNetworkInterface();
    if (netInterface) {
      steps.push({
        id: 'local-network',
        label: 'Local Network Connected',
        status: 'pass',
        detail: `${netInterface.interfaceName} (${netInterface.connectionType}) — Local IP: ${netInterface.localIp}, Mask: ${netInterface.subnetMask}`,
        durationMs: Date.now() - tNet,
      });
    } else {
      steps.push({
        id: 'local-network',
        label: 'Local Network Connected',
        status: 'fail',
        detail: 'No active IPv4 network adapter detected.',
        durationMs: Date.now() - tNet,
      });
    }

    // Step 2: Default Gateway Found
    const session = authenticationService.getSession();
    const settings = appStorage.getSettings();
    const targetGateway =
      session?.routerAddress ||
      (tendaSimulator.isRunning() ? tendaSimulator.getUrl() : '') ||
      netInterface?.defaultGateway ||
      settings.lastRouterAddress ||
      '192.168.0.1';

    steps.push({
      id: 'default-gateway',
      label: 'Default Gateway Found',
      status: targetGateway ? 'pass' : 'fail',
      detail: targetGateway
        ? `Target Gateway: ${targetGateway}${
            netInterface?.defaultGateway && netInterface.defaultGateway !== targetGateway
              ? ` (OS Default Gateway: ${netInterface.defaultGateway})`
              : ''
          }`
        : 'No default gateway found.',
      durationMs: 2,
    });

    // Step 3: Router HTTP Reachable & Step 4: Tenda Router Detected
    const tProbe = Date.now();
    const probe = await routerDiscovery.probeAddress(targetGateway);
    const probeDuration = Date.now() - tProbe;

    steps.push({
      id: 'router-http',
      label: 'Router HTTP Reachable',
      status: probe.httpAvailable || probe.httpsAvailable ? 'pass' : 'fail',
      detail:
        probe.httpAvailable || probe.httpsAvailable
          ? `Management interface responded at ${targetGateway}`
          : `No HTTP/HTTPS response from ${targetGateway}`,
      durationMs: probeDuration,
    });

    steps.push({
      id: 'tenda-detected',
      label: 'Tenda Router Detected',
      status: probe.isTenda ? 'pass' : probe.httpAvailable ? 'warn' : 'fail',
      detail: probe.isTenda
        ? `Detected ${probe.model || 'Tenda F3'} (${probe.hardwareVersion || 'F3'}, Firmware: ${
            probe.firmware || 'V12.01.01.xx'
          })`
        : probe.nonTendaVendorHint
        ? `Gateway responded as ${probe.nonTendaVendorHint} (not a Tenda F3)`
        : 'Could not verify Tenda F3 signature',
      durationMs: 5,
    });

    // Step 5, 6, 7: Adapter-level checks (Authentication, Device List, Wi-Fi Endpoint)
    const activeAdapter = authenticationService.getActiveAdapter();
    if (activeAdapter && activeAdapter.isAuthenticated()) {
      const adapterSteps = await activeAdapter.runDiagnostics();
      for (const s of adapterSteps) {
        if (s.id !== 'http-reachability') {
          steps.push(s);
        }
      }
    } else {
      steps.push({
        id: 'auth-session',
        label: 'Authentication Valid',
        status: 'warn',
        detail: 'Not currently logged in to router session.',
        durationMs: 0,
      });
      steps.push({
        id: 'device-endpoint',
        label: 'Device & QoS Endpoint (/goform/getQos)',
        status: 'warn',
        detail: 'Skipped (requires active authenticated session).',
        durationMs: 0,
      });
      steps.push({
        id: 'wifi-endpoint',
        label: 'Wi-Fi Endpoint (/goform/getWifi)',
        status: 'warn',
        detail: 'Skipped (requires active authenticated session).',
        durationMs: 0,
      });
    }

    return steps;
  }

  public async buildSanitizedDiagnosticReport(): Promise<DiagnosticReport> {
    const netInterface = await networkInspector.getActiveNetworkInterface();
    const steps = await this.runFullDiagnostics();
    let routerInfo: Partial<RouterInfo> | null = null;

    const adapter = authenticationService.getActiveAdapter();
    if (adapter && adapter.isAuthenticated()) {
      try {
        const info = await adapter.getRouterInfo();
        routerInfo = {
          model: info.model,
          hardwareVersion: info.hardwareVersion,
          firmwareVersion: info.firmwareVersion,
          adapterName: info.adapterName,
          routerIp: info.routerIp,
          macAddress: info.macAddress ? `${info.macAddress.slice(0, 8)}:XX:XX:XX` : 'XX:XX:XX:XX:XX:XX',
          uptimeSeconds: info.uptimeSeconds,
          online: info.online,
          capabilities: info.capabilities,
        };
      } catch {
        routerInfo = null;
      }
    }

    const sanitizedInterface = netInterface
      ? {
          ...netInterface,
          macAddress: netInterface.macAddress
            ? `${netInterface.macAddress.slice(0, 8)}:XX:XX:XX`
            : 'XX:XX:XX:XX:XX:XX',
          dnsServers: netInterface.dnsServers.map((d) =>
            d.startsWith('192.168.') || d === '8.8.8.8' || d === '1.1.1.1' ? d : maskIpAddress(d)
          ),
        }
      : null;

    return {
      generatedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      osPlatform: os.platform(),
      osRelease: os.release(),
      networkInterface: sanitizedInterface,
      steps,
      routerInfo,
      recentLogs: logger.getFormattedLogs(120),
    };
  }
}

export const diagnosticService = new DiagnosticService();
