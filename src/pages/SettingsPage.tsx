import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Download,
  KeyRound,
  Save,
  Settings,
  ShieldAlert,
  Sliders,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    updateAppSettings,
    toggleSimulatorMode,
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
    addToast('success', 'Credentials Cleared', 'Removed saved router passwords from the Windows Credential Vault.');
  };

  const handleClearAllData = async () => {
    await window.tendaApi?.clearAllAppData();
    setConfirmClearAllOpen(false);
    addToast('info', 'All Local Data Reset', 'Cleared saved credentials, device names, and speed test history.');
  };

  const handleExportLogs = async () => {
    const res = await window.tendaApi?.exportLogs();
    if (res?.saved) {
      addToast('success', 'Logs Exported', `Saved to ${res.filePath}`);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            Configure desktop behavior, polling intervals, network timeouts, and stored credential security.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="grid-2">
        {/* Application Preferences */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Settings size={18} color="var(--accent-primary)" />
              Application Preferences
            </span>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={launchAtStartup}
                onChange={(e) => setLaunchAtStartup(e.target.checked)}
              />
              <span>Launch TendaManager automatically at Windows startup</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => setMinimizeToTray(e.target.checked)}
              />
              <span>Minimize to Windows System Tray when closing window</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enableNotifications}
                onChange={(e) => setEnableNotifications(e.target.checked)}
              />
              <span>Show desktop notifications for router and device events</span>
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={maskWanIpByDefault}
                onChange={(e) => setMaskWanIpByDefault(e.target.checked)}
              />
              <span>Mask public WAN IP address by default on Dashboard</span>
            </label>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label className="form-label">Background Polling Interval</label>
            <select
              className="form-select"
              value={pollingIntervalSeconds}
              onChange={(e) => setPollingIntervalSeconds(Number(e.target.value) as 5 | 10 | 30 | 60)}
            >
              <option value={5}>Every 5 seconds (Fastest updates)</option>
              <option value={10}>Every 10 seconds (Recommended)</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every 60 seconds</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
            <Save size={16} />
            Save Preferences
          </button>
        </div>

        {/* Router Connection Settings */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Sliders size={18} color="var(--status-info)" />
              Router Connection Parameters
            </span>
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

          <div className="form-group">
            <label className="form-label">HTTP Request Timeout (ms)</label>
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
            <label className="form-label">Automatic Request Retries</label>
            <select
              className="form-select"
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
            >
              <option value={0}>0 (No retries)</option>
              <option value={1}>1 retry</option>
              <option value={2}>2 retries (Recommended)</option>
              <option value={3}>3 retries</option>
            </select>
          </div>

          <div
            style={{
              marginTop: '14px',
              paddingTop: '14px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={15} color="var(--accent-primary)" />
                Local Tenda F3 Hardware Simulator
              </div>
              <div className="form-hint">
                Run local V12.01.01.48_en firmware server on 127.0.0.1 for testing when away from router.
              </div>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${settings?.enableSimulatorMode ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => toggleSimulatorMode(!settings?.enableSimulatorMode)}
            >
              {settings?.enableSimulatorMode ? 'Disable Simulator' : 'Enable Simulator'}
            </button>
          </div>
        </div>
      </form>

      {/* Security & Data Management */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ShieldAlert size={18} color="var(--status-warning)" />
            Data, Credentials & Security
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClearSavedCredentials}
          >
            <KeyRound size={16} />
            Clear Saved Router Credentials
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportLogs}
          >
            <Download size={16} />
            Export Sanitized Logs
          </button>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setConfirmClearAllOpen(true)}
          >
            <Trash2 size={16} />
            Reset All Local App Data
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearAllOpen}
        title="Reset All Local Data?"
        description="This will log you out, clear saved credentials from the Windows Credential Vault, and remove custom device names and speed test history."
        confirmLabel="Reset All Data"
        variant="danger"
        onConfirm={handleClearAllData}
        onCancel={() => setConfirmClearAllOpen(false)}
      />
    </div>
  );
};
