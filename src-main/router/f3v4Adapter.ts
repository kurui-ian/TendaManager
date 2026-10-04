import { F3HardwareVersion } from './types';
import { TendaF3BaseAdapter } from './tendaF3BaseAdapter';
import { TendaHttpClient } from './httpClient';

/**
 * Adapter for Tenda F3 v4.0 hardware/firmware variants.
 * Supports MD5 and Base64 password negotiation with /login/Auth.
 */
export class F3V4Adapter extends TendaF3BaseAdapter {
  public readonly adapterName = 'F3V4Adapter';
  public readonly hardwareVersion: F3HardwareVersion = 'F3 v4.0';

  constructor(client?: TendaHttpClient) {
    super(client);
    this.capabilities = {
      ...this.capabilities,
      authMethod: 'md5',
    };
  }
}
