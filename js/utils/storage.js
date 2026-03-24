// ── localStorage Handling ────────────────────────────────────────────

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
  const alphaStatus = document.getElementById('alphaStatus');
  const massiveStatus = document.getElementById('massiveStatus');
  
  if (finnhubStatus) {
    finnhubStatus.className = 'status-badge ' + (state.apiKeys.finnhub ? 'connected' : 'disconnected');
    finnhubStatus.innerHTML = `<span>●</span><span>Finnhub: ${state.apiKeys.finnhub ? 'Connected' : 'Not Connected'}</span>`;
  }
  
  if (alphaStatus) {
    alphaStatus.className = 'status-badge ' + (state.apiKeys.alphaVantage ? 'connected' : 'disconnected');
    alphaStatus.innerHTML = `<span>●</span><span>Alpha Vantage: ${state.apiKeys.alphaVantage ? 'Connected' : 'Not Connected'}</span>`;
  }
  
  if (massiveStatus) {
    massiveStatus.className = 'status-badge ' + (state.apiKeys.massive ? 'connected' : 'disconnected');
    massiveStatus.innerHTML = `<span>●</span><span>MASSIVE: ${state.apiKeys.massive ? 'Connected' : 'Not Connected'}</span>`;
  }
  
  // Update input values
  const finnhubInput = document.getElementById('finnhubKeyInput');
  const alphaInput = document.getElementById('alphaKeyInput');
  const massiveInput = document.getElementById('massiveKeyInput');
  const corsInput = document.getElementById('corsProxyInput');
  
  if (finnhubInput) finnhubInput.value = state.apiKeys.finnhub;
  if (alphaInput) alphaInput.value = state.apiKeys.alphaVantage;
  if (massiveInput) massiveInput.value = state.apiKeys.massive;
  if (corsInput) corsInput.value = state.apiKeys.corsProxy;
}
