import {
  AuthCredentials,
  AuthSession,
  DiscoveryResult,
  F3HardwareVersion,
} from '../router/types';
import { TendaF3BaseAdapter } from '../router/tendaF3BaseAdapter';
import { AdapterFactory } from '../router/adapterFactory';
import { routerDiscovery } from '../network/routerDiscovery';
import { credentialStore } from '../storage/credentialStore';
import { appStorage } from '../storage/appStorage';
import { tendaSimulator } from '../router/simulatorServer';
import { logger } from '../logger/logger';

export class AuthenticationService {
  private activeAdapter: TendaF3BaseAdapter | null = null;
  private currentSession: AuthSession | null = null;

  public getActiveAdapter(): TendaF3BaseAdapter | null {
    return this.activeAdapter;
  }

  public getSession(): AuthSession | null {
    if (!this.activeAdapter || !this.activeAdapter.isAuthenticated()) {
      return null;
    }
    return this.currentSession;
  }

  public async discoverRouter(customAddress?: string): Promise<DiscoveryResult> {
    const settings = appStorage.getSettings();
    let simInfo: { active: boolean; url: string } | undefined;

    if (settings.enableSimulatorMode || tendaSimulator.isRunning()) {
      const url = await tendaSimulator.start();
      simInfo = { active: true, url };
    }

    return routerDiscovery.discover(customAddress, simInfo);
  }

  public async setSimulatorMode(enabled: boolean): Promise<DiscoveryResult> {
    appStorage.updateSettings({ enableSimulatorMode: enabled });
    if (enabled) {
      const url = await tendaSimulator.start();
      return routerDiscovery.discover(url, { active: true, url });
    } else {
      await this.logout();
      await tendaSimulator.stop();
      return routerDiscovery.discover();
    }
  }

  public async login(credentials: AuthCredentials): Promise<{
    success: boolean;
    session: AuthSession | null;
    errorMessage?: string;
  }> {
    let targetAddress = credentials.routerAddress.trim();

    if (credentials.useSimulator) {
      targetAddress = await tendaSimulator.start();
      appStorage.updateSettings({ enableSimulatorMode: true });
    }

    if (!targetAddress) {
      return {
        success: false,
        session: null,
        errorMessage: 'Please enter a valid router IP address or gateway (e.g. 192.168.0.1).',
      };
    }

    const probe = await routerDiscovery.probeAddress(targetAddress);
    if (!probe.httpAvailable && !probe.httpsAvailable) {
      return {
        success: false,
        session: null,
        errorMessage: `Cannot reach router at ${targetAddress}. Verify your Wi-Fi/Ethernet connection and gateway IP.`,
      };
    }

    if (!probe.isTenda) {
      const hint = probe.nonTendaVendorHint ? ` (${probe.nonTendaVendorHint})` : '';
      return {
        success: false,
        session: null,
        errorMessage: `The device at ${targetAddress}${hint} does not expose a Tenda F3 management interface.`,
      };
    }

    const hwVersion: F3HardwareVersion = probe.hardwareVersion || 'F3 v3.0';
    const adapter = AdapterFactory.createAdapter(hwVersion);
    const settings = appStorage.getSettings();
    adapter.setHttpConfig(settings.requestTimeoutMs, settings.maxRetries);

    const connected = await adapter.connect(targetAddress);
    if (!connected) {
      return {
        success: false,
        session: null,
        errorMessage: `Could not establish HTTP connection to ${targetAddress}.`,
      };
    }

    const authenticated = await adapter.authenticate({
      routerAddress: targetAddress,
      username: credentials.username || 'admin',
      password: credentials.password,
    });

    if (!authenticated) {
      return {
        success: false,
        session: null,
        errorMessage: 'Invalid router administrator password, or session rejected by router.',
      };
    }

    // Query router info to finalize firmware/hardware details
    let firmwareVersion = probe.firmware || 'V12.01.01.xx';
    try {
      const info = await adapter.getRouterInfo();
      firmwareVersion = info.firmwareVersion;
    } catch {
      // Non-fatal
    }

    this.activeAdapter = adapter;
    this.currentSession = {
      authenticated: true,
      routerAddress: targetAddress,
      adapterName: adapter.adapterName,
      hardwareVersion: adapter.hardwareVersion,
      firmwareVersion,
      loggedInAt: new Date().toISOString(),
      sessionCookiePreview: adapter.getSessionCookiePreview(),
      isSimulator: tendaSimulator.isRunning() && targetAddress.includes('127.0.0.1'),
    };

    appStorage.addKnownRouter(targetAddress);
    appStorage.updateSettings({
      lastRouterAddress: targetAddress,
      onboardingCompleted: true,
    });

    if (credentials.rememberSession) {
      credentialStore.saveCredentials(targetAddress, credentials.password, credentials.username);
    }

    logger.info('AuthenticationService', `Logged in to ${targetAddress} using ${adapter.adapterName}`);
    return {
      success: true,
      session: this.currentSession,
    };
  }

  public async tryAutoLogin(routerAddress?: string): Promise<{
    success: boolean;
    session: AuthSession | null;
  }> {
    const settings = appStorage.getSettings();
    const target = routerAddress || settings.lastRouterAddress || '192.168.0.1';
    const stored = credentialStore.getCredentials(target);
    if (!stored) {
      return { success: false, session: null };
    }

    const res = await this.login({
      routerAddress: target,
      username: stored.username,
      password: stored.password,
      rememberSession: true,
    });

    return {
      success: res.success,
      session: res.session,
    };
  }

  public async logout(clearSavedCredentials = false): Promise<void> {
    const addr = this.currentSession?.routerAddress;
    if (this.activeAdapter) {
      await this.activeAdapter.disconnect();
      this.activeAdapter = null;
    }
    this.currentSession = null;
    if (clearSavedCredentials && addr) {
      credentialStore.clearCredentials(addr);
    }
    logger.info('AuthenticationService', 'User logged out and session cleared');
  }
}

export const authenticationService = new AuthenticationService();
