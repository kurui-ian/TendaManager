import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Edit3,
  Gauge,
  MonitorSmartphone,
  Search,
  ShieldOff,
  Sliders,
  Wifi,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RouterDevice } from '../types/ipc';
import { ConfirmDialog } from '../components/ConfirmDialog';

type DeviceFilter = 'all' | 'online' | 'offline' | 'blocked' | 'limited';

const BANDWIDTH_PRESETS: Array<{ label: string; valueKbps: number }> = [
  { label: 'Unlimited', valueKbps: 0 },
  { label: '256 Kbps (32 KB/s)', valueKbps: 32 },
  { label: '512 Kbps (64 KB/s)', valueKbps: 64 },
  { label: '1 Mbps (128 KB/s)', valueKbps: 128 },
  { label: '2 Mbps (256 KB/s)', valueKbps: 256 },
  { label: '5 Mbps (640 KB/s)', valueKbps: 640 },
  { label: '10 Mbps (1280 KB/s)', valueKbps: 1280 },
  { label: 'Custom (Mbps)', valueKbps: -1 },
];

function formatLimitLabel(limitKbps: number): string {
  if (!limitKbps || limitKbps <= 0) return 'Unlimited';
  const mbps = (limitKbps * 8) / 1024;
  if (mbps >= 1) {
    return `${Number(mbps.toFixed(1))} Mbps (${limitKbps} KB/s)`;
  }
  return `${limitKbps * 8} Kbps (${limitKbps} KB/s)`;
}

