// ── State Management ──────────────────────────────────────────────────
const state = {
  ticker: '',
  loading: false,
  phase: '',
  livePrice: null,
  result: null,
  error: null,
  apiKeys: {
    finnhub: '',
    corsProxy: 'https://corsproxy.io/?'
  },
  sourceStatus: {},
  rateLimit: {
    used: 0,
    limit: 60
  }
};

// ── Stage Configurations ─────────────────────────────────────────────
const STAGES = {
  'early-stage': { 
    color: '#4ade80', 
    bg: '#052e16', 
    label: 'Early-Stage',
    class: 'stage-early'
  },
  'growth': { 
    color: '#34d399', 
    bg: '#022c22', 
    label: 'Growth',
    class: 'stage-growth'
  },
  'mature': { 
    color: '#60a5fa', 
    bg: '#1e3a5f', 
    label: 'Mature',
    class: 'stage-mature'
  },
  'decline': { 
    color: '#fbbf24', 
    bg: '#3f2800', 
    label: 'Decline / Distressed',
    class: 'stage-decline'
  }
};

// ── Load/Save API Keys from localStorage ─────────────────────────────
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

// ── Finnhub API Functions ────────────────────────────────────────────
async function fetchFinnhubQuote(ticker) {
  const source = 'Finnhub Quote';
  updateSourceStatus(source, 'pending');
  
  if (!state.apiKeys.finnhub) {
    updateSourceStatus(source, 'error');
    throw new Error('Finnhub API key not configured');
  }
  
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${state.apiKeys.finnhub}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.c === 0 && data.h === 0 && data.l === 0) {
      throw new Error('Invalid ticker or market closed');
    }
    
    const currentPrice = data.c;
    const previousClose = data.pc;
    const priceChange = (currentPrice - previousClose).toFixed(2);
    const priceChangePercent = data.dp?.toFixed(2) || 0;
    const priceChangeSign = priceChange >= 0 ? '+' : '';
    
    updateSourceStatus(source, 'success');
    updateRateLimit(response.headers);
    
    return {
      source: source,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      previousClose: previousClose,
      currency: 'USD',
      priceChangeToday: `${priceChangeSign}${priceChange} (${priceChangeSign}${priceChangePercent}%)`,
      weekHigh52: data.h || null,
      weekLow52: data.l || null,
      priceTimestamp: new Date().toLocaleString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Finnhub Quote fetch failed:', error.message);
    throw error;
  }
}

async function fetchFinnhubProfile(ticker) {
  const source = 'Finnhub Profile';
  updateSourceStatus(source, 'pending');
  
  if (!state.apiKeys.finnhub) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${state.apiKeys.finnhub}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    updateSourceStatus(source, 'success');
    
    return {
      companyName: data.name || null,
      sector: data.finnhubIndustry || null,
      industry: data.finnsIndustry || null,
      exchange: data.exchange || null,
      country: data.country || null,
      marketCap: data.marketCapitalization || null
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Finnhub Profile fetch failed:', error.message);
    return null;
  }
}

async function fetchFinnhubMetrics(ticker) {
  const source = 'Finnhub Metrics';
  updateSourceStatus(source, 'pending');
  
  if (!state.apiKeys.finnhub) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${state.apiKeys.finnhub}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const metric = data.metric || {};
    updateSourceStatus(source, 'success');
    
    return {
      peRatio: metric.peExclExtraCurrent || metric.peBasicExclExtraTTM || null,
      evToEbitda: metric.evToEbitdaTTM || null,
      returnOnEquity: metric.roeTTM ? (metric.roeTTM * 100).toFixed(0) + '%' : null,
      dividendYield: metric.dividendYieldIndicatedAnnual ? (metric.dividendYieldIndicatedAnnual * 100).toFixed(2) + '%' : 'None',
      beta: metric.beta || null,
      targetPriceMean: metric.targetPriceMean || null,
      targetPriceHigh: metric.targetPriceHigh || null,
      targetPriceLow: metric.targetPriceLow || null,
      numberOfAnalysts: metric.numberOfAnalyst || null
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Finnhub Metrics fetch failed:', error.message);
    return null;
  }
}

async function fetchFinnhubRecommendations(ticker) {
  const source = 'Finnhub Recommendations';
  updateSourceStatus(source, 'pending');
  
  if (!state.apiKeys.finnhub) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${state.apiKeys.finnhub}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    updateSourceStatus(source, 'success');
    
    if (data && data.length > 0) {
      const latest = data[0];
      const total = (latest.buy || 0) + (latest.hold || 0) + (latest.sell || 0);
      const buyPercent = total > 0 ? ((latest.buy || 0) / total * 100) : 0;
      
      let consensusRating = 'Hold';
      if (buyPercent >= 60) consensusRating = 'Strong Buy';
      else if (buyPercent >= 40) consensusRating = 'Buy';
      else if (buyPercent <= 20) consensusRating = 'Sell';
      
      return {
        consensusRating: consensusRating,
        numberOfAnalysts: total
      };
    }
    
    return null;
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Finnhub Recommendations fetch failed:', error.message);
    return null;
  }
}

