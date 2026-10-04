import React from 'react';
import { BookOpen, CheckCircle2, Cpu, HelpCircle, ShieldCheck, Wifi } from 'lucide-react';

export const HelpPage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Help, Troubleshooting & Compatibility</h1>
          <p className="page-subtitle">
            User guide for managing your Tenda F3 router and hardware/firmware compatibility reference.
          </p>
        </div>
      </div>

      {/* Firmware Compatibility Matrix */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Cpu size={18} color="var(--accent-primary)" />
            Tenda F3 Hardware & Firmware Compatibility Matrix
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hardware Version</th>
                <th>Adapter Module</th>
                <th>Typical Firmware Branch</th>
                <th>Auth Mechanism</th>
                <th>Device & MAC Block</th>
                <th>Bandwidth QoS</th>
                <th>Wi-Fi Config</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Tenda F3 v2.0</td>
                <td className="mono">F3V2Adapter</td>
                <td className="mono">V11.xx / V12.01.01.early</td>
                <td>Base64 + Form Fallback</td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Tenda F3 v3.0</td>
                <td className="mono">F3V3Adapter</td>
                <td className="mono">V12.01.01.34 – V12.01.01.48</td>
                <td>Base64 (/login/Auth + ecos_pw)</td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Tenda F3 v4.0</td>
                <td className="mono">F3V4Adapter</td>
                <td className="mono">V12.01.01.45+ (Rev 4.0)</td>
                <td>MD5 / Base64 Auto-Negotiation</td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Tenda F3 v5.0</td>
                <td className="mono">F3V5Adapter</td>
                <td className="mono">V12.01.01.5x (Rev 5.0)</td>
                <td>Base64 / MD5 Auto-Negotiation</td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
                <td><span className="badge badge-success">Supported</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequently Asked Questions / User Guide */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Wifi size={18} color="var(--status-info)" />
              Connecting & Logging In
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>1. How do I connect to my Tenda F3?</strong>
              <p style={{ marginTop: '3px' }}>
                Connect your Windows computer to your Tenda F3 Wi-Fi network or plug an Ethernet cable into one of the router&apos;s LAN ports (1, 2, or 3). TendaManager automatically detects the default gateway (typically <code className="mono">192.168.0.1</code>).
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>2. Where do I find the router login password?</strong>
              <p style={{ marginTop: '3px' }}>
                The router administrator password is the password set during initial router setup for opening <code className="mono">192.168.0.1</code> (often different from your Wi-Fi password). If you forgot it, press and hold the physical <strong>WPS/RST</strong> button on the back of the Tenda F3 for 8 seconds to restore factory defaults.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>3. What if 192.168.0.1 does not load?</strong>
              <p style={{ marginTop: '3px' }}>
                Check the <strong>Diagnostics</strong> page to see your computer&apos;s actual Default Gateway IP. If your Tenda F3 is connected behind an ISP fiber ONT (e.g., <code className="mono">192.168.100.1</code>), make sure your computer is connected to the Tenda F3&apos;s Wi-Fi rather than the ISP modem&apos;s Wi-Fi.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <BookOpen size={18} color="var(--status-success)" />
              Managing Devices, Bandwidth & Wi-Fi
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>4. How does Device Blocking work?</strong>
              <p style={{ marginTop: '3px' }}>
                When you click <strong>Block</strong> on a device, TendaManager adds the device&apos;s hardware MAC address to the Tenda F3&apos;s MAC Filter Blacklist (<code className="mono">/goform/setQos</code>). The router immediately blocks that device from accessing the Internet until you click <strong>Unblock</strong>.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>5. How do Bandwidth Limits work?</strong>
              <p style={{ marginTop: '3px' }}>
                Tenda F3 supports per-device Download and Upload rate limiting via its QoS engine. Select a preset (e.g., <code className="mono">1 Mbps</code>, <code className="mono">5 Mbps</code>) or enter a custom Mbps value in the Device Details drawer.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>6. What happens when I change Wi-Fi settings?</strong>
              <p style={{ marginTop: '3px' }}>
                Updating the Wi-Fi name (SSID) or password restarts the router&apos;s 2.4 GHz wireless radio. All wireless devices will disconnect and must reconnect using the new Wi-Fi credentials.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <ShieldCheck size={18} color="var(--status-success)" />
          <span>
            <strong>Privacy & Local-First Guarantee:</strong> TendaManager communicates directly with your local router over LAN/Wi-Fi. Router passwords are encrypted using the Windows Data Protection API (DPAPI) and are never transmitted to any external cloud service.
          </span>
          <HelpCircle size={16} style={{ marginLeft: 'auto', opacity: 0.5 }} />
          <CheckCircle2 size={16} color="var(--status-success)" />
        </div>
      </div>
    </div>
  );
};
