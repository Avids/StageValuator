// ── Storage Functions ────────────────────────────────────────────────

function loadApiKeys() {
  const saved = localStorage.getItem('stockAnalyzerApiKeys');
  if (saved) {
    try {
      state.apiKeys = { ...state.apiKeys, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to load API keys:', e);
    }
  }
  updateApiKeyStatus();
}

function saveApiKeys() {
  localStorage.setItem('stockAnalyzerApiKeys', JSON.stringify(state.apiKeys));
  updateApiKeyStatus();
}

function updateApiKeyStatus() {
  const finnhubStatus = document.getElementById('finnhubStatus');
  const finnhubKeyStatus = document.getElementById('finnhubKeyStatus');
  
  if (state.apiKeys.finnhub) {
    finnhubStatus.className = 'status-badge connected';
    finnhubStatus.innerHTML = '<span>●</span><span>Finnhub: Connected</span>';
    finnhubKeyStatus.className = 'status-badge connected';
    finnhubKeyStatus.textContent = 'Configured';
    document.getElementById('finnhubKeyInput').value = state.apiKeys.finnhub;
  } else {
    finnhubStatus.className = 'status-badge disconnected';
    finnhubStatus.innerHTML = '<span>●</span><span>Finnhub: Not Connected</span>';
    finnhubKeyStatus.className = 'status-badge disconnected';
    finnhubKeyStatus.textContent = 'Not Set';
    document.getElementById('finnhubKeyInput').value = '';
  }
  
  document.getElementById('corsProxyInput').value = state.apiKeys.corsProxy;
}

// ── UI Control Functions ─────────────────────────────────────────────

function setPhase(phase) {
  const loadingText = document.getElementById('loadingText');
  if (loadingText) loadingText.textContent = phase;
}

function showLivePrice(priceData) {
  const livePriceValue = document.getElementById('livePriceValue');
  const livePriceChange = document.getElementById('livePriceChange');
  const livePriceBadge = document.getElementById('livePriceBadge');
  
  if (livePriceValue) livePriceValue.textContent = `${priceData.currency} ${priceData.currentPrice}`;
  if (livePriceChange) {
    livePriceChange.textContent = priceData.priceChangeToday || '';
    livePriceChange.className = 'live-price-change ' + 
      (priceData.priceChangeToday?.includes('+') ? 'positive' : 'negative');
  }
  if (livePriceBadge) livePriceBadge.classList.remove('hidden');
}

function showError(message) {
  const errorSection = document.getElementById('errorSection');
  if (errorSection) {
    errorSection.textContent = '✕ ' + message;
    errorSection.classList.remove('hidden');
  }
}

function hideError() {
  const errorSection = document.getElementById('errorSection');
  if (errorSection) errorSection.classList.add('hidden');
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const analyzeBtn = document.getElementById('analyzeBtn');
  const loadingSection = document.getElementById('loadingSection');
  const livePriceBadge = document.getElementById('livePriceBadge');
  const dataSourceStatus = document.getElementById('dataSourceStatus');
  
  if (analyzeBtn) {
    analyzeBtn.disabled = isLoading;
    analyzeBtn.textContent = isLoading ? 'RUNNING…' : 'ANALYZE →';
  }
  if (loadingSection) loadingSection.classList.toggle('hidden', !isLoading);
  if (livePriceBadge && !isLoading) livePriceBadge.classList.add('hidden');
  if (dataSourceStatus && !isLoading) dataSourceStatus.innerHTML = '';
}

function toggleSettingsPanel() {
  const apiSettingsPanel = document.getElementById('apiSettingsPanel');
  if (apiSettingsPanel) apiSettingsPanel.classList.toggle('hidden');
}

// ── Test API Connection ──────────────────────────────────────────────

async function testConnection() {
  const apiKey = document.getElementById('finnhubKeyInput').value.trim();
  const resultDiv = document.getElementById('testConnectionResult');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  
  if (!apiKey) {
    if (resultDiv) {
      resultDiv.textContent = '❌ Please enter an API key first';
      resultDiv.style.color = '#f87171';
      resultDiv.classList.remove('hidden');
    }
    return;
  }
  
  if (testConnectionBtn) {
    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = '⏳ Testing...';
  }
  
  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${apiKey}`);
    
    if (response.ok) {
      const data = await response.json();
      if (resultDiv) {
        if (data.c !== 0) {
          resultDiv.textContent = '✅ Connection successful! AAPL: $' + data.c;
          resultDiv.style.color = '#4ade80';
        } else {
          resultDiv.textContent = '⚠ API key valid but market may be closed';
          resultDiv.style.color = '#fbbf24';
        }
      }
    } else {
      if (resultDiv) {
        resultDiv.textContent = '❌ Connection failed: ' + response.status;
        resultDiv.style.color = '#f87171';
      }
    }
  } catch (error) {
    if (resultDiv) {
      resultDiv.textContent = '❌ Connection failed: ' + error.message;
      resultDiv.style.color = '#f87171';
    }
  } finally {
    if (testConnectionBtn) {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = '🧪 Test Connection';
    }
    if (resultDiv) resultDiv.classList.remove('hidden');
  }
}

// ── Main Analysis Function ───────────────────────────────────────────

async function analyze() {
  const tickerInput = document.getElementById('tickerInput');
  const resultsSection = document.getElementById('resultsSection');
  
  const ticker = tickerInput.value.trim().toUpperCase();
  if (!ticker || state.loading) return;

  state.ticker = ticker;
  setLoading(true);
  if (resultsSection) resultsSection.classList.add('hidden');
  hideError();
  state.sourceStatus = {};

  try {
    setPhase('Fetching live price from multiple sources…');
    const loadingTicker = document.getElementById('loadingTicker');
    if (loadingTicker) loadingTicker.textContent = ticker;
    
    const priceData = await fetchPriceData(ticker);
    priceData.ticker = ticker;
    
    state.livePrice = priceData;
    showLivePrice(priceData);

    setPhase('Running valuation analysis…');
    await new Promise(resolve => setTimeout(resolve, 800));

    const analysis = generateValuationAnalysis(priceData);
    state.result = analysis;
    
    if (resultsSection) {
      resultsSection.innerHTML = renderResults(analysis);
      resultsSection.classList.remove('hidden');
    }

  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
    setPhase('');
  }
}

// ── Save Settings ────────────────────────────────────────────────────

function saveSettings() {
  const finnhubKeyInput = document.getElementById('finnhubKeyInput');
  const corsProxyInput = document.getElementById('corsProxyInput');
  
  state.apiKeys.finnhub = finnhubKeyInput.value.trim();
  state.apiKeys.corsProxy = corsProxyInput.value.trim() || 'https://corsproxy.io/?';
  saveApiKeys();
  toggleSettingsPanel();
  updateApiKeyStatus();
}

// ── Event Listeners ──────────────────────────────────────────────────

function setupEventListeners() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const tickerInput = document.getElementById('tickerInput');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsClose = document.getElementById('settingsClose');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
  
  if (tickerInput) {
    tickerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') analyze();
    });
    tickerInput.addEventListener('input', (e) => {
      tickerInput.value = e.target.value.toUpperCase();
    });
  }
  
  if (settingsToggle) settingsToggle.addEventListener('click', toggleSettingsPanel);
  if (settingsClose) settingsClose.addEventListener('click', toggleSettingsPanel);
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
  if (testConnectionBtn) testConnectionBtn.addEventListener('click', testConnection);
}

// ── Initialize ───────────────────────────────────────────────────────

function init() {
  loadApiKeys();
  setupEventListeners();
  updateApiKeyStatus();
  console.log('StageValuator initialized');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
