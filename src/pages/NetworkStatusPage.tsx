import React, { useState } from 'react';
import { Eye, EyeOff, Globe, Laptop, Network } from 'lucide-react';
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
        <div>
          <h1 className="page-title">Network Status</h1>
          <p className="page-subtitle">
            Detailed WAN (Internet) configuration reported by the Tenda F3 and local computer network interface parameters.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setRevealWan((v) => !v)}
        >
          {revealWan ? <EyeOff size={16} /> : <Eye size={16} />}
          {revealWan ? 'Mask WAN IP Addresses' : 'Reveal WAN IP Addresses'}
        </button>
      </div>

      <div className="grid-2">
        {/* Router WAN Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Globe size={18} color="var(--accent-primary)" />
              Router WAN (Internet) Interface
            </span>
            {networkStatus?.internetConnected ? (
              <span className="badge badge-success">● Connected</span>
            ) : (
              <span className="badge badge-danger">● Disconnected</span>
            )}
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">WAN Status</span>
              <span className="kv-value">{networkStatus?.connectionStatusText || 'Connected'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Connection Type</span>
              <span className="kv-value">{networkStatus?.connectionType || 'Dynamic IP (DHCP)'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">WAN IP Address</span>
              <span className="kv-value mono">
                {revealWan ? networkStatus?.wanIp || '0.0.0.0' : maskIp(networkStatus?.wanIp)}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">WAN Subnet Mask</span>
              <span className="kv-value mono">{networkStatus?.wanSubnetMask || '255.255.255.0'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">WAN Default Gateway</span>
              <span className="kv-value mono">
                {revealWan ? networkStatus?.wanGateway || '0.0.0.0' : maskIp(networkStatus?.wanGateway)}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Primary DNS Server</span>
              <span className="kv-value mono">{networkStatus?.primaryDns || '8.8.8.8'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Secondary DNS Server</span>
              <span className="kv-value mono">{networkStatus?.secondaryDns || '8.8.4.4'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">WAN MAC Address</span>
              <span className="kv-value mono">{networkStatus?.wanMac || 'C8:3A:35:00:00:02'}</span>
            </div>
          </div>
        </div>

        {/* Local Computer Adapter Info */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Laptop size={18} color="var(--status-info)" />
              This Computer&apos;s Network Adapter
            </span>
            <span className="badge badge-info">{localNet?.connectionType || 'Local LAN'}</span>
          </div>

          {localNet ? (
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-label">Interface Name</span>
                <span className="kv-value">{localNet.interfaceName}</span>
              </div>
              {localNet.ssid && (
                <div className="kv-row">
                  <span className="kv-label">Connected Wi-Fi SSID</span>
                  <span className="kv-value">{localNet.ssid}</span>
                </div>
              )}
              <div className="kv-row">
                <span className="kv-label">Local IPv4 Address</span>
                <span className="kv-value mono">{localNet.localIp}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Subnet Mask</span>
                <span className="kv-value mono">{localNet.subnetMask}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">OS Default Gateway</span>
                <span className="kv-value mono">{localNet.defaultGateway}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Adapter MAC Address</span>
                <span className="kv-value mono">{localNet.macAddress}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Configured DNS Servers</span>
                <span className="kv-value mono">{localNet.dnsServers.join(', ')}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', padding: '16px 0' }}>
              No active local network interface details available.
            </div>
          )}
        </div>
      </div>

      {/* Live Bandwidth Summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Network size={18} color="var(--status-success)" />
            Current WAN Throughput
          </span>
        </div>
        <div className="grid-2">
          <div>
            <div className="stat-label">Real-Time Download Rate</div>
            <div className="stat-value" style={{ color: 'var(--status-success)' }}>
              {networkStatus?.downloadSpeedKbps ?? 0} <span style={{ fontSize: '15px' }}>KB/s</span>
            </div>
          </div>
          <div>
            <div className="stat-label">Real-Time Upload Rate</div>
            <div className="stat-value" style={{ color: 'var(--status-info)' }}>
              {networkStatus?.uploadSpeedKbps ?? 0} <span style={{ fontSize: '15px' }}>KB/s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
