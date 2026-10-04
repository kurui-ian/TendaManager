import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { logger } from '../logger/logger';

export interface StoredCredentialEntry {
  routerAddress: string;
  username?: string;
  encryptedPasswordBase64: string;
  encryptionBackend: 'dpapi-safeStorage' | 'machine-aes256gcm';
  updatedAt: string;
}

interface SafeStorageProvider {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * OS-secure credential vault.
 * Uses Electron's safeStorage API (Windows DPAPI / Credential Manager backing) when running in Electron,
 * or machine-bound AES-256-GCM authenticated encryption in headless unit test environments.
 * Never persists plaintext passwords to disk.
 */
export class CredentialStore {
  private readonly vaultPath: string;
  private safeStorageRef: SafeStorageProvider | null = null;

  constructor(customDir?: string, safeStorageProvider?: SafeStorageProvider) {
    const baseDir =
      customDir ||
      path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'TendaManager');
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch {
      // Ignore
    }
    this.vaultPath = path.join(baseDir, 'credentials.vault.json');

    if (safeStorageProvider) {
      this.safeStorageRef = safeStorageProvider;
    } else {
      try {
        // Dynamically resolve electron.safeStorage when running inside Electron Main process
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const electron = require('electron');
        if (electron && electron.safeStorage) {
          this.safeStorageRef = electron.safeStorage;
        }
      } catch {
        this.safeStorageRef = null;
      }
    }
  }

  private getMachineKey(): Buffer {
    const machineIdentity = `${os.hostname()}|${os.userInfo().username}|${os.platform()}|${os.arch()}|TendaManager-v1`;
    return crypto.scryptSync(machineIdentity, 'TendaManager-DPAPI-Salt-v1', 32);
  }

  private encryptSecret(plainText: string): { payload: string; backend: 'dpapi-safeStorage' | 'machine-aes256gcm' } {
    if (this.safeStorageRef && this.safeStorageRef.isEncryptionAvailable()) {
      const buf = this.safeStorageRef.encryptString(plainText);
      return {
        payload: buf.toString('base64'),
        backend: 'dpapi-safeStorage',
      };
    }

    const key = this.getMachineKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return {
      payload: combined.toString('base64'),
      backend: 'machine-aes256gcm',
    };
  }

  private decryptSecret(payloadBase64: string, backend: 'dpapi-safeStorage' | 'machine-aes256gcm'): string | null {
    try {
      const raw = Buffer.from(payloadBase64, 'base64');
      if (backend === 'dpapi-safeStorage') {
        if (this.safeStorageRef && this.safeStorageRef.isEncryptionAvailable()) {
          return this.safeStorageRef.decryptString(raw);
        }
        return null;
      }

      const key = this.getMachineKey();
      const iv = raw.subarray(0, 12);
      const authTag = raw.subarray(12, 28);
      const ciphertext = raw.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (err) {
      logger.error('CredentialStore', 'Failed to decrypt stored credential', err);
      return null;
    }
  }

  private readVault(): Record<string, StoredCredentialEntry> {
    try {
      if (fs.existsSync(this.vaultPath)) {
        const raw = fs.readFileSync(this.vaultPath, 'utf8');
        return JSON.parse(raw) as Record<string, StoredCredentialEntry>;
      }
    } catch {
      // Return empty vault on corruption
    }
    return {};
  }

  private writeVault(vault: Record<string, StoredCredentialEntry>): void {
    try {
      fs.writeFileSync(this.vaultPath, JSON.stringify(vault, null, 2), 'utf8');
    } catch (err) {
      logger.error('CredentialStore', 'Failed to write credential vault', err);
    }
  }

  public saveCredentials(routerAddress: string, password: string, username?: string): void {
    const key = routerAddress.trim().toLowerCase();
    const { payload, backend } = this.encryptSecret(password);
    const vault = this.readVault();
    vault[key] = {
      routerAddress: key,
      username: username || 'admin',
      encryptedPasswordBase64: payload,
      encryptionBackend: backend,
      updatedAt: new Date().toISOString(),
    };
    this.writeVault(vault);
    logger.info('CredentialStore', `Saved encrypted credentials for router ${key} using ${backend}`);
  }

  public getCredentials(routerAddress: string): { username: string; password: string } | null {
    const key = routerAddress.trim().toLowerCase();
    const vault = this.readVault();
    const entry = vault[key];
    if (!entry) return null;

    const password = this.decryptSecret(entry.encryptedPasswordBase64, entry.encryptionBackend);
    if (password === null) return null;

    return {
      username: entry.username || 'admin',
      password,
    };
  }

  public hasSavedCredentials(routerAddress: string): boolean {
    const key = routerAddress.trim().toLowerCase();
    const vault = this.readVault();
    return Boolean(vault[key]);
  }

  public clearCredentials(routerAddress?: string): void {
    if (!routerAddress) {
      try {
        if (fs.existsSync(this.vaultPath)) {
          fs.unlinkSync(this.vaultPath);
        }
      } catch {
        // Ignore
      }
      logger.info('CredentialStore', 'Cleared all saved router credentials');
      return;
    }

    const key = routerAddress.trim().toLowerCase();
    const vault = this.readVault();
    delete vault[key];
    this.writeVault(vault);
    logger.info('CredentialStore', `Cleared saved credentials for ${key}`);
  }
}

export const credentialStore = new CredentialStore();
