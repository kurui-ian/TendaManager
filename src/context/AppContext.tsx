import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AppSettings,
  AuthCredentials,
  AuthSession,
  DiscoveryResult,
  NavPage,
  NetworkStatus,
  RouterDevice,
  RouterInfo,
  WifiSettings,
} from '../types/ipc';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

interface AppContextValue {
  discovery: DiscoveryResult | null;
  discovering: boolean;
  session: AuthSession | null;
  routerInfo: RouterInfo | null;
  networkStatus: NetworkStatus | null;
  devices: RouterDevice[];
  wifiSettings: WifiSettings | null;
  settings: AppSettings | null;
  activePage: NavPage;
  setActivePage: (page: NavPage) => void;
  connectionLost: boolean;
  rebootingRouter: boolean;
  refreshing: boolean;
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], title: string, message?: string) => void;
  dismissToast: (id: string) => void;
  runDiscovery: (customAddress?: string) => Promise<DiscoveryResult | null>;
  toggleSimulatorMode: (enabled: boolean) => Promise<DiscoveryResult | null>;
  login: (credentials: AuthCredentials) => Promise<{ success: boolean; errorMessage?: string }>;
  logout: (clearSaved?: boolean) => Promise<void>;
  refreshAllData: () => Promise<void>;
  triggerRouterReboot: () => Promise<boolean>;
  updateAppSettings: (partial: Partial<AppSettings>) => Promise<void>;
  themeMode: 'dark' | 'light';
  toggleThemeMode: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discovering, setDiscovering] = useState<boolean>(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [routerInfo, setRouterInfo] = useState<RouterInfo | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [devices, setDevices] = useState<RouterDevice[]>([]);
  const [wifiSettings, setWifiSettings] = useState<WifiSettings | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [connectionLost, setConnectionLost] = useState<boolean>(false);
  const [rebootingRouter, setRebootingRouter] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = useCallback((type: ToastMessage['type'], title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  const refreshAllData = useCallback(async () => {
    if (!window.tendaApi) return;
    setRefreshing(true);
    try {
      const [info, net, devList, wifi] = await Promise.all([
        window.tendaApi.getRouterInfo(),
        window.tendaApi.getNetworkStatus(),
        window.tendaApi.getDevices(),
        window.tendaApi.getWifiSettings(),
      ]);
      setRouterInfo(info);
      setNetworkStatus(net);
      setDevices(devList);
      setWifiSettings(wifi);
      if (connectionLost) {
        setConnectionLost(false);
        addToast('success', 'Router Reconnected', `Connected to ${info.routerIp}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/session expired|not authenticated/i.test(msg)) {
        setSession(null);
        addToast('warning', 'Session Expired', 'Please sign in to your router again.');
      } else {
        setConnectionLost(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [connectionLost, addToast]);

  const runDiscovery = useCallback(async (customAddress?: string): Promise<DiscoveryResult | null> => {
    if (!window.tendaApi) return null;
    setDiscovering(true);
    try {
      const result = await window.tendaApi.discoverRouter(customAddress);
      setDiscovery(result);
      return result;
    } catch (err) {
      addToast('error', 'Discovery Failed', err instanceof Error ? err.message : 'Network error');
      return null;
    } finally {
      setDiscovering(false);
    }
  }, [addToast]);

  const toggleSimulatorMode = useCallback(
    async (enabled: boolean): Promise<DiscoveryResult | null> => {
      if (!window.tendaApi) return null;
      setDiscovering(true);
      try {
        const res = await window.tendaApi.setSimulatorMode(enabled);
        setDiscovery(res);
        const updatedSettings = await window.tendaApi.getSettings();
        setSettings(updatedSettings);
        if (!enabled) {
          setSession(null);
          setRouterInfo(null);
          setNetworkStatus(null);
          setDevices([]);
        } else {
          addToast(
            'info',
            'Tenda F3 Hardware Simulator Active',
            `Running local Tenda F3 V12.01.01.48_en firmware at ${res.simulatorUrl} (Default password: admin)`
          );
        }
        return res;
      } finally {
        setDiscovering(false);
      }
    },
    [addToast]
  );

  const login = useCallback(
    async (credentials: AuthCredentials): Promise<{ success: boolean; errorMessage?: string }> => {
      if (!window.tendaApi) return { success: false, errorMessage: 'Desktop bridge unavailable' };
      try {
        const res = await window.tendaApi.login(credentials);
        if (res.success && res.session) {
          setSession(res.session);
          setConnectionLost(false);
          const updatedSettings = await window.tendaApi.getSettings();
          setSettings(updatedSettings);
          await refreshAllData();
          addToast('success', 'Authenticated', `Logged into ${res.session.routerAddress} (${res.session.adapterName})`);
          return { success: true };
        }
        return { success: false, errorMessage: res.errorMessage || 'Authentication failed' };
      } catch (err) {
        return {
          success: false,
          errorMessage: err instanceof Error ? err.message : 'Login error',
        };
      }
    },
    [refreshAllData, addToast]
  );

  const logout = useCallback(
    async (clearSaved = false) => {
      if (!window.tendaApi) return;
      await window.tendaApi.logout(clearSaved);
      setSession(null);
      setRouterInfo(null);
      setNetworkStatus(null);
      setDevices([]);
      setWifiSettings(null);
      setConnectionLost(false);
      addToast('info', 'Logged Out', 'Router session closed.');
    },
    [addToast]
  );

  const triggerRouterReboot = useCallback(async (): Promise<boolean> => {
    if (!window.tendaApi) return false;
    setRebootingRouter(true);
    try {
      const ok = await window.tendaApi.restartRouter();
      if (!ok) {
        setRebootingRouter(false);
        addToast('error', 'Reboot Failed', 'Router did not accept the restart command.');
        return false;
      }

      addToast('info', 'Restarting Router', 'Waiting for Tenda F3 to reboot and come back online...');
      // Wait and poll until router responds again
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await refreshAllData();
          setRebootingRouter(false);
          addToast('success', 'Router Online', 'Tenda F3 has finished restarting.');
          return true;
        } catch {
          // Keep waiting
        }
      }
      setRebootingRouter(false);
      return true;
    } catch (err) {
      setRebootingRouter(false);
      addToast('error', 'Reboot Error', err instanceof Error ? err.message : 'Failed to restart');
      return false;
    }
  }, [refreshAllData, addToast]);

  const updateAppSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      if (!window.tendaApi) return;
      const updated = await window.tendaApi.updateSettings(partial);
      setSettings(updated);
      addToast('success', 'Settings Saved', 'Your preferences have been updated.');
    },
    [addToast]
  );

  // Initial startup flow: load settings, run router discovery, attempt auto-login if credentials saved
  useEffect(() => {
    if (!window.tendaApi) return;
    let mounted = true;

    (async () => {
      try {
        const loadedSettings = await window.tendaApi.getSettings();
        if (!mounted) return;
        setSettings(loadedSettings);

        const disc = await window.tendaApi.discoverRouter();
        if (!mounted) return;
        setDiscovery(disc);
        setDiscovering(false);

        if (disc.isTendaDetected && disc.reachableGateway) {
          const hasSaved = await window.tendaApi.hasSavedCredentials(disc.reachableGateway);
          if (hasSaved) {
            const auto = await window.tendaApi.tryAutoLogin(disc.reachableGateway);
            if (auto.success && auto.session && mounted) {
              setSession(auto.session);
              await refreshAllData();
            }
          }
        }
      } catch {
        if (mounted) setDiscovering(false);
      }
    })();

    const unsubNav = window.tendaApi.onNavigateRequest((page) => {
      setActivePage(page as NavPage);
    });
    const unsubReconnect = window.tendaApi.onReconnectRequest(() => {
      refreshAllData();
    });
    const unsubLogout = window.tendaApi.onLogoutRequest(() => {
      setSession(null);
      setRouterInfo(null);
    });

    return () => {
      mounted = false;
      unsubNav();
      unsubReconnect();
      unsubLogout();
    };
  }, [refreshAllData]);

  // Periodic polling while authenticated
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!session || !session.authenticated || rebootingRouter) {
      return;
    }

    const intervalMs = (settings?.pollingIntervalSeconds || 10) * 1000;
    pollTimerRef.current = setInterval(() => {
      refreshAllData();
    }, intervalMs);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [session, settings?.pollingIntervalSeconds, rebootingRouter, refreshAllData]);

  return (
    <AppContext.Provider
      value={{
        discovery,
        discovering,
        session,
        routerInfo,
        networkStatus,
        devices,
        wifiSettings,
        settings,
        activePage,
        setActivePage,
        connectionLost,
        rebootingRouter,
        refreshing,
        toasts,
        addToast,
        dismissToast,
        runDiscovery,
        toggleSimulatorMode,
        login,
        logout,
        refreshAllData,
        triggerRouterReboot,
        updateAppSettings,
        themeMode,
        toggleThemeMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
