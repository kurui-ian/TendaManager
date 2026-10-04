import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  Radio,
  RefreshCw,
  Server,
  Wifi,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const OnboardingLogin: React.FC = () => {
  const {
    discovery,
    discovering,
    runDiscovery,
    toggleSimulatorMode,
    login,
    settings,
  } = useApp();

  const [routerAddress, setRouterAddress] = useState<string>('192.168.0.1');
  const [username, setUsername] = useState<string>('admin');
  const [showUsernameField, setShowUsernameField] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberSession, setRememberSession] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);

  useEffect(() => {
    if (discovery?.reachableGateway) {
      setRouterAddress(discovery.reachableGateway);
    } else if (settings?.lastRouterAddress) {
      setRouterAddress(settings.lastRouterAddress);
    }
    if (discovery?.requiresUsername) {
      setShowUsernameField(true);
    }
  }, [discovery, settings]);

  const isPasswordlessRouter =
    discovery?.isTendaDetected &&
    discovery?.hasLoginPassword === false &&
    discovery?.reachableGateway === routerAddress.trim();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isPasswordlessRouter && !password.trim()) {
      setErrorMsg('Please enter the router administrator password.');
      return;
    }

    setSubmitting(true);
    const res = await login({
      routerAddress,
      username: showUsernameField ? username : 'admin',
      password,
      rememberSession,
    });
    setSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.errorMessage || 'Authentication failed. Please check your password and router IP.');
    }
  };

  const handleStartSimulator = async () => {
    setErrorMsg(null);
    const disc = await toggleSimulatorMode(true);
    if (disc?.simulatorUrl) {
      setRouterAddress(disc.simulatorUrl);
      setPassword('admin');
    }
  };

  const handleStopSimulator = async () => {
    setErrorMsg(null);
    await toggleSimulatorMode(false);
    setPassword('');
  };

  return (
    <div className="login-viewport">
      <div className="login-card">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div className="brand-logo" style={{ width: '42px', height: '42px' }}>
            <Activity size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>TendaManager</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Local-Network Desktop Management for Tenda F3
            </p>
          </div>
        </div>

        {/* Discovery Banner */}
        <div
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {discovering ? 'Scanning Local Network & ARP Neighbors...' : 'Network Discovery Summary'}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '3px 9px', fontSize: '11.5px' }}
              onClick={() => runDiscovery(routerAddress)}
              disabled={discovering}
            >
              <RefreshCw size={12} />
              Rescan
            </button>
          </div>

          {discovery?.networkInterface ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12.5px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Local IP: </span>
                <strong className="mono">{discovery.networkInterface.localIp}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Subnet: </span>
                <strong className="mono">{discovery.networkInterface.subnetMask}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Gateway: </span>
                <strong className="mono">{discovery.networkInterface.defaultGateway}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Interface: </span>
                <strong>
                  {discovery.networkInterface.connectionType}
                  {discovery.networkInterface.ssid ? ` (${discovery.networkInterface.ssid})` : ''}
                </strong>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--status-warning)' }}>
              No active local network interface detected.
            </div>
          )}

          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            {discovery?.isTendaDetected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-success)', fontSize: '12.5px' }}>
                  <CheckCircle2 size={15} />
                  <span>
                    Detected <strong>{discovery.detectedModel || 'Tenda F3'}</strong> ({discovery.detectedHardwareVersion}) at{' '}
                    <strong className="mono">{discovery.reachableGateway}</strong>
                  </span>
                </div>
                {discovery.operatingMode && discovery.operatingMode !== 'disabled' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontSize: '12px' }}>
                    <Radio size={14} />
                    <span>
                      Operating in{' '}
                      <strong>
                        {discovery.operatingMode === 'client+ap'
                          ? 'Universal Repeater Mode'
                          : discovery.operatingMode.toUpperCase()}
                      </strong>
                      {discovery.upstreamSsid ? ` • Bridging "${discovery.upstreamSsid}"` : ''}
                      {discovery.extenderSsid ? ` → "${discovery.extenderSsid}"` : ''}
                    </span>
                  </div>
                )}
              </div>
            ) : discovery?.nonTendaVendorHint ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-warning)' }}>
                  <AlertCircle size={15} />
                  <span>
                    Gateway <strong className="mono">{discovery.reachableGateway}</strong> responded as{' '}
                    <strong>{discovery.nonTendaVendorHint}</strong> (not a Tenda F3).
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  Connect to your Tenda F3 Wi-Fi, enter your Tenda F3 IP below, or launch the built-in Tenda F3 Simulator to test all features locally.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                <Wifi size={15} />
                <span>Enter your Tenda F3 gateway address (commonly 192.168.0.1 or tendawifi.com).</span>
              </div>
            )}
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="router-address-input">
              Router Address
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="router-address-input"
                type="text"
                className="form-input mono"
                value={routerAddress}
                onChange={(e) => setRouterAddress(e.target.value)}
                placeholder="192.168.0.1 or tendawifi.com"
                required
              />
            </div>
          </div>

          {showUsernameField && (
            <div className="form-group">
              <label className="form-label" htmlFor="router-username-input">
                Administrator Username
              </label>
              <input
                id="router-username-input"
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
          )}

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="router-password-input">
                Administrator Password {isPasswordlessRouter && <span className="badge badge-success" style={{ marginLeft: 6 }}>No Password Set</span>}
              </label>
              <button
                type="button"
                onClick={() => setShowUsernameField((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                }}
              >
                {showUsernameField ? 'Hide username field' : 'Firmware requires username?'}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="router-password-input"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                style={{ paddingRight: '42px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isPasswordlessRouter
                    ? 'No login password set on router (leave blank to connect)'
                    : 'Enter router login password'
                }
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
              />
              <span>Remember this session (Windows Credential Vault)</span>
            </label>
          </div>

          {errorMsg && (
            <div className="alert-banner danger" style={{ marginBottom: '16px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '11px' }}
            disabled={submitting}
          >
            <Lock size={16} />
            {submitting
              ? 'Authenticating with Router...'
              : isPasswordlessRouter && !password
              ? `CONNECT TO ${routerAddress}`
              : 'LOGIN'}
          </button>
        </form>

        {/* Troubleshoot & Local Simulator Section */}
        <div
          style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Can&apos;t connect to your Tenda F3?</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTroubleshoot((v) => !v)}
            >
              <HelpCircle size={14} />
              {showTroubleshoot ? 'Hide Troubleshooter' : 'Troubleshoot Connection'}
            </button>
          </div>

          {(!discovery?.isTendaDetected || showTroubleshoot) && (
            <div
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '12.5px',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Connection Troubleshooting & Testing Options
              </div>
              <ul style={{ paddingLeft: '18px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Ensure your PC is connected to the Tenda F3 Wi-Fi or LAN port.</li>
                <li>Default Tenda F3 management address is <code className="mono">192.168.0.1</code> or <code className="mono">tendawifi.com</code>.</li>
                <li>In <strong>Universal Repeater</strong> mode, the Tenda F3 uses an IP from your main router (auto-detected via ARP).</li>
              </ul>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setRouterAddress('192.168.0.1');
                    runDiscovery('192.168.0.1');
                  }}
                >
                  <Server size={13} />
                  Try 192.168.0.1
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => window.tendaApi?.openWebInterface(routerAddress)}
                >
                  <ExternalLink size={13} />
                  Open in Browser
                </button>

                {!discovery?.simulatorActive ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleStartSimulator}
                    title="Starts a local Tenda F3 V12.01.01.48_en HTTP Firmware Simulator on 127.0.0.1 (password: admin)"
                  >
                    <Cpu size={13} />
                    Use Local Tenda F3 Simulator (pwd: admin)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleStopSimulator}
                  >
                    Stop Simulator
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
