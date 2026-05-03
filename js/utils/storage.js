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
    const hasFinnhub = hasApiAccess('finnhub');
    const label = state.apiKeys.finnhub ? 'User Key' : (state.deploymentApiKeys.finnhub ? 'Vercel Key' : 'Not Connected');
    finnhubStatus.className = 'status-badge ' + (hasFinnhub ? 'connected' : 'disconnected');
    finnhubStatus.innerHTML = `<span>●</span><span>Finnhub: ${label}</span>`;
  }
  
  if (alphaStatus) {
    const hasAlpha = hasApiAccess('alphaVantage');
    const label = state.apiKeys.alphaVantage ? 'User Key' : (state.deploymentApiKeys.alphaVantage ? 'Vercel Key' : 'Not Connected');
    alphaStatus.className = 'status-badge ' + (hasAlpha ? 'connected' : 'disconnected');
    alphaStatus.innerHTML = `<span>●</span><span>Alpha Vantage: ${label}</span>`;
  }
  
  if (massiveStatus) {
    const hasMassive = hasApiAccess('massive');
    const label = state.apiKeys.massive ? 'User Key' : (state.deploymentApiKeys.massive ? 'Vercel Key' : 'Not Connected');
    massiveStatus.className = 'status-badge ' + (hasMassive ? 'connected' : 'disconnected');
    massiveStatus.innerHTML = `<span>●</span><span>MASSIVE: ${label}</span>`;
  }
  
  const keyBadges = [
    ['finnhubKeyStatus', 'finnhub'],
    ['alphaKeyStatus', 'alphaVantage'],
    ['massiveKeyStatus', 'massive']
  ];

  keyBadges.forEach(([elementId, provider]) => {
    const badge = document.getElementById(elementId);
    if (!badge) return;

    const hasAccess = hasApiAccess(provider);
    badge.className = 'status-badge ' + (hasAccess ? 'connected' : 'disconnected');
    badge.textContent = state.apiKeys[provider] ? 'User Key' : (state.deploymentApiKeys[provider] ? 'Vercel Key' : 'Not Set');
  });

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
