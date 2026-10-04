import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WifiRelayMode, WifiScanNetwork } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const MODE_LABELS: Record<WifiRelayMode, string> = {
  'client+ap': 'Universal Repeater',
  wisp: 'WISP',
  ap: 'Access Point (AP)',
  disabled: 'Router (Disabled)',
};

export const RepeaterPage: React.FC = () => {
  const { routerInfo, wifiRelay, wifiSettings, refreshAllData, addToast } = useApp();

  const [mode, setMode] = useState<WifiRelayMode>('client+ap');
  const [upstreamSsid, setUpstreamSsid] = useState('');
  const [upstreamMac, setUpstreamMac] = useState('');
  const [upstreamChannel, setUpstreamChannel] = useState<string | number>(1);
  const [upstreamSecurityMode, setUpstreamSecurityMode] = useState('WPA/WPA2-PSK');
  const [upstreamPassword, setUpstreamPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scannedNetworks, setScannedNetworks] = useState<WifiScanNetwork[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wifiRelay) {
      setMode(wifiRelay.mode);
      setUpstreamSsid(wifiRelay.upstreamSsid || '');
      setUpstreamMac(wifiRelay.upstreamMac || '');
      setUpstreamChannel(wifiRelay.upstreamChannel || 1);
      setUpstreamSecurityMode(wifiRelay.upstreamSecurityMode || 'WPA/WPA2-PSK');
      setUpstreamPassword(wifiRelay.upstreamPassword || '');
    }
  }, [wifiRelay]);

  const handleScanNetworks = async () => {
    setScanning(true);
    try {
      const list = await window.tendaApi.scanWifiNetworks();
      setScannedNetworks(list);
      setHasScanned(true);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Unable to scan networks.');
    } finally {
      setScanning(false);
    }
  };

  const handleSelectNetwork = (net: WifiScanNetwork) => {
    setUpstreamSsid(net.ssid);
    setUpstreamMac(net.macAddress);
    setUpstreamChannel(net.channel);
    setUpstreamSecurityMode(net.securityMode || 'WPA/WPA2-PSK');
    if (net.ssid !== wifiRelay?.upstreamSsid) {
      setUpstreamPassword('');
    }
  };

  const needsBaseStation = mode === 'client+ap' || mode === 'wisp';
  const isOpenSecurity = /^none|open$/i.test(upstreamSecurityMode.trim());

  const validateBeforeConfirm = () => {
    if (wifiSettings && !wifiSettings.enabled && mode !== 'disabled') {
      addToast('error', 'Enable the Wi-Fi radio first.');
      return;
    }

    if (needsBaseStation) {
      if (!upstreamSsid.trim()) {
        addToast('warning', 'Select or enter a network name.');
        return;
      }
      if (!isOpenSecurity && upstreamPassword.length < 8) {
        addToast('warning', 'Password must be at least 8 characters.');
        return;
      }
    }

    setConfirmOpen(true);
  };

  const handleSaveRelay = async () => {
    setSaving(true);
    try {
      const result = await window.tendaApi.setWifiRelayConfig({
        mode,
        upstreamSsid: upstreamSsid.trim(),
        upstreamMac: upstreamMac.trim(),
        upstreamChannel,
        upstreamSecurityMode,
        upstreamPassword: isOpenSecurity ? '' : upstreamPassword,
      });

      if (result.applied) {
        setConfirmOpen(false);
        if (result.requiresReboot) {
          addToast('info', 'Applying changes and restarting router...');
          setTimeout(() => {
            refreshAllData();
          }, 3000);
        } else {
          await refreshAllData();
          addToast('success', 'Repeater settings saved');
        }
      } else {
        addToast('error', 'Repeater configuration could not be applied.');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Repeater configuration failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Universal Repeater</h1>
        <div className="filter-tabs" role="tablist" aria-label="Operating Mode">
          {(['client+ap', 'wisp', 'ap', 'disabled'] as WifiRelayMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`filter-tab ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Current Repeater State Strip */}
      <div className="overview-strip">
        <div className="overview-metric">
          <span className="overview-metric-label">Current Mode</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            {wifiRelay ? MODE_LABELS[wifiRelay.mode] : '—'}
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Connection Status</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            {!wifiRelay || wifiRelay.mode === 'disabled' ? (
              <>
                <span className="status-dot offline" />
                <span>Disabled</span>
              </>
            ) : wifiRelay.mode === 'ap' ? (
              <>
                <span className="status-dot online" />
                <span>Active (AP)</span>
              </>
            ) : wifiRelay.connectStatus === 'bridgeSuccess' ? (
              <>
                <span className="status-dot online" />
                <span>Bridged</span>
              </>
            ) : wifiRelay.connectStatus === 'pwdError' ? (
              <>
                <span className="status-dot danger" />
                <span>Password Error</span>
              </>
            ) : (
              <>
                <span className="status-dot warning" />
                <span>Disconnected</span>
              </>
            )}
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Upstream Network</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            {wifiRelay?.mode === 'client+ap' || wifiRelay?.mode === 'wisp'
              ? wifiRelay.upstreamSsid || 'None'
              : '—'}
          </div>
          {wifiRelay?.upstreamMac && (wifiRelay.mode === 'client+ap' || wifiRelay.mode === 'wisp') && (
            <span className="overview-metric-sub mono">
              Ch {wifiRelay.upstreamChannel} · {wifiRelay.upstreamMac}
            </span>
          )}
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Signal</span>
          <div className="overview-metric-value tabular" style={{ fontSize: 15 }}>
            {wifiRelay?.signalStrengthDbm !== null && wifiRelay?.signalStrengthDbm !== undefined
              ? `${wifiRelay.signalStrengthDbm} dBm`
              : '—'}
          </div>
        </div>

        <div className="overview-metric">
          <span className="overview-metric-label">Local Wi-Fi</span>
          <div className="overview-metric-value" style={{ fontSize: 15 }}>
            {wifiRelay?.extenderSsid || wifiSettings?.ssid || '—'}
          </div>
          <span className="overview-metric-sub mono">{routerInfo?.routerIp || '192.168.0.1'}</span>
        </div>
      </div>

      {needsBaseStation ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Available Networks */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              className="card-header"
              style={{ padding: '14px 18px', marginBottom: 0, borderBottom: '1px solid var(--border-subtle)' }}
            >
              <span className="card-title">Available Networks</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleScanNetworks}
                disabled={scanning}
              >
                <RefreshCw size={13} className={scanning ? 'spin' : ''} />
                <span>{scanning ? 'Scanning...' : 'Scan'}</span>
              </button>
            </div>

            {scannedNetworks.length === 0 ? (
              <div className="empty-state">
                {scanning
                  ? 'Scanning networks...'
                  : hasScanned
                  ? 'No networks found.'
                  : 'Click Scan to view available Wi-Fi networks.'}
              </div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 38 }}></th>
                      <th>Network</th>
                      <th>Ch</th>
                      <th>Security</th>
                      <th style={{ textAlign: 'right' }}>Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedNetworks.map((net) => {
                      const isPicked =
                        upstreamSsid === net.ssid &&
                        (!upstreamMac || upstreamMac.toUpperCase() === net.macAddress.toUpperCase());
                      return (
                        <tr
                          key={`${net.macAddress}-${net.ssid}`}
                          onClick={() => handleSelectNetwork(net)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isPicked ? 'var(--accent-subtle)' : undefined,
                          }}
                        >
                          <td>
                            <input
                              type="radio"
                              checked={isPicked}
                              onChange={() => handleSelectNetwork(net)}
                              style={{ accentColor: 'var(--accent-primary)' }}
                            />
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{net.ssid}</div>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {net.macAddress}
                            </div>
                          </td>
                          <td className="mono tabular">{net.channel}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {net.securityMode}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span
                              className={`badge tabular ${
                                net.signalPercent >= 65
                                  ? 'badge-success'
                                  : net.signalPercent >= 35
                                  ? 'badge-warning'
                                  : 'badge-danger'
                              }`}
                            >
                              {net.signalPercent}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected Network Configuration */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Selected Network</span>
              {upstreamSsid && <span className="badge badge-info">{upstreamSsid}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Network Name (SSID)</label>
              <input
                type="text"
                className="form-input"
                value={upstreamSsid}
                onChange={(e) => setUpstreamSsid(e.target.value)}
                placeholder="Select from list or enter SSID"
              />
            </div>

            {!isOpenSecurity && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Password</label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 6px', fontSize: 11.5 }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input mono"
                  value={upstreamPassword}
                  onChange={(e) => setUpstreamPassword(e.target.value)}
                  placeholder="Upstream Wi-Fi password"
                />
              </div>
            )}

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Security</label>
                <select
                  className="form-select"
                  value={upstreamSecurityMode}
                  onChange={(e) => setUpstreamSecurityMode(e.target.value)}
                >
                  <option value="WPA/WPA2-PSK">WPA/WPA2-PSK</option>
                  <option value="WPA2-PSK">WPA2-PSK</option>
                  <option value="WPA-PSK">WPA-PSK</option>
                  <option value="NONE">None (Open)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Channel</label>
                <input
                  type="number"
                  min={1}
                  max={13}
                  className="form-input mono"
                  value={upstreamChannel}
                  onChange={(e) => setUpstreamChannel(Number(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">MAC Address</label>
              <input
                type="text"
                className="form-input mono"
                value={upstreamMac}
                onChange={(e) => setUpstreamMac(e.target.value)}
                placeholder="XX:XX:XX:XX:XX:XX"
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              onClick={validateBeforeConfirm}
            >
              Connect & Apply
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-header">
            <span className="card-title">{MODE_LABELS[mode]}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {mode === 'ap'
              ? 'Operates as a wired Access Point connected via Ethernet cable. Local DHCP and NAT are disabled.'
              : 'Disables wireless repeating and operates as a standard router using the WAN port.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={validateBeforeConfirm}>
            Apply {MODE_LABELS[mode]}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Apply ${MODE_LABELS[mode]}?`}
        description={
          needsBaseStation
            ? `The router will bridge to "${upstreamSsid}" and restart.`
            : `The router will switch to ${MODE_LABELS[mode]} and restart.`
        }
        confirmLabel={saving ? 'Applying...' : 'Apply'}
        variant="primary"
        loading={saving}
        onConfirm={handleSaveRelay}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
