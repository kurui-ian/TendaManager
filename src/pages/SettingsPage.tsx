import React, { useEffect, useState } from 'react';
import {
  Download,
  KeyRound,
  Trash2,
} from 'lucide-react';
import { ThemePreference, useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    updateAppSettings,
    toggleSimulatorMode,
    themeMode,
    setThemeMode,
    addToast,
  } = useApp();

  const [launchAtStartup, setLaunchAtStartup] = useState<boolean>(false);
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(true);
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState<5 | 10 | 30 | 60>(10);
  const [enableNotifications, setEnableNotifications] = useState<boolean>(true);
  const [maskWanIpByDefault, setMaskWanIpByDefault] = useState<boolean>(true);
  const [lastRouterAddress, setLastRouterAddress] = useState<string>('192.168.0.1');
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(6000);
  const [maxRetries, setMaxRetries] = useState<number>(2);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setLaunchAtStartup(settings.launchAtStartup);
      setMinimizeToTray(settings.minimizeToTray);
      setPollingIntervalSeconds(settings.pollingIntervalSeconds);
      setEnableNotifications(settings.enableNotifications);
      setMaskWanIpByDefault(settings.maskWanIpByDefault);
      setLastRouterAddress(settings.lastRouterAddress);
      setRequestTimeoutMs(settings.requestTimeoutMs);
      setMaxRetries(settings.maxRetries);
    }
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateAppSettings({
      launchAtStartup,
      minimizeToTray,
      pollingIntervalSeconds,
      enableNotifications,
      maskWanIpByDefault,
      lastRouterAddress: lastRouterAddress.trim() || '192.168.0.1',
      requestTimeoutMs: Math.max(2000, Math.min(20000, Number(requestTimeoutMs) || 6000)),
      maxRetries: Math.max(0, Math.min(5, Number(maxRetries) || 2)),
    });
  };

  const handleClearSavedCredentials = async () => {
    await window.tendaApi?.clearSavedCredentials();
    addToast('success', 'Saved credentials cleared');
  };

  const handleClearAllData = async () => {
    await window.tendaApi?.clearAllAppData();
    setConfirmClearAllOpen(false);
    addToast('info', 'Application data reset');
  };

  const handleExportLogs = async () => {
    const res = await window.tendaApi?.exportLogs();
    if (res?.saved) {
      addToast('success', 'Logs exported');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <form onSubmit={handleSaveSettings} className="grid-2" style={{ alignItems: 'start' }}>
        {/* Application & Appearance */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">General & Appearance</span>
          </div>

          <div className="form-group">
            <label className="form-label">Theme</label>
            <div className="filter-tabs" role="radiogroup" aria-label="Theme preference">
              {(
                [
                  { id: 'dark', label: 'Dark' },
                  { id: 'light', label: 'Light' },
                  { id: 'system', label: 'System' },
                ] as Array<{ id: ThemePreference; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={themeMode === opt.id}
                  className={`filter-tab ${themeMode === opt.id ? 'active' : ''}`}
                  onClick={() => setThemeMode(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Refresh Interval</label>
            <select
              className="form-select"
              value={pollingIntervalSeconds}
              onChange={(e) => setPollingIntervalSeconds(Number(e.target.value) as 5 | 10 | 30 | 60)}
            >
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
            </select>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={launchAtStartup}
                onChange={(e) => setLaunchAtStartup(e.target.checked)}
              />
              <span>Launch at Windows startup</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => setMinimizeToTray(e.target.checked)}
              />
              <span>Minimize to system tray on close</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enableNotifications}
                onChange={(e) => setEnableNotifications(e.target.checked)}
              />
              <span>Desktop notifications</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={maskWanIpByDefault}
                onChange={(e) => setMaskWanIpByDefault(e.target.checked)}
              />
              <span>Mask WAN IP by default</span>
            </label>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 6 }}>
            Save Changes
          </button>
        </div>

        {/* Connection & Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Connection</span>
            </div>

            <div className="form-group">
              <label className="form-label">Default Router Address</label>
              <input
                type="text"
                className="form-input mono"
                value={lastRouterAddress}
                onChange={(e) => setLastRouterAddress(e.target.value)}
                placeholder="192.168.0.1"
              />
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Timeout (ms)</label>
                <input
                  type="number"
                  min={2000}
                  max={20000}
                  step={500}
                  className="form-input mono"
                  value={requestTimeoutMs}
                  onChange={(e) => setRequestTimeoutMs(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Retries</label>
                <select
                  className="form-select"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </div>

            <div
              style={{
                paddingTop: 12,
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Local Hardware Simulator</div>
                <div className="form-hint">127.0.0.1 test firmware</div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${settings?.enableSimulatorMode ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => toggleSimulatorMode(!settings?.enableSimulatorMode)}
              >
                {settings?.enableSimulatorMode ? 'Stop Simulator' : 'Start Simulator'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Data & Credentials</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleClearSavedCredentials}
              >
                <KeyRound size={13} />
                <span>Clear Credentials</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleExportLogs}
              >
                <Download size={13} />
                <span>Export Logs</span>
              </button>

              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmClearAllOpen(true)}
              >
                <Trash2 size={13} />
                <span>Reset App Data</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmClearAllOpen}
        title="Reset Application Data?"
        description="This clears saved credentials, device names, and speed test history."
        confirmLabel="Reset"
        variant="danger"
        onConfirm={handleClearAllData}
        onCancel={() => setConfirmClearAllOpen(false)}
      />
    </div>
  );
};
