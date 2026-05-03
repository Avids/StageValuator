// Deployment API helpers. User-entered keys stay in the browser; Vercel keys
// are used only through /api/* proxy routes so private env vars are not exposed.

function hasApiAccess(provider) {
  return !!state.apiKeys[provider] || !!state.deploymentApiKeys[provider];
}

function shouldUseDeploymentApi(provider) {
  return !state.apiKeys[provider] && !!state.deploymentApiKeys[provider];
}

async function loadDeploymentApiStatus() {
  try {
    const response = await fetch('/api/api-status', { cache: 'no-store' });
    if (!response.ok) return;

    const data = await response.json();
    state.deploymentApiKeys = {
      ...state.deploymentApiKeys,
      finnhub: !!data.finnhub,
      alphaVantage: !!data.alphaVantage,
      massive: !!data.massive
    };
  } catch (error) {
    console.info('Deployment API key status unavailable:', error.message);
  }
}

async function fetchDeploymentApi(provider, params) {
  const query = new URLSearchParams(params);
  return fetch(`/api/${provider}?${query.toString()}`);
}
