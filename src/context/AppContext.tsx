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
  SpeedTestRecord,
  WifiRelayConfig,
  WifiSettings,
} from '../types/ipc';

export type ThemePreference = 'dark' | 'light' | 'system';

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
  wifiRelay: WifiRelayConfig | null;
  speedTestHistory: SpeedTestRecord[];
  refreshSpeedTestHistory: () => Promise<void>;
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
  themeMode: ThemePreference;
  resolvedTheme: 'dark' | 'light';
  setThemeMode: (mode: ThemePreference) => void;
  toggleThemeMode: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discovering, setDiscovering] = useState<boolean>(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [routerInfo, setRouterInfo] = useState<RouterInfo | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [devices, setDevices] = useState<RouterDevice[]>([]);
  const [wifiSettings, setWifiSettings] = useState<WifiSettings | null>(null);
  const [wifiRelay, setWifiRelay] = useState<WifiRelayConfig | null>(null);
  const [speedTestHistory, setSpeedTestHistory] = useState<SpeedTestRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [connectionLost, setConnectionLost] = useState<boolean>(false);
  const [rebootingRouter, setRebootingRouter] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [themeMode, setThemeModeState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('tenda_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'dark';
  });
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const applyTheme = (pref: ThemePreference) => {
      const target = pref === 'system' ? getSystemTheme() : pref;
      setResolvedTheme(target);
      document.documentElement.setAttribute('data-theme', target);
    };

    applyTheme(themeMode);

    if (themeMode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      const handler = () => applyTheme('system');
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, [themeMode]);

  const setThemeMode = useCallback((mode: ThemePreference) => {
    localStorage.setItem('tenda_theme_mode', mode);
    setThemeModeState(mode);
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeModeState((prev) => {
      const currentResolved = prev === 'system' ? getSystemTheme() : prev;
      const next: ThemePreference = currentResolved === 'dark' ? 'light' : 'dark';
      localStorage.setItem('tenda_theme_mode', next);
      return next;
    });
  }, []);

  const addToast = useCallback((type: ToastMessage['type'], title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshSpeedTestHistory = useCallback(async () => {
    if (!window.tendaApi) return;
    try {
      const records = await window.tendaApi.getSpeedTestHistory();
      setSpeedTestHistory(records);
    } catch {
      // Ignore
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    if (!window.tendaApi) return;
    setRefreshing(true);
    try {
      const [info, net, devList, wifi, relay] = await Promise.all([
        window.tendaApi.getRouterInfo(),
        window.tendaApi.getNetworkStatus(),
        window.tendaApi.getDevices(),
        window.tendaApi.getWifiSettings(),
        window.tendaApi.getWifiRelayConfig().catch(() => null),
      ]);
      setRouterInfo(info);
      setNetworkStatus(net);
      setDevices(devList);
      setWifiSettings(wifi);
      if (relay) {
        setWifiRelay(relay);
      }
      if (connectionLost) {
        setConnectionLost(false);
        addToast('success', 'Reconnected', info.routerIp);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/session expired|not authenticated/i.test(msg)) {
        setSession(null);
        addToast('warning', 'Session expired', 'Sign in again to continue.');
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
      addToast('error', 'Unable to detect router', err instanceof Error ? err.message : undefined);
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
          setWifiRelay(null);
        } else {
          addToast('info', 'Simulator active', `${res.simulatorUrl} (password: admin)`);
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
          await Promise.all([refreshAllData(), refreshSpeedTestHistory()]);
          return { success: true };
        }
        return { success: false, errorMessage: res.errorMessage || 'Unable to authenticate with router.' };
      } catch (err) {
        return {
          success: false,
          errorMessage: err instanceof Error ? err.message : 'Unable to connect to the router.',
        };
      }
    },
    [refreshAllData, refreshSpeedTestHistory]
  );

  const logout = useCallback(async (clearSaved = false) => {
    if (!window.tendaApi) return;
    await window.tendaApi.logout(clearSaved);
    setSession(null);
    setRouterInfo(null);
    setNetworkStatus(null);
    setDevices([]);
    setWifiSettings(null);
    setWifiRelay(null);
    setConnectionLost(false);
  }, []);

  const triggerRouterReboot = useCallback(async (): Promise<boolean> => {
    if (!window.tendaApi) return false;
    setRebootingRouter(true);
    try {
      const ok = await window.tendaApi.restartRouter();
      if (!ok) {
        setRebootingRouter(false);
        addToast('error', 'Unable to restart router');
        return false;
      }

      addToast('info', 'Restarting router...');
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await refreshAllData();
          setRebootingRouter(false);
          addToast('success', 'Router online');
          return true;
        } catch {
          // Keep waiting
        }
      }
      setRebootingRouter(false);
      return true;
    } catch (err) {
      setRebootingRouter(false);
      addToast('error', 'Restart failed', err instanceof Error ? err.message : undefined);
      return false;
    }
  }, [refreshAllData, addToast]);

  const updateAppSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      if (!window.tendaApi) return;
      const updated = await window.tendaApi.updateSettings(partial);
      setSettings(updated);
      addToast('success', 'Settings saved');
    },
    [addToast]
  );

  useEffect(() => {
    if (!window.tendaApi) return;
    let mounted = true;

    (async () => {
      try {
        const [loadedSettings, historyRecords] = await Promise.all([
          window.tendaApi.getSettings(),
          window.tendaApi.getSpeedTestHistory(),
        ]);
        if (!mounted) return;
        setSettings(loadedSettings);
        setSpeedTestHistory(historyRecords);

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
        wifiRelay,
        speedTestHistory,
        refreshSpeedTestHistory,
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
        resolvedTheme,
        setThemeMode,
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
