import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';
import { logger } from '../logger/logger';

interface SimDevice {
  qosListHostname: string;
  qosListRemark: string;
  qosListIP: string;
  qosListConnectType: 'wifi' | 'wired';
  qosListMac: string;
  qosListDownSpeed: string;
  qosListUpSpeed: string;
  qosListDownLimit: string;
  qosListUpLimit: string;
  qosListAccess: 'true' | 'false';
}

interface SimBlackDevice {
  qosListHostname: string;
  qosListRemark: string;
  qosListMac: string;
}

/**
 * Local Tenda F3 HTTP Firmware Simulator (V12.01.01.48_en / V12.01.01.52_multi eCos httpd protocol).
 * Supports /goform/getStatus, /goform/getHomePageInfo, /goform/getQos, /goform/setQos,
 * /goform/getWifi, /goform/setWifi, /goform/getWifiRelay (including wifiScan), and /goform/setWifiRelay.
 */
export class TendaF3SimulatorServer {
  private server: http.Server | null = null;
  private port = 0;
  private adminPassword = 'admin';
  private activeSessionToken: string | null = null;
  private startTime = Date.now();

  private wifiState = {
    wifiEn: 'true',
    wifiSSID: 'Tenda_F3_Home',
    wifiSecurityMode: 'wpa&wpa2',
    wifiPwd: 'TendaWifi2026',
    wifiHideSSID: 'false',
    wifiChannel: '6',
    wifiBandwidth: '20',
  };

  private relayState = {
    wifiRelayType: 'client+ap',
    wifiRelaySSID: 'Fiber_Upstream_WiFi',
    upperWifiSsid: 'Fiber_Upstream_WiFi',
    extenderSsid: 'Tenda_F3_Home',
    extenderPwd: 'TendaWifi2026',
    wifiRelayMAC: '78:17:BE:1A:07:17',
    wifiRelayChannel: '6',
    wifiRelaySecurityMode: 'wpa2/AES',
    wifiRelayPwd: 'UpstreamSecret123',
    wifiRelayConnectStatus: 'bridgeSuccess',
    connectState: 'bridgeSuccess',
    connectDuration: '14620',
  };

  private onlineDevices: SimDevice[] = [
    {
      qosListHostname: 'Desktop-Workstation',
      qosListRemark: '',
      qosListIP: '192.168.0.101',
      qosListConnectType: 'wired',
      qosListMac: 'C8:3A:35:11:22:01',
      qosListDownSpeed: '428',
      qosListUpSpeed: '64',
      qosListDownLimit: '38528',
      qosListUpLimit: '38528',
      qosListAccess: 'true',
    },
    {
      qosListHostname: 'Galaxy-A25',
      qosListRemark: '',
      qosListIP: '192.168.0.104',
      qosListConnectType: 'wifi',
      qosListMac: 'A4:77:33:89:10:B2',
      qosListDownSpeed: '185',
      qosListUpSpeed: '22',
      qosListDownLimit: '38528',
      qosListUpLimit: '38528',
      qosListAccess: 'true',
    },
    {
      qosListHostname: 'Samsung-SmartTV',
      qosListRemark: '',
      qosListIP: '192.168.0.108',
      qosListConnectType: 'wifi',
      qosListMac: '50:85:69:CC:41:19',
      qosListDownSpeed: '1240',
      qosListUpSpeed: '38',
      qosListDownLimit: '5120',
      qosListUpLimit: '1024',
      qosListAccess: 'true',
    },
    {
      qosListHostname: 'LivingRoom-Echo',
      qosListRemark: '',
      qosListIP: '192.168.0.112',
      qosListConnectType: 'wifi',
      qosListMac: '68:54:FD:30:9A:7E',
      qosListDownSpeed: '12',
      qosListUpSpeed: '4',
      qosListDownLimit: '38528',
      qosListUpLimit: '38528',
      qosListAccess: 'true',
    },
  ];

  private blackDevices: SimBlackDevice[] = [
    {
      qosListHostname: 'Unknown-Android-Pad',
      qosListRemark: 'Guest Tablet',
      qosListMac: 'D4:6E:0E:99:88:77',
    },
  ];

