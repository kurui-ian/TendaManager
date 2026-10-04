import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Gauge,
  Info,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SpeedTestProgress, SpeedTestRecord } from '../types/ipc';

export const SpeedTestPage: React.FC = () => {
  const { addToast } = useApp();

  const [progress, setProgress] = useState<SpeedTestProgress>({
    phase: 'idle',
    pingMs: null,
    jitterMs: null,
    downloadMbps: null,
    uploadMbps: null,
    progressPercent: 0,
    serverLocation: 'Cloudflare Global Edge Network',
  });
  const [history, setHistory] = useState<SpeedTestRecord[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const loadHistory = async () => {
    if (!window.tendaApi) return;
    const records = await window.tendaApi.getSpeedTestHistory();
    setHistory(records);
  };

  useEffect(() => {
    loadHistory();
    if (!window.tendaApi) return;
    const unsub = window.tendaApi.onSpeedTestProgress((p) => {
      setProgress(p);
    });
    return () => unsub();
  }, []);

  const handleStartTest = async () => {
    if (running || !window.tendaApi) return;
    setRunning(true);
    try {
      const record = await window.tendaApi.runSpeedTest();
      if (record) {
        await loadHistory();
        addToast(
          'success',
          'Speed Test Complete',
          `Download: ${record.downloadMbps} Mbps • Upload: ${record.uploadMbps} Mbps • Ping: ${record.pingMs} ms`
        );
      }
    } catch (err) {
      addToast(
        'error',
        'Speed Test Failed',
        err instanceof Error ? err.message : 'Could not reach speed test server. Check Internet connectivity.'
      );
    } finally {
      setRunning(false);
    }
  };

  const handleCancelTest = async () => {
    await window.tendaApi?.cancelSpeedTest();
    setRunning(false);
    addToast('info', 'Speed Test Cancelled', 'Measurement stopped by user.');
  };

  const handleClearHistory = async () => {
    await window.tendaApi?.clearSpeedTestHistory();
    setHistory([]);
    addToast('info', 'History Cleared', 'Cleared saved speed test records.');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Internet Speed Test</h1>
          <p className="page-subtitle">
            Measure real-world latency, jitter, download throughput, and upload throughput from your computer through the router.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={handleCancelTest}>
              <Square size={15} />
              Cancel Speed Test
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleStartTest}>
              <Play size={15} />
              Start Speed Test
            </button>
          )}
        </div>
      </div>

      <div className="alert-banner info">
        <Info size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>
          <strong>Bandwidth Notice:</strong> Speed tests use active network bandwidth and may temporarily affect video
          streaming or downloads on other connected devices.
        </span>
      </div>

      {/* Live Metrics Cards */}
      <div className="grid-3">
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Activity size={18} color="var(--status-warning)" />
              Ping / Latency
            </span>
            {progress.phase === 'ping' && <span className="badge badge-warning">Testing...</span>}
          </div>
          <div className="stat-value">
            {progress.pingMs !== null ? `${progress.pingMs}` : '—'}{' '}
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-secondary)' }}>ms</span>
          </div>
          <div className="stat-label">
            Jitter: {progress.jitterMs !== null ? `${progress.jitterMs} ms` : '—'}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ArrowDownCircle size={18} color="var(--status-success)" />
              Download Speed
            </span>
            {progress.phase === 'download' && <span className="badge badge-success">Testing...</span>}
          </div>
          <div className="stat-value" style={{ color: 'var(--status-success)' }}>
            {progress.downloadMbps !== null ? `${progress.downloadMbps}` : '—'}{' '}
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-secondary)' }}>Mbps</span>
          </div>
          <div className="stat-label">Real HTTP stream throughput</div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ArrowUpCircle size={18} color="var(--status-info)" />
              Upload Speed
            </span>
            {progress.phase === 'upload' && <span className="badge badge-info">Testing...</span>}
          </div>
          <div className="stat-value" style={{ color: 'var(--status-info)' }}>
            {progress.uploadMbps !== null ? `${progress.uploadMbps}` : '—'}{' '}
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-secondary)' }}>Mbps</span>
          </div>
          <div className="stat-label">Real HTTP payload upload throughput</div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
          <span>
            Status:{' '}
            <strong style={{ textTransform: 'capitalize' }}>
              {progress.phase === 'idle' ? 'Ready to start' : progress.phase}
            </strong>{' '}
            ({progress.serverLocation})
          </span>
          <span className="mono">{progress.progressPercent}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress.progressPercent}%` }} />
        </div>
      </div>

      {/* Speed Test History */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Clock size={18} color="var(--accent-primary)" />
            Speed Test History
          </span>
          {history.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleClearHistory}>
              <Trash2 size={14} />
              Clear History
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Download</th>
                <th>Upload</th>
                <th>Ping</th>
                <th>Jitter</th>
                <th>Router IP</th>
                <th>Test Server</th>
              </tr>
            </thead>
            <tbody>
              {history.map((rec) => (
                <tr key={rec.id}>
                  <td>{new Date(rec.timestamp).toLocaleString()}</td>
                  <td style={{ fontWeight: 600, color: 'var(--status-success)' }}>{rec.downloadMbps} Mbps</td>
                  <td style={{ fontWeight: 600, color: 'var(--status-info)' }}>{rec.uploadMbps} Mbps</td>
                  <td className="mono">{rec.pingMs} ms</td>
                  <td className="mono">{rec.jitterMs} ms</td>
                  <td className="mono">{rec.routerIp}</td>
                  <td>{rec.serverName}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    <Gauge size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    No speed tests recorded yet. Click &quot;Start Speed Test&quot; above to run your first benchmark.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
