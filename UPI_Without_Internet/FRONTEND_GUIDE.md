# 📡 UPI Offline Mesh — Modern Frontend Guide

Welcome to the **UPI Offline Mesh** frontend! This interface is a **fintech and decentralized systems dashboard** crafted with **HTML5, CSS3 (Modern Glassmorphic Dark Mode), and Vanilla JavaScript**.

It simulates sending UPI payments in a dead zone (basement, subway, tunnel, flight, festival) with **no cellular or Wi-Fi internet connection**, routing payments through nearby stranger phones via Bluetooth Low Energy (BLE) gossip until an internet-connected bridge node uploads them to the banking backend.

---

## 🌟 Key Frontend Features

### 1. 📱 Interactive Smartphone Simulator (UPI Mobile App)
- **Authentic Mobile Frame**: Modeled like a modern flagship smartphone with notch, camera, dynamic status bar showing `📴 NO 4G • NO WI-FI` and `📡 BLE Mesh Ready`.
- **Account Switcher**: Switch between Alice, Bob, Carol, and Dave with dynamic live balance badges.
- **Payee Selector**: Quick-select chips or custom dropdown for recipients.
- **Amount Input & Quick Chips**: Preset chips (+₹100, +₹250, +₹500, +₹1000) and custom input.
- **Interactive 4-Digit UPI PIN Pad**: Modal dialog with masked PIN dots, animated numeric keypad, and realistic audio synthesis using the browser's **Web Audio API** (no external media dependencies).
- **Offline Mesh Broadcast**: Generates an encrypted hybrid packet on the client and injects it into the starting relay device.

### 2. 🌐 Interactive 2D Mesh Network Visualizer (HTML5 Canvas)
- **Real-Time Physics Simulation**: Nodes gently gravitate and repel in 2D space with smooth physics and drag-and-drop capability.
- **Visual Node Roles**:
  - 🟣 **Sender Phone (`phone-alice`)**: The origin device.
  - 🔵 **Offline Relays (`phone-stranger1..3`)**: Bystander phones carrying encrypted payloads.
  - 🟢 **4G Bridge Node (`phone-bridge`)**: The uplink device that walks outside into cellular range.
- **Animated BLE Radio Pulses**: Expanding radio ripples and glowing packet particles hopping across Bluetooth links during gossip rounds.
- **4G Cloud Uplink Beams**: Glowing vertical beams and particle fountains shooting upward from bridge nodes during ingestion.
- **Click-to-Toggle 4G**: Click any node on the canvas or mini-cards to toggle its 4G connection on/off to test custom network topologies!

### 3. 🎬 1-Click Interactive Demo Tour
- A single click on **"🎬 1-Click Demo Tour"** automatically guides viewers through the complete 3-step offline flow:
  1. **Compose & Inject**: Alice signs and encrypts a ₹500 payment to Bob offline.
  2. **Gossip Propagation**: Packet hops from phone to phone across strangers.
  3. **Bridge Uplink & Settlement**: The bridge phone reaches 4G, uploads to backend, and the ledger updates!

### 4. 🧪 1-Click Duplicate Storm Test
- Demonstrates the **atomic idempotency gate** (`ConcurrentHashMap.putIfAbsent` / Redis `SETNX` on `SHA-256(ciphertext)`):
  - Seeds 3 bridge nodes simultaneously.
  - Injects a payment and gossips it to all nodes.
  - Fires parallel uploads from all 3 bridges at the exact same millisecond.
  - Proves that **exactly 1 settles** and the other **2 are dropped as duplicates**, preventing double debits!

### 5. 🔐 Cryptography Inspector & Tamper Attack Playground
- **Hybrid Encryption Breakdown**:
  - **Part 1 (256 bytes)**: RSA-2048 OAEP encrypted AES key.
  - **Part 2 (12 bytes)**: AES-GCM Initialization Vector (IV).
  - **Part 3 (variable + 16 bytes)**: Authenticated AES-256-GCM ciphertext + auth tag.
- **SHA-256 Idempotency Hash**: Live fingerprint calculation.
- **Interactive Tamper Test**: Deliberately flips a single character/bit in the ciphertext to show the server catching tampering instantly via GCM auth tag mismatch (`INVALID: decryption_failed`).

### 6. 🏦 Real-Time Bank Accounts & Ledger Matrix
- **Bank Accounts Table**: Shows Alice, Bob, Carol, Dave with animated balance flash transitions and `@Version` optimistic lock counters.
- **Transaction Ledger**: Real-time record of settled transactions with status chips (`SETTLED`, `DUPLICATE_DROPPED`, `INVALID`), hop counts, bridge IDs, and SHA-256 hashes.
- **Live Activity Terminal**: Streaming cyberpunk-style log with color-coded tags (`[INJECT]`, `[GOSSIP]`, `[SETTLED]`, `[DUPLICATE]`, `[TAMPER]`, `[CRYPTO]`).

### 7. ⚡ Dual Operation: Live Server Mode & In-Browser Simulation Engine
- **Live Spring Boot Connected Mode**: When the Java Spring Boot backend is running on `http://localhost:8080/`, all actions hit the live REST API.
- **In-Browser Simulation Engine**: If the backend is not yet started or `index.html` is opened directly in a browser (`file:///...`), the frontend automatically falls back to an in-browser simulation engine that mimics the exact same hybrid encryption, gossip hops, idempotency dedup, and ledger updates!

---

## 🚀 How to Launch

### Option A: Open Directly in Your Web Browser (Instant Preview)
Double-click either:
- `E:\SANJEEV_PROJECT2\UPI_USING NO INTERNET\index.html` or
- `E:\SANJEEV_PROJECT2\UPI_USING NO INTERNET\UPI_Without_Internet\src\main\resources\static\index.html`

The application runs immediately using the built-in simulation engine.

### Option B: Run with the Spring Boot Java Backend
1. Open PowerShell in `E:\SANJEEV_PROJECT2\UPI_USING NO INTERNET\UPI_Without_Internet`.
2. Start the Spring Boot server:
   ```powershell
   .\mvnw.cmd spring-boot:run
   ```
3. Open your browser and go to:
   **http://localhost:8080**

The frontend will automatically connect to the live backend, switch the status badge to `🟢 Live Backend (8080)`, and drive the actual Java services!
