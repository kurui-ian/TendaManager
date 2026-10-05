import https from 'https';
import crypto from 'crypto';
import { SpeedTestProgress, SpeedTestRecord } from '../router/types';
import { appStorage } from '../storage/appStorage';
import { authenticationService } from './authenticationService';
import { logger } from '../logger/logger';

const PING_ROUNDS = 24;
const PING_INTERVAL_MS = 180; // ~5 seconds total ping & jitter measurement window
const DOWNLOAD_DURATION_MS = 15000; // Full 15 seconds active download measurement
const UPLOAD_DURATION_MS = 15000; // Full 15 seconds active upload measurement
const SAMPLE_HISTORY_LIMIT = 90;

export class SpeedTestService {
  private running = false;
  private cancelled = false;
  private activeRequests: Set<{ destroy: () => void }> = new Set();
  private keepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 4,
    timeout: 15000,
  });

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      // Phase 1: Connecting (warm up keep-alive TLS socket)
      onProgress({ ...progressState });
      await this.measureSinglePing();
      if (this.cancelled) throw new Error('Cancelled');

      // Phase 2: Finding / selecting nearest edge server via /cdn-cgi/trace
      progressState.phase = 'selecting_server';
      progressState.progressPercent = 5;
      onProgress({ ...progressState });

      const detectedServer = await this.detectEdgeServer().catch(() => 'Cloudflare Global Edge');
      progressState.serverLocation = detectedServer;
      progressState.progressPercent = 8;
      onProgress({ ...progressState });
      if (this.cancelled) throw new Error('Cancelled');

      // Phase 3: Testing latency / ping (24 RTT probes spaced across ~5 seconds)
      progressState.phase = 'ping';
      onProgress({ ...progressState });

      const pingSamples: number[] = [];
      for (let i = 0; i < PING_ROUNDS; i++) {
        if (this.cancelled) throw new Error('Cancelled');
        const probeStart = performance.now();
        const rtt = await this.measureSinglePing();
        pingSamples.push(rtt);

        const sorted = [...pingSamples].sort((a, b) => a - b);
        const lowerHalf = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.5)));
        const avgBestPing = lowerHalf.reduce((acc, v) => acc + v, 0) / lowerHalf.length;
        progressState.pingMs = Math.max(1, Math.round(avgBestPing));

        if (pingSamples.length > 1) {
          let diffs = 0;
          for (let j = 1; j < pingSamples.length; j++) {
            diffs += Math.abs(pingSamples[j] - pingSamples[j - 1]);
          }
          progressState.jitterMs = Math.max(1, Math.round(diffs / (pingSamples.length - 1)));
        } else {
          progressState.jitterMs = 1;
        }

        progressState.progressPercent = 8 + Math.round(((i + 1) / PING_ROUNDS) * 14);
        onProgress({ ...progressState });

        const elapsedProbe = performance.now() - probeStart;
        if (i < PING_ROUNDS - 1 && elapsedProbe < PING_INTERVAL_MS) {
          await this.sleep(PING_INTERVAL_MS - elapsedProbe);
        }
      }

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 4: Testing Download (continuous multi-stage HTTP streams over full 15 seconds)
      progressState.phase = 'download';
      progressState.progressPercent = 22;
      onProgress({ ...progressState });

      const finalDownloadMbps = await this.measureDownloadSpeed((instantMbps, avgMbps, pct) => {
        const roundedInstant = Number(instantMbps.toFixed(2));
        const roundedAvg = Number(avgMbps.toFixed(2));
        downloadSamples.push(roundedInstant);
        if (downloadSamples.length > SAMPLE_HISTORY_LIMIT) {
          downloadSamples.shift();
        }
        progressState.currentMbps = roundedInstant;
        progressState.downloadMbps = roundedAvg;
        progressState.downloadSamples = [...downloadSamples];
        progressState.progressPercent = 22 + Math.round(pct * 38);
        onProgress({ ...progressState });
      });

      progressState.downloadMbps = Number(finalDownloadMbps.toFixed(2));
      progressState.currentMbps = progressState.downloadMbps;
      onProgress({ ...progressState });

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 5: Testing Upload (continuous multi-chunk HTTP POST transfers over full 15 seconds)
      progressState.phase = 'upload';
      progressState.currentMbps = 0;
      progressState.progressPercent = 60;
      onProgress({ ...progressState });

      const finalUploadMbps = await this.measureUploadSpeed((instantMbps, avgMbps, pct) => {
        const roundedInstant = Number(instantMbps.toFixed(2));
        const roundedAvg = Number(avgMbps.toFixed(2));
        uploadSamples.push(roundedInstant);
        if (uploadSamples.length > SAMPLE_HISTORY_LIMIT) {
          uploadSamples.shift();
        }
        progressState.currentMbps = roundedInstant;
        progressState.uploadMbps = roundedAvg;
        progressState.uploadSamples = [...uploadSamples];
        progressState.progressPercent = 60 + Math.round(pct * 37);
        onProgress({ ...progressState });
      });

      progressState.uploadMbps = Number(finalUploadMbps.toFixed(2));
      progressState.currentMbps = progressState.uploadMbps;

      if (this.cancelled) throw new Error('Cancelled');

      // Phase 6: Calculating stabilized final results
      progressState.phase = 'calculating';
      progressState.progressPercent = 98;
      onProgress({ ...progressState });

      const stabilizedDown = this.calculateTrimmedSpeed(downloadSamples, finalDownloadMbps);
      const stabilizedUp = this.calculateTrimmedSpeed(uploadSamples, finalUploadMbps);

      await this.sleep(450);
      if (this.cancelled) throw new Error('Cancelled');

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
    // Discard bottom 20% (TCP slow start) and top 5% (buffer burst) for sustained throughput
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
          agent: this.keepAliveAgent,
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
          agent: this.keepAliveAgent,
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
    // Continuously stream progressively larger payloads until the full 15 seconds have elapsed
    const stageLadder = [
      4 * 1024 * 1024,
      8 * 1024 * 1024,
      16 * 1024 * 1024,
      25 * 1024 * 1024,
      35 * 1024 * 1024,
      50 * 1024 * 1024,
    ];
    const targetDurationMs = DOWNLOAD_DURATION_MS;
    const overallStart = performance.now();
    let totalReceivedBytes = 0;
    let lastEmitTime = overallStart;
    let windowBytes = 0;
    let smoothedInstantMbps = 0;
    let stageIndex = 0;

    while (performance.now() - overallStart < targetDurationMs) {
      if (this.cancelled) throw new Error('Cancelled');
      const elapsedTotal = performance.now() - overallStart;
      const remainingMs = targetDurationMs - elapsedTotal;
      if (remainingMs <= 80) break;

      const stageBytes = stageLadder[Math.min(stageIndex, stageLadder.length - 1)];
      stageIndex++;

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
            agent: this.keepAliveAgent,
            timeout: Math.max(4000, remainingMs + 2000),
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

              if (windowMs >= 120) {
                const rawWindowMbps = (windowBytes * 8) / ((windowMs / 1000) * 1_000_000);
                smoothedInstantMbps =
                  smoothedInstantMbps === 0
                    ? rawWindowMbps
                    : smoothedInstantMbps * 0.65 + rawWindowMbps * 0.35;
                const runningAvgMbps =
                  (totalReceivedBytes * 8) / (Math.max(0.1, totalElapsedMs / 1000) * 1_000_000);
                const pct = Math.min(0.99, totalElapsedMs / targetDurationMs);

                onSample(Math.max(0.1, smoothedInstantMbps), Math.max(0.1, runningAvgMbps), pct);
                lastEmitTime = now;
                windowBytes = 0;
              }

              if (totalElapsedMs >= targetDurationMs) {
                req.destroy();
                this.activeRequests.delete(req);
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
    // Continuously upload adaptive chunks for a full 15 seconds of active measurement
    const targetDurationMs = UPLOAD_DURATION_MS;
    const overallStart = performance.now();
    let totalBytesConfirmed = 0;
    let smoothedInstantMbps = 0;
    let currentChunkSize = 256 * 1024; // Start at 256 KB and scale up based on line speed

    while (performance.now() - overallStart < targetDurationMs) {
      if (this.cancelled) throw new Error('Cancelled');
      const elapsedBefore = performance.now() - overallStart;
      const remainingMs = targetDurationMs - elapsedBefore;
      if (remainingMs <= 120) break;

      const payload = Buffer.alloc(currentChunkSize, 'T');
      const chunkStart = performance.now();

      const bytesSentInChunk = await this.uploadChunkForDuration(
        payload,
        remainingMs,
        (inFlightBytes) => {
          const now = performance.now();
          const chunkElapsedSec = Math.max(0.08, (now - chunkStart) / 1000);
          const totalElapsedMs = now - overallStart;
          const totalElapsedSec = Math.max(0.1, totalElapsedMs / 1000);

          const chunkEstimateMbps = (inFlightBytes * 8) / (chunkElapsedSec * 1_000_000);
          const displayInstant =
            smoothedInstantMbps === 0
              ? chunkEstimateMbps
              : smoothedInstantMbps * 0.7 + chunkEstimateMbps * 0.3;
          const runningAvgMbps =
            ((totalBytesConfirmed + inFlightBytes) * 8) / (totalElapsedSec * 1_000_000);
          const pct = Math.min(0.99, totalElapsedMs / targetDurationMs);

          onSample(Math.max(0.1, displayInstant), Math.max(0.1, runningAvgMbps), pct);
        }
      );

      const chunkDurationSec = Math.max(0.05, (performance.now() - chunkStart) / 1000);
      totalBytesConfirmed += bytesSentInChunk;

      const chunkActualMbps = (bytesSentInChunk * 8) / (chunkDurationSec * 1_000_000);
      smoothedInstantMbps =
        smoothedInstantMbps === 0
          ? chunkActualMbps
          : smoothedInstantMbps * 0.55 + chunkActualMbps * 0.45;

      const totalElapsedMs = performance.now() - overallStart;
      const runningAvg =
        (totalBytesConfirmed * 8) / (Math.max(0.1, totalElapsedMs / 1000) * 1_000_000);
      const pct = Math.min(0.99, totalElapsedMs / targetDurationMs);
      onSample(Math.max(0.1, smoothedInstantMbps), Math.max(0.1, runningAvg), pct);

      // Adapt next chunk size so each POST round takes ~0.7s–1.4s on the wire
      if (chunkDurationSec < 0.45 && currentChunkSize < 4 * 1024 * 1024) {
        currentChunkSize = Math.min(4 * 1024 * 1024, currentChunkSize * 2);
      } else if (chunkDurationSec > 2.2 && currentChunkSize > 128 * 1024) {
        currentChunkSize = Math.max(128 * 1024, Math.floor(currentChunkSize / 2));
      }
    }

    const totalElapsedSec = Math.max(0.1, (performance.now() - overallStart) / 1000);
    return Math.max(0.1, (totalBytesConfirmed * 8) / (totalElapsedSec * 1_000_000));
  }

  private uploadChunkForDuration(
    payload: Buffer,
    maxDurationMs: number,
    onTickBytes: (bytesFlushed: number) => void
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let offset = 0;
      let baseSocketBytes = 0;
      const chunkStart = performance.now();

      const req = https.request(
        {
          hostname: 'speed.cloudflare.com',
          path: `/__up?r=${Math.random()}`,
          method: 'POST',
          agent: this.keepAliveAgent,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': payload.length.toString(),
          },
          timeout: Math.max(5000, maxDurationMs + 2500),
        },
        (res) => {
          res.resume();
          res.on('end', () => {
            cleanup();
            if (!settled) {
              settled = true;
              resolve(payload.length);
            }
          });
        }
      );

      req.on('socket', (sock) => {
        baseSocketBytes = sock.bytesWritten || 0;
      });

      this.activeRequests.add(req);

      // Emit progress every 120ms while the upload request is in flight
      const ticker = setInterval(() => {
        if (this.cancelled) {
          req.destroy();
          return;
        }
        const sockDelta =
          req.socket && req.socket.bytesWritten >= baseSocketBytes
            ? req.socket.bytesWritten - baseSocketBytes
            : offset;
        const elapsedRatio = Math.min(0.95, (performance.now() - chunkStart) / 1200);
        const pacedEstimate = Math.max(
          16 * 1024,
          Math.min(payload.length, sockDelta > 0 ? sockDelta : Math.round(payload.length * elapsedRatio))
        );
        onTickBytes(pacedEstimate);
      }, 120);

      // Cutoff timer if the overall 15-second upload window expires mid-chunk
      const cutoffTimer = setTimeout(() => {
        cleanup();
        if (!settled) {
          settled = true;
          const sockDelta =
            req.socket && req.socket.bytesWritten >= baseSocketBytes
              ? req.socket.bytesWritten - baseSocketBytes
              : offset;
          req.destroy();
          resolve(Math.max(32 * 1024, Math.min(payload.length, sockDelta || offset)));
        }
      }, maxDurationMs);

      const cleanup = () => {
        clearInterval(ticker);
        clearTimeout(cutoffTimer);
        this.activeRequests.delete(req);
      };

      req.on('timeout', () => {
        cleanup();
        if (!settled) {
          settled = true;
          req.destroy();
          if (offset > 0) {
            resolve(offset);
          } else {
            reject(new Error('Upload test chunk timed out'));
          }
        }
      });

      req.on('error', (err) => {
        cleanup();
        if (settled) return;
        settled = true;
        if (offset > 64 * 1024) {
          resolve(offset);
        } else {
          reject(err);
        }
      });

      const sliceSize = 32 * 1024;
      const writeNext = () => {
        if (this.cancelled || settled) {
          req.destroy();
          return;
        }
        while (offset < payload.length) {
          const end = Math.min(offset + sliceSize, payload.length);
          const slice = payload.subarray(offset, end);
          offset = end;
          const canContinue = req.write(slice);
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
