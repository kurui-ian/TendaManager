import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TendaRouterIcon } from '../components/TendaRouterIcon';

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
      setErrorMsg('Enter the router administrator password.');
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
      setErrorMsg(res.errorMessage || 'Unable to connect to the router.');
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
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div className="brand-logo" style={{ width: 38, height: 38 }}>
              <TendaRouterIcon size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>TendaManager</h1>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {discovering ? (
                  'Detecting router...'
                ) : discovery?.isTendaDetected ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <span className="status-dot online" />
                    <span>{discovery.detectedModel || 'Tenda F3'}</span>
                    <span>·</span>
                    <span className="mono">{discovery.reachableGateway}</span>
                  </span>
                ) : (
                  'Router Login'
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => runDiscovery(routerAddress)}
            disabled={discovering}
            title="Rescan network"
          >
            <RefreshCw size={13} className={discovering ? 'spin' : ''} />
            <span>Scan</span>
          </button>
        </div>

        {/* Concise Detected Router Status */}
        {discovery && !discovering && (
          <div
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              marginBottom: 18,
              fontSize: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {discovery.isTendaDetected ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Detected Router</span>
                  <span style={{ fontWeight: 600 }}>
                    {discovery.detectedModel || 'Tenda F3'} ({discovery.detectedFirmware || discovery.detectedHardwareVersion})
                  </span>
                </div>
                {discovery.operatingMode && discovery.operatingMode !== 'disabled' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Mode</span>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>
                      {discovery.operatingMode === 'client+ap'
                        ? `Universal Repeater${discovery.upstreamSsid ? ` (${discovery.upstreamSsid})` : ''}`
                        : discovery.operatingMode.toUpperCase()}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Local Gateway</span>
                <span className="mono">
                  {discovery.reachableGateway || discovery.networkInterface?.defaultGateway || '192.168.0.1'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="router-address-input">
              Router Address
            </label>
            <input
              id="router-address-input"
              type="text"
              className="form-input mono"
              value={routerAddress}
              onChange={(e) => setRouterAddress(e.target.value)}
              placeholder="192.168.0.1"
              required
            />
          </div>

          {showUsernameField && (
            <div className="form-group">
              <label className="form-label" htmlFor="router-username-input">
                Username
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
                Password
              </label>
              {isPasswordlessRouter ? (
                <span style={{ fontSize: 11, color: 'var(--status-success)', fontWeight: 500 }}>
                  No password set
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUsernameField((v) => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  {showUsernameField ? 'Hide username' : 'Use username'}
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="router-password-input"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                style={{ paddingRight: 38 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isPasswordlessRouter ? 'Optional (no password configured)' : 'Administrator password'}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
              />
              <span>Remember session</span>
            </label>
          </div>

          {errorMsg && (
            <div className="alert-banner danger" style={{ marginBottom: 14 }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '9px 14px' }}
            disabled={submitting}
          >
            {submitting ? 'Connecting...' : 'Sign In'}
          </button>
        </form>

        {/* Minimal Connection Options Footer */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '3px 6px' }}
              onClick={() => setShowTroubleshoot((v) => !v)}
            >
              Connection options
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '3px 6px' }}
              onClick={() => window.tendaApi?.openWebInterface(routerAddress)}
            >
              <ExternalLink size={12} />
              <span>Open in browser</span>
            </button>
          </div>

          {showTroubleshoot && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 4,
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setRouterAddress('192.168.0.1');
                  runDiscovery('192.168.0.1');
                }}
              >
                Use 192.168.0.1
              </button>

              {!discovery?.simulatorActive ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleStartSimulator}
                >
                  Start Local Simulator
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
          )}
        </div>
      </div>
    </div>
  );
};
