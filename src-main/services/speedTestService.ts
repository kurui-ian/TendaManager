import https from 'https';
import crypto from 'crypto';
import { SpeedTestProgress, SpeedTestRecord } from '../router/types';
import { appStorage } from '../storage/appStorage';
import { authenticationService } from './authenticationService';
import { logger } from '../logger/logger';

export class SpeedTestService {
  private running = false;
  private cancelled = false;
  private activeRequests: Set<{ destroy: () => void }> = new Set();

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

    const downloadSamples: number[] = [];
    const uploadSamples: number[] = [];

    const progressState: SpeedTestProgress = {
      phase: 'connecting',
      pingMs: null,
      jitterMs: null,
      downloadMbps: null,
      uploadMbps: null,
      currentMbps: null,
      downloadSamples: [],
      uploadSamples: [],
      progressPercent: 2,
      serverLocation: 'Cloudflare Speed Network',
    };

    try {
      // Phase 1: Connecting (warm up TLS connection)
      onProgress({ ...progressState });
      await this.measureSinglePing();
      if (this.cancelled) throw new Error('Cancelled');

      // Phase 2: Finding / selecting nearest edge server via /cdn-cgi/trace
      progressState.phase = 'selecting_server';
      progressState.progressPercent = 6;
      onProgress({ ...progressState });

      const detectedServer = await this.detectEdgeServer().catch(() => 'Cloudflare Global Edge');
      progressState.serverLocation = detectedServer;
      progressState.progressPercent = 10;
      onProgress({ ...progressState });
      if (this.cancelled) throw new Error('Cancelled');

      // Phase 3: Testing latency / ping (10 real RTT probes for stable latency & jitter)
      progressState.phase = 'ping';
      onProgress({ ...progressState });

      const pingRounds = 10;
      const pingSamples: number[] = [];
      for (let i = 0; i < pingRounds; i++) {
        if (this.cancelled) throw new Error('Cancelled');
        const rtt = await this.measureSinglePing();
        pingSamples.push(rtt);

        const sorted = [...pingSamples].sort((a, b) => a - b);
        const bestPing = sorted[0];
        progressState.pingMs = Math.round(bestPing);

        if (pingSamples.length > 1) {
          let diffs = 0;
          for (let j = 1; j < pingSamples.length; j++) {
            diffs += Math.abs(pingSamples[j] - pingSamples[j - 1]);
          }
          progressState.jitterMs = Math.max(1, Math.round(diffs / (pingSamples.length - 1)));
        } else {
          progressState.jitterMs = 1;
        }

        progressState.progressPercent = 10 + Math.round(((i + 1) / pingRounds) * 15);
        onProgress({ ...progressState });
      }

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 4: Testing Download (multi-stage HTTP streams over ~7.5 seconds)
      progressState.phase = 'download';
      progressState.progressPercent = 25;
      onProgress({ ...progressState });

      const finalDownloadMbps = await this.measureDownloadSpeed((instantMbps, avgMbps, pct) => {
        const roundedInstant = Number(instantMbps.toFixed(2));
        const roundedAvg = Number(avgMbps.toFixed(2));
        downloadSamples.push(roundedInstant);
        if (downloadSamples.length > 48) {
          downloadSamples.shift();
        }
        progressState.currentMbps = roundedInstant;
        progressState.downloadMbps = roundedAvg;
        progressState.downloadSamples = [...downloadSamples];
        progressState.progressPercent = 25 + Math.round(pct * 38);
        onProgress({ ...progressState });
      });

      progressState.downloadMbps = Number(finalDownloadMbps.toFixed(2));
      progressState.currentMbps = progressState.downloadMbps;
      onProgress({ ...progressState });

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 5: Testing Upload (multi-chunk HTTP POST transfers over ~6 seconds)
      progressState.phase = 'upload';
      progressState.currentMbps = 0;
      progressState.progressPercent = 63;
      onProgress({ ...progressState });

      const finalUploadMbps = await this.measureUploadSpeed((instantMbps, avgMbps, pct) => {
        const roundedInstant = Number(instantMbps.toFixed(2));
        const roundedAvg = Number(avgMbps.toFixed(2));
        uploadSamples.push(roundedInstant);
        if (uploadSamples.length > 48) {
          uploadSamples.shift();
        }
        progressState.currentMbps = roundedInstant;
        progressState.uploadMbps = roundedAvg;
        progressState.uploadSamples = [...uploadSamples];
        progressState.progressPercent = 63 + Math.round(pct * 32);
        onProgress({ ...progressState });
      });

      progressState.uploadMbps = Number(finalUploadMbps.toFixed(2));
      progressState.currentMbps = progressState.uploadMbps;

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 6: Calculating stabilized final results
      progressState.phase = 'calculating';
      progressState.progressPercent = 97;
      onProgress({ ...progressState });

      const stabilizedDown = this.calculateTrimmedSpeed(downloadSamples, finalDownloadMbps);
      const stabilizedUp = this.calculateTrimmedSpeed(uploadSamples, finalUploadMbps);

      progressState.downloadMbps = Number(stabilizedDown.toFixed(2));
      progressState.uploadMbps = Number(stabilizedUp.toFixed(2));
      progressState.currentMbps = null;
      progressState.phase = 'complete';
      progressState.progressPercent = 100;
      onProgress({ ...progressState });

      const session = authenticationService.getSession();
      const record: SpeedTestRecord = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        pingMs: progressState.pingMs || 20,
        jitterMs: progressState.jitterMs || 1,
        downloadMbps: progressState.downloadMbps || 0,
        uploadMbps: progressState.uploadMbps || 0,
        routerIp: session?.routerAddress || appStorage.getSettings().lastRouterAddress || '192.168.0.1',
        serverName: progressState.serverLocation,
      };