export const DevicesPage: React.FC = () => {
  const { devices, refreshAllData, addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<DeviceFilter>('all');
  const [selectedMac, setSelectedMac] = useState<string | null>(null);

  // Drawer editing state
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [downPreset, setDownPreset] = useState<number>(0);
  const [upPreset, setUpPreset] = useState<number>(0);
  const [customDownMbps, setCustomDownMbps] = useState<string>('5');
  const [customUpMbps, setCustomUpMbps] = useState<string>('2');
  const [savingBandwidth, setSavingBandwidth] = useState<boolean>(false);

  // Block confirmation dialog state
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
    addToast('success', 'Device Name Updated', `Saved friendly name for ${selectedDevice.macAddress}`);
  };

  const handleSaveBandwidth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    let finalDownKbps = downPreset;
    if (downPreset === -1) {
      const mbps = Number(customDownMbps);
      if (!Number.isFinite(mbps) || mbps <= 0 || mbps > 300) {
        addToast('error', 'Invalid Download Limit', 'Custom download speed must be between 0.1 and 300 Mbps.');
        return;
      }
      finalDownKbps = Math.round((mbps * 1024) / 8);
    }

    let finalUpKbps = upPreset;
    if (upPreset === -1) {
      const mbps = Number(customUpMbps);
      if (!Number.isFinite(mbps) || mbps <= 0 || mbps > 300) {
        addToast('error', 'Invalid Upload Limit', 'Custom upload speed must be between 0.1 and 300 Mbps.');
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
        addToast(
          'success',
          'Bandwidth Limits Applied',
          `Updated QoS limits for ${selectedDevice.customName || selectedDevice.hostname}`
        );
      } else {
        addToast('error', 'Update Failed', 'Router rejected the QoS bandwidth rule.');
      }
    } catch (err) {
      addToast('error', 'Bandwidth Error', err instanceof Error ? err.message : 'Failed to update bandwidth');
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
        addToast(
          'success',
          '✓ Device blocked successfully',
          `${deviceToBlock.customName || deviceToBlock.hostname} (${deviceToBlock.macAddress}) is now blocked from accessing the Internet.`
        );
        setDeviceToBlock(null);
      } else {
        addToast('error', 'Block Failed', 'Router did not accept the MAC block request.');
      }
    } catch (err) {
      addToast('error', 'Block Error', err instanceof Error ? err.message : 'Failed to block device');
    } finally {
      setBlockingInProgress(false);
    }
  };

  const handleUnblockDevice = async (dev: RouterDevice) => {
    try {
      const ok = await window.tendaApi.unblockDevice(dev.macAddress);
      if (ok) {
        await refreshAllData();
        addToast(
          'success',
          'Device Unblocked',
          `${dev.customName || dev.hostname} (${dev.macAddress}) has been restored to Internet access.`
        );
      }
    } catch (err) {
      addToast('error', 'Unblock Error', err instanceof Error ? err.message : 'Failed to unblock device');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Connected Devices</h1>
          <p className="page-subtitle">
            Inspect active and known devices, assign friendly local names, apply bandwidth limits, or block Internet access via MAC filtering.
          </p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div className="filter-tabs" role="tablist" aria-label="Device filter tabs">
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
              className={`filter-tab ${activeFilter === tab.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: '280px', flex: '0 1 340px' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '11px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="search"
            className="form-input"
            style={{ paddingLeft: '34px', paddingTop: '7px', paddingBottom: '7px' }}
            placeholder="Search by device name, IP, or MAC..."
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
                <th>Live Speed</th>
                <th>Bandwidth Limit</th>
                <th>Status</th>
                <th>Controls</th>
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
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MonitorSmartphone size={16} color="var(--accent-primary)" />
                      <span>{dev.customName || dev.hostname}</span>
                    </div>
                    {dev.customName && (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', paddingLeft: '24px' }}>
                        Hostname: {dev.hostname}
                      </div>
                    )}
                  </td>
                  <td className="mono">{dev.ipAddress}</td>
                  <td className="mono">{dev.macAddress}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Wifi size={13} color="var(--text-secondary)" />
                      {dev.connectionType}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: '12px' }}>
                    {dev.online && !dev.blocked
                      ? `↓ ${dev.downloadSpeedKbps} / ↑ ${dev.uploadSpeedKbps} KB/s`
                      : '—'}
                  </td>
                  <td>
                    {dev.downloadLimitKbps > 0 || dev.uploadLimitKbps > 0 ? (
                      <span className="badge badge-warning">
                        ↓ {formatLimitLabel(dev.downloadLimitKbps)} / ↑ {formatLimitLabel(dev.uploadLimitKbps)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Unlimited</span>
                    )}
                  </td>
                  <td>
                    {dev.blocked ? (
                      <span className="badge badge-danger">Blocked</span>
                    ) : dev.online ? (
                      <span className="badge badge-success">Online</span>
                    ) : (
                      <span className="badge badge-info">Offline</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openDeviceDrawer(dev)}
                      >
                        <Sliders size={13} />
                        Manage
                      </button>
                      {dev.blocked ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleUnblockDevice(dev)}
                        >
                          <CheckCircle2 size={13} />
                          Unblock
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeviceToBlock(dev)}
                        >
                          <Ban size={13} />
                          Block
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                    No devices match the current filter or search query.
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
                <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                  {selectedDevice.customName || selectedDevice.hostname}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Router Hostname: <span className="mono">{selectedDevice.hostname}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedMac(null)}
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Device Details Summary */}
            <div className="card" style={{ padding: '14px' }}>
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-label">Status</span>
                  <span className="kv-value">
                    {selectedDevice.blocked ? (
                      <span className="badge badge-danger">● Blocked</span>
                    ) : selectedDevice.online ? (
                      <span className="badge badge-success">● Connected</span>
                    ) : (
                      <span className="badge badge-info">○ Offline</span>
                    )}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-label">IP Address</span>
                  <span className="kv-value mono">{selectedDevice.ipAddress}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label">MAC Address</span>
                  <span className="kv-value mono">{selectedDevice.macAddress}</span>
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
            </div>

            {/* Friendly Local Naming */}
            <div className="card" style={{ padding: '14px' }}>
              <div className="card-header" style={{ marginBottom: '10px' }}>
                <span className="card-title" style={{ fontSize: '14px' }}>
                  <Edit3 size={15} color="var(--accent-primary)" />
                  Friendly Device Name (Local)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  placeholder="e.g. Living Room TV"
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSaveFriendlyName}
                >
                  Save
                </button>
              </div>
              <div className="form-hint" style={{ marginTop: '6px' }}>
                Stored locally in TendaManager while preserving the router&apos;s original hostname.
              </div>
            </div>

            {/* Bandwidth Control Form */}
            {!selectedDevice.blocked && (
              <form className="card" style={{ padding: '14px' }} onSubmit={handleSaveBandwidth}>
                <div className="card-header" style={{ marginBottom: '12px' }}>
                  <span className="card-title" style={{ fontSize: '14px' }}>
                    <Gauge size={15} color="var(--accent-primary)" />
                    Bandwidth Control
                  </span>
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
                    <label className="form-label">Custom Download (Mbps)</label>
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
                    <label className="form-label">Custom Upload (Mbps)</label>
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
                  {savingBandwidth ? 'Applying QoS Rules...' : 'Apply Bandwidth Limits'}
                </button>
              </form>
            )}

            {/* Block / Unblock Action */}
            <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
              {selectedDevice.blocked ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => handleUnblockDevice(selectedDevice)}
                >
                  <ShieldOff size={16} />
                  Unblock Internet Access
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ width: '100%' }}
                  onClick={() => setDeviceToBlock(selectedDevice)}
                >
                  <Ban size={16} />
                  Block Internet
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Block Device Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deviceToBlock)}
        title={`Block ${deviceToBlock?.customName || deviceToBlock?.hostname || 'Device'}?`}
        description="This device will lose Internet access immediately via MAC address filtering on the Tenda F3 router."
        warningItems={
          deviceToBlock
            ? [
                `Device: ${deviceToBlock.customName || deviceToBlock.hostname}`,
                `IP Address: ${deviceToBlock.ipAddress}`,
                `MAC Address: ${deviceToBlock.macAddress}`,
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
