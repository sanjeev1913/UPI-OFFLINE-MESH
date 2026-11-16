/**
 * UPI Offline Mesh — Simulated Mobile Phone UPI App Controller
 * Manages sender/receiver selection, amount inputs, PIN keypad,
 * sound effects (Web Audio API), and mesh packet injection.
 */

class UpiPhoneApp {
    constructor() {
        this.currentSender = 'alice@demo';
        this.currentReceiver = 'bob@demo';
        this.amount = 500;
        this.enteredPin = '';
        this.ttl = 5;
        this.accounts = [];
        
        this.initElements();
        this.bindEvents();
        this.initAudio();
    }
    
    initElements() {
        this.senderSelect = document.getElementById('phoneSenderSelect');
        this.senderAvatar = document.getElementById('phoneSenderAvatar');
        this.senderBalance = document.getElementById('phoneSenderBalance');
        this.receiverSelect = document.getElementById('phoneReceiverSelect');
        this.amountInput = document.getElementById('phoneAmountInput');
        this.ttlSelect = document.getElementById('phoneTtlSelect');
        this.startDeviceSelect = document.getElementById('phoneStartDeviceSelect');
        this.btnPay = document.getElementById('btnPhonePay');
        
        // PIN Modal Elements
        this.pinModal = document.getElementById('pinModalOverlay');
        this.pinDots = document.querySelectorAll('.pin-dot');
        this.numpadButtons = document.querySelectorAll('.numpad-btn');
        this.modalPayAmount = document.getElementById('modalPayAmount');
        this.modalPayee = document.getElementById('modalPayee');
    }
    
    initAudio() {
        // Web Audio API for interactive clicks & payment sounds
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        } catch (e) {
            this.audioCtx = null;
        }
    }
    
    playTone(freq, type, duration) {
        if (!this.audioCtx) return;
        try {
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (e) {}
    }
    
    playKeyClick() {
        this.playTone(600, 'triangle', 0.04);
    }
    
    playSuccessChime() {
        if (!this.audioCtx) return;
        setTimeout(() => this.playTone(523.25, 'sine', 0.15), 0);   // C5
        setTimeout(() => this.playTone(659.25, 'sine', 0.15), 100); // E5
        setTimeout(() => this.playTone(783.99, 'sine', 0.25), 200); // G5
        setTimeout(() => this.playTone(1046.5, 'sine', 0.4), 300);  // C6
    }
    
    playErrorTone() {
        if (!this.audioCtx) return;
        this.playTone(200, 'sawtooth', 0.25);
    }
    
    bindEvents() {
        // Sender Change
        if (this.senderSelect) {
            this.senderSelect.addEventListener('change', (e) => {
                this.currentSender = e.target.value;
                this.updateSenderDisplay();
            });
        }
        
        // Receiver Change
        if (this.receiverSelect) {
            this.receiverSelect.addEventListener('change', (e) => {
                this.currentReceiver = e.target.value;
                this.highlightActivePayeeChip(e.target.value);
            });
        }
        
        // Payee Chips
        document.querySelectorAll('.payee-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const targetVpa = chip.dataset.vpa;
                if (targetVpa) {
                    this.currentReceiver = targetVpa;
                    if (this.receiverSelect) this.receiverSelect.value = targetVpa;
                    this.highlightActivePayeeChip(targetVpa);
                    this.playKeyClick();
                }
            });
        });
        
        // Quick Amount Chips
        document.querySelectorAll('.quick-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const val = chip.dataset.amount;
                if (val && this.amountInput) {
                    this.amountInput.value = val;
                    this.amount = parseFloat(val);
                    this.playKeyClick();
                }
            });
        });
        
        // Amount input change
        if (this.amountInput) {
            this.amountInput.addEventListener('input', (e) => {
                this.amount = parseFloat(e.target.value) || 0;
            });
        }
        
        // Pay Offline Trigger
        if (this.btnPay) {
            this.btnPay.addEventListener('click', () => {
                this.openPinModal();
            });
        }
        
        // Numpad button clicks
        this.numpadButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const num = btn.dataset.num;
                if (num !== undefined) {
                    this.enterDigit(num);
                } else if (action === 'backspace') {
                    this.backspace();
                } else if (action === 'submit') {
                    this.submitPin();
                }
            });
        });
        
        // Close modal on backdrop click or close button
        const closeBtn = document.getElementById('closePinModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePinModal());
        }
    }
    
    highlightActivePayeeChip(vpa) {
        document.querySelectorAll('.payee-chip').forEach(chip => {
            if (chip.dataset.vpa === vpa) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }
    
    setAccounts(accounts) {
        this.accounts = accounts;
        this.updateSenderDisplay();
    }
    
    updateSenderDisplay() {
        const acc = this.accounts.find(a => a.vpa === this.currentSender);
        if (acc) {
            if (this.senderBalance) {
                this.senderBalance.textContent = `Avail: ₹${parseFloat(acc.balance).toFixed(2)}`;
            }
            if (this.senderAvatar) {
                this.senderAvatar.textContent = acc.holderName.charAt(0);
            }
        }
    }
    
    openPinModal() {
        if (!this.amount || this.amount <= 0) {
            window.showToast('Please enter a valid amount greater than ₹0', 'warning');
            return;
        }
        if (this.currentSender === this.currentReceiver) {
            window.showToast('Sender and receiver cannot be the same account', 'warning');
            return;
        }
        
        this.enteredPin = '';
        this.updatePinDots();
        
        if (this.modalPayAmount) this.modalPayAmount.textContent = `₹${parseFloat(this.amount).toFixed(2)}`;
        if (this.modalPayee) this.modalPayee.textContent = this.currentReceiver;
        
        if (this.pinModal) {
            this.pinModal.classList.add('open');
            this.playKeyClick();
        }
    }
    
    closePinModal() {
        if (this.pinModal) {
            this.pinModal.classList.remove('open');
        }
        this.enteredPin = '';
    }
    
    enterDigit(num) {
        if (this.enteredPin.length < 4) {
            this.enteredPin += num;
            this.playKeyClick();
            this.updatePinDots();
            if (this.enteredPin.length === 4) {
                // Auto submit or wait for submit button
                setTimeout(() => this.submitPin(), 250);
            }
        }
    }
    
    backspace() {
        if (this.enteredPin.length > 0) {
            this.enteredPin = this.enteredPin.slice(0, -1);
            this.playKeyClick();
            this.updatePinDots();
        }
    }
    
    updatePinDots() {
        this.pinDots.forEach((dot, idx) => {
            if (idx < this.enteredPin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    }
    
    async submitPin() {
        if (this.enteredPin.length < 4) {
            this.playErrorTone();
            window.showToast('Please enter full 4-digit UPI PIN', 'warning');
            return;
        }
        
        const pinToUse = this.enteredPin;
        this.closePinModal();
        
        // Execute Packet Injection
        const startDevice = this.startDeviceSelect ? this.startDeviceSelect.value : 'phone-alice';
        const ttl = this.ttlSelect ? parseInt(this.ttlSelect.value) : 5;
        
        if (window.app) {
            await window.app.sendPayment({
                senderVpa: this.currentSender,
                receiverVpa: this.currentReceiver,
                amount: this.amount,
                pin: pinToUse,
                ttl: ttl,
                startDevice: startDevice
            });
            this.playSuccessChime();
        }
    }
}

window.UpiPhoneApp = UpiPhoneApp;
