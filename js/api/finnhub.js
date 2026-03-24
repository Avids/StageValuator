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
      if (response.status === 429) throw new Error('Rate limit exceeded');
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
      marketCap: data.marketCapitalization || null
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
    
    const formatPercent = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      const num = parseFloat(value);
      let percentValue;
      if (Math.abs(num) <= 1.0) percentValue = num * 100;
      else if (Math.abs(num) > 100) percentValue = num / 100;
      else percentValue = num;
      return `${percentValue.toFixed(decimals)}%`;
    };
    
    const formatRatio = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      return parseFloat(value).toFixed(decimals);
    };
    
    return {
      peRatio: formatRatio(metric.peExclExtraCurrent || metric.peBasicExclExtraTTM),
      evToEbitda: formatRatio(metric.evToEbitdaTTM),
      priceToBook: formatRatio(metric.priceToBook),
      returnOnEquity: formatPercent(metric.roeTTM, 2),
      profitMargin: formatPercent(metric.netMarginTTM, 2),
      operatingMargin: formatPercent(metric.operMarginTTM, 2),
      dividendYield: metric.dividendYieldIndicatedAnnual !== null
        ? formatPercent(metric.dividendYieldIndicatedAnnual, 2)
        : 'None',
      fcfYield: metric.freeCashFlowPerShareTTM && metric.priceLastClose
        ? `${((metric.freeCashFlowPerShareTTM / metric.priceLastClose) * 100).toFixed(2)}%`
        : null,
      beta: formatRatio(metric.beta, 2),
      eps: metric.epsTTM ? `$${parseFloat(metric.epsTTM).toFixed(2)}` : null,
      targetPriceMean: metric.targetPriceMean || null,
      targetPriceHigh: metric.targetPriceHigh || null,
      targetPriceLow: metric.targetPriceLow || null,
      numberOfAnalysts: metric.numberOfAnalyst || null
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
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
      
      return { consensusRating, numberOfAnalysts: total };
    }
    
    return null;
  } catch (error) {
    updateSourceStatus(source, 'error');
    return null;
  }
}
