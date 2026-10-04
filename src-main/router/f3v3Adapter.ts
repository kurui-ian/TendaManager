import { F3HardwareVersion } from './types';
import { TendaF3BaseAdapter } from './tendaF3BaseAdapter';
import { TendaHttpClient } from './httpClient';

/**
 * Adapter for Tenda F3 v3.0 hardware/firmware variants (standard V12.01.01.xx eCos firmware).
 * Uses Base64-encoded password with /login/Auth and ecos_pw cookie.
 */
export class F3V3Adapter extends TendaF3BaseAdapter {
  public readonly adapterName = 'F3V3Adapter';
  public readonly hardwareVersion: F3HardwareVersion = 'F3 v3.0';

  constructor(client?: TendaHttpClient) {
    super(client);
    this.capabilities = {
      ...this.capabilities,
      authMethod: 'base64',
    };
  }
}
