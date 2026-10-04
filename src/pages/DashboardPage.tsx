import React, { useState } from 'react';
import {
  ArrowUpRight,
  Eye,
  Play,
  Power,
  Radio,
  Wifi,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MODE_LABELS } from './RepeaterPage';

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function maskWanIp(ip: string | undefined): string {
  if (!ip || ip === '0.0.0.0') return '0.0.0.0';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

export const DashboardPage: React.FC = () => {
  const {
    routerInfo,
    networkStatus,
    devices,
    wifiSettings,
    wifiRelay,
    speedTestHistory,
    settings,
    setActivePage,
    triggerRouterReboot,
    rebootingRouter,
  } = useApp();

  const [revealWanIp, setRevealWanIp] = useState<boolean>(
    settings ? !settings.maskWanIpByDefault : false
  );
  const [confirmRebootOpen, setConfirmRebootOpen] = useState<boolean>(false);

  const onlineDevices = devices.filter((d) => d.online && !d.blocked);
  const blockedDevices = devices.filter((d) => d.blocked);
  const latestSpeedTest = speedTestHistory.length > 0 ? speedTestHistory[0] : null;

  const displayedWanIp = revealWanIp
    ? networkStatus?.wanIp || '0.0.0.0'
    : maskWanIp(networkStatus?.wanIp);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActivePage('wifi')}
          >
            <Wifi size={14} />
            <span>Wi-Fi</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActivePage('repeater')}
          >
            <Radio size={14} />
            <span>Repeater</span>
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setConfirmRebootOpen(true)}
            disabled={rebootingRouter}
          >
            <Power size={13} />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {/* Inline Overview Strip (No 4-Card Row) */}
      <div className="overview-strip">
        <div className="overview-metric">
          <span className="overview-metric-label">Router</span>
          <div className="overview-metric-value">
            <span className="status-dot online" />
            <span>{routerInfo?.model || 'Tenda F3'}</span>
          </div>
          <span className="overview-metric-sub mono">
            {routerInfo?.routerIp || '192.168.0.1'} · {formatUptime(routerInfo?.uptimeSeconds)}
          </span>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Internet</span>
          <div className="overview-metric-value">
            <span
              className={`status-dot ${
                networkStatus?.internetConnected ? 'online' : 'danger'
              }`}
            />
            <span>{networkStatus?.internetConnected ? 'Connected' : 'Offline'}</span>
          </div>
          <span
            className="overview-metric-sub mono"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span>{displayedWanIp}</span>
            <button
              type="button"
              onClick={() => setRevealWanIp((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
              title={revealWanIp ? 'Mask IP' : 'Show IP'}
            >
              <Eye size={12} />
            </button>
          </span>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Operating Mode</span>
          <div className="overview-metric-value" style={{ fontSize: 14.5 }}>
            {wifiRelay?.mode === 'client+ap'
              ? 'Universal Repeater'
              : wifiRelay?.mode === 'wisp'
              ? 'WISP'
              : wifiRelay?.mode === 'ap'
              ? 'Access Point'
              : 'Router'}
          </div>
          <span className="overview-metric-sub">
            {wifiRelay && (wifiRelay.mode === 'client+ap' || wifiRelay.mode === 'wisp')
              ? `${wifiRelay.upstreamSsid || 'No base station'}${
                  wifiRelay.signalStrengthDbm ? ` (${wifiRelay.signalStrengthDbm} dBm)` : ''
                }`
              : networkStatus?.connectionType || 'Dynamic IP'}
          </span>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Wi-Fi (2.4 GHz)</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            {wifiSettings?.ssid || 'Tenda_F3'}
          </div>
          <span className="overview-metric-sub">
            {wifiSettings?.enabled === false ? 'Disabled' : wifiSettings?.securityMode || 'WPA/WPA2-PSK'}
          </span>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Connected Devices</span>
          <div className="overview-metric-value tabular">
            {onlineDevices.length}
          </div>
          <span className="overview-metric-sub tabular">
            {blockedDevices.length > 0 ? `${blockedDevices.length} blocked` : `${devices.length} total`}
          </span>
        </div>
      </div>

      {/* Main Split Composition */}
      <div className="dashboard-split">
        {/* Left: Connected Devices Preview */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="card-header"
            style={{ padding: '14px 18px', marginBottom: 0, borderBottom: '1px solid var(--border-subtle)' }}
          >
            <span className="card-title">Connected Devices</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setActivePage('devices')}
            >
              <span>All Devices ({devices.length})</span>
              <ArrowUpRight size={13} />
            </button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>IP Address</th>
                  <th>MAC Address</th>
                  <th>Limit</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {onlineDevices.slice(0, 8).map((dev) => (
                  <tr key={dev.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{dev.customName || dev.hostname}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {dev.connectionType}
                      </div>
                    </td>
                    <td className="mono">{dev.ipAddress}</td>
                    <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                      {dev.macAddress}
                    </td>
                    <td className="tabular" style={{ fontSize: 12 }}>
                      {dev.downloadLimitKbps > 0 || dev.uploadLimitKbps > 0
                        ? `↓ ${dev.downloadLimitKbps || '∞'} / ↑ ${dev.uploadLimitKbps || '∞'} KB/s`
                        : 'Unlimited'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActivePage('devices')}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {onlineDevices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No devices connected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Speed Test & Network Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Speed Test Summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Speed Test</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setActivePage('speedtest')}
              >
                <Play size={12} />
                <span>{latestSpeedTest ? 'Test Again' : 'Start Test'}</span>
              </button>
            </div>

            {latestSpeedTest ? (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                    padding: '6px 0 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Download</div>
                    <div className="tabular" style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
                      {latestSpeedTest.downloadMbps}{' '}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>Mbps</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Upload</div>
                    <div className="tabular" style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
                      {latestSpeedTest.uploadMbps}{' '}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>Mbps</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Ping</div>
                    <div className="tabular" style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
                      {latestSpeedTest.pingMs}{' '}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>ms</span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    paddingTop: 10,
                  }}
                >
                  <span>{latestSpeedTest.serverName}</span>
                  <span className="tabular">{new Date(latestSpeedTest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px 0 4px', color: 'var(--text-muted)', fontSize: 13 }}>
                No speed tests yet.
              </div>
            )}
          </div>

          {/* System & Link Details */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Network Details</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setActivePage('network')}
              >
                <span>Details</span>
                <ArrowUpRight size={13} />
              </button>
            </div>

            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-label">Mode</span>
                <span className="kv-value">
                  {wifiRelay ? MODE_LABELS[wifiRelay.mode] : 'Router'}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Firmware</span>
                <span className="kv-value mono">{routerInfo?.firmwareVersion || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">MAC Address</span>
                <span className="kv-value mono">{routerInfo?.macAddress || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Primary DNS</span>
                <span className="kv-value mono">{networkStatus?.primaryDns || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Live Rate</span>
                <span className="kv-value mono">
                  ↓ {networkStatus?.downloadSpeedKbps ?? 0} KB/s · ↑ {networkStatus?.uploadSpeedKbps ?? 0} KB/s
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRebootOpen}
        title="Restart Router?"
        description="Connected devices will briefly lose Wi-Fi and Internet access while the router restarts."
        confirmLabel="Restart"
        variant="danger"
        loading={rebootingRouter}
        onConfirm={async () => {
          await triggerRouterReboot();
          setConfirmRebootOpen(false);
        }}
        onCancel={() => setConfirmRebootOpen(false)}
      />
    </div>
  );
};
