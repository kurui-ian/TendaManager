import React, { useEffect, useState } from 'react';
import {
  Radio,
  RefreshCw,
  Wifi,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  Signal,
  Router,
  Globe,
  Network,
  PowerOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WifiRelayMode, WifiScanNetwork } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const MODE_LABELS: Record<WifiRelayMode, string> = {
  'client+ap': 'Universal Repeater (Client + AP)',
  wisp: 'WISP Mode (Wireless WAN + NAT)',
  ap: 'Access Point (AP Mode)',
  disabled: 'Disabled (Standard Router Mode)',
};

export const MODE_DESCRIPTIONS: Record<WifiRelayMode, string> = {
  'client+ap':
    'Wireless bridge to your main Wi-Fi router on the same subnet. Extends wireless coverage seamlessly. DHCP is handled by the main router.',
  wisp: 'Connects wirelessly to an upstream Wi-Fi network as WAN while creating a separate local subnet and DHCP server for your devices.',
  ap: 'Connects to your main router via an Ethernet cable and broadcasts Wi-Fi as a wired Access Point (NAT and local DHCP disabled).',
  disabled:
    'Standard wireless router mode. Connects to your modem/ISP via the WAN Ethernet port with full NAT and DHCP.',
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
      addToast(
        'info',
        'Wi-Fi Scan Complete',
        `Discovered ${list.length} nearby 2.4 GHz wireless network${list.length === 1 ? '' : 's'}.`
      );
    } catch (err) {
      addToast('error', 'Wi-Fi Scan Failed', err instanceof Error ? err.message : 'Could not scan nearby networks');
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
      addToast('error', 'Wi-Fi Radio Disabled', 'Please enable the Wi-Fi radio on the Wi-Fi Settings page first.');
      return;
    }

    if (needsBaseStation) {
      if (!upstreamSsid.trim()) {
        addToast(
          'warning',
          'Base Station Required',
          'Scan and select an upstream Wi-Fi network (or enter its SSID) before saving.'
        );
        return;
      }
      if (!isOpenSecurity && upstreamPassword.length < 8) {
        addToast(
          'warning',
          'Upstream Wi-Fi Password Required',
          'Please enter the upstream Wi-Fi password (minimum 8 characters).'
        );
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
          addToast(
            'success',
            'Wireless Repeating Saved — Rebooting Router',
            `Tenda F3 is switching to ${MODE_LABELS[mode]} and restarting...`
          );
          setTimeout(() => {
            refreshAllData();
          }, 3000);
        } else {
          await refreshAllData();
          addToast('success', 'Wireless Repeating Updated', `Applied ${MODE_LABELS[mode]} settings.`);
        }
      } else {
        addToast('error', 'Update Failed', 'Router rejected the Wireless Repeating configuration.');
      }
    } catch (err) {
      addToast('error', 'Save Error', err instanceof Error ? err.message : 'Failed to apply repeating settings');
    } finally {
      setSaving(false);
    }
  };

  const renderConnectStatusBadge = () => {
    if (!wifiRelay) return <span className="badge badge-neutral">Loading...</span>;
    if (wifiRelay.mode === 'disabled') {
      return <span className="badge badge-neutral">Disabled (Standard Router)</span>;
    }
    if (wifiRelay.mode === 'ap') {
      return <span className="badge badge-success">● Active (Wired Access Point)</span>;
    }
    if (wifiRelay.connectStatus === 'bridgeSuccess') {
      return <span className="badge badge-success">● Bridged Successfully!</span>;
    }
    if (wifiRelay.connectStatus === 'pwdError') {
      return <span className="badge badge-danger">● Upstream Password Error</span>;
    }
    return <span className="badge badge-warning">● Disconnected / Bridging...</span>;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Wireless Repeating (Universal Repeater)</h1>
          <p className="page-subtitle">
            Configure Universal Repeater (Client + AP), WISP, or Access Point mode and bridge your Tenda F3 to an upstream Wi-Fi network.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => refreshAllData()}>
          <RefreshCw size={15} /> Refresh Status
        </button>
      </div>

      {/* Current Repeating Status Summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Radio size={17} color="var(--accent-primary)" /> Current Wireless Repeating Status
          </span>
          {renderConnectStatusBadge()}
        </div>

        <div className="grid-4">
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Active Operating Mode</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
              {wifiRelay ? MODE_LABELS[wifiRelay.mode] : 'Detecting...'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upstream Base Station (SSID)</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
              {wifiRelay?.mode === 'client+ap' || wifiRelay?.mode === 'wisp'
                ? wifiRelay.upstreamSsid || 'Not Set'
                : 'N/A (Wired)'}
            </div>
            {wifiRelay?.upstreamMac && (wifiRelay.mode === 'client+ap' || wifiRelay.mode === 'wisp') && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                MAC: {wifiRelay.upstreamMac} • Ch {wifiRelay.upstreamChannel}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upstream Signal Strength</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
              {wifiRelay?.signalStrengthDbm !== null && wifiRelay?.signalStrengthDbm !== undefined
                ? `${wifiRelay.signalStrengthDbm} dBm`
                : '—'}
            </div>
            {wifiRelay?.signalStrengthDbm !== null && wifiRelay?.signalStrengthDbm !== undefined && (
              <div style={{ fontSize: 11, color: 'var(--status-success)', marginTop: 2 }}>
                {wifiRelay.signalStrengthDbm >= -60
                  ? 'Excellent Signal'
                  : wifiRelay.signalStrengthDbm >= -72
                  ? 'Good Signal'
                  : 'Weak Signal'}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Local Broadcast Wi-Fi (Extender SSID)</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
              {wifiRelay?.extenderSsid || wifiSettings?.ssid || 'Tenda_F3'}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Management IP: {routerInfo?.routerIp || '192.168.0.1'}
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selection Cards */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">1. Select Wireless Repeating / Operating Mode</span>
          <span className="badge badge-info">Tenda F3 /goform/setWifiRelay</span>
        </div>

        <div className="grid-2" style={{ gap: 12 }}>
          {(
            [
              {
                id: 'client+ap' as WifiRelayMode,
                title: 'Universal Repeater (Client + AP)',
                badge: 'Recommended for Extending Wi-Fi',
                icon: <Radio size={18} />,
              },
              {
                id: 'wisp' as WifiRelayMode,
                title: 'WISP Mode (Wireless ISP)',
                badge: 'Separate Subnet + NAT',
                icon: <Globe size={18} />,
              },
              {
                id: 'ap' as WifiRelayMode,
                title: 'AP Mode (Wired Access Point)',
                badge: 'Ethernet Uplink',
                icon: <Network size={18} />,
              },
              {
                id: 'disabled' as WifiRelayMode,
                title: 'Disabled (Standard Router)',
                badge: 'WAN Cable Mode',
                icon: <PowerOff size={18} />,
              },
            ] as const
          ).map((option) => {
            const selected = mode === option.id;
            const isCurrent = wifiRelay?.mode === option.id;
            return (
              <div
                key={option.id}
                onClick={() => setMode(option.id)}
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md)',
                  border: selected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: selected ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                    <span style={{ color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                      {option.icon}
                    </span>
                    {option.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isCurrent && <span className="badge badge-success">Current</span>}
                    <span className="badge badge-neutral">{option.badge}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {MODE_DESCRIPTIONS[option.id]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upstream Base Station Scanner & Configuration (shown for Universal Repeater & WISP) */}
      {needsBaseStation && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Left column: Live Nearby Wi-Fi Scanner */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Signal size={16} color="var(--accent-primary)" /> 2. Scan & Select Base Station Wi-Fi
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleScanNetworks}
                disabled={scanning}
              >
                <RefreshCw size={14} />
                {scanning ? 'Router Scanning 2.4GHz...' : 'Scan Nearby Wi-Fi'}
              </button>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 12 }}>
              Click <strong>Scan Nearby Wi-Fi</strong> to instruct your Tenda F3 to scan for upstream wireless routers,
              then click any network below to auto-fill its SSID, MAC address, channel, and security mode.
            </p>

            {scannedNetworks.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                {scanning
                  ? 'Asking Tenda F3 to scan surrounding Wi-Fi channels (takes ~3–5 seconds)...'
                  : hasScanned
                  ? 'No nearby 2.4 GHz networks returned. Try scanning again or enter the Base Station details manually.'
                  : 'Click "Scan Nearby Wi-Fi" above to list available base stations.'}
              </div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 330, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 42 }}>Pick</th>
                      <th>Base Station SSID</th>
                      <th>Ch</th>
                      <th>Security</th>
                      <th>Signal</th>
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
                            background: isPicked ? 'var(--accent-subtle)' : undefined,
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
                            <div style={{ fontWeight: 600 }}>{net.ssid}</div>
                            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {net.macAddress}
                            </div>
                          </td>
                          <td className="mono">{net.channel}</td>
                          <td style={{ fontSize: 12 }}>{net.securityMode}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                className={`badge ${
                                  net.signalPercent >= 65
                                    ? 'badge-success'
                                    : net.signalPercent >= 35
                                    ? 'badge-warning'
                                    : 'badge-danger'
                                }`}
                              >
                                {net.signalPercent}%
                              </span>
                              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                ({net.signalStrengthDbm} dBm)
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right column: Selected Upstream Base Station Credentials */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Wifi size={16} color="var(--accent-primary)" /> 3. Base Station Connection Credentials
              </span>
              {upstreamSsid && <span className="badge badge-success">Target: {upstreamSsid}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Upstream Base Station Wi-Fi Name (SSID)</label>
              <input
                type="text"
                className="form-input"
                value={upstreamSsid}
                onChange={(e) => setUpstreamSsid(e.target.value)}
                placeholder="Select from scan or type upstream SSID"
              />
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Base Station MAC Address</label>
                <input
                  type="text"
                  className="form-input mono"
                  value={upstreamMac}
                  onChange={(e) => setUpstreamMac(e.target.value)}
                  placeholder="XX:XX:XX:XX:XX:XX"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Upstream Channel</label>
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
              <label className="form-label">Upstream Security Mode</label>
              <select
                className="form-select"
                value={upstreamSecurityMode}
                onChange={(e) => setUpstreamSecurityMode(e.target.value)}
              >
                <option value="WPA/WPA2-PSK">WPA/WPA2-PSK</option>
                <option value="WPA2-PSK">WPA2-PSK</option>
                <option value="WPA-PSK">WPA-PSK</option>
                <option value="NONE">Open / None</option>
              </select>
            </div>

            {!isOpenSecurity && (
              <div className="form-group">
                <label className="form-label">Upstream Base Station Wi-Fi Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    value={upstreamPassword}
                    onChange={(e) => setUpstreamPassword(e.target.value)}
                    placeholder="Enter password for the upstream Wi-Fi network"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="form-hint">
                  Must match the exact Wi-Fi password of <strong>{upstreamSsid || 'the upstream router'}</strong>.
                </div>
              </div>
            )}

            <div className="alert-banner info" style={{ marginTop: 12, marginBottom: 16 }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                {mode === 'client+ap' ? (
                  <>
                    In <strong>Universal Repeater</strong> mode, the Tenda F3&apos;s IP address is assigned by your main
                    router (currently <code className="mono">{routerInfo?.routerIp || '192.168.100.8'}</code>).
                    TendaManager automatically discovers it on your network even when its IP changes.
                  </>
                ) : (
                  <>
                    In <strong>WISP</strong> mode, the Tenda F3 connects wirelessly to{' '}
                    <strong>{upstreamSsid || 'the upstream network'}</strong> and keeps its own local LAN subnet.
                  </>
                )}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={validateBeforeConfirm}
            >
              <Save size={15} /> Apply {MODE_LABELS[mode]}
            </button>
          </div>
        </div>
      )}

      {/* Action Card when AP Mode or Disabled is selected */}
      {!needsBaseStation && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Router size={16} color="var(--accent-primary)" /> 2. Apply {MODE_LABELS[mode]}
            </span>
          </div>

          <div className="alert-banner warning" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {mode === 'ap' ? (
                <>
                  <strong>Access Point (AP) Mode</strong> requires an Ethernet cable connected from your main router to
                  the Tenda F3. Local DHCP and NAT will be disabled.
                </>
              ) : (
                <>
                  <strong>Disabling Wireless Repeating</strong> returns the Tenda F3 to standard wireless router mode
                  (expecting an internet cable in the WAN port and enabling the local <code className="mono">192.168.0.1</code>{' '}
                  DHCP server).
                </>
              )}
            </span>
          </div>

          <button type="button" className="btn btn-primary" onClick={validateBeforeConfirm}>
            <Save size={15} /> Save & Switch to {MODE_LABELS[mode]}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Apply ${MODE_LABELS[mode]}?`}
        description={
          needsBaseStation
            ? `Your Tenda F3 will bridge to upstream Wi-Fi "${upstreamSsid}" on Channel ${upstreamChannel} in ${MODE_LABELS[mode]}. Applying this setting will automatically reboot the router (~35 seconds).`
            : `Your Tenda F3 will switch to ${MODE_LABELS[mode]} and automatically reboot (~35 seconds).`
        }
        confirmLabel={saving ? 'Applying & Rebooting...' : 'Confirm & Apply'}
        variant="primary"
        loading={saving}
        onConfirm={handleSaveRelay}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
