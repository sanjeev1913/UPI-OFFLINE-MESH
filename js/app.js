/**
 * UPI Offline Mesh — Core Application Controller & State Engine
 * Orchestrates live REST API calls, client-side simulation fallback,
 * mesh visualizer, simulated phone app, ledgers, and interactive tours.
 */

class AppController {
    constructor() {
        this.apiBase = (window.location.protocol === 'file:' || window.location.port !== '8080')
            ? 'http://localhost:8080'
            : '';
        this.isBackendOnline = false;
        this.pollInterval = null;
        this.stats = {
            totalSettledAmount: 0,
            duplicatesPrevented: 0,
            activePackets: 0
        };
        
        // Client-side fallback simulation state (used when backend is offline)
        this.mockState = {
            accounts: [
                { vpa: 'alice@demo', holderName: 'Alice', balance: 5000.00, version: 0 },
                { vpa: 'bob@demo', holderName: 'Bob', balance: 1000.00, version: 0 },
                { vpa: 'carol@demo', holderName: 'Carol', balance: 2500.00, version: 0 },
                { vpa: 'dave@demo', holderName: 'Dave', balance: 500.00, version: 0 }
            ],
            devices: [
                { deviceId: 'phone-alice', hasInternet: false, packetCount: 0, packetIds: [], packets: [] },
                { deviceId: 'phone-stranger1', hasInternet: false, packetCount: 0, packetIds: [], packets: [] },
                { deviceId: 'phone-stranger2', hasInternet: false, packetCount: 0, packetIds: [], packets: [] },
                { deviceId: 'phone-stranger3', hasInternet: false, packetCount: 0, packetIds: [], packets: [] },
                { deviceId: 'phone-bridge', hasInternet: true, packetCount: 0, packetIds: [], packets: [] }
            ],
            transactions: [],
            idempotencyMap: new Map(),
            serverKey: {
                publicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3fK1...",
                algorithm: "RSA-2048 / OAEP-SHA256",
                hybridScheme: "RSA-OAEP encrypts an AES-256-GCM session key"
            }
        };
        
        this.init();
    }
    
    async init() {
        this.initDOM();
        this.visualizer = new MeshVisualizer('meshCanvas');
        this.phoneApp = new UpiPhoneApp();
        this.cryptoInspector = new CryptoInspector();
        
        // Global hook for canvas node click
        window.onNodeClicked = (node) => this.toggleNodeInternet(node.id);
        
        this.bindEvents();
        await this.checkBackendStatus();
        this.startPolling();
    }
    
    initDOM() {
        this.serverBadge = document.getElementById('serverStatusBadge');
        this.metricNodes = document.getElementById('metricActiveNodes');
        this.metricPackets = document.getElementById('metricActivePackets');
        this.metricSettled = document.getElementById('metricTotalSettled');
        this.metricDuplicates = document.getElementById('metricDuplicates');
        this.deviceStrip = document.getElementById('deviceMiniCards');
        this.accountsTableBody = document.querySelector('#accountsTable tbody');
        this.txTableBody = document.querySelector('#txTable tbody');
        this.terminalBody = document.getElementById('terminalLogs');
    }
    
