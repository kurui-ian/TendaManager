# TendaManager — Desktop Router Management Application for Tenda F3

**Version:** `v1.0.0`  
**Platform:** Windows 10 & Windows 11 (64-bit)  
**Target Router:** Tenda F3 (Hardware/Firmware Revisions v2.0, v3.0, v4.0, v5.0)  
**Installer:** `TendaManager-Setup.exe` (`TendaManager-Setup-1.0.0.exe`)

---

## Releases & Download (v1.0.0)

Download the latest Windows installer directly from the [**GitHub Releases (v1.0.0)**](https://github.com/kurui-ian/TendaManager/releases/tag/v1.0.0) section:

| Release Asset | Type | Platform | Description |
| :--- | :--- | :--- | :--- |
| [**`TendaManager-Setup.exe`**](https://github.com/kurui-ian/TendaManager/releases/download/v1.0.0/TendaManager-Setup.exe) | NSIS Installer | Windows 10 / 11 (x64) | Full desktop installer with Start Menu & Desktop shortcuts and uninstaller |
| [**`TendaManager-Setup-1.0.0.exe`**](https://github.com/kurui-ian/TendaManager/releases/download/v1.0.0/TendaManager-Setup-1.0.0.exe) | Versioned Installer | Windows 10 / 11 (x64) | Version-tagged release installer (`1.0.0`) |

### What's Included in v1.0.0
- **Automatic Tenda F3 Discovery**: Detects Tenda F3 routers across standard gateways (`192.168.0.1`, `tendawifi.com`) and **Universal Repeater / AP** subnet IPs (such as `192.168.100.8`) via ARP OUI inspection.
- **Password & Passwordless Login**: Supports both administrator password authentication (`/login/Auth` with Windows DPAPI credential encryption) and direct one-click sign-in when the router has no login password configured (`hasLoginPwd=false`).
- **Universal Repeater & Operating Modes**: Scan nearby 2.4 GHz Wi-Fi networks (`wifiScan`) and configure **Universal Repeater (`client+ap`)**, **WISP**, **Access Point (`ap`)**, or **Standard Router (`disabled`)** via `/goform/getWifiRelay` and `/goform/setWifiRelay`.
- **Connected Devices, MAC Blocking & Bandwidth Control**: View real-time client lists, assign local friendly device names, block/unblock MAC addresses, and enforce per-device download/upload bandwidth limits (`/goform/getQos`, `/goform/setQos`).
- **Wi-Fi Configuration**: Manage 2.4 GHz SSID, WPA/WPA2-PSK passphrase, radio state, and SSID broadcast visibility (`/goform/getWifi`, `/goform/setWifi`).
- **Live Multi-Stage Internet Speed Test**: Real-time radial speedometer gauge (`0–250+ Mbps`) and live download/upload waveform sparklines with 24-probe latency/jitter testing (~5s), 15-second continuous download streaming, and 15-second continuous upload streaming against Cloudflare Edge (`speed.cloudflare.com`).
- **Desktop UI with Dark, Light & System Themes**: Clean, restrained Windows desktop interface with custom dual-antenna TendaManager branding, system tray integration, and 7-step connection diagnostics.

---

## 1. Project Overview

**TendaManager** is a local-first Windows desktop application that provides a modern, centralized interface for administering a **Tenda F3** wireless router over a local network without manually navigating the traditional embedded web UI.

```text
User connects to Tenda Wi-Fi / LAN
          ↓
Opens TendaManager
          ↓
Application detects local gateway or Universal Repeater IP & Tenda F3 signature
          ↓
User authenticates (with optional Windows DPAPI Credential Vault storage)
          ↓
TendaManager Dashboard
          ↓
Manage router / connected devices / MAC blocking / bandwidth QoS / Wi-Fi / Universal Repeater
          ↓
Run real-time Internet Speed Test & Connection Diagnostics
```

---

## 2. Supported Router Models & Firmware Compatibility

Tenda has released multiple hardware and firmware revisions of the F3 router (`v2.0`, `v3.0`, `v4.0`, `v5.0`). Rather than assuming a single hard-coded endpoint schema, TendaManager uses a modular **Router Adapter Architecture**:

| Hardware Version | Adapter Class | Typical Firmware Branch | Auth Mechanism | Connected Devices & MAC Block | Per-Device Bandwidth QoS | Wi-Fi & Universal Repeater | Remote Reboot |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Tenda F3 v2.0** | `F3V2Adapter` | `V11.xx` / early `V12.01.01` | Base64 + Form Fallback | Supported | Supported | Supported | Supported |
| **Tenda F3 v3.0** | `F3V3Adapter` | `V12.01.01.34` – `V12.01.01.48` | Base64 (`/login/Auth` + `ecos_pw`) | Supported | Supported | Supported | Supported |
| **Tenda F3 v4.0** | `F3V4Adapter` | `V12.01.01.45+` (Rev 4.0) | MD5 / Base64 Auto-Negotiation | Supported | Supported | Supported | Supported |
| **Tenda F3 v5.0** | `F3V5Adapter` | `V12.01.01.5x` (Rev 5.0) | Base64 / MD5 Auto-Negotiation | Supported | Supported | Supported | Supported |

---

## 3. Core Features

- **Automatic Router Discovery**: Inspects active Windows IPv4 network interfaces (`ipconfig`, `netsh wlan`, `arp -a`) to identify the local IP, subnet mask, connected SSID, Default Gateway, and Tenda OUI devices operating in Universal Repeater mode.
- **Secure Authentication**: Authenticates against the router's `/login/Auth` endpoint, maintains session cookies (`ecos_pw`), supports unauthenticated (`hasLoginPwd=false`) routers, and automatically renews expired sessions when credentials are saved.
- **Dashboard**: Clean overview strip of router model, Internet state, operating mode, Wi-Fi status, and connected device count, paired with a live connected-devices table, latest Speed Test summary, and WAN/LAN telemetry.
- **Connected Devices & Friendly Local Naming**:
  - Search by device name, IP, or MAC address.
  - Filter by `All`, `Online`, `Offline`, `Blocked`, or `Bandwidth Limited`.
  - Assign custom local friendly names stored in `%APPDATA%/TendaManager` while preserving the router's reported hostname.
- **MAC-Based Device Blocking & Unblocking**: Block or restore Internet access for any device via `/goform/setQos` (`blackList`) with confirmation dialogs.
- **Per-Device Bandwidth Control (QoS)**: Apply separate Download and Upload rate limits using presets (`Unlimited`, `256 Kbps`, `512 Kbps`, `1 Mbps`, `2 Mbps`, `5 Mbps`, `10 Mbps`) or custom Mbps limits (`0.25 – 300 Mbps`).
- **Wi-Fi Management**: Configure 2.4 GHz radio state, SSID, security mode (`WPA/WPA2-PSK`, `WPA2-PSK`, `WPA-PSK`, `None`), password visibility toggle, and SSID broadcast hiding.
- **Universal Repeater (`wifiRelay`)**: Scan nearby 2.4 GHz wireless networks with signal strength, channel, MAC/BSSID, and security detection, and switch seamlessly between `Universal Repeater`, `WISP`, `Access Point (AP)`, and `Router (Disabled)`.
- **Internet Speed Test**: Multi-stage real HTTP latency/ping (24 RTT probes over ~5s), jitter, 15s download throughput, and 15s upload throughput measurement against Cloudflare's edge network (`speed.cloudflare.com`), with a live non-linear radial speedometer gauge, real-time waveform sparklines, cancellation support, and persistent test history.
- **Connection Diagnostics & Report Export**: Verifies local network adapter, default gateway, HTTP reachability, Tenda signature, authentication validity, `/goform/getQos`, and `/goform/getWifi`, with one-click sanitized JSON report export.
- **Windows System Tray & Theme Support**: Minimizes to the Windows system tray and supports `Dark`, `Light`, and `System` appearance modes.

---

## 4. Architecture

TendaManager enforces a strict layered architecture where the React UI layer **never** makes direct HTTP requests to the router:

```text
┌──────────────────────────────────────────────────────────┐
│                       UI Layer (src/)                    │
│  Dashboard • Devices • Wi-Fi • Repeater • Speed Test     │
└────────────────────────────┬─────────────────────────────┘
                             │ Electron ContextBridge IPC (preload.ts)
┌────────────────────────────▼─────────────────────────────┐
│             Application Services (src-main/services/)    │
│  AuthenticationService • RouterService • DeviceService   │
│  WifiService • SpeedTestService • DiagnosticService      │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│            Router Abstraction (src-main/router/)         │
│  RouterAdapter Interface • TendaF3BaseAdapter            │
│  F3V2Adapter • F3V3Adapter • F3V4Adapter • F3V5Adapter   │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│         Local Network & HTTP Layer (TendaHttpClient)     │
│  InsecureHTTPParser tolerance • Cookie jar • Retries     │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Development Setup & Building

### Prerequisites
- **Node.js**: v20+ or v24+
- **OS**: Windows 10 or Windows 11 (64-bit)

### Install Dependencies
```bash
npm install
```

### Run Automated Tests
```bash
npm test
```

### Build Production Bundles
```bash
npm run build
```

### Launch Desktop Application
```bash
npm start
```

### Package Windows Installer (`TendaManager-Setup.exe`)
```bash
npm run dist:win
```
The packaged Windows NSIS installer and unpacked desktop executable are output to the `release/` directory.

---

## 6. Security Considerations

- **No Plaintext Password Storage**: When "Remember password" is enabled, credentials are encrypted via Electron's `safeStorage` API backed by the **Windows Data Protection API (DPAPI)**.
- **Redacted Logging & Diagnostic Exports**: All log entries and exported diagnostic reports pass through `sanitizeLogString()` and `maskIpAddress()`, automatically redacting `password`, `wifiPwd`, `ecos_pw`, and `Set-Cookie` values and masking public WAN IP addresses.
- **Authorized Local Administration Only**: TendaManager uses only standard router management HTTP endpoints and never attempts brute-force attacks, authentication bypasses, or firmware exploits.
