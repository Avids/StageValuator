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
      source: 'Finnhub',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      previousClose: previousClose,
      currency: 'USD',
      priceChangeToday: `${priceChangeSign}${priceChange} (${priceChangeSign}${priceChangePercent}%)`,
      weekHigh52: data.h || null,
      weekLow52: data.l || null,
      priceTimestamp: new Date().toLocaleString('en-US', { 
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
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
      marketCap: data.marketCapitalization || null,
      description: data.description || null,
      sharesOutstanding: data.shareOutstanding || null
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
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
    
    // Smart percentage formatter with range detection
    const formatPercent = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      const num = parseFloat(value);
      
      let percentValue;
      if (Math.abs(num) <= 1.0) {
        // Likely decimal form (e.g., 0.4325)
        percentValue = num * 100;
      } else if (Math.abs(num) > 100) {
        // Likely already multiplied (e.g., 4325 instead of 43.25)
        percentValue = num / 100;
      } else {
        // Already in percentage form (e.g., 43.25)
        percentValue = num;
      }
      
      return `${percentValue.toFixed(decimals)}%`;
    };
    
    const formatRatio = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      return parseFloat(value).toFixed(decimals);
    };
    
    // Calculate FCF Yield if data available
    const calculateFCFYield = () => {
      const fcfPerShare = metric.freeCashFlowPerShareTTM;
      const currentPrice = metric.priceLastClose || metric.price;
      
      if (fcfPerShare && currentPrice && currentPrice > 0) {
        const fcfYield = (fcfPerShare / currentPrice) * 100;
        return `${fcfYield.toFixed(2)}%`;
      }
      return null;
    };
    
    return {
      // Valuation Metrics
      peRatio: formatRatio(metric.peExclExtraCurrent || metric.peBasicExclExtraTTM),
      evToEbitda: formatRatio(metric.evToEbitdaTTM),
      evToRevenue: formatRatio(metric.evToSalesTTM),
      priceToBook: formatRatio(metric.priceToBook),
      priceToSales: formatRatio(metric.priceToSalesTTM),
      
      // Profitability Metrics
      returnOnEquity: formatPercent(metric.roeTTM, 2),
      returnOnAssets: formatPercent(metric.roaTTM, 2),
      profitMargin: formatPercent(metric.netMarginTTM, 2),
      operatingMargin: formatPercent(metric.operMarginTTM, 2),
      grossMargin: formatPercent(metric.grossMarginTTM, 2),
      
      // Dividend Yield - FIXED: properly handle percentage
      dividendYield: metric.dividendYieldIndicatedAnnual !== null && metric.dividendYieldIndicatedAnnual !== undefined
        ? formatPercent(metric.dividendYieldIndicatedAnnual, 2)
        : 'None',
      
      // NEW: FCF Yield
      fcfYield: calculateFCFYield(),
      
      // Other metrics
      beta: formatRatio(metric.beta, 2),
      eps: metric.epsTTM ? `$${parseFloat(metric.epsTTM).toFixed(2)}` : null,
      bookValuePerShare: metric.bookValuePerShareMRQ ? `$${parseFloat(metric.bookValuePerShareMRQ).toFixed(2)}` : null,
      freeCashFlowPerShare: metric.freeCashFlowPerShareTTM ? `$${parseFloat(metric.freeCashFlowPerShareTTM).toFixed(2)}` : null,
      revenuePerShare: metric.revenuePerShareTTM ? `$${parseFloat(metric.revenuePerShareTTM).toFixed(2)}` : null,
      
      // Analyst Targets
      targetPriceMean: metric.targetPriceMean || null,
      targetPriceHigh: metric.targetPriceHigh || null,
      targetPriceLow: metric.targetPriceLow || null,
      targetPriceMedian: metric.targetPriceMedian || null,
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
        numberOfAnalysts: total,
        buyCount: latest.buy || 0,
        holdCount: latest.hold || 0,
        sellCount: latest.sell || 0
      };
    }
    
    return null;
  } catch (error) {
    updateSourceStatus(source, 'error');
    return null;
  }
}

// ── Yahoo Finance API (Fallback) ─────────────────────────────────────

