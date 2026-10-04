import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  Play,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DiagnosticStepResult, LogEntry } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

export const RouterInfoPage: React.FC = () => {
  const {
    routerInfo,
    session,
    rebootingRouter,
    triggerRouterReboot,
    addToast,
  } = useApp();

  const [tab, setTab] = useState<'system' | 'diagnostics'>('system');
  const [confirmRebootOpen, setConfirmRebootOpen] = useState<boolean>(false);

  // Diagnostics state
  const [steps, setSteps] = useState<DiagnosticStepResult[]>([]);
  const [runningDiag, setRunningDiag] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const loadLogs = async () => {
    if (!window.tendaApi) return;
    const entries = await window.tendaApi.getLogs();
    setLogs(entries);
  };

  useEffect(() => {
    if (tab === 'diagnostics') {
      loadLogs();
    }
  }, [tab]);

  const handleRunDiagnostics = async () => {
    if (!window.tendaApi) return;
    setRunningDiag(true);
    try {
      const res = await window.tendaApi.runDiagnostics();
      setSteps(res);
      await loadLogs();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Diagnostics failed.');
    } finally {
      setRunningDiag(false);
    }
  };

  const handleExportReport = async () => {
    const res = await window.tendaApi?.exportDiagnosticReport();
    if (res?.saved) {
      addToast('success', 'Diagnostic report exported');
    }
  };

  const handleClearLogs = async () => {
    await window.tendaApi?.clearLogs();
    setLogs([]);
  };

  const caps = routerInfo?.capabilities;

  const capabilityRows: Array<{ label: string; supported: boolean }> = [
    { label: 'Connected Devices', supported: caps?.canViewDevices ?? true },
    { label: 'MAC Address Blocking', supported: caps?.canBlockDevices ?? true },
    { label: 'Per-Device Bandwidth Control', supported: caps?.canControlBandwidth ?? true },
    { label: 'Wi-Fi Configuration', supported: caps?.canChangeWifi ?? true },
    { label: 'Hide Wi-Fi SSID', supported: caps?.canHideSsid ?? true },
    { label: 'Universal Repeater / WISP / AP', supported: caps?.canWirelessRepeating ?? true },
    { label: 'WAN Status', supported: caps?.canViewWanStatus ?? true },
    { label: 'System Reboot', supported: caps?.canReboot ?? true },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 className="page-title">Router</h1>
          <div className="filter-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'system'}
              className={`filter-tab ${tab === 'system' ? 'active' : ''}`}
              onClick={() => setTab('system')}
            >
              System
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'diagnostics'}
              className={`filter-tab ${tab === 'diagnostics' ? 'active' : ''}`}
              onClick={() => setTab('diagnostics')}
            >
              Diagnostics
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.tendaApi?.openWebInterface(session?.routerAddress)}
          >
            <ExternalLink size={13} />
            <span>Open Web Interface</span>
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setConfirmRebootOpen(true)}
            disabled={rebootingRouter || caps?.canReboot === false}
          >
            <Power size={13} />
            <span>{rebootingRouter ? 'Restarting...' : 'Restart Router'}</span>
          </button>
        </div>
      </div>

      {tab === 'system' ? (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Hardware & Firmware</span>
              <span className="badge badge-success">● Online</span>
            </div>

            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-label">Model</span>
                <span className="kv-value">{routerInfo?.model || 'Tenda F3'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Hardware Revision</span>
                <span className="kv-value">{routerInfo?.hardwareVersion || session?.hardwareVersion || 'F3 v3.0'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Firmware Version</span>
                <span className="kv-value mono">{routerInfo?.firmwareVersion || session?.firmwareVersion || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Adapter</span>
                <span className="kv-value mono">{routerInfo?.adapterName || session?.adapterName || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Management IP</span>
                <span className="kv-value mono">{routerInfo?.routerIp || session?.routerAddress || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">MAC Address</span>
                <span className="kv-value mono">{routerInfo?.macAddress || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">System Time</span>
                <span className="kv-value mono">{routerInfo?.systemTime || '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Uptime</span>
                <span className="kv-value tabular">{formatUptime(routerInfo?.uptimeSeconds)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Supported Capabilities</span>
              <span className="badge badge-neutral">{routerInfo?.adapterName || 'F3Adapter'}</span>
            </div>

            <div className="kv-list">
              {capabilityRows.map((row) => (
                <div key={row.label} className="kv-row">
                  <span className="kv-label">{row.label}</span>
                  <span className="kv-value">
                    {row.supported ? (
                      <span className="badge badge-success">
                        <Check size={11} />
                        Supported
                      </span>
                    ) : (
                      <span className="badge badge-neutral">
                        <X size={11} />
                        Unsupported
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Connection Verification */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Connection Diagnostics</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleRunDiagnostics}
                  disabled={runningDiag}
                >
                  <Play size={12} />
                  <span>{runningDiag ? 'Running...' : 'Run Checks'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportReport}
                >
                  <Download size={12} />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {steps.length === 0 ? (
              <div className="empty-state">
                {runningDiag ? 'Running diagnostic checks...' : 'Click Run Checks to test router connectivity.'}
              </div>
            ) : (
              <div className="kv-list">
                {steps.map((step) => (
                  <div key={step.id} className="kv-row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{step.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        {step.detail}
                      </div>
                    </div>
                    <span
                      className={`badge ${
                        step.status === 'pass'
                          ? 'badge-success'
                          : step.status === 'warn'
                          ? 'badge-warning'
                          : 'badge-danger'
                      }`}
                    >
                      {step.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Log */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Application Log</span>
              {logs.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleClearLogs}
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="empty-state">No log entries.</div>
            ) : (
              <div
                className="mono"
                style={{
                  maxHeight: 340,
                  overflowY: 'auto',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 10,
                  fontSize: 11.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {logs
                  .slice()
                  .reverse()
                  .slice(0, 60)
                  .map((entry, idx) => (
                    <div key={`${entry.timestamp}-${idx}`} style={{ lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>{' '}
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            entry.level === 'ERROR'
                              ? 'var(--status-danger)'
                              : entry.level === 'WARN'
                              ? 'var(--status-warning)'
                              : 'var(--accent-primary)',
                        }}
                      >
                        [{entry.component}]
                      </span>{' '}
                      <span>{entry.message}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRebootOpen}
        title="Restart Router?"
        description="Connected devices will lose Wi-Fi and Internet access for approximately 45 seconds while the router restarts."
        confirmLabel="Restart"
        variant="danger"
        loading={rebootingRouter}
        onConfirm={async () => {
          await triggerRouterReboot();
          setConfirmRebootOpen(false);
        }}
        onCancel={() => setConfirmRebootOpen(false)}
      />
    </div>
  );
};
