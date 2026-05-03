// ── Utility Functions ────────────────────────────────────────────────

function toFixedSafe(value, decimals = 0) {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toFixed(decimals);
}

function calculatePercentage(value, min, max) {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function formatMarketCap(value) {
  if (!value) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  return '$' + num.toFixed(2);
}

function normalizeDividendYield(value, source = '') {
  if (value === null || value === undefined || value === '' || value === 'None' || value === 'null') {
    return 'None';
  }

  let raw = value;
  if (typeof raw === 'string') {
    raw = raw.replace('%', '').trim();
  }

  const num = parseFloat(raw);
  if (isNaN(num) || num <= 0) return 'None';

  let percent = num;

  // Alpha Vantage reports DividendYield as a decimal fraction.
  if (source === 'alphaVantage') {
    percent = num * 100;
  } else if (num <= 1) {
    percent = num * 100;
  }

  // Common-stock dividend yields above this are usually formatting/provider
  // errors in this app's data sources, not usable valuation inputs.
  if (percent > 15) return 'None';

  return `${percent.toFixed(2)}%`;
}

function chooseDividendYield(candidates = [], fallback = null) {
  const priority = {
    alphaVantage: 1,
    finnhub: 2,
    massive: 3
  };

  const normalized = candidates
    .map((candidate) => ({
      source: candidate.source,
      value: normalizeDividendYield(candidate.value, candidate.source)
    }))
    .filter((candidate) => candidate.value !== 'None')
    .sort((a, b) => (priority[a.source] || 99) - (priority[b.source] || 99));

  if (normalized.length > 0) return normalized[0].value;
  return normalizeDividendYield(fallback);
}

function updateSourceStatus(source, status) {
  state.sourceStatus[source] = status;
  const container = document.getElementById('dataSourceStatus');
  if (!container) return;
  
  const badges = Object.entries(state.sourceStatus).map(([src, stat]) => {
    const className = stat === 'success' ? 'success' : stat === 'error' ? 'error' : 'pending';
    const icon = stat === 'success' ? '✓' : stat === 'error' ? '✕' : '○';
    return `<span class="source-badge ${className}">${icon} ${src}</span>`;
  }).join('');
  
  container.innerHTML = badges;
}

function updateRateLimit(headers) {
  const remaining = headers.get('X-RateLimit-Remaining');
  const limit = headers.get('X-RateLimit-Limit');
  
  if (remaining && limit) {
    state.rateLimit.used = parseInt(limit) - parseInt(remaining);
    state.rateLimit.limit = parseInt(limit);
    
    const rateLimitStatus = document.getElementById('rateLimitStatus');
    if (rateLimitStatus) {
      rateLimitStatus.className = 'status-badge ' + (state.rateLimit.used > 50 ? 'warning' : 'connected');
      rateLimitStatus.innerHTML = `<span>⚠</span><span>Rate Limit: ${state.rateLimit.used}/${state.rateLimit.limit}</span>`;
      rateLimitStatus.classList.remove('hidden');
    }
  }
}
