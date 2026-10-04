import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WifiSecurityMode } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const WifiPage: React.FC = () => {
  const { wifiSettings, routerInfo, refreshAllData, addToast } = useApp();

  const [enabled, setEnabled] = useState<boolean>(true);
  const [ssid, setSsid] = useState<string>('');
  const [securityMode, setSecurityMode] = useState<WifiSecurityMode>('WPA/WPA2-PSK');
  const [password, setPassword] = useState<string>('');
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
      setHideSsid(wifiSettings.hideSsid);
    }
  }, [wifiSettings]);

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSsid = ssid.trim();
    if (!trimmedSsid) {
      addToast('error', 'Wi-Fi name cannot be empty.');
      return;
    }
    if (new TextEncoder().encode(trimmedSsid).length > 32) {
      addToast('error', 'Wi-Fi name cannot exceed 32 characters.');
      return;
    }

    if (securityMode !== 'None') {
      if (password.length < 8 || password.length > 63) {
        addToast('error', 'Password must be 8 to 63 characters.');
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
        addToast('success', 'Wi-Fi settings saved');
        setConfirmModalOpen(false);
      } else {
        addToast('error', 'Wi-Fi settings could not be changed.');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Wi-Fi settings could not be changed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Wi-Fi</h1>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={handlePreSubmit}>
          <div className="card-header">
            <span className="card-title">Wireless Configuration</span>
            <label className="checkbox-row" style={{ fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>2.4 GHz Radio Enabled</span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="wifi-ssid">
              Wi-Fi Name (SSID)
            </label>
            <input
              id="wifi-ssid"
              type="text"
              className="form-input"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              maxLength={32}
              placeholder="MyNetwork"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="wifi-security">
              Security
            </label>
            <select
              id="wifi-security"
              className="form-select"
              value={securityMode}
              onChange={(e) => setSecurityMode(e.target.value as WifiSecurityMode)}
            >
              <option value="WPA/WPA2-PSK">WPA/WPA2-PSK</option>
              <option value="WPA2-PSK">WPA2-PSK</option>
              <option value="WPA-PSK">WPA-PSK</option>
              <option value="None">None (Open)</option>
            </select>
          </div>

          {securityMode !== 'None' && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="wifi-password">
                  Password
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', fontSize: 11.5 }}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
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
                placeholder="8–63 characters"
                required
              />
            </div>
          )}

          {routerInfo?.capabilities.canHideSsid !== false && (
            <div className="form-group" style={{ marginTop: 4 }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={hideSsid}
                  onChange={(e) => setHideSsid(e.target.checked)}
                />
                <span>Hide network name</span>
              </label>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ marginTop: 6 }}>
            Save Changes
          </button>
        </form>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Current Status</span>
            <span className={`badge ${wifiSettings?.enabled !== false ? 'badge-success' : 'badge-neutral'}`}>
              <span className={`status-dot ${wifiSettings?.enabled !== false ? 'online' : 'offline'}`} />
              {wifiSettings?.enabled !== false ? 'Active' : 'Disabled'}
            </span>
          </div>

          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-label">Wi-Fi Name</span>
              <span className="kv-value">{wifiSettings?.ssid || '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Security</span>
              <span className="kv-value">{wifiSettings?.securityMode || '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Visibility</span>
              <span className="kv-value">{wifiSettings?.hideSsid ? 'Hidden' : 'Broadcast'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Band</span>
              <span className="kv-value">2.4 GHz (802.11b/g/n)</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Channel</span>
              <span className="kv-value mono">{wifiSettings?.channel || 'Auto'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-label">Bandwidth</span>
              <span className="kv-value mono">{wifiSettings?.bandwidth || '20/40 MHz'}</span>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmModalOpen}
        title="Save Wi-Fi Settings?"
        description="Changing the Wi-Fi name or password will disconnect wireless devices."
        warningItems={[
          `SSID: ${ssid.trim()}`,
          `Security: ${securityMode}`,
        ]}
        confirmLabel="Save"
        variant="primary"
        loading={saving}
        onConfirm={handleConfirmApply}
        onCancel={() => setConfirmModalOpen(false)}
      />
    </div>
  );
};
