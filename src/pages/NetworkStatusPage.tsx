import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

function maskIp(ip: string | undefined): string {
  if (!ip || ip === '0.0.0.0') return '0.0.0.0';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

export const NetworkStatusPage: React.FC = () => {
  const { networkStatus, discovery, settings } = useApp();
  const [revealWan, setRevealWan] = useState<boolean>(settings ? !settings.maskWanIpByDefault : false);

  const localNet = discovery?.networkInterface;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Network</h1>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setRevealWan((v) => !v)}
        >
          {revealWan ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{revealWan ? 'Mask IP' : 'Show IP'}</span>
        </button>
      </div>

      <div className="overview-strip">
        <div className="overview-metric">
          <span className="overview-metric-label">Internet</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            <span className={`status-dot ${networkStatus?.internetConnected ? 'online' : 'danger'}`} />
            <span>{networkStatus?.internetConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Connection Type</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            {networkStatus?.connectionType || 'Dynamic IP'}
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">WAN / Bridge IP</span>
          <div className="overview-metric-value mono" style={{ fontSize: 15 }}>
            {revealWan ? networkStatus?.wanIp || '0.0.0.0' : maskIp(networkStatus?.wanIp)}
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Download Rate</span>
          <div className="overview-metric-value tabular" style={{ fontSize: 15 }}>
            {networkStatus?.downloadSpeedKbps ?? 0} KB/s
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Upload Rate</span>
          <div className="overview-metric-value tabular" style={{ fontSize: 15 }}>
            {networkStatus?.uploadSpeedKbps ?? 0} KB/s
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">WAN Interface</span>
            <span className={`badge ${networkStatus?.internetConnected ? 'badge-success' : 'badge-danger'}`}>
              {networkStatus?.internetConnected ? 'Active' : 'Offline'}
            </span>
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">Status</span>
              <span className="kv-value">{networkStatus?.connectionStatusText || 'Connected'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">IP Address</span>
              <span className="kv-value mono">
                {revealWan ? networkStatus?.wanIp || '0.0.0.0' : maskIp(networkStatus?.wanIp)}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Subnet Mask</span>
              <span className="kv-value mono">{networkStatus?.wanSubnetMask || '255.255.255.0'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Default Gateway</span>
              <span className="kv-value mono">
                {revealWan ? networkStatus?.wanGateway || '0.0.0.0' : maskIp(networkStatus?.wanGateway)}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Primary DNS</span>
              <span className="kv-value mono">{networkStatus?.primaryDns || '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Secondary DNS</span>
              <span className="kv-value mono">{networkStatus?.secondaryDns || '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">MAC Address</span>
              <span className="kv-value mono">{networkStatus?.wanMac || '—'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Local Adapter</span>
            <span className="badge badge-neutral">{localNet?.connectionType || 'LAN'}</span>
          </div>

          {localNet ? (
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-label">Interface</span>
                <span className="kv-value">{localNet.interfaceName}</span>
              </div>
              {localNet.ssid && (
                <div className="kv-row">
                  <span className="kv-label">Wi-Fi SSID</span>
                  <span className="kv-value">{localNet.ssid}</span>
                </div>
              )}
              <div className="kv-row">
                <span className="kv-label">IPv4 Address</span>
                <span className="kv-value mono">{localNet.localIp}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Subnet Mask</span>
                <span className="kv-value mono">{localNet.subnetMask}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Gateway</span>
                <span className="kv-value mono">{localNet.defaultGateway}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">MAC Address</span>
                <span className="kv-value mono">{localNet.macAddress}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">DNS Servers</span>
                <span className="kv-value mono">{localNet.dnsServers.join(', ') || '—'}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state">No active local network adapter detected.</div>
          )}
        </div>
      </div>
    </div>
  );
};
