import React from 'react';
import {
  Gauge,
  Globe,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Radio,
  Router,
  Settings,
  Wifi,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NavPage } from '../types/ipc';
import { TendaRouterIcon } from './TendaRouterIcon';

interface NavGroup {
  title: string;
  items: Array<{ id: NavPage; label: string; icon: React.ReactNode }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Main',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> }],
  },
  {
    title: 'Network',
    items: [
      { id: 'devices', label: 'Devices', icon: <MonitorSmartphone size={16} /> },
      { id: 'wifi', label: 'Wi-Fi', icon: <Wifi size={16} /> },
      { id: 'repeater', label: 'Universal Repeater', icon: <Radio size={16} /> },
      { id: 'network', label: 'Network', icon: <Globe size={16} /> },
    ],
  },
  {
    title: 'Tools',
    items: [{ id: 'speedtest', label: 'Speed Test', icon: <Gauge size={16} /> }],
  },
  {
    title: 'System',
    items: [
      { id: 'router', label: 'Router', icon: <Router size={16} /> },
      { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    session,
    routerInfo,
    devices,
    connectionLost,
    rebootingRouter,
    logout,
  } = useApp();

  const onlineCount = devices.filter((d) => d.online && !d.blocked).length;
  const activeIp = routerInfo?.routerIp || session?.routerAddress || '192.168.0.1';

  return (
    <aside className="sidebar" aria-label="Main Navigation">
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="sidebar-brand">
          <div className="brand-logo">
            <TendaRouterIcon size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-title">TendaManager</div>
            <div className="brand-subtitle">
              <span
                className={`status-dot ${
                  rebootingRouter || connectionLost ? 'warning' : 'online'
                }`}
              />
              <span className="mono" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rebootingRouter ? 'Restarting' : connectionLost ? 'Reconnecting' : activeIp}
              </span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-label">{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                  onClick={() => setActivePage(item.id)}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.id === 'devices' && onlineCount > 0 && (
                    <span
                      className="tabular"
                      style={{
                        fontSize: '11px',
                        color: activePage === 'devices' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {onlineCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="nav-item"
          onClick={() => logout(false)}
          title="Disconnect from router"
        >
          <LogOut size={15} />
          <span>Disconnect</span>
        </button>
      </div>
    </aside>
  );
};