      appStorage.addSpeedTestRecord(record);
      logger.info(
        'SpeedTestService',
        `Speed test completed: Ping ${record.pingMs}ms, Down ${record.downloadMbps} Mbps, Up ${record.uploadMbps} Mbps (${record.serverName})`
      );
      return record;
    } catch (err) {
      if (this.cancelled || (err instanceof Error && err.message === 'Cancelled')) {
        progressState.phase = 'cancelled';
        progressState.currentMbps = null;
        onProgress({ ...progressState });
        return null;
      }

      const message = err instanceof Error ? err.message : 'Speed test failed';
      logger.error('SpeedTestService', `Speed test error: ${message}`);
      progressState.phase = 'error';
      progressState.currentMbps = null;
      progressState.errorMessage = message;
      onProgress({ ...progressState });
      throw err;
    } finally {
      this.running = false;
      this.activeRequests.clear();
    }
  }

  private calculateTrimmedSpeed(samples: number[], fallbackMbps: number): number {
    const valid = samples.filter((n) => Number.isFinite(n) && n > 0);
    if (valid.length < 4) return Math.max(0.1, fallbackMbps);
    const sorted = [...valid].sort((a, b) => a - b);
    // Discard bottom 20% (TCP slow start) and top 5% (buffer burst) for accurate sustained throughput
    const startIdx = Math.floor(sorted.length * 0.2);
    const endIdx = Math.max(startIdx + 1, Math.ceil(sorted.length * 0.95));
    const slice = sorted.slice(startIdx, endIdx);
    const avg = slice.reduce((acc, v) => acc + v, 0) / slice.length;
    return Math.max(0.1, avg);
  }

  private detectEdgeServer(): Promise<string> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'speed.cloudflare.com',
          path: '/cdn-cgi/trace',
          method: 'GET',
          timeout: 4000,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            this.activeRequests.delete(req);
            const coloMatch = body.match(/^colo=([A-Z0-9]+)/m);
            const locMatch = body.match(/^loc=([A-Z]+)/m);
            if (coloMatch) {
              const colo = coloMatch[1];
              const loc = locMatch ? `${locMatch[1]} · ` : '';
              resolve(`Cloudflare Edge (${loc}${colo})`);
            } else {
              resolve('Cloudflare Global Edge');
            }
          });
        }
      );

      this.activeRequests.add(req);
      req.on('timeout', () => {
        req.destroy();
        this.activeRequests.delete(req);
        resolve('Cloudflare Global Edge');
      });
      req.on('error', () => {
        this.activeRequests.delete(req);
        resolve('Cloudflare Global Edge');
      });
      req.end();
    });
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

  private async measureDownloadSpeed(
    onSample: (instantMbps: number, runningAvgMbps: number, progress0to1: number) => void
  ): Promise<number> {
    // Perform progressive multi-chunk downloads up to 7.5 seconds of active measurement
    const stages = [2 * 1024 * 1024, 8 * 1024 * 1024, 16 * 1024 * 1024, 24 * 1024 * 1024];
    const targetDurationMs = 7500;
    const overallStart = performance.now();
    let totalReceivedBytes = 0;
    let lastEmitTime = overallStart;
    let windowBytes = 0;
    let smoothedInstantMbps = 0;

    for (let s = 0; s < stages.length; s++) {
      if (this.cancelled) throw new Error('Cancelled');
      const elapsedTotal = performance.now() - overallStart;
      if (elapsedTotal >= targetDurationMs) break;

      const remainingMs = targetDurationMs - elapsedTotal;
      const stageBytes = stages[s];

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finishStage = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const req = https.request(
          {
            hostname: 'speed.cloudflare.com',
            path: `/__down?bytes=${stageBytes}&r=${Math.random()}`,
            method: 'GET',
            timeout: Math.max(3000, remainingMs + 1500),
          },
          (res) => {
            res.on('data', (chunk: Buffer) => {
              if (this.cancelled) {
                req.destroy();
                return;
              }
              totalReceivedBytes += chunk.length;
              windowBytes += chunk.length;

              const now = performance.now();
              const windowMs = now - lastEmitTime;
              const totalElapsedMs = now - overallStart;

              if (windowMs >= 110) {
                const rawWindowMbps = (windowBytes * 8) / ((windowMs / 1000) * 1_000_000);
                smoothedInstantMbps =
                  smoothedInstantMbps === 0
                    ? rawWindowMbps
                    : smoothedInstantMbps * 0.6 + rawWindowMbps * 0.4;
                const runningAvgMbps =
                  (totalReceivedBytes * 8) / (Math.max(0.08, totalElapsedMs / 1000) * 1_000_000);
                const pct = Math.min(0.99, totalElapsedMs / targetDurationMs);

                onSample(Math.max(0.1, smoothedInstantMbps), Math.max(0.1, runningAvgMbps), pct);
                lastEmitTime = now;
                windowBytes = 0;
              }

              if (totalElapsedMs >= targetDurationMs) {
                req.destroy();
                finishStage();
              }
            });

            res.on('end', () => {
              this.activeRequests.delete(req);
              finishStage();
            });
          }
        );

        this.activeRequests.add(req);

        req.on('timeout', () => {
          req.destroy();
          this.activeRequests.delete(req);
          if (totalReceivedBytes > 0) {
            finishStage();
          } else {
            reject(new Error('Download speed test timed out'));
          }
        });

        req.on('error', (err) => {
          this.activeRequests.delete(req);
          if (settled) return;
          if (totalReceivedBytes > 64 * 1024) {
            finishStage();
          } else {
            reject(err);
          }
        });

        req.end();
      });
    }

    const finalElapsedSec = Math.max(0.1, (performance.now() - overallStart) / 1000);
    return Math.max(0.1, (totalReceivedBytes * 8) / (finalElapsedSec * 1_000_000));
  }

  private async measureUploadSpeed(
    onSample: (instantMbps: number, runningAvgMbps: number, progress0to1: number) => void
  ): Promise<number> {
    // Perform multi-chunk uploads up to ~6.0 seconds with live socket progress sampling
    const chunkSizes = [
      256 * 1024,
      384 * 1024,
      512 * 1024,
      512 * 1024,
      768 * 1024,
      768 * 1024,
      1024 * 1024,
      1024 * 1024,
    ];
    const targetDurationMs = 6000;
    const overallStart = performance.now();
    let totalBytesSent = 0;
    let smoothedInstantMbps = 0;

    for (let i = 0; i < chunkSizes.length; i++) {
      if (this.cancelled) throw new Error('Cancelled');
      const elapsedBefore = performance.now() - overallStart;
      if (elapsedBefore >= targetDurationMs && i >= 2) break;

      const chunkSize = chunkSizes[i];
      const payload = Buffer.alloc(chunkSize, 'T');
      const chunkStart = performance.now();

      await this.uploadSingleChunkWithProgress(payload, (bytesFlushedInChunk) => {
        const now = performance.now();
        const chunkElapsedSec = Math.max(0.05, (now - chunkStart) / 1000);
        const totalElapsedMs = now - overallStart;
        const totalElapsedSec = Math.max(0.08, totalElapsedMs / 1000);

        const chunkMbps = (bytesFlushedInChunk * 8) / (chunkElapsedSec * 1_000_000);
        smoothedInstantMbps =
          smoothedInstantMbps === 0 ? chunkMbps : smoothedInstantMbps * 0.65 + chunkMbps * 0.35;
        const runningAvgMbps = ((totalBytesSent + bytesFlushedInChunk) * 8) / (totalElapsedSec * 1_000_000);
        const pct = Math.min(
          0.99,
          Math.max((i + bytesFlushedInChunk / chunkSize) / chunkSizes.length, totalElapsedMs / targetDurationMs)
        );
        onSample(Math.max(0.1, smoothedInstantMbps), Math.max(0.1, runningAvgMbps), pct);
      });

      totalBytesSent += chunkSize;
      const chunkDurationSec = Math.max(0.04, (performance.now() - chunkStart) / 1000);
      const chunkFinalMbps = (chunkSize * 8) / (chunkDurationSec * 1_000_000);
      smoothedInstantMbps =
        smoothedInstantMbps === 0 ? chunkFinalMbps : smoothedInstantMbps * 0.5 + chunkFinalMbps * 0.5;
      const totalElapsedMs = performance.now() - overallStart;
      const runningAvg = (totalBytesSent * 8) / (Math.max(0.08, totalElapsedMs / 1000) * 1_000_000);
      const pct = Math.min(0.99, Math.max((i + 1) / chunkSizes.length, totalElapsedMs / targetDurationMs));
      onSample(Math.max(0.1, smoothedInstantMbps), Math.max(0.1, runningAvg), pct);
    }

    const totalElapsedSec = Math.max(0.08, (performance.now() - overallStart) / 1000);
    return Math.max(0.1, (totalBytesSent * 8) / (totalElapsedSec * 1_000_000));
  }

  private uploadSingleChunkWithProgress(
    payload: Buffer,
    onProgressBytes: (sent: number) => void
  ): Promise<void> {
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
          timeout: 8000,
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

      // Stream payload in 64 KB slices so socket progress events fire during upload
      const sliceSize = 64 * 1024;
      let offset = 0;

      const writeNext = () => {
        if (this.cancelled) {
          req.destroy();
          return;
        }
        while (offset < payload.length) {
          const end = Math.min(offset + sliceSize, payload.length);
          const slice = payload.subarray(offset, end);
          offset = end;
          const canContinue = req.write(slice);
          onProgressBytes(offset);
          if (!canContinue && offset < payload.length) {
            req.once('drain', writeNext);
            return;
          }
        }
        req.end();
      };

      writeNext();
    });
  }
}

export const speedTestService = new SpeedTestService();
