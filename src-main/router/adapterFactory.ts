import { F3HardwareVersion } from './types';
import { TendaF3BaseAdapter } from './tendaF3BaseAdapter';
import { F3V2Adapter } from './f3v2Adapter';
import { F3V3Adapter } from './f3v3Adapter';
import { F3V4Adapter } from './f3v4Adapter';
import { F3V5Adapter } from './f3v5Adapter';
import { TendaHttpClient } from './httpClient';

export class AdapterFactory {
  public static createAdapter(
    hardwareVersion?: F3HardwareVersion | string | null,
    client?: TendaHttpClient
  ): TendaF3BaseAdapter {
    switch (hardwareVersion) {
      case 'F3 v2.0':
      case 'F3V2Adapter':
        return new F3V2Adapter(client);
      case 'F3 v4.0':
      case 'F3V4Adapter':
        return new F3V4Adapter(client);
      case 'F3 v5.0':
      case 'F3V5Adapter':
        return new F3V5Adapter(client);
      case 'F3 v3.0':
      case 'F3V3Adapter':
      default:
        return new F3V3Adapter(client);
    }
  }
}
