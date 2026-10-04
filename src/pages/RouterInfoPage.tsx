import React, { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  ExternalLink,
  Power,
  Router,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'Not exposed by firmware';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours}h ${mins}m ${secs}s`;
}

export const RouterInfoPage: React.FC = () => {
  const {
    routerInfo,
    session,
    rebootingRouter,
    triggerRouterReboot,
  } = useApp();

  const [confirmRebootOpen, setConfirmRebootOpen] = useState<boolean>(false);

  const caps = routerInfo?.capabilities;

  const capabilityRows: Array<{ label: string; supported: boolean }> = [
    { label: 'View Connected Devices (/goform/getQos)', supported: caps?.canViewDevices ?? true },
    { label: 'MAC Address Device Blocking (/goform/setQos)', supported: caps?.canBlockDevices ?? true },
    { label: 'Per-Device Upload/Download Bandwidth Control', supported: caps?.canControlBandwidth ?? true },
    { label: 'Wi-Fi SSID & WPA/WPA2 Configuration (/goform/setWifi)', supported: caps?.canChangeWifi ?? true },
    { label: 'Hide Wi-Fi SSID Broadcast', supported: caps?.canHideSsid ?? true },
    { label: 'WAN & Internet Status Inspection (/goform/getStatus)', supported: caps?.canViewWanStatus ?? true },
    { label: 'Remote System Reboot (/goform/sysReboot)', supported: caps?.canReboot ?? true },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Router Information</h1>
          <p className="page-subtitle">
            Hardware identification, firmware revision, active adapter details, and system administration controls.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.tendaApi?.openWebInterface(session?.routerAddress)}
          >
            <ExternalLink size={16} />
            Open Tenda Web Interface
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setConfirmRebootOpen(true)}
            disabled={rebootingRouter || caps?.canReboot === false}
          >
            <Power size={16} />
            {rebootingRouter ? 'Restarting Router...' : 'Restart Router'}
          </button>
        </div>
      </div>

      {rebootingRouter && (
        <div className="alert-banner warning">
          <Power size={18} />
          <span>
            <strong>Restarting Router...</strong> TendaManager is waiting for your Tenda F3 to finish rebooting and
            automatically re-establish the management session.
          </span>
        </div>
      )}

      <div className="grid-2">
        {/* Hardware & Firmware Details */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Router size={18} color="var(--accent-primary)" />
              System & Hardware Details
            </span>
            <span className="badge badge-success">● Active</span>
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">Model</span>
              <span className="kv-value">{routerInfo?.model || 'Tenda F3'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Hardware Revision</span>
              <span className="kv-value">{routerInfo?.hardwareVersion || session?.hardwareVersion || 'F3 v3.0'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Firmware Version</span>
              <span className="kv-value mono">{routerInfo?.firmwareVersion || session?.firmwareVersion}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Active Router Adapter</span>
              <span className="kv-value mono">{routerInfo?.adapterName || session?.adapterName}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Authentication Encoding</span>
              <span className="kv-value mono" style={{ textTransform: 'uppercase' }}>
                {caps?.authMethod || 'BASE64'}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Router LAN IP</span>
              <span className="kv-value mono">{routerInfo?.routerIp || session?.routerAddress}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Router LAN MAC</span>
              <span className="kv-value mono">{routerInfo?.macAddress || 'C8:3A:35:00:00:01'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">System Time</span>
              <span className="kv-value mono">{routerInfo?.systemTime || 'Synchronized'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">System Uptime</span>
              <span className="kv-value">{formatUptime(routerInfo?.uptimeSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Adapter Capabilities Matrix */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Cpu size={18} color="var(--status-info)" />
              Detected Adapter Capabilities
            </span>
            <span className="badge badge-info">{routerInfo?.adapterName || 'F3V3Adapter'}</span>
          </div>

          <div className="kv-list" style={{ marginBottom: '18px' }}>
            {capabilityRows.map((row) => (
              <div key={row.label} className="kv-row">
                <span className="kv-label">{row.label}</span>
                <span className="kv-value">
                  {row.supported ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={13} />
                      Supported
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      <XCircle size={13} />
                      Unsupported
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              fontSize: '12.5px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <ShieldCheck size={18} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Browser Fallback Support:</strong> For advancedISP-specific settings (such as IPTV VLAN tags,
              static routing tables, or manual firmware `.bin` uploads), click{' '}
              <strong>Open Tenda Web Interface</strong> above to open <code className="mono">http://{routerInfo?.routerIp || '192.168.0.1'}</code> directly in your default web browser.
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRebootOpen}
        title="Restart Router?"
        description="All connected devices will temporarily lose Internet access for approximately 45–60 seconds while the router restarts."
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