async function fetchYahooFinance(ticker) {
  const source = 'Yahoo Finance';
  updateSourceStatus(source, 'pending');
  
  try {
    const url = `${state.apiKeys.corsProxy}https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
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
      source: 'Yahoo Finance',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      currency: meta.currency || 'USD',
      priceChangeToday: `${priceChangeSign}${priceChange} (${priceChangeSign}${priceChangePercent}%)`,
      weekHigh52: meta.fiftyTwoWeekHigh || null,
      weekLow52: meta.fiftyTwoWeekLow || null,
      exchange: meta.exchangeName || meta.exchange || 'NASDAQ',
      priceTimestamp: new Date().toLocaleString('en-US', { 
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Yahoo Finance fetch failed:', error.message);
    throw error;
  }
}

// ── Main Fetcher with Fallback Chain ─────────────────────────────────

async function fetchPriceData(ticker) {
  // Try Finnhub first (if API key configured)
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
        evToRevenue: metrics?.evToRevenue,
        returnOnEquity: metrics?.returnOnEquity,
        profitMargin: metrics?.profitMargin,
        operatingMargin: metrics?.operatingMargin,
        dividendYield: metrics?.dividendYield,
        fcfYield: metrics?.fcfYield,  // NEW: FCF Yield
        beta: metrics?.beta,
        eps: metrics?.eps,
        freeCashFlowPerShare: metrics?.freeCashFlowPerShare,
        targetPriceMean: metrics?.targetPriceMean,
        targetPriceHigh: metrics?.targetPriceHigh,
        targetPriceLow: metrics?.targetPriceLow,
        numberOfAnalysts: metrics?.numberOfAnalysts || recommendations?.numberOfAnalysts,
        consensusRating: recommendations?.consensusRating || 'Hold',
        dataSource: 'Finnhub API',
        hasRealMetrics: true
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
      dataSource: 'Yahoo Finance',
      hasRealMetrics: false
    };
  } catch (error) {
    console.warn('Yahoo Finance failed, using mock data:', error.message);
  }
  
  // Final fallback: Mock Data
  return generateMockData(ticker);
}

// ── Mock Data (Last Resort Only) ─────────────────────────────────────

function generateMockData(ticker) {
  const companies = {
    'AAPL': {
      source: 'Mock Data',
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
      evToEbitda: 23,
      returnOnEquity: '147%',
      profitMargin: '25%',
      dividendYield: '0.5%',
      fcfYield: '3.8%',  // NEW
      beta: 1.3,
      dataSource: 'Mock Data (Fallback)',
      hasRealMetrics: false
    },
    'NVDA': {
      source: 'Mock Data',
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
      evToEbitda: 58,
      returnOnEquity: '98%',
      profitMargin: '49%',
      dividendYield: '0.03%',
      fcfYield: '2.1%',  // NEW
      beta: 1.7,
      dataSource: 'Mock Data (Fallback)',
      hasRealMetrics: false
    },
    'TSLA': {
      source: 'Mock Data',
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
      evToEbitda: 38,
      returnOnEquity: '28%',
      profitMargin: '15%',
      dividendYield: 'None',
      fcfYield: '1.9%',  // NEW
      beta: 2.0,
      dataSource: 'Mock Data (Fallback)',
      hasRealMetrics: false
    },
    'MSFT': {
      source: 'Mock Data',
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
      evToEbitda: 28,
      returnOnEquity: '42%',
      profitMargin: '36%',
      dividendYield: '0.7%',
      fcfYield: '3.2%',  // NEW
      beta: 0.9,
      dataSource: 'Mock Data (Fallback)',
      hasRealMetrics: false
    }
  };

  const defaultData = {
    source: 'Mock Data',
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
    fcfYield: '~' + (Math.random() * 3 + 1).toFixed(1) + '%',  // NEW
    beta: parseFloat((Math.random() * 1.5 + 0.8).toFixed(1)),
    dataSource: 'Mock Data (Fallback)',
    hasRealMetrics: false
  };

  return companies[ticker] || defaultData;
}

// ── Helper Functions ─────────────────────────────────────────────────

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
