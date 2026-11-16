/**
 * UPI Offline Mesh — Cryptographic Inspector & Security Playground
 * Explains Hybrid Encryption (RSA-OAEP + AES-GCM), ciphertext wire layout,
 * SHA-256 idempotency hashing, and interactive bit-flip tampering tests.
 */

class CryptoInspector {
    constructor() {
        this.currentPacket = null;
        this.serverKey = null;
        this.initElements();
        this.bindEvents();
    }
    
    initElements() {
        this.rsaKeyEl = document.getElementById('cryptoRsaKey');
        this.rsaSchemeEl = document.getElementById('cryptoScheme');
        this.packetIdEl = document.getElementById('cryptoPacketId');
        this.nonceEl = document.getElementById('cryptoNonce');
        this.signedAtEl = document.getElementById('cryptoSignedAt');
        this.rawCiphertextEl = document.getElementById('cryptoCiphertext');
        this.ciphertextHashEl = document.getElementById('cryptoHash');
        this.btnTamper = document.getElementById('btnTestTamper');
    }
    
    bindEvents() {
        if (this.btnTamper) {
            this.btnTamper.addEventListener('click', () => {
                this.testTamper();
            });
        }
    }
    
    setServerKey(keyData) {
        this.serverKey = keyData;
        if (this.rsaKeyEl && keyData.publicKey) {
            this.rsaKeyEl.textContent = keyData.publicKey.substring(0, 48) + '...';
        }
        if (this.rsaSchemeEl && keyData.algorithm) {
            this.rsaSchemeEl.textContent = `${keyData.algorithm} | ${keyData.hybridScheme}`;
        }
    }
    
    inspectPacket(packet) {
        this.currentPacket = packet;
        if (this.packetIdEl) this.packetIdEl.textContent = packet.packetId;
        if (this.rawCiphertextEl) this.rawCiphertextEl.textContent = packet.ciphertext || 'N/A';
        
        // Compute SHA-256 hash in JS if needed
        if (packet.ciphertext) {
            this.computeSha256(packet.ciphertext).then(hash => {
                if (this.ciphertextHashEl) this.ciphertextHashEl.textContent = hash;
            });
        }
        
        if (this.nonceEl) this.nonceEl.textContent = packet.nonce || 'e.g. 550e8400-e29b-41d4-a716-446655440000 (unique per payment)';
        if (this.signedAtEl) {
            const dateStr = packet.createdAt ? new Date(packet.createdAt).toLocaleString() : new Date().toLocaleString();
            this.signedAtEl.textContent = `${dateStr} (Valid for 24 hours)`;
        }
    }
    
    async computeSha256(message) {
        try {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return 'a3f8c9e120... (SHA-256 digest)';
        }
    }
    
    async testTamper() {
        if (window.app) {
            await window.app.testTamperAttack();
        }
    }
}

window.CryptoInspector = CryptoInspector;
