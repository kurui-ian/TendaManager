import fs from 'fs';
import path from 'path';
import os from 'os';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  meta?: string;
}

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(password["'\s:=]+)([^"'\s&,;}]+)/gi, replacement: '$1[REDACTED]' },
  { pattern: /(wifiPwd["'\s:=]+)([^"'\s&,;}]+)/gi, replacement: '$1[REDACTED]' },
  { pattern: /(wifiRelayPwd["'\s:=]+)([^"'\s&,;}]+)/gi, replacement: '$1[REDACTED]' },
  { pattern: /(extenderPwd["'\s:=]+)([^"'\s&,;}]+)/gi, replacement: '$1[REDACTED]' },
  { pattern: /(ecos_pw=)([^;\s"']+)/gi, replacement: '$1[REDACTED]' },
  { pattern: /(Set-Cookie["'\s:=]+)([^"\r\n]+)/gi, replacement: '$1[REDACTED_COOKIE]' },
  { pattern: /(Cookie["'\s:=]+)([^"\r\n]+)/gi, replacement: '$1[REDACTED_COOKIE]' },
  { pattern: /(token["'\s:=]+)([^"'\s&,;}]+)/gi, replacement: '$1[REDACTED]' },
];

export function sanitizeLogString(input: string): string {
  let result = input;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function maskIpAddress(ip: string): string {
  if (!ip || typeof ip !== 'string') return 'xxx.xxx.xxx.xxx';
  const parts = ip.trim().split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

export class Logger {
  private entries: LogEntry[] = [];
  private readonly maxEntries = 500;
  private logFilePath: string;

  constructor(customLogDir?: string) {
    const baseDir =
      customLogDir ||
      path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'TendaManager', 'logs');
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch {
      // Ignore directory creation errors in restricted test environments
    }
    this.logFilePath = path.join(baseDir, 'tendamanager.log');
  }

  public log(level: LogLevel, component: string, message: string, meta?: unknown): void {
    const safeMessage = sanitizeLogString(String(message));
    let safeMeta: string | undefined;

    if (meta !== undefined) {
      try {
        const raw = typeof meta === 'string' ? meta : JSON.stringify(meta);
        safeMeta = sanitizeLogString(raw);
      } catch {
        safeMeta = '[Unserializable Meta]';
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message: safeMessage,
      meta: safeMeta,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    const formatted = `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}${
      entry.meta ? ` | ${entry.meta}` : ''
    }\n`;

    try {
      fs.appendFileSync(this.logFilePath, formatted, 'utf8');
    } catch {
      // Non-fatal if file is locked
    }
  }

  public info(component: string, message: string, meta?: unknown): void {
    this.log('INFO', component, message, meta);
  }

  public warn(component: string, message: string, meta?: unknown): void {
    this.log('WARN', component, message, meta);
  }

  public error(component: string, message: string, meta?: unknown): void {
    this.log('ERROR', component, message, meta);
  }

  public debug(component: string, message: string, meta?: unknown): void {
    this.log('DEBUG', component, message, meta);
  }

  public getRecentEntries(limit = 150): LogEntry[] {
    return this.entries.slice(-limit);
  }

  public getFormattedLogs(limit = 200): string[] {
    return this.getRecentEntries(limit).map(
      (e) =>
        `[${e.timestamp}] [${e.level}] [${e.component}] ${e.message}${e.meta ? ` | ${e.meta}` : ''}`
    );
  }

  public clearLogs(): void {
    this.entries = [];
    try {
      if (fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, '', 'utf8');
      }
    } catch {
      // Ignore
    }
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}

export const logger = new Logger();
