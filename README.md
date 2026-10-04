# TendaManager — Desktop Router Management Application for Tenda F3

**Version:** 1.0.0  
**Platform:** Windows 10 & Windows 11 (64-bit)  
**Target Router:** Tenda F3 (Hardware/Firmware Revisions v2.0, v3.0, v4.0, v5.0)  
**Primary Output:** `TendaManager-Setup-1.0.0.exe` / `TendaManager-Setup.exe`

---

## 1. Project Overview

**TendaManager** is a local-first Windows desktop application that provides a modern, centralized interface for administering a **Tenda F3** wireless router over a local network without manually navigating the traditional embedded web UI.

```text
User connects to Tenda Wi-Fi / LAN
          ↓
Opens TendaManager
          ↓
Application detects local gateway & Tenda F3 signature
          ↓
User authenticates (with optional Windows DPAPI Credential Vault storage)
          ↓
TendaManager Dashboard
          ↓
Manage router / connected devices / MAC blocking / bandwidth QoS / Wi-Fi
          ↓
Run real-time Internet Speed Test & Connection Diagnostics
```

---

## 2. Supported Router Models & Firmware Compatibility

Tenda has released multiple hardware and firmware revisions of the F3 router (`v2.0`, `v3.0`, `v4.0`, `v5.0`). Rather than assuming a single hard-coded endpoint schema, TendaManager uses a modular **Router Adapter Architecture**:

| Hardware Version | Adapter Class | Typical Firmware Branch | Auth Mechanism | Connected Devices & MAC Block | Per-Device Bandwidth QoS | Wi-Fi SSID & WPA/WPA2 | Remote Reboot |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Tenda F3 v2.0** | `F3V2Adapter` | `V11.xx` / early `V12.01.01` | Base64 + Form Fallback | Supported | Supported | Supported | Supported |
| **Tenda F3 v3.0** | `F3V3Adapter` | `V12.01.01.34` – `V12.01.01.48` | Base64 (`/login/Auth` + `ecos_pw`) | Supported | Supported | Supported | Supported |
| **Tenda F3 v4.0** | `F3V4Adapter` | `V12.01.01.45+` (Rev 4.0) | MD5 / Base64 Auto-Negotiation | Supported | Supported | Supported | Supported |
| **Tenda F3 v5.0** | `F3V5Adapter` | `V12.01.01.5x` (Rev 5.0) | Base64 / MD5 Auto-Negotiation | Supported | Supported | Supported | Supported |

If a connected gateway is not a Tenda F3 (for example, an ISP Huawei fiber ONT at `192.168.100.1`), TendaManager detects the non-Tenda vendor, alerts the user clearly without fabricating router data, and provides:
1. Direct fallback to **Open in Browser**
2. A built-in **Local Tenda F3 Hardware Simulator (`127.0.0.1`, default password: `admin`)** that speaks the genuine Tenda F3 `V12.01.01.48_en` HTTP `/login/Auth` and `/goform/*` protocol for offline testing and evaluation.

---

## 3. Core Features

- **Automatic Router Discovery**: Inspects active Windows IPv4 network interfaces (`ipconfig`, `netsh wlan`) to identify the local IP, subnet mask, connected SSID, and Default Gateway (`192.168.0.1`, `tendawifi.com`, or custom gateway).
- **Secure Authentication**: Authenticates against the router's `/login/Auth` endpoint, maintains session cookies (`ecos_pw`), detects session expiration (`302` redirects to `/login.html`), and automatically renews sessions when safe.
- **Dashboard**: Real-time overview of router model, hardware revision, firmware version, uptime, connected/offline/blocked device counts, and WAN status (with WAN IP masked by default).
- **Connected Devices & Friendly Local Naming**:
  - Search by device name, IP, or MAC address.
  - Filter by `All`, `Online`, `Offline`, `Blocked`, or `Bandwidth Limited`.
  - Assign custom local friendly names (e.g., `"Living Room TV"`) stored in `%APPDATA%/TendaManager` while preserving the router's reported hostname.
- **MAC-Based Device Blocking & Unblocking**: Block or restore Internet access for any device via `/goform/setQos` (`blackList`) with safety confirmation dialogs.
- **Per-Device Bandwidth Control (QoS)**: Apply separate Download and Upload rate limits using presets (`Unlimited`, `256 Kbps`, `512 Kbps`, `1 Mbps`, `2 Mbps`, `5 Mbps`, `10 Mbps`) or custom Mbps limits (`0.25 – 300 Mbps`).
- **Wi-Fi Management**: Configure 2.4 GHz radio state, SSID, security mode (`WPA/WPA2-PSK`, `WPA2-PSK`, `WPA-PSK`, `None`), password visibility toggle, live password strength indicator, password confirmation, and SSID broadcast hiding.
- **Internet Speed Test**: Real HTTP latency/ping, jitter, download throughput, and upload throughput measurement against Cloudflare's edge network (`speed.cloudflare.com`), with cancellation support and persistent local test history.
- **7-Step Connection Diagnostics & Report Export**: Verifies local network adapter, default gateway, HTTP reachability, Tenda signature, authentication validity, `/goform/getQos`, and `/goform/getWifi`, with one-click sanitized JSON report export.
- **Windows System Tray Integration**: Minimizes to the Windows system tray with quick actions (`Open Dashboard`, `Devices`, `Speed Test`, `Reconnect Router`, `Logout`, `Exit`) and optional desktop notifications.
- **Replaceable Theme Architecture**: All UI styling is driven by semantic CSS custom properties in `src/styles/theme.css` (`--bg-*`, `--text-*`, `--accent-*`, `--status-*`), supporting instant Dark/Light mode switching and effortless future theme replacement.

---

## 4. Architecture

TendaManager enforces a strict layered architecture where the React UI layer **never** makes direct HTTP requests to the router:

```text
┌──────────────────────────────────────────────────────────┐
│                       UI Layer (src/)                    │
│  Dashboard / Devices / Wi-Fi / SpeedTest / Diagnostics   │
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

- **No Plaintext Password Storage**: When "Remember this session" is enabled, credentials are encrypted via Electron's `safeStorage` API backed by the **Windows Data Protection API (DPAPI)** (or machine-bound AES-256-GCM in headless test environments).
- **Redacted Logging & Diagnostic Exports**: All log entries and exported diagnostic reports pass through `sanitizeLogString()` and `maskIpAddress()`, automatically redacting `password`, `wifiPwd`, `ecos_pw`, and `Set-Cookie` values and masking public WAN IP addresses.
- **Authorized Local Administration Only**: TendaManager uses only standard router management HTTP endpoints and never attempts brute-force attacks, authentication bypasses, or firmware exploits.