  public async start(preferredPort = 0): Promise<string> {
    if (this.server) {
      return this.getUrl();
    }

    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => this.handleRequest(req, res));
      srv.on('error', (err) => reject(err));
      srv.listen(preferredPort, '127.0.0.1', () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.server = srv;
        logger.info('TendaF3Simulator', `Started Tenda F3 V12.01.01.48_en Simulator at ${this.getUrl()}`);
        resolve(this.getUrl());
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server?.close(() => {
        this.server = null;
        this.port = 0;
        resolve();
      });
    });
  }

  public isRunning(): boolean {
    return this.server !== null;
  }

  public getUrl(): string {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  public setAdminPassword(pwd: string): void {
    this.adminPassword = pwd;
  }

  public expireSession(): void {
    this.activeSessionToken = null;
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.activeSessionToken) return false;
    const cookie = req.headers.cookie || '';
    const expectedB64 = Buffer.from(this.adminPassword, 'utf8').toString('base64');
    const expectedMd5 = crypto.createHash('md5').update(this.adminPassword, 'utf8').digest('hex');
    return (
      cookie.includes(`ecos_pw=${this.activeSessionToken}`) ||
      cookie.includes(`ecos_pw=${expectedB64}`) ||
      cookie.includes(`ecos_pw=${expectedMd5}`)
    );
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  private parseForm(body: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of body.split('&')) {
      if (!pair) continue;
      const idx = pair.indexOf('=');
      if (idx > -1) {
        const k = decodeURIComponent(pair.slice(0, idx));
        const v = decodeURIComponent(pair.slice(idx + 1));
        out[k] = v;
      }
    }
    return out;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${this.port || 80}`);
    const pathname = reqUrl.pathname;

    if (pathname === '/' || pathname === '/index.html' || pathname === '/login.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        Server: 'GoAhead-Webs',
        'Set-Cookie': 'bLanguage=en; path=/',
      });
      res.end(
        `<!DOCTYPE html><html><head><title>Tenda Wireless Router F3</title></head>` +
          `<body><!-- Tenda F3 V12.01.01.48_en reasy-ui --><form action="/login/Auth" method="post">` +
          `<input type="hidden" id="username" value="admin"/><input type="password" id="login-password"/></form></body></html>`
      );
      return;
    }

    if (pathname === '/common/macro_config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(
        `var CONFIG_FIRMWARE_VERSION = "V12.01.01.48_en";\nvar CONFIG_PRODUCT_NAME = "F3";\nvar CONFIG_HW_VER = "V3.0";\n`
      );
      return;
    }

    if (pathname === '/goform/getHomePageInfo') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          loginAuth: {
            hasLoginPwd: this.adminPassword ? 'true' : 'false',
            'username ': 'admin',
          },
          wifiRelay: this.relayState,
        })
      );
      return;
    }

    if (pathname === '/login/Auth' && req.method === 'POST') {
      const body = await this.readBody(req);
      const form = this.parseForm(body);
      const submittedPwd = form.password || '';
      const expectedB64 = Buffer.from(this.adminPassword, 'utf8').toString('base64');
      const expectedMd5 = crypto.createHash('md5').update(this.adminPassword, 'utf8').digest('hex');

      if (submittedPwd === expectedB64 || submittedPwd === expectedMd5 || submittedPwd === this.adminPassword) {
        this.activeSessionToken = submittedPwd;
        res.writeHead(302, {
          Location: '/index.html',
          'Set-Cookie': `ecos_pw=${submittedPwd}; path=/`,
        });
        res.end();
      } else {
        res.writeHead(302, {
          Location: '/login.html?error=passwordError',
        });
        res.end();
      }
      return;
    }

    if (pathname === '/goform/loginOut') {
      this.activeSessionToken = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errCode: 0 }));
      return;
    }

    if (!this.isAuthorized(req)) {
      res.writeHead(302, { Location: '/login.html' });
      res.end('<html><body>Redirecting to /login.html</body></html>');
      return;
    }

    if (pathname === '/goform/getStatus') {
      const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000) + 14620;
      const payload = {
        systemInfo: {
          productName: 'Tenda F3',
          softVersion: 'V12.01.01.48_en',
          lanIP: '192.168.0.1',
          macAddr: 'C8:3A:35:4F:8A:10',
          statusWanMAC: 'C8:3A:35:4F:8A:11',
          statusWanIP: '105.163.42.198',
          statusWanMask: '255.255.252.0',
          statusWanGaterway: '105.163.40.1',
          statusWanDns1: '8.8.8.8',
          statusWanDns2: '1.1.1.1',
          wanType: 'dhcp',
          runTime: String(uptimeSeconds),
          wanConnectTime: String(uptimeSeconds),
          sysTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        },
        internetStatus: {
          wanConnectStatus: '0113',
          wanIp: '105.163.42.198',
          wanMask: '255.255.252.0',
          wanGw: '105.163.40.1',
          wanDns1: '8.8.8.8',
          wanDns2: '1.1.1.1',
          wanMac: 'C8:3A:35:4F:8A:11',
          wanType: '0',
          wanUpSpeed: '96',
          wanDownSpeed: '1865',
          wanConnectTime: String(uptimeSeconds),
        },
        wanAdvCfg: {
          macWan: 'C8:3A:35:4F:8A:11',
          macRouter: 'C8:3A:35:4F:8A:10',
        },
        deviceStastics: {
          statusBlackNum: String(this.blackDevices.length),
          statusOnlineNumber: String(this.onlineDevices.length),
          statusUpSpeed: '96',
          statusDownSpeed: '1865',
          wifiRate: '-52',
          routerName: this.relayState.wifiRelaySSID,
          extendName: this.wifiState.wifiSSID,
        },
        wifiRelay: this.relayState,
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (pathname === '/goform/getQos') {
      const payload = {
        localhost: {
          localhost: '192.168.0.101',
          mac: 'C8:3A:35:11:22:01',
        },
        onlineList: this.onlineDevices,
        blackList: this.blackDevices,
        macFilter: {
          curFilterMode: 'deny',
          macFilterList: [],
        },
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (pathname === '/goform/setQos' && req.method === 'POST') {
      const body = await this.readBody(req);
      const form = this.parseForm(body);

      const existingIpByMac = new Map<string, { ip: string; type: 'wifi' | 'wired'; down: string; up: string }>();
      for (const dev of this.onlineDevices) {
        existingIpByMac.set(dev.qosListMac.toUpperCase(), {
          ip: dev.qosListIP,
          type: dev.qosListConnectType,
          down: dev.qosListDownSpeed,
          up: dev.qosListUpSpeed,
        });
      }

      if (form.qosList !== undefined) {
        const newOnline: SimDevice[] = [];
        const newBlack: SimBlackDevice[] = [];
        const rows = form.qosList.split('\n').filter((r) => r.trim().length > 0);
        rows.forEach((row, idx) => {
          const cols = row.split('\t');
          if (cols.length >= 6) {
            const [host, remark, mac, upLimit, downLimit, access] = cols;
            const upperMac = mac.toUpperCase();
            if (access === 'false') {
              newBlack.push({
                qosListHostname: host || 'Blocked Device',
                qosListRemark: remark || '',
                qosListMac: upperMac,
              });
            } else {
              const prev = existingIpByMac.get(upperMac);
              newOnline.push({
                qosListHostname: host || 'Device',
                qosListRemark: remark || '',
                qosListIP: prev?.ip || `192.168.0.${115 + idx}`,
                qosListConnectType: prev?.type || 'wifi',
                qosListMac: upperMac,
                qosListDownSpeed: prev?.down || '45',
                qosListUpSpeed: prev?.up || '10',
                qosListUpLimit: upLimit || '38528',
                qosListDownLimit: downLimit || '38528',
                qosListAccess: 'true',
              });
            }
          }
        });
        this.onlineDevices = newOnline;
        this.blackDevices = newBlack;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ errCode: '0' }));
      return;
    }

    if (pathname === '/goform/getWifi') {
      const payload = {
        wifiEn: { wifiEn: this.wifiState.wifiEn },
        wifiBasicCfg: {
          wifiEn: this.wifiState.wifiEn,
          wifiSSID: this.wifiState.wifiSSID,
          wifiSecurityMode: this.wifiState.wifiSecurityMode,
          wifiPwd: this.wifiState.wifiPwd,
          wifiHideSSID: this.wifiState.wifiHideSSID,
        },
        wifiAdvCfg: {
          wifiChannel: this.wifiState.wifiChannel,
          wifiChannelCurrent: this.wifiState.wifiChannel,
          wifiBandwidth: this.wifiState.wifiBandwidth,
          wifiBandwidthCurrent: this.wifiState.wifiBandwidth,
        },
        wifiPower: {
          wifiPower: 'high',
          wifiPowerGear: 'hide_power',
        },
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (pathname === '/goform/setWifi' && req.method === 'POST') {
      const body = await this.readBody(req);
      const form = this.parseForm(body);
      if (form.wifiEn !== undefined) this.wifiState.wifiEn = form.wifiEn;
      if (form.wifiSSID !== undefined) this.wifiState.wifiSSID = form.wifiSSID;
      if (form.wifiSecurityMode !== undefined) this.wifiState.wifiSecurityMode = form.wifiSecurityMode;
      if (form.wifiPwd !== undefined) this.wifiState.wifiPwd = form.wifiPwd;
      if (form.wifiHideSSID !== undefined) this.wifiState.wifiHideSSID = form.wifiHideSSID;

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ errCode: '0' }));
      return;
    }

    if (pathname === '/goform/getWifiRelay') {
      const modules = reqUrl.searchParams.get('modules') || '';
      if (modules.includes('wifiScan')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            wifiScan: [
              {
                wifiScanSSID: 'Fiber_Upstream_WiFi',
                wifiScanMAC: '78:17:BE:1A:07:17',
                wifiScanChannel: '6',
                wifiScanSecurityMode: 'WPA2/AES',
                wifiScanSignalStrength: '-52',
              },
              {
                wifiScanSSID: 'Office_Main_Router',
                wifiScanMAC: 'B4:0F:3B:36:FF:80',
                wifiScanChannel: '11',
                wifiScanSecurityMode: 'WPAWPA2/AES',
                wifiScanSignalStrength: '-64',
              },
              {
                wifiScanSSID: 'Neighbor_Guest_WiFi',
                wifiScanMAC: 'CC:2D:21:1E:1D:28',
                wifiScanChannel: '1',
                wifiScanSecurityMode: 'NONE',
                wifiScanSignalStrength: '-78',
              },
            ],
          })
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          wifiEn: { wifiEn: this.wifiState.wifiEn },
          wifiRelay: this.relayState,
        })
      );
      return;
    }

    if (pathname === '/goform/setWifiRelay' && req.method === 'POST') {
      const body = await this.readBody(req);
      const form = this.parseForm(body);
      if (form.wifiRelayType !== undefined) {
        this.relayState.wifiRelayType = form.wifiRelayType;
      }
      if (form.wifiRelaySSID !== undefined) {
        this.relayState.wifiRelaySSID = form.wifiRelaySSID;
        this.relayState.upperWifiSsid = form.wifiRelaySSID;
      }
      if (form.wifiRelayMAC !== undefined) {
        this.relayState.wifiRelayMAC = form.wifiRelayMAC;
      }
      if (form.wifiRelayChannel !== undefined) {
        this.relayState.wifiRelayChannel = form.wifiRelayChannel;
      }
      if (form.wifiRelaySecurityMode !== undefined) {
        this.relayState.wifiRelaySecurityMode = form.wifiRelaySecurityMode;
      }
      if (form.wifiRelayPwd !== undefined) {
        this.relayState.wifiRelayPwd = form.wifiRelayPwd;
      }
      this.relayState.wifiRelayConnectStatus =
        this.relayState.wifiRelayType === 'disabled' ? 'disconnect' : 'bridgeSuccess';
      this.relayState.connectState = this.relayState.wifiRelayConnectStatus;

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ errCode: '0' }));
      return;
    }

    if (pathname === '/goform/sysReboot' || pathname === '/goform/SysToolReboot') {
      this.startTime = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ errCode: '100' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

export const tendaSimulator = new TendaF3SimulatorServer();
