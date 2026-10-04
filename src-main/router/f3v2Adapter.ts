import { F3HardwareVersion } from './types';
import { TendaF3BaseAdapter } from './tendaF3BaseAdapter';
import { TendaHttpClient } from './httpClient';

/**
 * Adapter for Tenda F3 v2.0 hardware/firmware variants (early V11/V12.01.01 builds).
 * Uses Base64 authentication with fallback to plain-form /Login if needed.
 */
export class F3V2Adapter extends TendaF3BaseAdapter {
  public readonly adapterName = 'F3V2Adapter';
  public readonly hardwareVersion: F3HardwareVersion = 'F3 v2.0';

  constructor(client?: TendaHttpClient) {
    super(client);
    this.capabilities = {
      ...this.capabilities,
      authMethod: 'base64',
      canViewUptime: true,
    };
  }
}
