import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SpeedTestProgress, SpeedTestRecord } from '../types/ipc';

/**
 * Non-linear Speedtest.net-style scale stops (in Mbps) mapped evenly across [0..1] of the 270-degree dial arc.
 * Ensures typical residential & repeater speeds (1 - 100 Mbps) utilize the majority of the gauge sweep.
 */
const GAUGE_STOPS = [0, 1, 5, 10, 20, 30, 50, 100, 250];

function speedToGaugeFraction(mbps: number): number {
  if (!Number.isFinite(mbps) || mbps <= 0) return 0;
  const maxStop = GAUGE_STOPS[GAUGE_STOPS.length - 1];
  if (mbps >= maxStop) return 1;

  for (let i = 0; i < GAUGE_STOPS.length - 1; i++) {
    const low = GAUGE_STOPS[i];
    const high = GAUGE_STOPS[i + 1];
    if (mbps >= low && mbps <= high) {
      const localPct = (mbps - low) / (high - low);
      return (i + localPct) / (GAUGE_STOPS.length - 1);
    }
  }
  return 0;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function buildSparklinePath(samples: number[], width: number, height: number): { line: string; area: string } {
  if (!samples || samples.length === 0) return { line: '', area: '' };
  const pts = samples.length === 1 ? [samples[0], samples[0]] : samples;
  const maxVal = Math.max(5, ...pts) * 1.12;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * width;
    const y = height - Math.min(height - 3, Math.max(3, (v / maxVal) * (height - 6)));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${coords.join(' L ')}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  return { line, area };
}

export const SpeedTestPage: React.FC = () => {
  const {
    speedTestHistory,
    refreshSpeedTestHistory,
    discovery,
    routerInfo,
    addToast,
  } = useApp();

  const [progress, setProgress] = useState<SpeedTestProgress>({
    phase: 'idle',
    pingMs: null,
    jitterMs: null,
    downloadMbps: null,
    uploadMbps: null,
    currentMbps: null,
    downloadSamples: [],
    uploadSamples: [],
    progressPercent: 0,
    serverLocation: 'Cloudflare Global Edge',
  });
  const [running, setRunning] = useState<boolean>(false);

  useEffect(() => {
    refreshSpeedTestHistory();
    if (!window.tendaApi) return;
    const unsub = window.tendaApi.onSpeedTestProgress((p) => {
      setProgress(p);
    });
    return () => unsub();
  }, [refreshSpeedTestHistory]);

  const handleStartTest = async () => {
    if (running || !window.tendaApi) return;
    setRunning(true);
    try {
      const record = await window.tendaApi.runSpeedTest();
      if (record) {
        await refreshSpeedTestHistory();
      }
    } catch {
      // Error state is handled via progress.phase === 'error'
    } finally {
      setRunning(false);
    }
  };

  const handleCancelTest = async () => {
    await window.tendaApi?.cancelSpeedTest();
    setRunning(false);
  };

  const handleClearHistory = async () => {
    await window.tendaApi?.clearSpeedTestHistory();
    await refreshSpeedTestHistory();
    addToast('info', 'Speed test history cleared');
  };

  const { phase } = progress;
  const isTesting =
    running ||
    phase === 'connecting' ||
    phase === 'selecting_server' ||
    phase === 'ping' ||
    phase === 'download' ||
    phase === 'upload' ||
    phase === 'calculating';

  // Determine active gauge value and color
  const activeSpeedMbps =
    phase === 'download'
      ? progress.currentMbps ?? progress.downloadMbps ?? 0
      : phase === 'upload'
      ? progress.currentMbps ?? progress.uploadMbps ?? 0
      : phase === 'calculating' || phase === 'complete'
      ? progress.downloadMbps ?? 0
      : 0;

  const gaugeFraction =
    phase === 'ping' && progress.pingMs !== null
      ? Math.min(0.35, Math.max(0.05, (200 - Math.min(190, progress.pingMs)) / 200))
      : speedToGaugeFraction(activeSpeedMbps);

  const startAngle = -135;
  const totalSweep = 270;
  const currentAngle = startAngle + gaugeFraction * totalSweep;

  const activeAccentColor =
    phase === 'upload'
      ? 'var(--speed-upload)'
      : phase === 'ping'
      ? 'var(--status-warning)'
      : 'var(--speed-download)';

  const cx = 160;
  const cy = 152;
  const radius = 116;
  const trackArc = describeArc(cx, cy, radius, startAngle, startAngle + totalSweep);
  const valueArc =
    gaugeFraction > 0.005
      ? describeArc(cx, cy, radius, startAngle, Math.max(startAngle + 2, currentAngle))
      : '';
  const needleTip = polarToCartesian(cx, cy, radius - 18, currentAngle);
  const needleBaseLeft = polarToCartesian(cx, cy, 5, currentAngle - 90);
  const needleBaseRight = polarToCartesian(cx, cy, 5, currentAngle + 90);

  const downSpark = buildSparklinePath(progress.downloadSamples || [], 220, 44);
  const upSpark = buildSparklinePath(progress.uploadSamples || [], 220, 44);

  const phaseLabel =
    phase === 'connecting'
      ? 'Connecting...'
      : phase === 'selecting_server'
      ? 'Finding test server...'
      : phase === 'ping'
      ? 'Testing ping'
      : phase === 'download'
      ? 'Download'
      : phase === 'upload'
      ? 'Upload'
      : phase === 'calculating'
      ? 'Calculating results...'
      : phase === 'complete'
      ? 'Test Complete'
      : phase === 'error'
      ? 'Speed test failed'
      : 'Ready to test';

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Speed Test</h1>
        {isTesting && (
          <button type="button" className="btn btn-danger btn-sm" onClick={handleCancelTest}>
            <Square size={12} />
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Main Speedtest Stage */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 24px 24px',
        }}
      >
        {/* Top Live Telemetry Strip (Ping / Jitter / Download / Upload) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(110px, 160px))',
            gap: 24,
            width: '100%',
            maxWidth: 680,
            paddingBottom: 20,
            borderBottom: '1px solid var(--border-subtle)',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ping
            </div>
            <div className="tabular" style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>
              {progress.pingMs !== null ? progress.pingMs : '—'}{' '}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>ms</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Jitter
            </div>
            <div className="tabular" style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>
              {progress.jitterMs !== null ? progress.jitterMs : '—'}{' '}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>ms</span>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11.5,
                color: phase === 'download' ? 'var(--speed-download)' : 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ArrowDown size={12} color="var(--speed-download)" />
              Download
            </div>
            <div className="tabular" style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>
              {progress.downloadMbps !== null ? progress.downloadMbps.toFixed(1) : '—'}{' '}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>Mbps</span>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11.5,
                color: phase === 'upload' ? 'var(--speed-upload)' : 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ArrowUp size={12} color="var(--speed-upload)" />
              Upload
            </div>
            <div className="tabular" style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>
              {progress.uploadMbps !== null ? progress.uploadMbps.toFixed(1) : '—'}{' '}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>Mbps</span>
            </div>
          </div>
        </div>

        {/* Center Visualization Area */}
        {phase === 'error' ? (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--status-danger)', marginBottom: 6 }}>
              Speed test failed
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
              Check your Internet connection and try again.
            </div>
            <button type="button" className="btn btn-primary" onClick={handleStartTest}>
              <RotateCcw size={14} />
              <span>Try Again</span>
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: 18,
              width: '100%',
            }}
          >
            {/* Radial Speedometer SVG */}
            <div style={{ position: 'relative', width: 320, height: 255 }}>
              <svg width="320" height="255" viewBox="0 0 320 255" aria-label="Speed test gauge">
                {/* Scale ticks and labels */}
                {GAUGE_STOPS.map((stopVal, idx) => {
                  const frac = idx / (GAUGE_STOPS.length - 1);
                  const deg = startAngle + frac * totalSweep;
                  const outerPt = polarToCartesian(cx, cy, radius + 2, deg);
                  const innerPt = polarToCartesian(cx, cy, radius - 7, deg);
                  const labelPt = polarToCartesian(cx, cy, radius - 22, deg);
                  const passed = gaugeFraction >= frac && isTesting;

                  return (
                    <g key={stopVal}>
                      <line
                        x1={innerPt.x}
                        y1={innerPt.y}
                        x2={outerPt.x}
                        y2={outerPt.y}
                        stroke={passed ? activeAccentColor : 'var(--border-strong)'}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <text
                        x={labelPt.x}
                        y={labelPt.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={passed ? 'var(--text-primary)' : 'var(--text-muted)'}
                        fontSize="10.5"
                        fontWeight="600"
                        fontFamily="var(--font-mono)"
                      >
                        {stopVal === 250 ? '250+' : stopVal}
                      </text>
                    </g>
                  );
                })}

                {/* Background Arc Track */}
                <path
                  d={trackArc}
                  fill="none"
                  stroke="var(--bg-elevated)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />

                {/* Active Measurement Arc */}
                {valueArc && (
                  <path
                    d={valueArc}
                    fill="none"
                    stroke={activeAccentColor}
                    strokeWidth="12"
                    strokeLinecap="round"
                    style={{ transition: 'stroke 0.2s ease' }}
                  />
                )}

                {/* Needle Indicator when testing or complete */}
                {(isTesting || phase === 'complete') && (
                  <g>
                    <polygon
                      points={`${needleBaseLeft.x.toFixed(1)},${needleBaseLeft.y.toFixed(1)} ${needleTip.x.toFixed(
                        1
                      )},${needleTip.y.toFixed(1)} ${needleBaseRight.x.toFixed(1)},${needleBaseRight.y.toFixed(1)}`}
                      fill="var(--text-primary)"
                      opacity="0.85"
                    />
                    <circle cx={cx} cy={cy} r="6" fill="var(--text-primary)" />
                  </g>
                )}
              </svg>

              {/* Center Readout Overlay */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {phase === 'idle' || phase === 'cancelled' ? (
                  <div style={{ pointerEvents: 'auto', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      Ready to test
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '10px 26px', fontSize: 14, borderRadius: 999 }}
                      onClick={handleStartTest}
                    >
                      <Play size={14} />
                      <span>Start Test</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: activeAccentColor,
                        marginBottom: 2,
                      }}
                    >
                      {phaseLabel}
                    </div>
                    <div className="tabular" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05 }}>
                      {phase === 'connecting' || phase === 'selecting_server'
                        ? '···'
                        : phase === 'ping'
                        ? progress.pingMs ?? '—'
                        : activeSpeedMbps.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {phase === 'ping' ? 'ms' : 'Mbps'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Real-Time Dual Waveform Graphs (Download & Upload Samples) */}
            {(isTesting || phase === 'complete') && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 18,
                  width: '100%',
                  maxWidth: 520,
                  marginTop: 8,
                  paddingTop: 14,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginBottom: 4,
                    }}
                  >
                    <span>Download Graph</span>
                    <span className="mono tabular" style={{ color: 'var(--speed-download)' }}>
                      {progress.downloadMbps !== null ? `${progress.downloadMbps.toFixed(1)} Mbps` : '—'}
                    </span>
                  </div>
                  <svg
                    width="100%"
                    height="44"
                    viewBox="0 0 220 44"
                    preserveAspectRatio="none"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {downSpark.area && (
                      <path d={downSpark.area} fill="var(--speed-download-subtle)" />
                    )}
                    {downSpark.line && (
                      <path
                        d={downSpark.line}
                        fill="none"
                        stroke="var(--speed-download)"
                        strokeWidth="1.8"
                      />
                    )}
                  </svg>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginBottom: 4,
                    }}
                  >
                    <span>Upload Graph</span>
                    <span className="mono tabular" style={{ color: 'var(--speed-upload)' }}>
                      {progress.uploadMbps !== null ? `${progress.uploadMbps.toFixed(1)} Mbps` : '—'}
                    </span>
                  </div>
                  <svg
                    width="100%"
                    height="44"
                    viewBox="0 0 220 44"
                    preserveAspectRatio="none"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {upSpark.area && (
                      <path d={upSpark.area} fill="var(--speed-upload-subtle)" />
                    )}
                    {upSpark.line && (
                      <path
                        d={upSpark.line}
                        fill="none"
                        stroke="var(--speed-upload)"
                        strokeWidth="1.8"
                      />
                    )}
                  </svg>
                </div>
              </div>
            )}

            {/* Footer Server & Connection Context + Test Again */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                maxWidth: 520,
                marginTop: 16,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span>
                Server: <strong style={{ color: 'var(--text-secondary)' }}>{progress.serverLocation}</strong>
              </span>
              <span>
                Router: <strong className="mono" style={{ color: 'var(--text-secondary)' }}>{routerInfo?.routerIp || '192.168.0.1'}</strong>
                {discovery?.networkInterface?.connectionType
                  ? ` (${discovery.networkInterface.connectionType})`
                  : ''}
              </span>
              {phase === 'complete' && !isTesting && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleStartTest}
                >
                  <RotateCcw size={12} />
                  <span>Test Again</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Speed Test History */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          className="card-header"
          style={{ padding: '14px 18px', marginBottom: 0, borderBottom: '1px solid var(--border-subtle)' }}
        >
          <span className="card-title">History</span>
          {speedTestHistory.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearHistory}>
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Download</th>
                <th>Upload</th>
                <th>Ping</th>
                <th>Jitter</th>
                <th>Server</th>
              </tr>
            </thead>
            <tbody>
              {speedTestHistory.map((rec) => (
                <tr key={rec.id}>
                  <td className="tabular">{new Date(rec.timestamp).toLocaleString()}</td>
                  <td className="tabular" style={{ fontWeight: 600, color: 'var(--speed-download)' }}>
                    {rec.downloadMbps} Mbps
                  </td>
                  <td className="tabular" style={{ fontWeight: 600, color: 'var(--speed-upload)' }}>
                    {rec.uploadMbps} Mbps
                  </td>
                  <td className="mono tabular">{rec.pingMs} ms</td>
                  <td className="mono tabular">{rec.jitterMs} ms</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{rec.serverName}</td>
                </tr>
              ))}
              {speedTestHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No speed tests yet.
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
