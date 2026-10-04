import http from 'http';
import https from 'https';
import { URL } from 'url';
import { logger } from '../logger/logger';

export interface HttpResponseData {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  redirectLocation?: string;
}

export interface HttpClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Resilient HTTP/HTTPS client tailored for embedded router web servers (such as Tenda's eCos GoAhead/httpd).
 * Uses Node's insecureHTTPParser=true to tolerate non-strict HTTP header formatting common in router firmware,
 * manages session cookies automatically, and supports configurable timeouts and retries.
 */
export class TendaHttpClient {
  private baseUrl = 'http://192.168.0.1';
  private cookies: Map<string, string> = new Map();
  private timeoutMs = 6000;
  private maxRetries = 2;

  constructor(options?: HttpClientOptions) {
    if (options?.timeoutMs) this.timeoutMs = options.timeoutMs;
    if (options?.maxRetries !== undefined) this.maxRetries = options.maxRetries;
    this.cookies.set('bLanguage', 'en');
  }

  public setBaseUrl(address: string): void {
    let trimmed = address.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = `http://${trimmed}`;
    }
    this.baseUrl = trimmed.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setConfig(timeoutMs: number, maxRetries: number): void {
    this.timeoutMs = Math.max(1500, timeoutMs);
    this.maxRetries = Math.max(0, Math.min(5, maxRetries));
  }

  public setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  public getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  public clearCookies(): void {
    this.cookies.clear();
    this.cookies.set('bLanguage', 'en');
  }

  public getCookieHeader(): string {
    const parts: string[] = [];
    for (const [k, v] of this.cookies.entries()) {
      parts.push(`${k}=${v}`);
    }
    return parts.join('; ');
  }

  public getMaskedCookieSummary(): string {
    const keys = Array.from(this.cookies.keys());
    if (keys.length === 0) return 'none';
    return keys
      .map((k) => {
        const val = this.cookies.get(k) || '';
        if (k.toLowerCase().includes('pw') || k.toLowerCase().includes('pass') || k.toLowerCase().includes('token')) {
          return `${k}=[MASKED_${val.length}B]`;
        }
        return `${k}=${val}`;
      })
      .join('; ');
  }

  private captureCookies(setCookieHeader: string | string[] | undefined): void {
    if (!setCookieHeader) return;
    const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const item of list) {
      const firstSegment = item.split(';')[0];
      if (!firstSegment) continue;
      const eqIdx = firstSegment.indexOf('=');
      if (eqIdx > 0) {
        const name = firstSegment.slice(0, eqIdx).trim();
        const value = firstSegment.slice(eqIdx + 1).trim();
        if (name) {
          this.cookies.set(name, value);
        }
      }
    }
  }

  public async request(
    method: 'GET' | 'POST',
    endpointPath: string,
    bodyPayload?: string,
    customTimeoutMs?: number
  ): Promise<HttpResponseData> {
    const attempts = method === 'GET' ? this.maxRetries + 1 : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.executeSingleRequest(method, endpointPath, bodyPayload, customTimeoutMs);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }

    throw lastError || new Error(`HTTP ${method} ${endpointPath} failed`);
  }

  private executeSingleRequest(
    method: 'GET' | 'POST',
    endpointPath: string,
    bodyPayload?: string,
    customTimeoutMs?: number
  ): Promise<HttpResponseData> {
    return new Promise((resolve, reject) => {
      const fullUrl = endpointPath.startsWith('http')
        ? endpointPath
        : `${this.baseUrl}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(fullUrl);
      } catch (err) {
        reject(new Error(`Invalid router URL: ${fullUrl}`));
        return;
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;
      const timeout = customTimeoutMs || this.timeoutMs;

      const headers: Record<string, string> = {
        Accept: 'application/json, text/javascript, text/html, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TendaManager/1.0',
        Referer: `${this.baseUrl}/index.html`,
        Origin: this.baseUrl,
        'X-Requested-With': 'XMLHttpRequest',
        Connection: 'close',
      };

      const cookieStr = this.getCookieHeader();
      if (cookieStr) {
        headers['Cookie'] = cookieStr;
      }

      if (method === 'POST' && bodyPayload !== undefined) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        headers['Content-Length'] = Buffer.byteLength(bodyPayload, 'utf8').toString();
      }

      const requestOptions: http.RequestOptions & { rejectUnauthorized?: boolean; insecureHTTPParser?: boolean } = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers,
        timeout,
        insecureHTTPParser: true,
        rejectUnauthorized: false,
      };

      const req = transport.request(requestOptions, (res) => {
        this.captureCookies(res.headers['set-cookie']);

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const redirectLocation = res.headers.location;
          resolve({
            statusCode: res.statusCode || 200,
            headers: res.headers,
            body,
            redirectLocation,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request to ${parsedUrl.hostname}${parsedUrl.pathname} timed out after ${timeout}ms`));
      });

      req.on('error', (err) => {
        logger.debug('TendaHttpClient', `HTTP error on ${method} ${parsedUrl.pathname}: ${err.message}`);
        reject(err);
      });

      if (method === 'POST' && bodyPayload !== undefined) {
        req.write(bodyPayload, 'utf8');
      }
      req.end();
    });
  }

  public async getJson<T = Record<string, unknown>>(endpointPath: string): Promise<{
    data: T | null;
    sessionExpired: boolean;
    rawBody: string;
    statusCode: number;
  }> {
    const res = await this.request('GET', endpointPath);
    const location = res.redirectLocation || '';

    const isLoginRedirect =
      (res.statusCode >= 300 && res.statusCode < 400 && /login/i.test(location)) ||
      /window\.location.*login/i.test(res.body) ||
      (/<html/i.test(res.body) && /login/i.test(res.body) && endpointPath.includes('/goform/'));

    if (isLoginRedirect) {
      return {
        data: null,
        sessionExpired: true,
        rawBody: res.body,
        statusCode: res.statusCode,
      };
    }

    try {
      const cleaned = res.body.trim();
      const parsed = JSON.parse(cleaned) as T;
      return {
        data: parsed,
        sessionExpired: false,
        rawBody: res.body,
        statusCode: res.statusCode,
      };
    } catch {
      return {
        data: null,
        sessionExpired: false,
        rawBody: res.body,
        statusCode: res.statusCode,
      };
    }
  }

  public async postForm(
    endpointPath: string,
    params: Record<string, string | number | boolean>
  ): Promise<HttpResponseData> {
    const encoded = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return this.request('POST', endpointPath, encoded);
  }
}
