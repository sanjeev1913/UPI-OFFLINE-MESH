# 📡 UPI Offline Mesh — Zero-Internet Peer-to-Peer Payment Protocol

[![Java](https://img.shields.io/badge/Java-17%20LTS-orange.svg?style=flat&logo=openjdk)](https://adoptium.net)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3.5-brightgreen.svg?style=flat&logo=springboot)](https://spring.io/projects/spring-boot)
[![Security](https://img.shields.io/badge/Cryptography-RSA--2048%20%2B%20AES--256--GCM-blue.svg?style=flat&logo=letsencrypt)](https://en.wikipedia.org/wiki/Authenticated_encryption)
[![Architecture](https://img.shields.io/badge/Architecture-Mesh--Routed%20Deferred%20Settlement-purple.svg?style=flat)](#architecture)
[![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-yellow.svg?style=flat&logo=javascript)](#interactive-frontend-dashboard)

A production-concept **decentralized, offline UPI payment routing system** that enables peer-to-peer digital transactions in **zero-connectivity environments** (underground subways, basements, tunnels, remote areas, flights, or disaster zones).

Transactions are encrypted offline with **Hybrid Cryptography (RSA-OAEP + AES-256-GCM)**, hop peer-to-peer across stranger devices via a simulated **Bluetooth Low Energy (BLE) gossip mesh**, and settle atomically on the banking ledger the moment *any* phone walks outside and hits cellular 4G/5G coverage.

---

## 📑 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [The Core Concept: Mesh-Routed Deferred Settlement](#-the-core-concept-mesh-routed-deferred-settlement)
3. [The Three Hard Problems Solved](#-the-three-hard-problems-solved)
4. [System Architecture & Wire Protocol](#-system-architecture--wire-protocol)
5. [Interactive Frontend Dashboard](#-interactive-frontend-dashboard)
6. [Tech Stack](#-tech-stack)
7. [API Specification](#-api-specification)
8. [Quick Start Guide](#-quick-start-guide)
9. [Resume / Portfolio Highlights](#-resume--portfolio-highlights-ready-to-use)

---

## 💡 Executive Summary

Traditional digital payment rails (UPI, Visa, Mastercard) require an active, uninterrupted internet connection between the sender's phone, the acquiring switch, and the issuing bank. When a user is in a dead zone, payments fail completely.

**UPI Offline Mesh** solves this without requiring custom satellite hardware or pre-funded hardware cards:
* **Offline Signing**: The sender creates and encrypts a digital payment instruction on their phone with zero internet access.
* **Gossip Propagation**: Encrypted envelopes hop device-to-device through bystander phones in Bluetooth proximity (TTL-bounded). Intermediaries cannot read or alter amounts.
* **Opportunistic Uplink**: As soon as *any* phone carrying the packet enters network range (the "Bridge Node"), it silently flushes held packets to the banking backend.
* **Atomic Idempotent Settlement**: The backend validates freshness, verifies the AES-GCM authentication tag, deduplicates against concurrent multi-bridge uploads, and updates the double-entry ledger.

---

## 🔒 The Three Hard Problems Solved

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OFFLINE SENDER PHONE                            │
│  PaymentInstruction { sender, receiver, amount, nonce, signedAt }      │
│            │                                                           │
│            ▼  Hybrid Encrypt (Server RSA-2048 + Ephemeral AES-256-GCM) │
│  MeshPacket { packetId, ttl: 5, ciphertext: [Key | IV | Payload+Tag] } │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ BLE Mesh Gossip (Hops 1..N)
                                    ▼
       ┌──────────┐    Hop    ┌──────────┐    Hop    ┌──────────────┐
       │Stranger 1│ ────────▶ │Stranger 2│ ────────▶ │4G Bridge Node│
       │(Offline) │           │(Offline) │           │(Walks outside)
       └──────────┘           └──────────┘           └──────┬───────┘
                                                            │ HTTPS POST /api/bridge/ingest
                                                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BANKING BACKEND PIPELINE                        │
│                                                                        │
│  [1] SHA-256 Hash of Ciphertext (Opaque Idempotency Key)               │
│  [2] Idempotency Gate: Atomic putIfAbsent(hash) (Redis SETNX pattern)  │
│      ├── First Claimer  ──▶ Proceeds to Step 3                         │
│      └── Later Claimers ──▶ Short-circuit: DUPLICATE_DROPPED           │
│  [3] Decrypt: RSA unwraps AES key; AES-GCM validates auth tag (Tamper) │
│  [4] Freshness Check: signedAt within 24h sliding window (Replay)      │
│  [5] Atomic Settlement: Debit sender, credit receiver (@Version lock)  │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Untrusted Intermediaries & Confidentiality
* **The Problem**: A stranger's phone carries your financial transaction. What prevents them from reading the amount, changing the beneficiary, or tampering with the balance?
* **The Solution**: **Hybrid Encryption (RSA-2048 OAEP + AES-256-GCM)**.
  1. The sender phone generates a one-time ephemeral AES-256 key for each payment.
  2. The JSON payment payload is encrypted using **AES-256-GCM** (providing both confidentiality and ciphertext integrity).
  3. The ephemeral AES key is encrypted with the bank server's RSA-2048 public key.
  4. The wire envelope packs: `[256-byte RSA-encrypted key] [12-byte GCM IV] [Ciphertext + 16-byte Tag]`.
  * **Integrity Guarantee**: AES-GCM is an authenticated encryption cipher. If any intermediate flips even a single bit in the payload, decryption fails immediately with an authentication tag mismatch, rejecting the packet before touching the ledger.

### 2. The Duplicate-Storm (Concurrent Deliveries)
* **The Problem**: Because gossip flood-routes packets, multiple bridge devices might hold the same packet. If 3 phones walk outside simultaneously and POST to the backend within milliseconds, the sender could be debited 3x.
* **The Solution**: **Atomic Compare-and-Set on `SHA-256(ciphertext)`**.
  * The backend hashes the raw ciphertext *before* spending CPU on decryption.
  * It attempts an atomic claim in the idempotency cache (`ConcurrentHashMap.putIfAbsent`, representing Redis `SETNX key EX 86400`).
  * Exactly **one** thread wins the claim; concurrent duplicates are short-circuited and recorded as `DUPLICATE_DROPPED`.
  * **Database Defense-in-Depth**: The `transactions.packet_hash` database column has a unique constraint index.

### 3. Replay Attacks
* **The Problem**: An adversary eavesdropping on BLE broadcasts captures valid ciphertexts and replays them weeks later to repeatedly drain the sender's account.
* **The Solution**: **24-Hour Freshness Window + Cryptographic Nonces**.
  * Inside the tamper-proof encrypted payload, the sender embeds a unique UUID `nonce` and a `signedAt` epoch millisecond timestamp.
  * The backend rejects any packet older than 24 hours (`ageSeconds > 86400`) or with future-dated clock skew.
  * Two legitimate payments of ₹100 from Alice to Bob have distinct nonces &rarr; distinct ciphertexts &rarr; distinct hashes &rarr; both settle safely. Replaying an identical packet hits the idempotency shield.

---

## 🎨 Interactive Frontend Dashboard

The frontend is an **interactive fintech command center** built with modern HTML5, CSS3 Glassmorphism, and Vanilla JavaScript. It operates in **dual mode**:
* **Live Server Mode**: Connects directly to the Spring Boot REST API on port `8080`.
* **In-Browser Simulation Engine**: If running standalone without the Java backend, an embedded client-side simulation engine mimics encryption, gossip hops, idempotency dedup, and ledger updates.

### Key Visual Components:
1. **📱 Simulated Mobile Smartphone UPI App**:
   * Authentic mobile device frame with camera notch, speaker, and live status bar (`📴 NO 4G • NO WI-FI`, `📡 BLE Mesh Ready`).
   * Switch between accounts (Alice, Bob, Carol, Dave) with real-time balance displays.
   * Preset amount chips (`+₹100`, `+₹250`, `+₹500`, `+₹1000`) and custom amount entry.
   * **Interactive 4-Digit PIN Modal**: Full numeric keypad with masked PIN dots and realistic haptic/audio tone synthesis via the **Web Audio API** (zero audio file dependencies).
2. **🌐 Interactive 2D Mesh Network Visualizer (HTML5 Canvas)**:
   * Real-time physics engine where nodes gravitate and repel with draggable positions.
   * Dynamic node roles: 🟣 Sender (`phone-alice`), 🔵 Offline Relays (`strangers`), 🟢 4G Bridge (`phone-bridge`).
   * Animated BLE broadcast radio wave ripples during gossip rounds.
   * Glowing packet particle animations hopping between devices with TTL badges.
   * Vertical 4G cloud particle beam shooting upward from bridge nodes during settlement.
   * **Click-to-Toggle 4G**: Click any node to turn its 4G connection on/off and test custom network topologies.
3. **🎬 1-Click Automated Demo Tour**:
   * One-click guided walkthrough showing the entire 3-step offline flow: Compose &rarr; Gossip &rarr; 4G Uplink Settlement.
4. **🧪 1-Click Duplicate Storm Test**:
   * Seeds 3 bridges, floods them with the same packet, and uploads simultaneously to visually prove idempotency in real time.
5. **🔐 Cryptography Inspector & Tamper Playground**:
   * Inspects the 3-part byte structure of the hybrid ciphertext.
   * Real-time SHA-256 hash calculation.
   * **"Flip 1 Bit" Tamper Test**: Modifies a byte in the ciphertext to demonstrate real-time server rejection via GCM tag failure.
6. **🏦 Bank Accounts & Settled Transaction Ledgers**:
   * Live balances with flash animations and `@Version` optimistic locking counters.
   * Searchable transaction ledger with status tags (`SETTLED`, `DUPLICATE_DROPPED`, `INVALID`).
7. **🪵 Live Activity Terminal**:
   * High-tech streaming log with color-coded tags (`[INJECT]`, `[GOSSIP]`, `[SETTLED]`, `[DUPLICATE]`, `[TAMPER]`, `[CRYPTO]`).

---

## 🛠️ Tech Stack

### Backend
* **Language**: Java 17 LTS
* **Framework**: Spring Boot 3.3.5
* **Data Access**: Spring Data JPA / Hibernate
* **Database**: H2 In-Memory Database (zero-config, web console at `/h2-console`)
* **Cryptography**: Java Cryptography Architecture (JCA/JCE)
  * `RSA/ECB/OAEPWithSHA-256AndMGF1Padding` (Key wrapping)
  * `AES/GCM/NoPadding` (256-bit Authenticated Encryption with 128-bit Tag)
  * `SHA-256` (Message Digest for Idempotency Hash)
* **Concurrency**: `ConcurrentHashMap` (atomic `putIfAbsent`), Parallel Streams, Optimistic Locking (`@Version`)
* **Testing**: JUnit 5, Spring Boot Test, Multi-threaded Concurrency Test Suite

### Frontend
* **Core**: Modern HTML5, Responsive CSS3 (Glassmorphism, Cyberpunk Dark Theme, Custom Properties)
* **Graphics**: HTML5 Canvas API (Physics-based node-link graph, particle systems, radio waves)
* **Audio**: Web Audio API (Synthesized keypad tones & settlement chimes)
* **Architecture**: Vanilla JavaScript (ES6+ Modules, Async/Await, Dual-Mode Simulation Engine)

---

## 📡 API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves the interactive full-stack dashboard |
| `GET` | `/api/server-key` | Returns the server's RSA-2048 public key (Base64) |
| `GET` | `/api/accounts` | Lists all demo bank accounts, VPAs, and balances |
| `GET` | `/api/transactions` | Retrieves the last 20 settled transactions from the ledger |
| `GET` | `/api/mesh/state` | Returns the real-time state of all virtual phones and held packets |
| `POST` | `/api/demo/send` | Simulates the sender phone: encrypts payload & injects packet |
| `POST` | `/api/mesh/gossip` | Executes one round of BLE gossip across nearby devices |
| `POST` | `/api/mesh/flush` | Simulates bridge phones getting 4G and uploading in parallel |
| `POST` | `/api/mesh/device/toggle` | Toggles 4G internet on/off for any simulated phone |
| `POST` | `/api/demo/seed-bridges` | Configures 3 simultaneous bridge nodes for duplicate testing |
| `POST` | `/api/demo/tamper-test` | Flips a bit in ciphertext to verify AES-GCM rejection |
| `POST` | `/api/mesh/reset` | Resets the mesh topology and idempotency cache |
| `POST` | `/api/bridge/ingest` | **The Production Endpoint**: Real bridge devices POST packets here |

---

## 🚀 Quick Start Guide

### Prerequisites
* **JDK 17 or newer** (`java -version`)
* Windows, macOS, or Linux

### 1. Launch with One Click (Windows)
* Double-click **`START_SERVER.bat`** to start the Spring Boot backend on port `8080`.
* Double-click **`OPEN_DASHBOARD.bat`** or open **[http://localhost:8080](http://localhost:8080)**.

### 2. Launch via Terminal
```bash
# Navigate to the backend folder
cd UPI_Without_Internet

# Start the Spring Boot application (using the included Maven wrapper)
# On Windows:
.\mvnw.cmd spring-boot:run

# On Linux/macOS:
./mvnw spring-boot:run
```
Once you see `Started UpiMeshApplication in X.XXX seconds`, open **http://localhost:8080** in your browser.

### 3. Run the Automated Concurrency & Cryptography Tests
```bash
# Runs the 3-bridges-at-once concurrent delivery test and tamper tests
.\mvnw.cmd test
```

---

## 💼 Resume / Portfolio Highlights (Ready to Use)

You can copy and adapt these bullet points for your resume or LinkedIn profile:

### Option 1: Full-Stack / Distributed Systems Focus
> **Distributed Systems Engineer | UPI Offline Mesh Protocol**
> * Architected and built an offline peer-to-peer payment routing protocol enabling zero-connectivity UPI transactions through opportunistic Bluetooth Low Energy (BLE) gossip mesh routing and deferred settlement.
> * Implemented military-grade hybrid cryptography (**RSA-2048 OAEP + AES-256-GCM**) ensuring untrusted intermediary relay phones cannot read, tamper with, or forge financial payloads.
> * Engineered an atomic idempotency gate using `ConcurrentHashMap.putIfAbsent` (Redis `SETNX` pattern) on `SHA-256` ciphertext digests, guaranteeing exact-once ledger settlement during concurrent multi-bridge uploads.
> * Developed an interactive cyber-fintech dashboard featuring an HTML5 Canvas physics-based mesh visualizer, simulated smartphone with Web Audio API sound synthesis, and real-time transaction ledgers.

### Option 2: Backend / FinTech Engineering Focus
> **Backend & Security Engineer | UPI Offline Mesh Protocol**
> * Designed a Spring Boot 3.3 backend resolving the three core challenges of offline payments: untrusted relay confidentiality, multi-bridge duplicate storms, and replay attacks.
> * Built double-entry ledger settlement with Hibernate optimistic locking (`@Version`) and database-level unique hash constraints to prevent double-spending.
> * Authored comprehensive multi-threaded concurrency test suites using JUnit 5 proving atomic deduplication under simulated simultaneous bridge flushes.
> * Created RESTful APIs and WebSocket-ready state endpoints with full CORS integration and zero-configuration in-memory H2 database persistence.

---

## 📄 License
Open-source demo and portfolio project for educational and architectural reference.
