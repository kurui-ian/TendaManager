import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Save, Shield, Wifi } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WifiSecurityMode } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

function evaluatePasswordStrength(pwd: string): {
  label: string;
  color: string;
  percent: number;
} {
  if (!pwd) return { label: 'None', color: 'var(--text-muted)', percent: 0 };
  if (pwd.length < 8) return { label: 'Too Short (< 8 chars)', color: 'var(--status-danger)', percent: 20 };

  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 2) return { label: 'Fair', color: 'var(--status-warning)', percent: 50 };
  if (score === 3) return { label: 'Good', color: 'var(--status-info)', percent: 75 };
  return { label: 'Strong', color: 'var(--status-success)', percent: 100 };
}

export const WifiPage: React.FC = () => {
  const { wifiSettings, routerInfo, refreshAllData, addToast } = useApp();

  const [enabled, setEnabled] = useState<boolean>(true);
  const [ssid, setSsid] = useState<string>('');
  const [securityMode, setSecurityMode] = useState<WifiSecurityMode>('WPA/WPA2-PSK');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [hideSsid, setHideSsid] = useState<boolean>(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (wifiSettings) {
      setEnabled(wifiSettings.enabled);
      setSsid(wifiSettings.ssid);
      setSecurityMode(wifiSettings.securityMode);
      setPassword(wifiSettings.password || '');
      setConfirmPassword(wifiSettings.password || '');
      setHideSsid(wifiSettings.hideSsid);
    }
  }, [wifiSettings]);

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSsid = ssid.trim();
    if (!trimmedSsid) {
      addToast('error', 'Invalid SSID', 'Network Name (SSID) cannot be empty.');
      return;
    }
    if (new TextEncoder().encode(trimmedSsid).length > 32) {
      addToast('error', 'SSID Too Long', 'Network Name (SSID) cannot exceed 32 bytes.');
      return;
    }

    if (securityMode !== 'None') {
      if (password.length < 8 || password.length > 63) {
        addToast('error', 'Invalid Password', 'Wi-Fi password must be between 8 and 63 characters.');
        return;
      }
      if (password !== confirmPassword) {
        addToast('error', 'Passwords Do Not Match', 'Please ensure the confirmation password matches.');
        return;
      }
    }

    setConfirmModalOpen(true);
  };

  const handleConfirmApply = async () => {
    setSaving(true);
    try {
      const ok = await window.tendaApi.updateWifiSettings({
        enabled,
        ssid: ssid.trim(),
        securityMode,
        password: securityMode === 'None' ? '' : password,
        hideSsid,
      });

      if (ok) {
        await refreshAllData();
        addToast(
          'success',
          'Wi-Fi Settings Updated',
          `Applied SSID "${ssid.trim()}". Wireless clients may briefly reconnect.`
        );
        setConfirmModalOpen(false);
      } else {
        addToast('error', 'Update Rejected', 'Router did not accept the Wi-Fi configuration.');
      }
    } catch (err) {
      addToast('error', 'Wi-Fi Update Error', err instanceof Error ? err.message : 'Failed to save Wi-Fi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Wi-Fi Settings</h1>
          <p className="page-subtitle">
            Manage your Tenda F3 wireless network name (SSID), WPA/WPA2 encryption mode, and password.
          </p>
        </div>
      </div>

      <div className="alert-banner warning">
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Wireless Disconnection Notice:</strong> Changing the Wi-Fi Network Name (SSID) or password will
          immediately disconnect all wireless devices, including this computer if connected over Wi-Fi.
        </div>
      </div>

      <div className="grid-2">
        <form className="card" onSubmit={handlePreSubmit}>
          <div className="card-header">
            <span className="card-title">
              <Wifi size={18} color="var(--accent-primary)" />
              Wireless Network Configuration
            </span>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Enable 2.4 GHz Wireless Radio
              </span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="wifi-ssid">
              Network Name (SSID)
            </label>
            <input
              id="wifi-ssid"
              type="text"
              className="form-input"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              maxLength={32}
              placeholder="MyTendaWiFi"
              required
            />
            <span className="form-hint">1 to 32 characters. Visible to nearby wireless devices.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="wifi-security">
              Security Mode
            </label>
            <select
              id="wifi-security"
              className="form-select"
              value={securityMode}
              onChange={(e) => setSecurityMode(e.target.value as WifiSecurityMode)}
            >
              <option value="WPA/WPA2-PSK">WPA/WPA2-PSK (Recommended)</option>
              <option value="WPA2-PSK">WPA2-PSK (AES)</option>
              <option value="WPA-PSK">WPA-PSK</option>
              <option value="None">None (Open Network — Not Recommended)</option>
            </select>
          </div>

          {securityMode !== 'None' && (
            <>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" htmlFor="wifi-password">
                    Wi-Fi Password
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11.5px' }}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showPassword ? 'Hide Password' : 'Show Password'}
                  </button>
                </div>
                <input
                  id="wifi-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={63}
                  placeholder="Minimum 8 characters"
                  required
                />

                {/* Password Strength Meter */}
                <div style={{ marginTop: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>Password Strength</span>
                    <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                  </div>
                  <div className="progress-track" style={{ height: '6px' }}>
                    <div
                      className="progress-fill"
                      style={{ width: `${strength.percent}%`, backgroundColor: strength.color }}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="wifi-confirm-password">
                  Confirm Wi-Fi Password
                </label>
                <input
                  id="wifi-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input mono"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  maxLength={63}
                  placeholder="Re-enter Wi-Fi password"
                  required
                />
              </div>
            </>
          )}

          {routerInfo?.capabilities.canHideSsid !== false && (
            <div className="form-group" style={{ marginTop: '8px' }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={hideSsid}
                  onChange={(e) => setHideSsid(e.target.checked)}
                />
                <span>Hide Wi-Fi Network Name (Disable SSID Broadcast)</span>
              </label>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
            <Save size={16} />
            Save Changes
          </button>
        </form>

        {/* Current Radio Status & Security Tips */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Shield size={18} color="var(--status-info)" />
              Active Radio Parameters
            </span>
          </div>

          <div className="kv-list" style={{ marginBottom: '20px' }}>
            <div className="kv-row">
              <span className="kv-label">Radio Band</span>
              <span className="kv-value">2.4 GHz (802.11b/g/n 300 Mbps)</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Current SSID</span>
              <span className="kv-value">{wifiSettings?.ssid || 'Tenda_F3'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Current Security</span>
              <span className="kv-value">{wifiSettings?.securityMode || 'WPA/WPA2-PSK'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Wireless Channel</span>
              <span className="kv-value">{wifiSettings?.channel || 'Auto'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Channel Bandwidth</span>
              <span className="kv-value">{wifiSettings?.bandwidth || '20/40 MHz'}</span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              padding: '14px',
              fontSize: '12.5px',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Tenda F3 Wireless Recommendations
            </div>
            <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <li>Use <strong>WPA/WPA2-PSK</strong> or <strong>WPA2-PSK</strong> for strong encryption and broad device compatibility.</li>
              <li>Choose a password at least 12 characters long mixing letters, numbers, and symbols.</li>
              <li>Avoid spaces at the beginning or end of your SSID or Wi-Fi password.</li>
            </ul>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmModalOpen}
        title="Change Wi-Fi Settings?"
        description="Changing the Wi-Fi name or password will disconnect all wireless devices, including this computer. You may need to reconnect manually."
        warningItems={[
          `New SSID: ${ssid.trim()}`,
          `Security Mode: ${securityMode}`,
          `SSID Broadcast: ${hideSsid ? 'Hidden' : 'Visible'}`,
        ]}
        confirmLabel="Apply Changes"
        variant="primary"
        loading={saving}
        onConfirm={handleConfirmApply}
        onCancel={() => setConfirmModalOpen(false)}
      />
    </div>
  );
};