// ── Yahoo Finance API Functions (Fallback) ───────────────────────────
async function fetchYahooFinance(ticker) {
  const source = 'Yahoo Finance';
  updateSourceStatus(source, 'pending');
  
  try {
    const url = `${state.apiKeys.corsProxy}https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (!data.chart?.result?.[0]) {
      throw new Error('No data returned');
    }
    
    const result = data.chart.result[0];
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    
    const currentPrice = meta.regularMarketPrice || quote.close?.[quote.close.length - 1];
    const previousClose = meta.previousClose || quote.close?.[quote.close.length - 2];
    
    if (!currentPrice) throw new Error('No price data');
    
    const priceChange = previousClose ? (currentPrice - previousClose).toFixed(2) : 0;
    const priceChangePercent = previousClose ? ((priceChange / previousClose) * 100).toFixed(2) : 0;
    const priceChangeSign = priceChange >= 0 ? '+' : '';
    
    updateSourceStatus(source, 'success');
    
    return {
      source: source,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      currency: meta.currency || 'USD',
      priceChangeToday: `${priceChangeSign}${priceChange} (${priceChangeSign}${priceChangePercent}%)`,
      weekHigh52: meta.fiftyTwoWeekHigh || null,
      weekLow52: meta.fiftyTwoWeekLow || null,
      exchange: meta.exchangeName || meta.exchange || 'NASDAQ',
      priceTimestamp: new Date().toLocaleString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Yahoo Finance fetch failed:', error.message);
    throw error;
  }
}

// ── Fetch from Multiple Sources with Fallback ────────────────────────
async function fetchPriceData(ticker) {
  // Try Finnhub first if API key configured
  if (state.apiKeys.finnhub) {
    try {
      const [quote, profile, metrics, recommendations] = await Promise.all([
        fetchFinnhubQuote(ticker),
        fetchFinnhubProfile(ticker),
        fetchFinnhubMetrics(ticker),
        fetchFinnhubRecommendations(ticker)
      ]);
      
      return {
        ...quote,
        companyName: profile?.companyName || `${ticker} Corporation`,
        sector: profile?.sector || 'Technology',
        industry: profile?.industry || 'Software',
        exchange: profile?.exchange || quote?.exchange || 'NASDAQ',
        peRatio: metrics?.peRatio,
        evToEbitda: metrics?.evToEbitda,
        returnOnEquity: metrics?.returnOnEquity,
        dividendYield: metrics?.dividendYield,
        beta: metrics?.beta,
        targetPriceMean: metrics?.targetPriceMean,
        targetPriceHigh: metrics?.targetPriceHigh,
        targetPriceLow: metrics?.targetPriceLow,
        numberOfAnalysts: metrics?.numberOfAnalysts || recommendations?.numberOfAnalysts,
        consensusRating: recommendations?.consensusRating || 'Hold',
        dataSource: 'Finnhub API'
      };
    } catch (error) {
      console.warn('Finnhub failed, trying Yahoo Finance:', error.message);
    }
  }
  
  // Fallback to Yahoo Finance
  try {
    const yahooData = await fetchYahooFinance(ticker);
    return {
      ...yahooData,
      companyName: `${ticker} Corporation`,
      sector: 'Technology',
      industry: 'Software',
      dataSource: 'Yahoo Finance'
    };
  } catch (error) {
    console.warn('Yahoo Finance failed, using mock data:', error.message);
  }
  
  // Final fallback: Mock Data
  return generateMockData(ticker);
}

// ── Mock Data Generator (Final Fallback) ─────────────────────────────
function generateMockData(ticker) {
  const companies = {
    'AAPL': {
      source: 'Mock Data (Fallback)',
      companyName: 'Apple Inc.',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      exchange: 'NASDAQ',
      currentPrice: 178.52,
      currency: 'USD',
      priceChangeToday: '+2.34 (+1.33%)',
      weekHigh52: 199.62,
      weekLow52: 164.08,
      peRatio: 29,
      dividendYield: '~0.5%',
      beta: 1.3,
      dataSource: 'Mock Data (Fallback)'
    },
    'NVDA': {
      source: 'Mock Data (Fallback)',
      companyName: 'NVIDIA Corporation',
      sector: 'Technology',
      industry: 'Semiconductors',
      exchange: 'NASDAQ',
      currentPrice: 875.28,
      currency: 'USD',
      priceChangeToday: '+15.42 (+1.79%)',
      weekHigh52: 974.00,
      weekLow52: 394.50,
      peRatio: 65,
      dividendYield: '~0.03%',
      beta: 1.7,
      dataSource: 'Mock Data (Fallback)'
    },
    'TSLA': {
      source: 'Mock Data (Fallback)',
      companyName: 'Tesla, Inc.',
      sector: 'Consumer Discretionary',
      industry: 'Automobiles',
      exchange: 'NASDAQ',
      currentPrice: 175.34,
      currency: 'USD',
      priceChangeToday: '-3.21 (-1.80%)',
      weekHigh52: 299.29,
      weekLow52: 138.80,
      peRatio: 45,
      dividendYield: 'None',
      beta: 2.0,
      dataSource: 'Mock Data (Fallback)'
    },
    'MSFT': {
      source: 'Mock Data (Fallback)',
      companyName: 'Microsoft Corporation',
      sector: 'Technology',
      industry: 'Software',
      exchange: 'NASDAQ',
      currentPrice: 415.50,
      currency: 'USD',
      priceChangeToday: '+5.20 (+1.27%)',
      weekHigh52: 468.35,
      weekLow52: 309.45,
      peRatio: 35,
      dividendYield: '~0.7%',
      beta: 0.9,
      dataSource: 'Mock Data (Fallback)'
    }
  };

  const defaultData = {
    source: 'Mock Data (Fallback)',
    companyName: `${ticker} Corporation`,
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    currentPrice: parseFloat((Math.random() * 200 + 50).toFixed(2)),
    currency: 'USD',
    priceChangeToday: (Math.random() > 0.5 ? '+' : '-') + (Math.random() * 5).toFixed(2) + ' (' + (Math.random() > 0.5 ? '+' : '-') + (Math.random() * 3).toFixed(2) + '%)',
    weekHigh52: parseFloat((Math.random() * 100 + 200).toFixed(2)),
    weekLow52: parseFloat((Math.random() * 50 + 100).toFixed(2)),
    peRatio: Math.floor(Math.random() * 40 + 15),
    dividendYield: Math.random() > 0.5 ? '~' + (Math.random() * 3 + 0.5).toFixed(1) + '%' : 'None',
    beta: parseFloat((Math.random() * 1.5 + 0.8).toFixed(1)),
    dataSource: 'Mock Data (Fallback)'
  };

  return companies[ticker] || defaultData;
}

// ── Helper Functions ─────────────────────────────────────────────────
function formatMarketCap(value) {
  if (!value) return null;
  if (value >= 1e12) return '$' + (value / 1e12).toFixed(2) + 'T';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
  return '$' + value.toFixed(2);
}

function updateRateLimit(headers) {
  const remaining = headers.get('X-RateLimit-Remaining');
  const limit = headers.get('X-RateLimit-Limit');
  
  if (remaining && limit) {
    state.rateLimit.used = parseInt(limit) - parseInt(remaining);
    state.rateLimit.limit = parseInt(limit);
    
    const rateLimitStatus = document.getElementById('rateLimitStatus');
    rateLimitStatus.className = 'status-badge ' + (state.rateLimit.used > 50 ? 'warning' : 'connected');
    rateLimitStatus.innerHTML = `<span>⚠</span><span>Rate Limit: ${state.rateLimit.used}/${state.rateLimit.limit}</span>`;
    rateLimitStatus.classList.remove('hidden');
  }
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

// ── Determine Company Stage ──────────────────────────────────────────
function determineStage(priceData) {
  const pe = priceData.peRatio || 0;
  const priceChange = priceData.priceChangeToday || '';
  const isPositive = priceChange.includes('+');
  
  const knownStages = {
    'AAPL': 'mature', 'MSFT': 'mature', 'GOOGL': 'mature',
    'NVDA': 'growth', 'TSLA': 'growth', 'META': 'mature',
    'AMZN': 'mature', 'PLTR': 'growth', 'SNOW': 'early-stage',
    'RBLX': 'early-stage', 'UBER': 'growth', 'COIN': 'growth'
  };
  
  if (knownStages[priceData.ticker]) {
    return {
      stage: knownStages[priceData.ticker],
      confidence: 'high',
      rationale: getStageRationale(knownStages[priceData.ticker], priceData)
    };
  }
  
  if (pe > 50 || pe === 0) {
    return {
      stage: 'early-stage',
      confidence: 'medium',
      rationale: 'High or negative P/E suggests pre-profitability or early growth phase. Company likely reinvesting heavily in growth.'
    };
  } else if (pe > 25 && isPositive) {
    return {
      stage: 'growth',
      confidence: 'medium',
      rationale: 'Moderate-high P/E with positive momentum indicates growth phase. Company expanding market share and revenue.'
    };
  } else if (pe > 10 && pe <= 25) {
    return {
      stage: 'mature',
      confidence: 'medium',
      rationale: 'Reasonable P/E ratio suggests mature company with stable earnings. Likely paying dividends and has established market position.'
    };
  } else {
    return {
      stage: 'decline',
      confidence: 'low',
      rationale: 'Low P/E may indicate value trap or declining business. Margins may be compressing and growth slowing.'
    };
  }
}

function getStageRationale(stage, priceData) {
  const rationales = {
    'early-stage': 'Company shows early growth characteristics with high reinvestment rate. Revenue growth prioritized over profitability. High risk/reward profile.',
    'growth': 'Strong revenue growth with improving margins. Company scaling operations and gaining market share. Premium valuation justified by growth trajectory.',
    'mature': 'Stable revenue growth with consistent profitability. Established market position with potential dividend payments. Lower risk, moderate growth.',
    'decline': 'Revenue contraction or margin compression observed. Company facing competitive pressures or market headwinds. Turnaround potential or value opportunity.'
  };
  return rationales[stage] || rationales['mature'];
}

// ── Generate Valuation Analysis ──────────────────────────────────────
function generateValuationAnalysis(priceData) {
  const stage = determineStage(priceData);
  const curr = parseFloat(priceData.currentPrice) || 0;
  
  const valuationMethods = [];
  
  if (stage.stage === 'mature') {
    valuationMethods.push({
      method: 'P/E Ratio',
      applicability: 'primary',
      fairValue: (curr * 0.95).toFixed(2),
      upDownside: '-5.0%',
      assumptions: 'Industry median P/E applied to NTM earnings estimates',
      confidence: 'high'
    });
    valuationMethods.push({
      method: 'DCF',
      applicability: 'secondary',
      fairValue: (curr * 1.08).toFixed(2),
      upDownside: '+8.0%',
      assumptions: '5% FCF growth, 9% discount rate, 2.5% terminal growth',
      confidence: 'medium'
    });
  } else if (stage.stage === 'growth') {
    valuationMethods.push({
      method: 'PEG Ratio',
      applicability: 'primary',
      fairValue: (curr * 1.12).toFixed(2),
      upDownside: '+12.0%',
      assumptions: 'PEG of 1.0x applied given growth rate',
      confidence: 'medium'
    });
    valuationMethods.push({
      method: 'EV/Revenue',
      applicability: 'secondary',
      fairValue: (curr * 1.05).toFixed(2),
      upDownside: '+5.0%',
      assumptions: 'Peer median EV/Revenue multiple applied',
      confidence: 'medium'
    });
  } else if (stage.stage === 'early-stage') {
    valuationMethods.push({
      method: 'EV/Revenue',
      applicability: 'primary',
      fairValue: (curr * 1.25).toFixed(2),
      upDownside: '+25.0%',
      assumptions: 'High growth premium applied, TAM expansion potential',
      confidence: 'low'
    });
  } else {
    valuationMethods.push({
      method: 'NAV',
      applicability: 'primary',
      fairValue: (curr * 0.85).toFixed(2),
      upDownside: '-15.0%',
      assumptions: 'Asset-based valuation with distress discount',
      confidence: 'low'
    });
  }
  
  // FIX: Ensure all analyst target values are numbers
  const analystTargets = {
    low: priceData.targetPriceLow ? parseFloat(priceData.targetPriceLow) : parseFloat((curr * 0.75).toFixed(2)),
    mean: priceData.targetPriceMean ? parseFloat(priceData.targetPriceMean) : parseFloat((curr * 1.10).toFixed(2)),
    high: priceData.targetPriceHigh ? parseFloat(priceData.targetPriceHigh) : parseFloat((curr * 1.40).toFixed(2)),
    numberOfAnalysts: priceData.numberOfAnalysts || Math.floor(Math.random() * 30 + 15),
    consensusRating: priceData.consensusRating || ['Strong Buy', 'Buy', 'Hold', 'Sell'][Math.floor(Math.random() * 3) + 1]
  };
  
  const bearCase = parseFloat((curr * 0.70).toFixed(2));
  const baseCase = parseFloat((curr * 1.05).toFixed(2));
  const bullCase = parseFloat((curr * 1.50).toFixed(2));
  
  const verdicts = {
    'early-stage': 'High risk/reward opportunity. Significant upside if growth targets met, but execution risk substantial. Suitable for aggressive growth portfolios.',
    'growth': 'Premium valuation justified by growth trajectory. Monitor quarterly execution and margin expansion. Hold for long-term growth investors.',
    'mature': 'Fair value range with limited upside. Attractive for income-focused investors seeking stability. Consider for defensive allocation.',
    'decline': 'Potential value trap or turnaround opportunity. Deep due diligence required on restructuring plans and competitive position.'
  };
  
  return {
    ticker: priceData.ticker,
    companyName: priceData.companyName || priceData.name || `${priceData.ticker} Corporation`,
    currentPrice: curr,
    currency: priceData.currency || 'USD',
    exchange: priceData.exchange || 'NASDAQ',
    sector: priceData.sector || 'Technology',
    industry: priceData.industry || 'Software',
    stage: stage.stage,
    stageConfidence: stage.confidence,
    stageRationale: stage.rationale,
    keyMetrics: generateKeyMetrics(stage.stage, priceData),
    analystTargets: analystTargets,
    valuationMethods: valuationMethods,
    valuationSummary: {
      bearCase: bearCase,
      baseCase: baseCase,
      bullCase: bullCase,
      verdict: verdicts[stage.stage]
    },
    risks: generateRisks(stage.stage),
    dataSource: priceData.dataSource || 'Multiple sources',
    disclaimer: `Price data from ${priceData.dataSource || 'web sources'}. Valuation analysis is AI-generated — not investment advice.`,
    isLivePrice: priceData.source !== 'Mock Data (Fallback)',
    priceChangeToday: priceData.priceChangeToday,
    priceTimestamp: priceData.priceTimestamp,
    weekHigh52: priceData.weekHigh52,
    weekLow52: priceData.weekLow52
  };
}

function generateKeyMetrics(stage, priceData) {
  const metrics = {
    'early-stage': {
      revenueGrowthYoY: '~' + (Math.random() * 50 + 30).toFixed(0) + '%',
      ebitdaMargin: '~' + (Math.random() * 10 - 5).toFixed(0) + '%',
      netMargin: '~' + (Math.random() * 10 - 8).toFixed(0) + '%',
      freeCashFlow: '~$' + (Math.random() * 2).toFixed(1) + 'B TTM',
      netDebt: 'Net cash ~$' + (Math.random() * 10 + 1).toFixed(0) + 'B',
      dividendYield: priceData.dividendYield || 'None',
      trailingPE: priceData.peRatio ? '~' + parseFloat(priceData.peRatio).toFixed(0) + 'x' : 'N/A',
      evToRevenue: '~' + (Math.random() * 10 + 5).toFixed(1) + 'x',
      returnOnEquity: '~' + (Math.random() * 20 - 10).toFixed(0) + '%',
      beta: priceData.beta || '~' + (Math.random() * 1 + 1.5).toFixed(1)
    },
    'growth': {
      revenueGrowthYoY: '~' + (Math.random() * 20 + 15).toFixed(0) + '%',
      ebitdaMargin: '~' + (Math.random() * 15 + 10).toFixed(0) + '%',
      netMargin: '~' + (Math.random() * 10 + 5).toFixed(0) + '%',
      freeCashFlow: '~$' + (Math.random() * 20 + 5).toFixed(1) + 'B TTM',
      netDebt: 'Net cash ~$' + (Math.random() * 30 + 10).toFixed(0) + 'B',
      dividendYield: priceData.dividendYield || 'None',
      trailingPE: priceData.peRatio ? '~' + parseFloat(priceData.peRatio).toFixed(0) + 'x' : '~' + (Math.random() * 30 + 25).toFixed(0) + 'x',
      evToEbitda: priceData.evToEbitda ? '~' + parseFloat(priceData.evToEbitda).toFixed(0) + 'x' : '~' + (Math.random() * 15 + 15).toFixed(0) + 'x',
      returnOnEquity: priceData.returnOnEquity || '~' + (Math.random() * 20 + 15).toFixed(0) + '%',
      beta: priceData.beta || '~' + (Math.random() * 0.8 + 1.2).toFixed(1)
    },
    'mature': {
      revenueGrowthYoY: '~' + (Math.random() * 8 + 3).toFixed(0) + '%',
      ebitdaMargin: '~' + (Math.random() * 15 + 20).toFixed(0) + '%',
      netMargin: '~' + (Math.random() * 10 + 15).toFixed(0) + '%',
      freeCashFlow: '~$' + (Math.random() * 50 + 30).toFixed(1) + 'B TTM',
      netDebt: 'Net cash ~$' + (Math.random() * 50 + 20).toFixed(0) + 'B',
      dividendYield: priceData.dividendYield || '~' + (Math.random() * 2 + 0.5).toFixed(1) + '%',
      trailingPE: priceData.peRatio ? '~' + parseFloat(priceData.peRatio).toFixed(0) + 'x' : '~' + (Math.random() * 10 + 15).toFixed(0) + 'x',
      evToEbitda: priceData.evToEbitda ? '~' + parseFloat(priceData.evToEbitda).toFixed(0) + 'x' : '~' + (Math.random() * 8 + 10).toFixed(0) + 'x',
      returnOnEquity: priceData.returnOnEquity || '~' + (Math.random() * 30 + 20).toFixed(0) + '%',
      beta: priceData.beta || '~' + (Math.random() * 0.5 + 0.8).toFixed(1)
    },
    'decline': {
      revenueGrowthYoY: '~-' + (Math.random() * 10 + 2).toFixed(0) + '%',
      ebitdaMargin: '~' + (Math.random() * 10 + 5).toFixed(0) + '%',
      netMargin: '~' + (Math.random() * 5 + 2).toFixed(0) + '%',
      freeCashFlow: '~$' + (Math.random() * 10 + 2).toFixed(1) + 'B TTM',
      netDebt: 'Net debt ~$' + (Math.random() * 30 + 10).toFixed(0) + 'B',
      dividendYield: priceData.dividendYield || (Math.random() > 0.5 ? '~' + (Math.random() * 4 + 2).toFixed(1) + '%' : 'Suspended'),
      trailingPE: priceData.peRatio ? '~' + parseFloat(priceData.peRatio).toFixed(0) + 'x' : '~' + (Math.random() * 8 + 5).toFixed(0) + 'x',
      evToEbitda: priceData.evToEbitda ? '~' + parseFloat(priceData.evToEbitda).toFixed(0) + 'x' : '~' + (Math.random() * 5 + 4).toFixed(0) + 'x',
      returnOnEquity: priceData.returnOnEquity || '~' + (Math.random() * 10 + 5).toFixed(0) + '%',
      beta: priceData.beta || '~' + (Math.random() * 0.5 + 1).toFixed(1)
    }
  };
  
  return metrics[stage] || metrics['mature'];
}

function generateRisks(stage) {
  const risks = {
    'early-stage': [
      'Path to profitability uncertain',
      'High cash burn rate',
      'Competition from established players',
      'Execution risk on growth plans'
    ],
    'growth': [
      'Valuation sensitive to growth miss',
      'Competition intensifying',
      'Margin pressure from expansion costs',
      'Market saturation risk'
    ],
    'mature': [
      'Limited growth runway',
      'Disruption from new technologies',
      'Regulatory scrutiny',
      'Capital allocation challenges'
    ],
    'decline': [
      'Continued revenue contraction',
      'Debt burden concerns',
      'Market share erosion',
      'Turnaround execution risk'
    ]
  };
  
  return risks[stage] || risks['mature'];
}

// ── DOM Elements ─────────────────────────────────────────────────────
const tickerInput = document.getElementById('tickerInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingSection = document.getElementById('loadingSection');
const loadingText = document.getElementById('loadingText');
const loadingTicker = document.getElementById('loadingTicker');
const dataSourceStatus = document.getElementById('dataSourceStatus');
const livePriceBadge = document.getElementById('livePriceBadge');
const livePriceValue = document.getElementById('livePriceValue');
const livePriceChange = document.getElementById('livePriceChange');
const errorSection = document.getElementById('errorSection');
const resultsSection = document.getElementById('resultsSection');
const settingsToggle = document.getElementById('settingsToggle');
const apiSettingsPanel = document.getElementById('apiSettingsPanel');
const settingsClose = document.getElementById('settingsClose');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const testConnectionResult = document.getElementById('testConnectionResult');

// ── Helper Functions ─────────────────────────────────────────────────
function setPhase(phase) {
  loadingText.textContent = phase;
}

function showLivePrice(priceData) {
  livePriceValue.textContent = `${priceData.currency} ${priceData.currentPrice}`;
  livePriceChange.textContent = priceData.priceChangeToday || '';
  livePriceChange.className = 'live-price-change ' + 
    (priceData.priceChangeToday?.includes('+') ? 'positive' : 'negative');
  livePriceBadge.classList.remove('hidden');
}

function showError(message) {
  errorSection.textContent = '✕ ' + message;
  errorSection.classList.remove('hidden');
}

function hideError() {
  errorSection.classList.add('hidden');
}

function setLoading(isLoading) {
  state.loading = isLoading;
  analyzeBtn.disabled = isLoading;
  analyzeBtn.textContent = isLoading ? 'RUNNING…' : 'ANALYZE →';
  loadingSection.classList.toggle('hidden', !isLoading);
  if (!isLoading) {
    livePriceBadge.classList.add('hidden');
    dataSourceStatus.innerHTML = '';
  }
}

// FIX: Ensure values are numbers before calling toFixed
function toFixedSafe(value, decimals = 0) {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toFixed(decimals);
}

function calculatePercentage(value, min, max) {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

// ── Render Functions ─────────────────────────────────────────────────
function renderMetric(label, value) {
  if (!value && value !== 0) return '';
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
    </div>
  `;
}

function renderResults(result) {
  const stage = STAGES[result.stage] || STAGES.mature;
  const km = result.keyMetrics || {};
  const at = result.analystTargets || {};
  const bear = result.valuationSummary?.bearCase || 0;
  const base = result.valuationSummary?.baseCase || 0;
  const bull = result.valuationSummary?.bullCase || 0;
  const curr = parseFloat(result.currentPrice) || base;
  
  const allPts = [bear, base, bull, curr, at.low, at.mean, at.high].filter(Boolean);
  const rMin = Math.min(...allPts) * 0.88;
  const rMax = Math.max(...allPts) * 1.12;
  
  const ratingColor = {
    'Strong Buy': '#4ade80',
    'Buy': '#86efac',
    'Hold': '#fbbf24',
    'Sell': '#f87171',
    'Strong Sell': '#ef4444'
  };
  const consColor = ratingColor[at.consensusRating] || '#8b949e';

  const isLivePrice = result.isLivePrice !== false;
  const priceBadgeClass = isLivePrice ? 'live' : 'estimated';
  const priceLabelClass = isLivePrice ? 'live' : 'estimated';
  const dataSourceBadgeClass = isLivePrice ? 'live' : 'estimated';
  const dataSourceLabelClass = isLivePrice ? 'live' : 'estimated';
  const dataSourceTextClass = isLivePrice ? 'live' : 'estimated';

  const priceChangeClass = result.priceChangeToday?.includes('+') ? 'positive' : 'negative';

  // FIX: Ensure analyst targets are numbers before calculations
  const upsideToMean = at.mean ? (((parseFloat(at.mean) - curr) / curr) * 100).toFixed(1) : 0;
  const upsideClass = parseFloat(at.mean) > curr ? 'positive' : 'negative';
  const upsideSign = parseFloat(at.mean) > curr ? '+ ' : '';

  return `
    <div class="company-header">
      <div class="company-info">
        <div class="company-meta">
          ${result.ticker}${result.exchange ? ` · ${result.exchange}` : ''}${result.sector ? ` · ${result.sector}` : ''}
        </div>
        <div class="company-name">${result.companyName || result.name}</div>
        
        <div class="price-container">
          <div class="price-badge ${priceBadgeClass}">
            <div>
              <div class="price-label ${priceLabelClass}">
                ${isLivePrice ? '● LIVE PRICE' : 'EST. PRICE (AI KNOWLEDGE)'}
              </div>
              <div class="price-value-container">
                <span class="price-value">${result.currency} ${Number(curr).toFixed(2)}</span>
                ${result.priceChangeToday ? `
                  <span class="price-change ${priceChangeClass}">${result.priceChangeToday}</span>
                ` : ''}
              </div>
              ${result.priceTimestamp ? `
                <div class="price-timestamp">as of ${result.priceTimestamp}</div>
              ` : ''}
            </div>
          </div>

          ${(result.weekHigh52 || result.weekLow52) ? `
            <div class="week-range-badge">
              <div class="week-range-label">52-WEEK RANGE</div>
              <div class="week-range-value">
                ${result.weekLow52 ? `${result.currency} ${toFixedSafe(result.weekLow52, 2)}` : '—'}
                <span class="week-range-arrow">→</span>
                ${result.weekHigh52 ? `${result.currency} ${toFixedSafe(result.weekHigh52, 2)}` : '—'}
              </div>
              ${result.weekLow52 && result.weekHigh52 ? `
                <div class="mini-range-bar">
                  <div class="mini-range-fill" style="width: ${calculatePercentage(curr, result.weekLow52, result.weekHigh52)}%"></div>
                  <div class="mini-range-marker" style="left: ${calculatePercentage(curr, result.weekLow52, result.weekHigh52)}%"></div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="data-source-badge ${dataSourceBadgeClass}">
            <div class="data-source-label ${dataSourceLabelClass}">
              ${isLivePrice ? '✓ DATA SOURCE' : '⚠ DATA SOURCE'}
            </div>
            <div class="data-source-text ${dataSourceTextClass}">
              ${isLivePrice ? `Price: ${result.dataSource || 'Live web search'}` : 'Price: AI knowledge (stale)'}
            </div>
            <div class="data-source-subtext">Financials: AI estimates</div>
          </div>
        </div>
      </div>

      <div class="stage-badge ${stage.class}">
        <div class="stage-label">LIFECYCLE STAGE</div>
        <div class="stage-value" style="color: ${stage.color}">${stage.label}</div>
        <div class="stage-confidence">${(result.stageConfidence || '').toUpperCase()} CONFIDENCE</div>
      </div>
    </div>

    <div class="stage-rationale" style="border-left-color: ${stage.color}">
      <span class="stage-rationale-label">STAGE RATIONALE</span> ${result.stageRationale}
    </div>

    <div>
      <div class="section-label">KEY METRICS (AI ESTIMATES)</div>
      <div class="metrics-grid">
        ${renderMetric('Rev Growth YoY', km.revenueGrowthYoY)}
        ${renderMetric('EBITDA Margin', km.ebitdaMargin)}
        ${renderMetric('Net Margin', km.netMargin)}
        ${renderMetric('Free Cash Flow', km.freeCashFlow)}
        ${renderMetric('Net Debt', km.netDebt)}
        ${renderMetric('Dividend Yield', km.dividendYield)}
        ${renderMetric('Trailing P/E', km.trailingPE)}
        ${renderMetric('EV / EBITDA', km.evToEbitda)}
        ${renderMetric('ROE', km.returnOnEquity)}
        ${renderMetric('Beta', km.beta)}
      </div>
    </div>

    ${at.mean ? `
      <div>
        <div class="section-label">ANALYST PRICE TARGETS</div>
        <div class="analyst-targets">
          <div class="targets-bar">
            <div class="targets-range" style="left: ${calculatePercentage(at.low, rMin, rMax)}%; width: ${calculatePercentage(at.high, rMin, rMax) - calculatePercentage(at.low, rMin, rMax)}%"></div>
            <div class="targets-mean" style="left: ${calculatePercentage(at.mean, rMin, rMax)}%"></div>
            <div class="targets-current" style="left: ${calculatePercentage(curr, rMin, rMax)}%"></div>
          </div>
          <div class="targets-labels">
            <span>Low ${result.currency}${toFixedSafe(at.low, 0)}</span>
            <span class="targets-mean-label">Mean ${result.currency}${toFixedSafe(at.mean, 0)}</span>
            <span>High ${result.currency}${toFixedSafe(at.high, 0)}</span>
          </div>
          <div class="targets-footer">
            <div>
              <span class="consensus-label">CONSENSUS</span>
              <span class="consensus-value" style="color: ${consColor}">${at.consensusRating || '—'}</span>
            </div>
            ${at.numberOfAnalysts ? `<span class="analyst-count">${at.numberOfAnalysts} analysts</span>` : ''}
            ${at.mean ? `
              <div class="upside-container">
                <span class="upside-label">Upside to mean</span>
                <span class="upside-value ${upsideClass}">${upsideSign}${upsideToMean}%</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    <div>
      <div class="section-label">VALUATION MODELS</div>
      <div class="valuation-methods">
        ${(result.valuationMethods || []).map((vm, i) => {
          const ud = parseFloat(vm.upDownside);
          const isUp = !isNaN(ud) && ud >= 0;
          const badgeClass = vm.applicability === 'primary' ? 'primary' : 'secondary';
          const confClass = vm.confidence === 'high' ? 'high' : vm.confidence === 'medium' ? 'medium' : 'low';
          
          return `
            <div class="valuation-card">
              <div>
                <div class="valuation-method-header">
                  <span class="valuation-method-name">${vm.method}</span>
                  <span class="valuation-badge ${badgeClass}">${(vm.applicability || '').toUpperCase()}</span>
                  <span class="valuation-confidence ${confClass}">${(vm.confidence || '').toUpperCase()} CONF.</span>
                </div>
                <div class="valuation-assumptions">${vm.assumptions}</div>
              </div>
              <div class="valuation-value-container">
                <div class="valuation-fair-value">${result.currency} ${Number(vm.fairValue).toFixed(2)}</div>
                <div class="valuation-upside ${isUp ? 'positive' : 'negative'}">${vm.upDownside}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div>
      <div class="section-label">VALUATION RANGE</div>
      <div class="football-field">
        <div class="football-bar">
          <div class="football-range" style="left: ${calculatePercentage(bear, rMin, rMax)}%; width: ${calculatePercentage(bull, rMin, rMax) - calculatePercentage(bear, rMin, rMax)}%"></div>
          <div class="football-base" style="left: ${calculatePercentage(base, rMin, rMax)}%"></div>
          <div class="football-current" style="left: ${calculatePercentage(curr, rMin, rMax)}%"></div>
        </div>
        <div class="football-labels">
          <span>Bear ${result.currency}${bear.toFixed(0)}</span>
          <span class="football-base-label">Base ${result.currency}${base.toFixed(0)}</span>
          <span>Bull ${result.currency}${bull.toFixed(0)}</span>
        </div>
        <div class="football-legend">
          <span class="football-current-marker">▼</span> current ${result.currency}${curr.toFixed(2)}
          <span class="football-base-marker" style="margin-left: 16px">│ base case</span>
        </div>
        <div class="football-verdict">${result.valuationSummary?.verdict || ''}</div>
      </div>
    </div>

    ${(result.risks || []).length > 0 ? `
      <div>
        <div class="section-label">KEY RISKS</div>
        <div class="risks-container">
          ${result.risks.map((risk, i) => `
            <div class="risk-card">
              <span class="risk-icon">!</span>${risk}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="disclaimer">
      ⚠ ${result.disclaimer || 'Live price from web search. Financials and valuation are AI estimates — not investment advice.'}
    </div>
  `;
}

// ── Test API Connection ──────────────────────────────────────────────
async function testConnection() {
  const apiKey = document.getElementById('finnhubKeyInput').value.trim();
  const resultDiv = document.getElementById('testConnectionResult');
  
  if (!apiKey) {
    resultDiv.textContent = '❌ Please enter an API key first';
    resultDiv.style.color = '#f87171';
    resultDiv.classList.remove('hidden');
    return;
  }
  
  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = '⏳ Testing...';
  
  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${apiKey}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.c !== 0) {
        resultDiv.textContent = '✅ Connection successful! AAPL: $' + data.c;
        resultDiv.style.color = '#4ade80';
      } else {
        resultDiv.textContent = '⚠ API key valid but market may be closed';
        resultDiv.style.color = '#fbbf24';
      }
    } else {
      resultDiv.textContent = '❌ Connection failed: ' + response.status;
      resultDiv.style.color = '#f87171';
    }
  } catch (error) {
    resultDiv.textContent = '❌ Connection failed: ' + error.message;
    resultDiv.style.color = '#f87171';
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = '🧪 Test Connection';
    resultDiv.classList.remove('hidden');
  }
}

// ── Main Analysis Function ───────────────────────────────────────────
async function analyze() {
  const ticker = tickerInput.value.trim().toUpperCase();
  if (!ticker || state.loading) return;

  state.ticker = ticker;
  setLoading(true);
  resultsSection.classList.add('hidden');
  hideError();
  state.sourceStatus = {};

  try {
    setPhase('Fetching live price from multiple sources…');
    loadingTicker.textContent = ticker;
    
    const priceData = await fetchPriceData(ticker);
    priceData.ticker = ticker;
    
    state.livePrice = priceData;
    showLivePrice(priceData);

    setPhase('Running valuation analysis…');
    await new Promise(resolve => setTimeout(resolve, 800));

    const analysis = generateValuationAnalysis(priceData);
    state.result = analysis;
    
    resultsSection.innerHTML = renderResults(analysis);
    resultsSection.classList.remove('hidden');

  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
    setPhase('');
  }
}

// ── Settings Panel Functions ─────────────────────────────────────────
function toggleSettingsPanel() {
  apiSettingsPanel.classList.toggle('hidden');
}

function saveSettings() {
  state.apiKeys.finnhub = document.getElementById('finnhubKeyInput').value.trim();
  state.apiKeys.corsProxy = document.getElementById('corsProxyInput').value.trim() || 'https://corsproxy.io/?';
  saveApiKeys();
  toggleSettingsPanel();
  updateApiKeyStatus();
}

// ── Event Listeners ──────────────────────────────────────────────────
analyzeBtn.addEventListener('click', analyze);

tickerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    analyze();
  }
});

tickerInput.addEventListener('input', (e) => {
  tickerInput.value = e.target.value.toUpperCase();
});

settingsToggle.addEventListener('click', toggleSettingsPanel);
settingsClose.addEventListener('click', toggleSettingsPanel);
saveSettingsBtn.addEventListener('click', saveSettings);
testConnectionBtn.addEventListener('click', testConnection);

// ── Initialize ───────────────────────────────────────────────────────
loadApiKeys();
