import React, { useState } from 'react';
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  EyeOff,
  Gauge,
  Globe,
  MonitorSmartphone,
  Power,
  Router,
  ShieldAlert,
  Stethoscope,
  Wifi,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'Available on Router';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
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
  const offlineDevices = devices.filter((d) => !d.online && !d.blocked);
  const blockedDevices = devices.filter((d) => d.blocked);

  const displayedWanIp = revealWanIp
    ? networkStatus?.wanIp || '0.0.0.0'
    : maskWanIp(networkStatus?.wanIp);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Network Dashboard</h1>
          <p className="page-subtitle">
            Centralized real-time overview of your {routerInfo?.model || 'Tenda F3'} router, connected devices, and Internet link.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setActivePage('speedtest')}
          >
            <Gauge size={16} />
            Run Speed Test
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActivePage('devices')}
          >
            <MonitorSmartphone size={16} />
            Manage Devices ({onlineDevices.length})
          </button>
        </div>
      </div>

      {/* Top Summary Counters */}
      <div className="grid-4">
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <MonitorSmartphone size={17} color="var(--accent-primary)" />
              Total Known Devices
            </span>
          </div>
          <div className="stat-value">{devices.length}</div>
          <div className="stat-label">Tracked on local network</div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Activity size={17} color="var(--status-success)" />
              Online Now
            </span>
          </div>
          <div className="stat-value" style={{ color: 'var(--status-success)' }}>
            {onlineDevices.length}
          </div>
          <div className="stat-label">Active wireless & wired clients</div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <MonitorSmartphone size={17} color="var(--text-secondary)" />
              Offline / Known
            </span>
          </div>
          <div className="stat-value">{offlineDevices.length}</div>
          <div className="stat-label">Previously connected devices</div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ShieldAlert size={17} color="var(--status-danger)" />
              Blocked Devices
            </span>
          </div>
          <div className="stat-value" style={{ color: blockedDevices.length > 0 ? 'var(--status-danger)' : undefined }}>
            {blockedDevices.length}
          </div>
          <div className="stat-label">MAC-filtered from Internet</div>
        </div>
      </div>

      {/* Main 3-Column Overview */}
      <div className="grid-3">
        {/* Router Status Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Router size={18} color="var(--accent-primary)" />
              Router Status
            </span>
            <span className="badge badge-success">
              <span className="status-dot online" />
              Online
            </span>
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">Router Model</span>
              <span className="kv-value">{routerInfo?.model || 'Tenda F3'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Hardware Variant</span>
              <span className="kv-value">{routerInfo?.hardwareVersion || 'F3 v3.0'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Firmware Version</span>
              <span className="kv-value mono">{routerInfo?.firmwareVersion || 'V12.01.01.xx'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Gateway IP</span>
              <span className="kv-value mono">{routerInfo?.routerIp || '192.168.0.1'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Uptime</span>
              <span className="kv-value">{formatUptime(routerInfo?.uptimeSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Internet Status Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Globe size={18} color="var(--status-info)" />
              Internet Status
            </span>
            {networkStatus?.internetConnected ? (
              <span className="badge badge-success">● Connected</span>
            ) : (
              <span className="badge badge-danger">● Disconnected</span>
            )}
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">WAN IP Address</span>
              <span className="kv-value mono" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {displayedWanIp}
                <button
                  type="button"
                  onClick={() => setRevealWanIp((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                  }}
                  title={revealWanIp ? 'Mask WAN IP' : 'Reveal full WAN IP'}
                >
                  {revealWanIp ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Connection Type</span>
              <span className="kv-value">{networkStatus?.connectionType || 'Dynamic IP (DHCP)'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">DNS Servers</span>
              <span className="kv-value mono">
                {networkStatus?.primaryDns || '8.8.8.8'}, {networkStatus?.secondaryDns || '1.1.1.1'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Live Download Rate</span>
              <span className="kv-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <ArrowDownCircle size={14} color="var(--status-success)" />
                {networkStatus?.downloadSpeedKbps ?? 0} KB/s
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Live Upload Rate</span>
              <span className="kv-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <ArrowUpCircle size={14} color="var(--status-info)" />
                {networkStatus?.uploadSpeedKbps ?? 0} KB/s
              </span>
            </div>
          </div>
        </div>

        {/* Wireless & Quick Controls Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Wifi size={18} color="var(--accent-primary)" />
              Wi-Fi & Quick Actions
            </span>
            <span className="badge badge-info">{wifiSettings?.enabled !== false ? '2.4 GHz Active' : 'Disabled'}</span>
          </div>

          <div className="kv-list" style={{ marginBottom: '16px' }}>
            <div className="kv-row">
              <span className="kv-label">Network Name (SSID)</span>
              <span className="kv-value">{wifiSettings?.ssid || 'Tenda_F3'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Security Mode</span>
              <span className="kv-value">{wifiSettings?.securityMode || 'WPA/WPA2-PSK'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">SSID Broadcast</span>
              <span className="kv-value">{wifiSettings?.hideSsid ? 'Hidden' : 'Visible'}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActivePage('wifi')}
            >
              <Wifi size={14} />
              Configure Wi-Fi
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActivePage('diagnostics')}
            >
              <Stethoscope size={14} />
              Diagnostics
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActivePage('network')}
            >
              <Globe size={14} />
              WAN Details
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmRebootOpen(true)}
              disabled={rebootingRouter}
            >
              <Power size={14} />
              Restart Router
            </button>
          </div>
        </div>
      </div>

      {/* Connected Devices Preview Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Connected Devices</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActivePage('devices')}
          >
            View All Devices →
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>IP Address</th>
                <th>MAC Address</th>
                <th>Connection</th>
                <th>Bandwidth Limit</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {onlineDevices.slice(0, 6).map((dev) => (
                <tr key={dev.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{dev.customName || dev.hostname}</div>
                    {dev.customName && (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        Router Hostname: {dev.hostname}
                      </div>
                    )}
                  </td>
                  <td className="mono">{dev.ipAddress}</td>
                  <td className="mono">{dev.macAddress}</td>
                  <td>{dev.connectionType}</td>
                  <td>
                    {dev.downloadLimitKbps > 0 || dev.uploadLimitKbps > 0
                      ? `↓ ${dev.downloadLimitKbps || '∞'} / ↑ ${dev.uploadLimitKbps || '∞'} KB/s`
                      : 'Unlimited'}
                  </td>
                  <td>
                    <span className="badge badge-success">Online</span>
                  </td>
                  <td>
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
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    No active online devices reported by the router.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRebootOpen}
        title="Restart Router?"
        description="All connected devices will temporarily lose Internet and Wi-Fi access while the Tenda F3 reboots."
        confirmLabel="Restart Router"
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
