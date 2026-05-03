// ── Main Entry Point ─────────────────────────────────────────────────

function setPhase(phase) {
  const el = document.getElementById('loadingText');
  if (el) el.textContent = phase;
}

function showLivePrice(priceData) {
  const valueEl = document.getElementById('livePriceValue');
  const changeEl = document.getElementById('livePriceChange');
  const badgeEl = document.getElementById('livePriceBadge');
  
  if (valueEl) valueEl.textContent = `${priceData.currency} ${priceData.currentPrice}`;
  if (changeEl) {
    changeEl.textContent = priceData.priceChangeToday || '';
    changeEl.className = 'live-price-change ' + (priceData.priceChangeToday?.includes('+') ? 'positive' : 'negative');
  }
  if (badgeEl) badgeEl.classList.remove('hidden');
}

function showError(message) {
  const el = document.getElementById('errorSection');
  if (el) {
    el.textContent = '✕ ' + message;
    el.classList.remove('hidden');
  }
}

function hideError() {
  const el = document.getElementById('errorSection');
  if (el) el.classList.add('hidden');
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const btn = document.getElementById('analyzeBtn');
  const section = document.getElementById('loadingSection');
  const badge = document.getElementById('livePriceBadge');
  const status = document.getElementById('dataSourceStatus');
  
  if (btn) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'RUNNING…' : 'ANALYZE →';
  }
  if (section) section.classList.toggle('hidden', !isLoading);
  if (badge && !isLoading) badge.classList.add('hidden');
  if (status && !isLoading) status.innerHTML = '';
}

function toggleSettingsPanel() {
  const el = document.getElementById('apiSettingsPanel');
  if (el) el.classList.toggle('hidden');
}

async function testConnection(apiName) {
  const keyInput = document.getElementById(`${apiName}KeyInput`);
  const resultDiv = document.getElementById(`test${apiName}Result`);
  const btn = document.getElementById(`test${apiName}Btn`);
  
  const apiKey = keyInput.value.trim();
  const providerMap = {
    Finnhub: 'finnhub',
    Alpha: 'alphaVantage',
    Massive: 'massive'
  };
  const provider = providerMap[apiName];
  const useDeploymentKey = !apiKey && provider && state.deploymentApiKeys[provider];

  if (!apiKey && !useDeploymentKey) {
    if (resultDiv) {
      resultDiv.textContent = '❌ Please enter an API key first';
      resultDiv.style.color = '#dc2626';
      resultDiv.classList.remove('hidden');
    }
    return;
  }
  
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
  }
  
  try {
    let url, testSymbol = 'AAPL';
    
    if (useDeploymentKey && apiName === 'Finnhub') {
      url = `/api/finnhub?endpoint=quote&symbol=${testSymbol}`;
    } else if (useDeploymentKey && apiName === 'Alpha') {
      url = `/api/alphavantage?function=GLOBAL_QUOTE&symbol=${testSymbol}`;
    } else if (useDeploymentKey && apiName === 'Massive') {
      url = `/api/massive?endpoint=snapshot&ticker=${testSymbol}`;
    } else if (apiName === 'Finnhub') {
      url = `https://finnhub.io/api/v1/quote?symbol=${testSymbol}&token=${apiKey}`;
    } else if (apiName === 'Alpha') {
      url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${testSymbol}&apikey=${apiKey}`;
    } else if (apiName === 'Massive') {
      url = `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${testSymbol}?apiKey=${apiKey}`;
    }
    
    const response = await fetch(url);
    
    if (resultDiv) {
      if (response.ok) {
        resultDiv.textContent = '✅ Connection successful!';
        resultDiv.style.color = '#059669';
      } else {
        resultDiv.textContent = `❌ Connection failed: ${response.status}`;
        resultDiv.style.color = '#dc2626';
      }
    }
  } catch (error) {
    if (resultDiv) {
      resultDiv.textContent = '❌ Connection failed: ' + error.message;
      resultDiv.style.color = '#dc2626';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `🧪 Test ${apiName}`;
    }
    if (resultDiv) resultDiv.classList.remove('hidden');
  }
}

function saveSettings() {
  const finnhubInput = document.getElementById('finnhubKeyInput');
  const alphaInput = document.getElementById('alphaKeyInput');
  const massiveInput = document.getElementById('massiveKeyInput');
  const corsInput = document.getElementById('corsProxyInput');
  
  state.apiKeys.finnhub = finnhubInput?.value.trim() || '';
  state.apiKeys.alphaVantage = alphaInput?.value.trim() || '';
  state.apiKeys.massive = massiveInput?.value.trim() || '';
  state.apiKeys.corsProxy = corsInput?.value.trim() || 'https://corsproxy.io/?';
  
  saveApiKeys();
  toggleSettingsPanel();
  updateApiKeyStatus();
}

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
    await new Promise(resolve => setTimeout(resolve, 500));

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

function setupEventListeners() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const tickerInput = document.getElementById('tickerInput');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsClose = document.getElementById('settingsClose');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  
  if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
  
  if (tickerInput) {
    tickerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze(); });
    tickerInput.addEventListener('input', (e) => { tickerInput.value = e.target.value.toUpperCase(); });
  }
  
  if (settingsToggle) settingsToggle.addEventListener('click', toggleSettingsPanel);
  if (settingsClose) settingsClose.addEventListener('click', toggleSettingsPanel);
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Test buttons
  const testFinnhubBtn = document.getElementById('testFinnhubBtn');
  const testAlphaBtn = document.getElementById('testAlphaBtn');
  const testMassiveBtn = document.getElementById('testMassiveBtn');
  
  if (testFinnhubBtn) testFinnhubBtn.addEventListener('click', () => testConnection('Finnhub'));
  if (testAlphaBtn) testAlphaBtn.addEventListener('click', () => testConnection('Alpha'));
  if (testMassiveBtn) testMassiveBtn.addEventListener('click', () => testConnection('Massive'));
}

function init() {
  loadApiKeys();
  setupEventListeners();
  updateApiKeyStatus();
  loadDeploymentApiStatus().then(updateApiKeyStatus);
  console.log('StageValuator initialized');
}

document.addEventListener('DOMContentLoaded', init);
