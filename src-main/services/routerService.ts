import { NetworkStatus, RouterCapabilities, RouterInfo } from '../router/types';
import { authenticationService } from './authenticationService';
import { logger } from '../logger/logger';

export class RouterService {
  private requireAdapter() {
    const adapter = authenticationService.getActiveAdapter();
    if (!adapter || !adapter.isAuthenticated()) {
      throw new Error('Not authenticated with a Tenda F3 router.');
    }
    return adapter;
  }

  public async getRouterInfo(): Promise<RouterInfo> {
    const adapter = this.requireAdapter();
    return adapter.getRouterInfo();
  }

  public async getNetworkStatus(): Promise<NetworkStatus> {
    const adapter = this.requireAdapter();
    return adapter.getNetworkStatus();
  }

  public getCapabilities(): RouterCapabilities | null {
    const adapter = authenticationService.getActiveAdapter();
    return adapter ? adapter.getCapabilities() : null;
  }

  public async restartRouter(): Promise<boolean> {
    const adapter = this.requireAdapter();
    logger.warn('RouterService', 'Initiating router reboot command');
    return adapter.restartRouter();
  }
}

export const routerService = new RouterService();
