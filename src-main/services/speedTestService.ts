import https from 'https';
import crypto from 'crypto';
import { SpeedTestProgress, SpeedTestRecord } from '../router/types';
import { appStorage } from '../storage/appStorage';
import { authenticationService } from './authenticationService';
import { logger } from '../logger/logger';

export class SpeedTestService {
  private running = false;
  private cancelled = false;
  private activeRequests: Set< { destroy: () => void } > = new Set();

  public isRunning(): boolean {
    return this.running;
  }

  public cancel(): void {
    if (!this.running) return;
    this.cancelled = true;
    for (const req of this.activeRequests) {
      try {
        req.destroy();
      } catch {
        // Ignore
      }
    }
    this.activeRequests.clear();
    logger.info('SpeedTestService', 'Speed test cancelled by user');
  }

  public getHistory(): SpeedTestRecord[] {
    return appStorage.getSpeedTestHistory();
  }

  public clearHistory(): void {
    appStorage.clearSpeedTestHistory();
  }

  public async runSpeedTest(
    onProgress: (progress: SpeedTestProgress) => void
  ): Promise<SpeedTestRecord | null> {
    if (this.running) {
      throw new Error('A speed test is already in progress.');
    }

    this.running = true;
    this.cancelled = false;
    this.activeRequests.clear();

    const serverName = 'Cloudflare Global Edge Network';
    const progressState: SpeedTestProgress = {
      phase: 'ping',
      pingMs: null,
      jitterMs: null,
      downloadMbps: null,
      uploadMbps: null,
      progressPercent: 5,
      serverLocation: serverName,
    };

    try {
      onProgress({ ...progressState });

      // Phase 1: Ping & Jitter (4 samples)
      const pingSamples: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (this.cancelled) throw new Error('Cancelled');
        const rtt = await this.measureSinglePing();
        pingSamples.push(rtt);
        const minPing = Math.min(...pingSamples);
        progressState.pingMs = Math.round(minPing);
        progressState.jitterMs =
          pingSamples.length > 1
            ? Math.round(
                pingSamples.reduce((acc, v) => acc + Math.abs(v - minPing), 0) / pingSamples.length
              )
            : 1;
        progressState.progressPercent = 5 + Math.round(((i + 1) / 4) * 20);
        onProgress({ ...progressState });
      }

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 2: Download Speed Measurement
      progressState.phase = 'download';
      progressState.progressPercent = 30;
      onProgress({ ...progressState });

      const downloadMbps = await this.measureDownloadSpeed((currentMbps, pct) => {
        progressState.downloadMbps = Number(currentMbps.toFixed(2));
        progressState.progressPercent = 30 + Math.round(pct * 35);
        onProgress({ ...progressState });
      });
      progressState.downloadMbps = Number(downloadMbps.toFixed(2));

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 3: Upload Speed Measurement
      progressState.phase = 'upload';
      progressState.progressPercent = 65;
      onProgress({ ...progressState });

      const uploadMbps = await this.measureUploadSpeed((currentMbps, pct) => {
        progressState.uploadMbps = Number(currentMbps.toFixed(2));
        progressState.progressPercent = 65 + Math.round(pct * 30);
        onProgress({ ...progressState });
      });
      progressState.uploadMbps = Number(uploadMbps.toFixed(2));

      if (this.cancelled) throw new Error('Cancelled');

      progressState.phase = 'complete';
      progressState.progressPercent = 100;
      onProgress({ ...progressState });

      const session = authenticationService.getSession();
      const record: SpeedTestRecord = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        pingMs: progressState.pingMs || 20,
        jitterMs: progressState.jitterMs || 2,
        downloadMbps: progressState.downloadMbps || 0,
        uploadMbps: progressState.uploadMbps || 0,
        routerIp: session?.routerAddress || appStorage.getSettings().lastRouterAddress || '192.168.0.1',
        serverName,
      };

