import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ToastContainer } from './components/ToastContainer';
import { OnboardingLogin } from './pages/OnboardingLogin';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { WifiPage } from './pages/WifiPage';
import { SpeedTestPage } from './pages/SpeedTestPage';
import { NetworkStatusPage } from './pages/NetworkStatusPage';
import { RouterInfoPage } from './pages/RouterInfoPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpPage } from './pages/HelpPage';

const MainShell: React.FC = () => {
  const { session, activePage } = useApp();

  if (!session || !session.authenticated) {
    return (
      <>
        <OnboardingLogin />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-region">
        <TopBar />
        {activePage === 'dashboard' && <DashboardPage />}
        {activePage === 'devices' && <DevicesPage />}
        {activePage === 'wifi' && <WifiPage />}
        {activePage === 'speedtest' && <SpeedTestPage />}
        {activePage === 'network' && <NetworkStatusPage />}
        {activePage === 'router' && <RouterInfoPage />}
        {activePage === 'diagnostics' && <DiagnosticsPage />}
        {activePage === 'settings' && <SettingsPage />}
        {activePage === 'help' && <HelpPage />}
      </div>
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <MainShell />
    </AppProvider>
  );
};

export default App;