    bindEvents() {
        // Tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const targetContent = document.getElementById(`tab-${targetTab}`);
                if (targetContent) targetContent.classList.add('active');
            });
        });
        
        // Hub action buttons
        const btnGossip = document.getElementById('btnRunGossip');
        if (btnGossip) btnGossip.addEventListener('click', () => this.runGossip());
        
        const btnFlush = document.getElementById('btnFlushBridges');
        if (btnFlush) btnFlush.addEventListener('click', () => this.flushBridges());
        
        const btnReset = document.getElementById('btnResetMesh');
        if (btnReset) btnReset.addEventListener('click', () => this.resetMesh());
        
        const btnStorm = document.getElementById('btnDuplicateStorm');
        if (btnStorm) btnStorm.addEventListener('click', () => this.runDuplicateStorm());
        
        const btnTour = document.getElementById('btnInteractiveTour');
        if (btnTour) btnTour.addEventListener('click', () => this.runInteractiveTour());
        
        const btnArch = document.getElementById('btnOpenArchModal');
        if (btnArch) btnArch.addEventListener('click', () => this.openArchModal());
        
        const closeArch = document.getElementById('closeArchModal');
        if (closeArch) closeArch.addEventListener('click', () => this.closeArchModal());
        
        const btnClearLogs = document.getElementById('btnClearTerminal');
        if (btnClearLogs) btnClearLogs.addEventListener('click', () => this.clearLogs());
        
        const btnCheckConn = document.getElementById('btnCheckConnection');
        if (btnCheckConn) btnCheckConn.addEventListener('click', () => this.checkBackendStatus(true));
    }
    
    // ------------------------------------------------------------------ Logging
    log(tag, msg) {
        if (!this.terminalBody) return;
        const now = new Date().toLocaleTimeString();
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `
            <span class="log-time">[${now}]</span>
            <span class="log-tag ${tag}">${tag}</span>
            <span class="log-msg">${msg}</span>
        `;
        this.terminalBody.prepend(div);
        
        // Cap logs at 100 entries
        if (this.terminalBody.children.length > 100) {
            this.terminalBody.removeChild(this.terminalBody.lastChild);
        }
    }
    
    clearLogs() {
        if (this.terminalBody) {
            this.terminalBody.innerHTML = '';
            this.log('INFO', 'Activity logs cleared');
        }
    }
    
    // ------------------------------------------------------------- Backend Sync
    async checkBackendStatus(showToastMsg = false) {
        try {
            const res = await fetch(`${this.apiBase}/api/server-key`, { cache: 'no-cache' });
            if (res.ok) {
                const key = await res.json();
                this.isBackendOnline = true;
                this.updateServerBadge(true);
                this.cryptoInspector.setServerKey(key);
                this.log('CRYPTO', `Backend connected: RSA-2048 Public Key Loaded`);
                if (showToastMsg) window.showToast('Connected to Spring Boot Backend (Port 8080)', 'success');
            } else {
                throw new Error('Non-200');
            }
        } catch (e) {
            this.isBackendOnline = false;
            this.updateServerBadge(false);
            this.cryptoInspector.setServerKey(this.mockState.serverKey);
            this.log('INFO', 'Running in In-Browser Mesh Simulation Engine (Backend not running or offline)');
            if (showToastMsg) window.showToast('Using In-Browser Simulation Engine (Full features available)', 'info');
        }
        await this.refreshState();
    }
    
    updateServerBadge(isOnline) {
        if (!this.serverBadge) return;
        if (isOnline) {
            this.serverBadge.className = 'server-badge online';
            this.serverBadge.innerHTML = `<span class="status-light"></span> Live Backend (8080)`;
        } else {
            this.serverBadge.className = 'server-badge simulated';
            this.serverBadge.innerHTML = `<span class="status-light"></span> Simulation Engine`;
        }
    }
    
    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => {
            if (this.isBackendOnline) {
                this.refreshState();
            }
        }, 3000);
    }
    
    async refreshState() {
        if (this.isBackendOnline) {
            try {
                // Fetch mesh state
                const mesh = await fetch(`${this.apiBase}/api/mesh/state`).then(r => r.json());
                this.handleMeshState(mesh);
                
                // Fetch accounts
                const accounts = await fetch(`${this.apiBase}/api/accounts`).then(r => r.json());
                this.handleAccounts(accounts);
                
                // Fetch transactions
                const txs = await fetch(`${this.apiBase}/api/transactions`).then(r => r.json());
                this.handleTransactions(txs);
            } catch (e) {
                console.warn('Backend sync failed, falling back to mock:', e);
                this.isBackendOnline = false;
                this.updateServerBadge(false);
                this.refreshState();
            }
        } else {
            // Use mock state
            this.handleMeshState({
                devices: this.mockState.devices,
                idempotencyCacheSize: this.mockState.idempotencyMap.size
            });
            this.handleAccounts(this.mockState.accounts);
            this.handleTransactions(this.mockState.transactions);
        }
    }
    
    // ------------------------------------------------------------- State Updates
    handleMeshState(data) {
        const devices = data.devices || [];
        this.visualizer.setDevices(devices);
        this.renderDeviceMiniCards(devices);
        
        let totalPackets = 0;
        devices.forEach(d => totalPackets += d.packetCount);
        this.stats.activePackets = totalPackets;
        
        if (this.metricNodes) this.metricNodes.textContent = devices.length;
        if (this.metricPackets) this.metricPackets.textContent = totalPackets;
        if (this.metricDuplicates) this.metricDuplicates.textContent = this.stats.duplicatesPrevented;
    }
    
    handleAccounts(accounts) {
        this.phoneApp.setAccounts(accounts);
        if (!this.accountsTableBody) return;
        
        this.accountsTableBody.innerHTML = accounts.map(a => `
            <tr>
                <td><span class="vpa-chip">${a.vpa}</span></td>
                <td><strong>${a.holderName}</strong></td>
                <td><span class="balance-amount">₹${parseFloat(a.balance).toFixed(2)}</span></td>
                <td style="font-family: var(--font-mono); color: var(--text-dim); font-size: 11px;">v${a.version || 0}</td>
            </tr>
        `).join('');
    }
    
    handleTransactions(txs) {
        if (!this.txTableBody) return;
        
        let settledVolume = 0;
        let settledCount = 0;
        
        txs.forEach(t => {
            if (t.status === 'SETTLED') {
                settledVolume += parseFloat(t.amount);
                settledCount++;
            }
        });
        
        if (this.metricSettled) {
            this.metricSettled.textContent = `₹${settledVolume.toFixed(2)}`;
        }
        
        this.txTableBody.innerHTML = txs.map(t => {
            const shortHash = t.packetHash ? (t.packetHash.substring(0, 10) + '...') : 'N/A';
            const timeStr = t.settledAt ? new Date(t.settledAt).toLocaleTimeString() : 'Just now';
            return `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight: 700;">#${t.id}</td>
                    <td><span class="hash-pill" title="${t.packetHash}">${shortHash}</span></td>
                    <td><span class="vpa-chip">${t.senderVpa}</span></td>
                    <td><span class="vpa-chip">${t.receiverVpa}</span></td>
                    <td class="balance-amount">₹${parseFloat(t.amount).toFixed(2)}</td>
                    <td><span class="badge-status ${t.status}">${t.status}</span></td>
                    <td style="font-family: var(--font-mono); font-size: 11px;">${t.bridgeNodeId || 'N/A'}</td>
                    <td style="font-family: var(--font-mono);">${t.hopCount || 0}</td>
                    <td style="color: var(--text-dim); font-size: 11px;">${timeStr}</td>
                </tr>
            `;
        }).join('');
    }
    
    renderDeviceMiniCards(devices) {
        if (!this.deviceStrip) return;
        this.deviceStrip.innerHTML = devices.map(d => {
            const isBridge = d.hasInternet;
            return `
                <div class="device-mini-card ${isBridge ? 'is-bridge' : ''}" onclick="window.app.toggleNodeInternet('${d.deviceId}')">
                    <div class="device-mini-card-header">
                        <span class="device-mini-name">${d.deviceId}</span>
                        <span class="device-status-badge ${isBridge ? 'badge-4g' : 'badge-off'}">
                            ${isBridge ? '🌐 4G ON' : '🚫 OFFLINE'}
                        </span>
                    </div>
                    <div class="device-packet-bar">
                        <span>Packets held</span>
                        <strong style="color: ${d.packetCount > 0 ? '#38bdf8' : 'var(--text-dim)'};">${d.packetCount}</strong>
                    </div>
                    <div class="held-packet-pills">
                        ${(d.packetIds || []).map(id => `<span class="pkt-pill">${id}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // ------------------------------------------------------------- Core Actions
    async sendPayment(paymentData) {
        this.log('INJECT', `Creating encrypted payment: ${paymentData.senderVpa} → ${paymentData.receiverVpa} (₹${paymentData.amount})`);
        
        if (this.isBackendOnline) {
            try {
                const res = await fetch(`${this.apiBase}/api/demo/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(paymentData)
                }).then(r => r.json());
                
                this.log('INJECT', `Packet ${res.packetId.substring(0, 8)} injected at ${res.injectedAt} (TTL ${res.ttl})`);
                this.log('CRYPTO', `Hybrid Ciphertext: ${res.ciphertextPreview}`);
                
                this.cryptoInspector.inspectPacket({
                    packetId: res.packetId,
                    ciphertext: res.ciphertextPreview,
                    createdAt: Date.now()
                });
                
                window.showToast(`Packet injected into ${res.injectedAt} (TTL ${res.ttl})`, 'success');
                await this.refreshState();
            } catch (e) {
                this.log('ERROR', `Injection failed: ${e.message}`);
                window.showToast('Payment injection failed on server', 'error');
            }
        } else {
            // Simulated local injection
            const packetId = 'pkt-' + Math.random().toString(36).substring(2, 10);
            const fakeCiphertext = 'RSA-OAEP-KEY-[' + btoa(Math.random().toString()) + ']-AES-GCM-[' + btoa(JSON.stringify(paymentData)) + ']';
            const dev = this.mockState.devices.find(d => d.deviceId === paymentData.startDevice) || this.mockState.devices[0];
            
            const newPacket = {
                packetId: packetId,
                shortId: packetId.substring(0, 8),
                ttl: paymentData.ttl,
                createdAt: Date.now(),
                ciphertext: fakeCiphertext,
                senderVpa: paymentData.senderVpa,
                receiverVpa: paymentData.receiverVpa,
                amount: paymentData.amount
            };
            
            dev.packets.push(newPacket);
            dev.packetIds.push(packetId.substring(0, 8));
            dev.packetCount = dev.packets.length;
            
            this.log('INJECT', `[Sim] Packet ${packetId.substring(0, 8)} injected into ${dev.deviceId} (TTL ${paymentData.ttl})`);
            this.log('CRYPTO', `[Sim] Generated RSA-OAEP + AES-GCM hybrid ciphertext`);
            
            this.cryptoInspector.inspectPacket(newPacket);
            window.showToast(`Simulated: Packet broadcast to ${dev.deviceId} via BLE`, 'success');
            await this.refreshState();
        }
    }
    
    async runGossip() {
        this.log('GOSSIP', 'Initiating peer-to-peer BLE gossip round across all devices...');
        
        if (this.isBackendOnline) {
            try {
                const res = await fetch(`${this.apiBase}/api/mesh/gossip`, { method: 'POST' }).then(r => r.json());
                this.log('GOSSIP', `Round completed: ${res.transfers} packet transfer(s) occurred between devices.`);
                this.visualizer.triggerGossipAnimation(res.transfers);
                window.showToast(`Gossip Round: ${res.transfers} hops completed`, 'info');
                await this.refreshState();
            } catch (e) {
                this.log('ERROR', `Gossip failed: ${e.message}`);
            }
        } else {
            // Simulated local gossip
            let transfers = 0;
            const snapshot = this.mockState.devices.map(d => ({
                id: d.deviceId,
                packets: [...d.packets]
            }));
            
            for (const src of snapshot) {
                for (const pkt of src.packets) {
                    if (pkt.ttl <= 0) continue;
                    for (const dst of this.mockState.devices) {
                        if (dst.deviceId === src.id) continue;
                        if (dst.packets.some(p => p.packetId === pkt.packetId)) continue;
                        
                        dst.packets.push({ ...pkt, ttl: pkt.ttl - 1 });
                        dst.packetIds.push(pkt.packetId.substring(0, 8));
                        dst.packetCount = dst.packets.length;
                        transfers++;
                    }
                }
            }
            
            this.log('GOSSIP', `[Sim] Gossip round finished: ${transfers} packet copies transferred via BLE.`);
            this.visualizer.triggerGossipAnimation(transfers);
            window.showToast(`Simulated Gossip: ${transfers} hops`, 'info');
            await this.refreshState();
        }
    }
    
    async flushBridges() {
        this.log('SETTLED', 'Bridge node(s) detecting 4G uplink — uploading held packets to backend...');
        
        if (this.isBackendOnline) {
            try {
                const res = await fetch(`${this.apiBase}/api/mesh/flush`, { method: 'POST' }).then(r => r.json());
                this.log('SETTLED', `${res.uploadsAttempted} bridge upload(s) executed concurrently.`);
                
                res.results.forEach(r => {
                    if (r.outcome === 'SETTLED') {
                        this.log('SETTLED', `✅ ${r.bridgeNode} delivered packet ${r.packetId} → SETTLED (Tx #${r.transactionId})`);
                        this.visualizer.triggerFlushAnimation(r.bridgeNode);
                        window.showToast(`Payment Settled: Tx #${r.transactionId}`, 'success');
                    } else if (r.outcome === 'DUPLICATE_DROPPED') {
                        this.log('DUPLICATE', `🛡️ ${r.bridgeNode} delivered packet ${r.packetId} → DUPLICATE_DROPPED (Idempotency Shield)`);
                        this.stats.duplicatesPrevented++;
                        window.showToast('Duplicate delivery dropped atomically', 'warning');
                    } else {
                        this.log('TAMPER', `❌ Ingestion rejected: ${r.reason}`);
                    }
                });
                
                await this.refreshState();
            } catch (e) {
                this.log('ERROR', `Bridge flush error: ${e.message}`);
            }
        } else {
            // Simulated local bridge flush
            const bridges = this.mockState.devices.filter(d => d.hasInternet && d.packets.length > 0);
            if (bridges.length === 0) {
                this.log('INFO', 'No bridge device with 4G internet currently holds packets. Gossip first or enable 4G on a device holding packets.');
                window.showToast('No bridge nodes hold packets. Run Gossip first!', 'warning');
                return;
            }
            
            bridges.forEach(b => {
                b.packets.forEach(pkt => {
                    const hash = 'hash-' + pkt.packetId;
                    this.visualizer.triggerFlushAnimation(b.deviceId);
                    
                    if (this.mockState.idempotencyMap.has(hash)) {
                        this.log('DUPLICATE', `🛡️ [Sim] ${b.deviceId} upload for ${pkt.packetId.substring(0, 8)}: DUPLICATE_DROPPED`);
                        this.stats.duplicatesPrevented++;
                    } else {
                        this.mockState.idempotencyMap.set(hash, Date.now());
                        
                        // Settle balance
                        const sender = this.mockState.accounts.find(a => a.vpa === pkt.senderVpa);
                        const receiver = this.mockState.accounts.find(a => a.vpa === pkt.receiverVpa);
                        if (sender && receiver) {
                            sender.balance -= pkt.amount;
                            receiver.balance += pkt.amount;
                            sender.version = (sender.version || 0) + 1;
                            receiver.version = (receiver.version || 0) + 1;
                        }
                        
                        const newTx = {
                            id: this.mockState.transactions.length + 1,
                            packetHash: hash + '948a31...',
                            senderVpa: pkt.senderVpa,
                            receiverVpa: pkt.receiverVpa,
                            amount: pkt.amount,
                            status: 'SETTLED',
                            bridgeNodeId: b.deviceId,
                            hopCount: 5 - pkt.ttl,
                            settledAt: Date.now()
                        };
                        this.mockState.transactions.unshift(newTx);
                        this.log('SETTLED', `✅ [Sim] Payment settled! ₹${pkt.amount} debited from ${pkt.senderVpa} → ${pkt.receiverVpa}`);
                        window.showToast(`Payment Settled: Tx #${newTx.id}`, 'success');
                    }
                });
                b.packets = [];
                b.packetIds = [];
                b.packetCount = 0;
            });
            
            await this.refreshState();
        }
    }
    
    async resetMesh() {
        this.log('INFO', 'Clearing mesh packets and resetting idempotency cache...');
        
        if (this.isBackendOnline) {
            try {
                await fetch(`${this.apiBase}/api/mesh/reset`, { method: 'POST' });
                this.log('INFO', 'Server mesh state and idempotency cache reset');
                window.showToast('Mesh reset successfully', 'info');
                await this.refreshState();
            } catch (e) {
                this.log('ERROR', `Reset failed: ${e.message}`);
            }
        } else {
            this.mockState.devices.forEach(d => {
                d.packets = [];
                d.packetIds = [];
                d.packetCount = 0;
            });
            this.mockState.idempotencyMap.clear();
            this.log('INFO', '[Sim] Local mesh state and idempotency cache cleared');
            window.showToast('Simulated mesh reset', 'info');
            await this.refreshState();
        }
    }
    
    async toggleNodeInternet(deviceId) {
        this.log('INFO', `Toggling internet connectivity for ${deviceId}...`);
        
        if (this.isBackendOnline) {
            try {
                const res = await fetch(`${this.apiBase}/api/mesh/device/toggle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId: deviceId })
                }).then(r => r.json());
                
                this.log('INFO', `${deviceId} 4G connectivity is now: ${res.hasInternet ? 'ENABLED (Bridge)' : 'DISABLED (Offline Relay)'}`);
                window.showToast(`${deviceId}: 4G ${res.hasInternet ? 'Active' : 'Offline'}`, 'info');
                await this.refreshState();
            } catch (e) {
                this.log('ERROR', `Toggle device failed: ${e.message}`);
            }
        } else {
            const dev = this.mockState.devices.find(d => d.deviceId === deviceId);
            if (dev) {
                dev.hasInternet = !dev.hasInternet;
                this.log('INFO', `[Sim] ${deviceId} 4G connectivity: ${dev.hasInternet ? 'ENABLED' : 'DISABLED'}`);
                window.showToast(`${deviceId}: 4G ${dev.hasInternet ? 'Active' : 'Offline'}`, 'info');
                await this.refreshState();
            }
        }
    }
    
    // ------------------------------------------------------------- Advanced Scenarios
    async runDuplicateStorm() {
        this.log('INFO', '🧪 EXECUTING DUPLICATE STORM TEST: Multi-bridge concurrent arrival...');
        window.showToast('Duplicate Storm: Setting up 3 bridges...', 'info');
        
        // 1. Configure 3 bridges
        if (this.isBackendOnline) {
            await fetch(`${this.apiBase}/api/demo/seed-bridges`, { method: 'POST' });
        } else {
            const b1 = this.mockState.devices.find(d => d.deviceId === 'phone-stranger1');
            const b2 = this.mockState.devices.find(d => d.deviceId === 'phone-stranger2');
            const b3 = this.mockState.devices.find(d => d.deviceId === 'phone-bridge');
            if (b1) b1.hasInternet = true;
            if (b2) b2.hasInternet = true;
            if (b3) b3.hasInternet = true;
        }
        await this.refreshState();
        
        // 2. Inject single packet
        this.log('INJECT', 'Injecting test payment from Alice → Carol (₹750.00)...');
        await this.sendPayment({
            senderVpa: 'alice@demo',
            receiverVpa: 'carol@demo',
            amount: 750,
            pin: '1234',
            ttl: 5,
            startDevice: 'phone-alice'
        });
        
        // 3. Gossip twice so all 3 bridges hold it
        await new Promise(r => setTimeout(r, 600));
        await this.runGossip();
        await new Promise(r => setTimeout(r, 600));
        await this.runGossip();
        
        // 4. Flush all bridges in parallel
        await new Promise(r => setTimeout(r, 800));
        this.log('SETTLED', 'Simultaneously firing bridge uploads from all 3 bridges to test idempotency gate!');
        await this.flushBridges();
    }
    
    async testTamperAttack() {
        this.log('TAMPER', '🛡️ Initiating deliberate bit-flipping tamper attack test on packet ciphertext...');
        
        if (this.isBackendOnline) {
            try {
                const res = await fetch(`${this.apiBase}/api/demo/tamper-test`, { method: 'POST' }).then(r => r.json());
                this.log('TAMPER', `Modified ciphertext at char index ${res.tamperedAtChar}`);
                this.log('TAMPER', `Server response: Outcome = ${res.outcome}, Reason = ${res.reason}`);
                window.showToast(`Tamper Caught: Outcome is ${res.outcome} (${res.reason})`, 'error');
            } catch (e) {
                this.log('ERROR', `Tamper test error: ${e.message}`);
            }
        } else {
            this.log('TAMPER', '[Sim] Bit flipped in AES-GCM ciphertext payload');
            this.log('TAMPER', '[Sim] Decryption failed: GCM authentication tag verification mismatch!');
            this.log('TAMPER', '[Sim] Ingestion rejected as INVALID (decryption_failed). Ledger untouched.');
            window.showToast('Tamper Caught: AES-GCM tag mismatch rejected!', 'error');
        }
    }
    
    async runInteractiveTour() {
        this.log('INFO', '🎬 STARTING 1-CLICK INTERACTIVE DEMO TOUR');
        window.showToast('Step 1: Alice creates an offline payment...', 'info');
        
        // Highlight phone
        const phone = document.querySelector('.phone-frame');
        if (phone) phone.classList.add('tour-step-highlight');
        
        await new Promise(r => setTimeout(r, 1200));
        await this.sendPayment({
            senderVpa: 'alice@demo',
            receiverVpa: 'bob@demo',
            amount: 500,
            pin: '1234',
            ttl: 5,
            startDevice: 'phone-alice'
        });
        
        if (phone) phone.classList.remove('tour-step-highlight');
        
        // Step 2: Gossip
        await new Promise(r => setTimeout(r, 1500));
        window.showToast('Step 2: Packets hop node-to-node across strangers...', 'info');
        await this.runGossip();
        await new Promise(r => setTimeout(r, 1000));
        await this.runGossip();
        
        // Step 3: Uplink & Settlement
        await new Promise(r => setTimeout(r, 1500));
        window.showToast('Step 3: Bridge node walks outside into 4G range!', 'info');
        await this.flushBridges();
        
        await new Promise(r => setTimeout(r, 1000));
        window.showToast('🎉 Tour Complete: Payment settled offline without internet!', 'success');
        this.log('INFO', '🎉 Tour complete! Watch the Account Balances and Ledger.');
    }
    
    openArchModal() {
        const modal = document.getElementById('archModalOverlay');
        if (modal) modal.classList.add('open');
    }
    
    closeArchModal() {
        const modal = document.getElementById('archModalOverlay');
        if (modal) modal.classList.remove('open');
    }
}

// Global Toast System
window.showToast = function(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'error') icon = '❌';
    
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3800);
};

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppController();
});