      appStorage.addSpeedTestRecord(record);
      logger.info(
        'SpeedTestService',
        `Speed test completed: Ping ${record.pingMs}ms, Down ${record.downloadMbps} Mbps, Up ${record.uploadMbps} Mbps`
      );
      return record;
    } catch (err) {
      if (this.cancelled || (err instanceof Error && err.message === 'Cancelled')) {
        progressState.phase = 'cancelled';
        onProgress({ ...progressState });
        return null;
      }

      const message = err instanceof Error ? err.message : 'Internet speed test failed';
      logger.error('SpeedTestService', `Speed test error: ${message}`);
      progressState.phase = 'error';
      progressState.errorMessage = message;
      onProgress({ ...progressState });
      throw err;
    } finally {
      this.running = false;
      this.activeRequests.clear();
    }
  }

  private measureSinglePing(): Promise<number> {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const req = https.request(
        {
          hostname: 'speed.cloudflare.com',
          path: `/__down?bytes=0&r=${Math.random()}`,
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          const rtt = performance.now() - start;
          res.resume();
          res.on('end', () => {
            this.activeRequests.delete(req);
            resolve(Math.max(1, rtt));
          });
        }
      );

      this.activeRequests.add(req);

      req.on('timeout', () => {
        req.destroy(new Error('Ping request timed out'));
      });

      req.on('error', (err) => {
        this.activeRequests.delete(req);
        reject(err);
      });

      req.end();
    });
  }

  private measureDownloadSpeed(onSample: (mbps: number, progress0to1: number) => void): Promise<number> {
    return new Promise((resolve, reject) => {
      // Request 8 MB payload or stop after 4.5 seconds of active transfer
      const targetBytes = 8 * 1024 * 1024;
      const maxDurationMs = 4500;
      let receivedBytes = 0;
      let startTime = 0;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
        const mbps = (receivedBytes * 8) / (elapsedSec * 1_000_000);
        resolve(Math.max(0.1, mbps));
      };

      const req = https.request(
        {
          hostname: 'speed.cloudflare.com',
          path: `/__down?bytes=${targetBytes}&r=${Math.random()}`,
          method: 'GET',
          timeout: 8000,
        },
        (res) => {
          startTime = performance.now();
          res.on('data', (chunk: Buffer) => {
            if (this.cancelled) {
              req.destroy();
              return;
            }
            receivedBytes += chunk.length;
            const elapsedMs = performance.now() - startTime;
            const elapsedSec = Math.max(0.05, elapsedMs / 1000);
            const currentMbps = (receivedBytes * 8) / (elapsedSec * 1_000_000);
            const pct = Math.min(1, Math.max(receivedBytes / targetBytes, elapsedMs / maxDurationMs));
            onSample(currentMbps, pct);

            if (elapsedMs >= maxDurationMs) {
              req.destroy();
              finish();
            }
          });

          res.on('end', () => {
            this.activeRequests.delete(req);
            finish();
          });
        }
      );

      this.activeRequests.add(req);

      req.on('timeout', () => {
        if (receivedBytes > 0) {
          req.destroy();
          finish();
        } else {
          req.destroy(new Error('Download speed test timed out'));
        }
      });

      req.on('error', (err) => {
        this.activeRequests.delete(req);
        if (settled) return;
        if (receivedBytes > 64 * 1024) {
          finish();
        } else {
          reject(err);
        }
      });

      req.end();
    });
  }

  private async measureUploadSpeed(
    onSample: (mbps: number, progress0to1: number) => void
  ): Promise<number> {
    // Perform 3 sequential chunk uploads of 512 KB each to accurately measure upload throughput
    const chunkSizeBytes = 512 * 1024;
    const payload = Buffer.alloc(chunkSizeBytes, 'T');
    let totalBytesSent = 0;
    const overallStart = performance.now();
    const rounds = 3;

    for (let i = 0; i < rounds; i++) {
      if (this.cancelled) throw new Error('Cancelled');
      await this.uploadSingleChunk(payload);
      totalBytesSent += chunkSizeBytes;
      const elapsedSec = Math.max(0.05, (performance.now() - overallStart) / 1000);
      const mbps = (totalBytesSent * 8) / (elapsedSec * 1_000_000);
      onSample(mbps, (i + 1) / rounds);
    }

    const totalElapsedSec = Math.max(0.05, (performance.now() - overallStart) / 1000);
    return Math.max(0.1, (totalBytesSent * 8) / (totalElapsedSec * 1_000_000));
  }

  private uploadSingleChunk(payload: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'speed.cloudflare.com',
          path: `/__up?r=${Math.random()}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': payload.length.toString(),
          },
          timeout: 7000,
        },
        (res) => {
          res.resume();
          res.on('end', () => {
            this.activeRequests.delete(req);
            resolve();
          });
        }
      );

      this.activeRequests.add(req);

      req.on('timeout', () => {
        req.destroy(new Error('Upload test chunk timed out'));
      });

      req.on('error', (err) => {
        this.activeRequests.delete(req);
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}

export const speedTestService = new SpeedTestService();
