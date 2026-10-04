import { F3HardwareVersion } from './types';
import { TendaF3BaseAdapter } from './tendaF3BaseAdapter';
import { TendaHttpClient } from './httpClient';

/**
 * Adapter for Tenda F3 v5.0 hardware/firmware variants (latest V12.01.01.5x revisions).
 * Supports Base64 and MD5 authentication negotiation and full QoS/Wi-Fi controls.
 */
export class F3V5Adapter extends TendaF3BaseAdapter {
  public readonly adapterName = 'F3V5Adapter';
  public readonly hardwareVersion: F3HardwareVersion = 'F3 v5.0';

  constructor(client?: TendaHttpClient) {
    super(client);
    this.capabilities = {
      ...this.capabilities,
      authMethod: 'base64',
    };
  }
}
