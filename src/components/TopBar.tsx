import React from 'react';
import { ExternalLink, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const TopBar: React.FC = () => {
  const {
    session,
    routerInfo,
    connectionLost,
    refreshing,
    refreshAllData,
  } = useApp();

  const handleOpenWebUi = () => {
    window.tendaApi?.openWebInterface(session?.routerAddress);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {connectionLost ? (
          <span className="badge badge-danger">
            <WifiOff size={13} />
            Router Connection Lost — Retrying
          </span>
        ) : (
          <span className="badge badge-success">
            <span className="status-dot online" />
            Online ({routerInfo?.routerIp || session?.routerAddress || '192.168.0.1'})
          </span>
        )}

        <span style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>
          Adapter: <strong>{session?.adapterName || 'F3V3Adapter'}</strong> • Firmware:{' '}
          <strong className="mono">{routerInfo?.firmwareVersion || session?.firmwareVersion}</strong>
        </span>

        {session?.isSimulator && (
          <span className="badge badge-warning" title="Connected to local Tenda F3 HTTP Firmware Simulator">
            <ShieldCheck size={13} />
            Simulator Mode
          </span>
        )}
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => refreshAllData()}
          disabled={refreshing}
          title="Refresh router state now"
        >
          <RefreshCw size={14} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleOpenWebUi}
          title="Open traditional Tenda Web Interface in browser"
        >
          <ExternalLink size={14} />
          Open Web UI
        </button>
      </div>
    </header>
  );
};
