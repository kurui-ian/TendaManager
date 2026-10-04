import React, { useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Search,
  Sliders,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RouterDevice } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

type DeviceFilter = 'all' | 'online' | 'offline' | 'blocked' | 'limited';

const BANDWIDTH_PRESETS: Array<{ label: string; valueKbps: number }> = [
  { label: 'Unlimited', valueKbps: 0 },
  { label: '256 Kbps', valueKbps: 32 },
  { label: '512 Kbps', valueKbps: 64 },
  { label: '1 Mbps', valueKbps: 128 },
  { label: '2 Mbps', valueKbps: 256 },
  { label: '5 Mbps', valueKbps: 640 },
  { label: '10 Mbps', valueKbps: 1280 },
  { label: 'Custom (Mbps)', valueKbps: -1 },
];

function formatLimitLabel(limitKbps: number): string {
  if (!limitKbps || limitKbps <= 0) return 'Unlimited';
  const mbps = (limitKbps * 8) / 1024;
  if (mbps >= 1) {
    return `${Number(mbps.toFixed(1))} Mbps`;
  }
  return `${limitKbps * 8} Kbps`;
}

export const DevicesPage: React.FC = () => {
  const { devices, refreshing, refreshAllData, addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<DeviceFilter>('all');
  const [selectedMac, setSelectedMac] = useState<string | null>(null);

  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [downPreset, setDownPreset] = useState<number>(0);
  const [upPreset, setUpPreset] = useState<number>(0);
  const [customDownMbps, setCustomDownMbps] = useState<string>('5');
  const [customUpMbps, setCustomUpMbps] = useState<string>('2');
  const [savingBandwidth, setSavingBandwidth] = useState<boolean>(false);

  const [deviceToBlock, setDeviceToBlock] = useState<RouterDevice | null>(null);
  const [blockingInProgress, setBlockingInProgress] = useState<boolean>(false);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.macAddress === selectedMac) || null,
    [devices, selectedMac]
  );

  const openDeviceDrawer = (dev: RouterDevice) => {
    setSelectedMac(dev.macAddress);
    setCustomNameInput(dev.customName || '');

    const matchDown = BANDWIDTH_PRESETS.some((p) => p.valueKbps === dev.downloadLimitKbps && p.valueKbps >= 0);
    if (matchDown) {
      setDownPreset(dev.downloadLimitKbps);
    } else {
      setDownPreset(-1);
      setCustomDownMbps(String(Math.max(0.25, Number(((dev.downloadLimitKbps * 8) / 1024).toFixed(2)))));
    }

    const matchUp = BANDWIDTH_PRESETS.some((p) => p.valueKbps === dev.uploadLimitKbps && p.valueKbps >= 0);
    if (matchUp) {
      setUpPreset(dev.uploadLimitKbps);
    } else {
      setUpPreset(-1);
      setCustomUpMbps(String(Math.max(0.25, Number(((dev.uploadLimitKbps * 8) / 1024).toFixed(2)))));
    }
  };

  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return devices.filter((dev) => {
      if (activeFilter === 'online' && (!dev.online || dev.blocked)) return false;
      if (activeFilter === 'offline' && (dev.online || dev.blocked)) return false;
      if (activeFilter === 'blocked' && !dev.blocked) return false;
      if (activeFilter === 'limited' && dev.downloadLimitKbps <= 0 && dev.uploadLimitKbps <= 0) return false;

      if (!q) return true;
      const nameMatch = (dev.customName || '').toLowerCase().includes(q) || dev.hostname.toLowerCase().includes(q);
      const ipMatch = dev.ipAddress.toLowerCase().includes(q);
      const macMatch = dev.macAddress.toLowerCase().includes(q);
      return nameMatch || ipMatch || macMatch;
    });
  }, [devices, searchQuery, activeFilter]);

  const handleSaveFriendlyName = async () => {
    if (!selectedDevice) return;
    await window.tendaApi.renameDevice(selectedDevice.macAddress, customNameInput);
    await refreshAllData();
    addToast('success', 'Device name saved');
  };

  const handleSaveBandwidth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    let finalDownKbps = downPreset;
    if (downPreset === -1) {
      const mbps = Number(customDownMbps);
      if (!Number.isFinite(mbps) || mbps <= 0 || mbps > 300) {
        addToast('error', 'Download limit must be between 0.1 and 300 Mbps.');
        return;
      }
      finalDownKbps = Math.round((mbps * 1024) / 8);
    }

    let finalUpKbps = upPreset;
    if (upPreset === -1) {
      const mbps = Number(customUpMbps);
      if (!Number.isFinite(mbps) || mbps <= 0 || mbps > 300) {
        addToast('error', 'Upload limit must be between 0.1 and 300 Mbps.');
        return;
      }
      finalUpKbps = Math.round((mbps * 1024) / 8);
    }

    setSavingBandwidth(true);
    try {
      const ok = await window.tendaApi.setBandwidthRule({
        macAddress: selectedDevice.macAddress,
        hostname: selectedDevice.hostname,
        downloadLimitKbps: finalDownKbps,
        uploadLimitKbps: finalUpKbps,
      });
      if (ok) {
        await refreshAllData();
        addToast('success', 'Bandwidth limits updated');
      } else {
        addToast('error', 'Bandwidth limits could not be updated.');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Bandwidth limits could not be updated.');
    } finally {
      setSavingBandwidth(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!deviceToBlock) return;
    setBlockingInProgress(true);
    try {
      const ok = await window.tendaApi.blockDevice(deviceToBlock.macAddress, deviceToBlock.hostname);
      if (ok) {
        await refreshAllData();
        addToast('success', 'Device blocked');
        setDeviceToBlock(null);
      } else {
        addToast('error', 'Device could not be blocked.');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Device could not be blocked.');
    } finally {
      setBlockingInProgress(false);
    }
  };

  const handleUnblockDevice = async (dev: RouterDevice) => {
    try {
      const ok = await window.tendaApi.unblockDevice(dev.macAddress);
      if (ok) {
        await refreshAllData();
        addToast('success', 'Device unblocked');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Device could not be unblocked.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Devices</h1>
      </div>

      {/* Filter & Search Toolbar (Directly on page, not wrapped in a card) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div className="filter-tabs" role="tablist" aria-label="Device filter">
          {(
            [
              { id: 'all', label: `All (${devices.length})` },
              { id: 'online', label: `Online (${devices.filter((d) => d.online && !d.blocked).length})` },
              { id: 'offline', label: `Offline (${devices.filter((d) => !d.online && !d.blocked).length})` },
              { id: 'blocked', label: `Blocked (${devices.filter((d) => d.blocked).length})` },
              {
                id: 'limited',
                label: `Limited (${devices.filter((d) => d.downloadLimitKbps > 0 || d.uploadLimitKbps > 0).length})`,
              },
            ] as Array<{ id: DeviceFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab.id}
              className={`filter-tab tabular ${activeFilter === tab.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: 250, flex: '0 1 300px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="search"
            className="form-input"
            style={{ paddingLeft: 32, paddingTop: 6, paddingBottom: 6 }}
            placeholder="Filter by name, IP, or MAC"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Devices Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>IP Address</th>
                <th>MAC Address</th>
                <th>Connection</th>
                <th>Rate</th>
                <th>Limit</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((dev) => (
                <tr
                  key={dev.id}
                  onClick={() => openDeviceDrawer(dev)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div style={{ fontWeight: 500 }}>{dev.customName || dev.hostname}</div>
                    {dev.customName && (
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {dev.hostname}
                      </div>
                    )}
                  </td>
                  <td className="mono">{dev.ipAddress}</td>
                  <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                    {dev.macAddress}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{dev.connectionType}</td>
                  <td className="mono tabular">
                    {dev.online && !dev.blocked
                      ? `↓ ${dev.downloadSpeedKbps} / ↑ ${dev.uploadSpeedKbps} KB/s`
                      : '—'}
                  </td>
                  <td className="tabular">
                    {dev.downloadLimitKbps > 0 || dev.uploadLimitKbps > 0 ? (
                      <span className="badge badge-warning">
                        ↓ {formatLimitLabel(dev.downloadLimitKbps)} · ↑ {formatLimitLabel(dev.uploadLimitKbps)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Unlimited</span>
                    )}
                  </td>
                  <td>
                    {dev.blocked ? (
                      <span className="badge badge-danger">
                        <span className="status-dot danger" />
                        Blocked
                      </span>
                    ) : dev.online ? (
                      <span className="badge badge-success">
                        <span className="status-dot online" />
                        Online
                      </span>
                    ) : (
                      <span className="badge badge-neutral">
                        <span className="status-dot offline" />
                        Offline
                      </span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openDeviceDrawer(dev)}
                      >
                        <Sliders size={12} />
                        <span>View</span>
                      </button>
                      {dev.blocked ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleUnblockDevice(dev)}
                        >
                          <Check size={12} />
                          <span>Unblock</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeviceToBlock(dev)}
                        >
                          <Ban size={12} />
                          <span>Block</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-state">
                    {refreshing && devices.length === 0
                      ? 'Loading devices...'
                      : devices.length === 0
                      ? 'No devices connected.'
                      : 'No matching devices.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Device Details Side Drawer */}
      {selectedDevice && (
        <div className="drawer-backdrop" onClick={() => setSelectedMac(null)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                  {selectedDevice.customName || selectedDevice.hostname}
                </h2>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {selectedDevice.macAddress}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedMac(null)}
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Device Details Summary */}
            <div className="kv-list" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
              <div className="kv-row">
                <span className="kv-label">Status</span>
                <span className="kv-value">
                  {selectedDevice.blocked ? (
                    <span className="badge badge-danger">● Blocked</span>
                  ) : selectedDevice.online ? (
                    <span className="badge badge-success">● Online</span>
                  ) : (
                    <span className="badge badge-neutral">● Offline</span>
                  )}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Hostname</span>
                <span className="kv-value mono">{selectedDevice.hostname}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">IP Address</span>
                <span className="kv-value mono">{selectedDevice.ipAddress}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Connection</span>
                <span className="kv-value">{selectedDevice.connectionType}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Download Limit</span>
                <span className="kv-value">{formatLimitLabel(selectedDevice.downloadLimitKbps)}</span>
              </div>
              <div className="kv-row">
                <span className="kv-label">Upload Limit</span>
                <span className="kv-value">{formatLimitLabel(selectedDevice.uploadLimitKbps)}</span>
              </div>
            </div>

            {/* Rename Device */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
                Display Name
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  placeholder={selectedDevice.hostname}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSaveFriendlyName}
                >
                  Save
                </button>
              </div>
            </div>

            {/* Bandwidth Control Form */}
            {!selectedDevice.blocked && (
              <form
                style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}
                onSubmit={handleSaveBandwidth}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  Bandwidth Control
                </div>

                <div className="form-group">
                  <label className="form-label">Download Limit</label>
                  <select
                    className="form-select"
                    value={downPreset}
                    onChange={(e) => setDownPreset(Number(e.target.value))}
                  >
                    {BANDWIDTH_PRESETS.map((p) => (
                      <option key={p.label} value={p.valueKbps}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {downPreset === -1 && (
                  <div className="form-group">
                    <label className="form-label">Download (Mbps)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="300"
                      className="form-input"
                      value={customDownMbps}
                      onChange={(e) => setCustomDownMbps(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Upload Limit</label>
                  <select
                    className="form-select"
                    value={upPreset}
                    onChange={(e) => setUpPreset(Number(e.target.value))}
                  >
                    {BANDWIDTH_PRESETS.map((p) => (
                      <option key={p.label} value={p.valueKbps}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {upPreset === -1 && (
                  <div className="form-group">
                    <label className="form-label">Upload (Mbps)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="300"
                      className="form-input"
                      value={customUpMbps}
                      onChange={(e) => setCustomUpMbps(e.target.value)}
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={savingBandwidth}
                >
                  {savingBandwidth ? 'Saving...' : 'Apply Limits'}
                </button>
              </form>
            )}

            {/* Block / Unblock Action */}
            <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              {selectedDevice.blocked ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => handleUnblockDevice(selectedDevice)}
                >
                  Unblock Device
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ width: '100%' }}
                  onClick={() => setDeviceToBlock(selectedDevice)}
                >
                  Block Internet Access
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deviceToBlock)}
        title={`Block ${deviceToBlock?.customName || deviceToBlock?.hostname || 'Device'}?`}
        description="This device will lose Internet access."
        warningItems={
          deviceToBlock
            ? [
                `${deviceToBlock.customName || deviceToBlock.hostname}`,
                `IP: ${deviceToBlock.ipAddress}`,
                `MAC: ${deviceToBlock.macAddress}`,
              ]
            : undefined
        }
        confirmLabel="Block Device"
        variant="danger"
        loading={blockingInProgress}
        onConfirm={handleConfirmBlock}
        onCancel={() => setDeviceToBlock(null)}
      />
    </div>
  );
};
