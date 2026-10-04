import React from 'react';
import { ExternalLink, Moon, RefreshCw, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NavPage } from '../types/ipc';

const PAGE_BREADCRUMBS: Record<NavPage, { group: string; title: string }> = {
  dashboard: { group: 'Main', title: 'Dashboard' },
  devices: { group: 'Network', title: 'Devices' },
  wifi: { group: 'Network', title: 'Wi-Fi' },
  repeater: { group: 'Network', title: 'Universal Repeater' },
  network: { group: 'Network', title: 'Network' },
  speedtest: { group: 'Tools', title: 'Speed Test' },
  router: { group: 'System', title: 'Router' },
  diagnostics: { group: 'System', title: 'Diagnostics' },
  settings: { group: 'System', title: 'Settings' },
  help: { group: 'System', title: 'Help' },
};

export const TopBar: React.FC = () => {
  const {
    activePage,
    session,
    routerInfo,
    connectionLost,
    rebootingRouter,
    refreshing,
    refreshAllData,
    resolvedTheme,
    toggleThemeMode,
  } = useApp();

  const crumb = PAGE_BREADCRUMBS[activePage] || { group: 'Main', title: 'Dashboard' };
  const routerIp = routerInfo?.routerIp || session?.routerAddress || '192.168.0.1';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span>{crumb.group}</span>
          <span>/</span>
          <strong>{crumb.title}</strong>
        </div>

        <span style={{ color: 'var(--border-strong)' }}>·</span>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <span
            className={`status-dot ${
              rebootingRouter ? 'warning' : connectionLost ? 'danger' : 'online'
            }`}
          />
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            {rebootingRouter ? 'Restarting' : connectionLost ? 'Reconnecting' : 'Online'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span className="mono" style={{ color: 'var(--text-muted)' }}>
            {routerIp}
          </span>
        </div>

        {session?.isSimulator && (
          <span className="badge badge-neutral" title="Local Tenda F3 Simulator">
            Simulator
          </span>
        )}
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={toggleThemeMode}
          title={resolvedTheme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => refreshAllData()}
          disabled={refreshing}
          title="Refresh router state"
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          <span>Refresh</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => window.tendaApi?.openWebInterface(session?.routerAddress)}
          title="Open router web interface in browser"
        >
          <ExternalLink size={13} />
          <span>Web UI</span>
        </button>
      </div>
    </header>
  );
};
