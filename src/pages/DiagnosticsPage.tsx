import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Play,
  Stethoscope,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DiagnosticStepResult, LogEntry } from '../types/ipc';

export const DiagnosticsPage: React.FC = () => {
  const { addToast } = useApp();

  const [steps, setSteps] = useState<DiagnosticStepResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeChecks = useCallback(async () => {
    if (!window.tendaApi) return;
    setRunning(true);
    try {
      const [diagSteps, recentLogs] = await Promise.all([
        window.tendaApi.runDiagnostics(),
        window.tendaApi.getLogs(),
      ]);
      setSteps(diagSteps);
      setLogs(recentLogs);
    } catch (err) {
      addToast('error', 'Diagnostics Error', err instanceof Error ? err.message : 'Check failed');
    } finally {
      setRunning(false);
    }
  }, [addToast]);

  useEffect(() => {
    executeChecks();
  }, [executeChecks]);

  const handleExportReport = async () => {
    if (!window.tendaApi) return;
    const res = await window.tendaApi.exportDiagnosticReport();
    if (res.saved) {
      addToast('success', 'Diagnostic Report Exported', `Saved sanitized report to ${res.filePath}`);
    }
  };

  const handleExportLogs = async () => {
    if (!window.tendaApi) return;
    const res = await window.tendaApi.exportLogs();
    if (res.saved) {
      addToast('success', 'Application Logs Exported', `Saved sanitized log file to ${res.filePath}`);
    }
  };

  const handleClearLogs = async () => {
    if (!window.tendaApi) return;
    await window.tendaApi.clearLogs();
    setLogs([]);
    addToast('info', 'Logs Cleared', 'Cleared application log history.');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Connection & Endpoint Diagnostics</h1>
          <p className="page-subtitle">
            Automated 7-step verification of local network connectivity, default gateway reachability, and Tenda F3 goform endpoints.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportReport}
          >
            <Download size={16} />
            Export Diagnostic Report
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={executeChecks}
            disabled={running}
          >
            <Play size={16} />
            {running ? 'Running Diagnostics...' : 'Run Diagnostics'}
          </button>
        </div>
      </div>

      {/* Diagnostic Steps Checklist */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Stethoscope size={18} color="var(--accent-primary)" />
            Diagnostic Verification Checklist
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Status</th>
                <th>Details</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.label}</td>
                  <td>
                    {s.status === 'pass' && (
                      <span className="badge badge-success">
                        <CheckCircle2 size={13} />
                        Pass
                      </span>
                    )}
                    {s.status === 'warn' && (
                      <span className="badge badge-warning">
                        <AlertTriangle size={13} />
                        Warning
                      </span>
                    )}
                    {s.status === 'fail' && (
                      <span className="badge badge-danger">
                        <XCircle size={13} />
                        Fail
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.detail}</td>
                  <td className="mono">{s.durationMs !== undefined ? `${s.durationMs} ms` : '—'}</td>
                </tr>
              ))}
              {steps.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    Running diagnostic probes...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sanitized Application Logs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <FileText size={18} color="var(--status-info)" />
            Sanitized Application Logs (Passwords & Tokens Redacted)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportLogs}>
              <Download size={14} />
              Export Logs
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleClearLogs}>
              <Trash2 size={14} />
              Clear
            </button>
          </div>
        </div>

        <div
          className="mono selectable"
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            maxHeight: '260px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            fontSize: '12px',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No log entries recorded in current buffer.</div>
          ) : (
            logs
              .slice()
              .reverse()
              .map((entry, idx) => (
                <div key={idx}>
                  <span style={{ color: 'var(--text-muted)' }}>[{entry.timestamp.slice(11, 19)}]</span>{' '}
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        entry.level === 'ERROR'
                          ? 'var(--status-danger)'
                          : entry.level === 'WARN'
                          ? 'var(--status-warning)'
                          : 'var(--status-info)',
                    }}
                  >
                    [{entry.level}]
                  </span>{' '}
                  <span style={{ color: 'var(--accent-primary)' }}>[{entry.component}]</span>{' '}
                  <span>{entry.message}</span>
                  {entry.meta ? <span style={{ color: 'var(--text-muted)' }}> | {entry.meta}</span> : null}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};
