import React from 'react';
import {
  Activity,
  Gauge,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Moon,
  Radio,
  Router,
  Settings,
  Stethoscope,
  Sun,
  Wifi,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { NavPage } from '../types/ipc';

const NAV_ITEMS: Array<{ id: NavPage; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'devices', label: 'Connected Devices', icon: <MonitorSmartphone size={18} /> },
  { id: 'wifi', label: 'Wi-Fi Settings', icon: <Wifi size={18} /> },
  { id: 'repeater', label: 'Wireless Repeating', icon: <Radio size={18} /> },
  { id: 'speedtest', label: 'Speed Test', icon: <Gauge size={18} /> },
  { id: 'network', label: 'Network Status', icon: <Globe size={18} /> },
  { id: 'router', label: 'Router Information', icon: <Router size={18} /> },
  { id: 'diagnostics', label: 'Diagnostics', icon: <Stethoscope size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  { id: 'help', label: 'Help & Compatibility', icon: <HelpCircle size={18} /> },
];

export const Sidebar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    session,
    devices,
    wifiRelay,
    logout,
    themeMode,
    toggleThemeMode,
  } = useApp();

  const onlineCount = devices.filter((d) => d.online && !d.blocked).length;

  return (
    <aside className="sidebar" aria-label="Main Navigation">
      <div>
        <div className="sidebar-brand">
          <div className="brand-logo" aria-hidden="true">
            <Activity size={20} />
          </div>
          <div>
            <div className="brand-title">TendaManager</div>
            <div className="brand-subtitle">
              {session?.hardwareVersion || 'Tenda F3'} Desktop
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.id === 'devices' && onlineCount > 0 && (
                <span className="badge badge-info" style={{ padding: '1px 7px', fontSize: '11px' }}>
                  {onlineCount}
                </span>
              )}
              {item.id === 'repeater' && wifiRelay && wifiRelay.mode !== 'disabled' && (
                <span className="badge badge-success" style={{ padding: '1px 6px', fontSize: '10px' }}>
                  {wifiRelay.mode === 'client+ap' ? 'Repeater' : wifiRelay.mode.toUpperCase()}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="nav-item" onClick={toggleThemeMode}>
          {themeMode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          <span>{themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
        </button>

        <button
          type="button"
          className="nav-item"
          onClick={() => logout(false)}
          style={{ color: 'var(--status-danger)' }}
        >
          <LogOut size={17} />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
};
