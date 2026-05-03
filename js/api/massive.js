// ── Massive API (formerly Polygon.io) Functions ─────────────────────────
// Docs: https://github.com/massive-com/client-js
// Base URL: https://api.massive.com

// Helper: Build API URL with query params
function buildMassiveUrl(endpoint, params = {}) {
  const baseUrl = 'https://api.massive.com';
  const queryString = new URLSearchParams(params).toString();
  return `${baseUrl}${endpoint}?${queryString}`;
}

// Helper: Format API response errors
function handleMassiveError(response, endpoint) {
  if (response.status === 401) {
    throw new Error('Massive API: Invalid API key');
  }
  if (response.status === 429) {
    throw new Error('Massive API: Rate limit exceeded. Please wait.');
  }
  if (response.status === 404) {
    throw new Error(`Massive API: Ticker not found or endpoint unavailable`);
  }
  throw new Error(`Massive API ${endpoint}: HTTP ${response.status}`);
}

// ── Fetch Current Quote/Snapshot ───────────────────────────────────────

async function fetchMassiveQuote(ticker) {
  const source = 'Massive Quote';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('massive')) {
    updateSourceStatus(source, 'error');
    throw new Error('Massive API key not configured');
  }
  
  try {
    // Use Snapshot API for current price (most reliable for real-time)
    // Endpoint: /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
    const response = shouldUseDeploymentApi('massive')
      ? await fetchDeploymentApi('massive', { endpoint: 'snapshot', ticker })
      : await fetch(buildMassiveUrl(
          `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
          { apiKey: state.apiKeys.massive }
        ));
    
    if (!response.ok) {
      handleMassiveError(response, 'snapshot');
    }
    
    const data = await response.json();
    
    if (!data.ticker || !data.lastTrade || !data.lastTrade.p) {
      throw new Error('No price data returned from Massive API');
    }
    
    const lastTrade = data.lastTrade;
    const prevClose = data.prevDay?.c || lastTrade.p;
    const change = (lastTrade.p - prevClose).toFixed(2);
    const changePercent = prevClose ? ((change / prevClose) * 100).toFixed(2) : 0;
    const changeSign = change >= 0 ? '+' : '';
    
    updateSourceStatus(source, 'success');
    
    return {
      source: 'Massive API',
      currentPrice: parseFloat(lastTrade.p.toFixed(2)),
      previousClose: prevClose,
      currency: 'USD',
      priceChangeToday: `${changeSign}${change} (${changeSign}${changePercent}%)`,
      weekHigh52: data.day?.h || null,
      weekLow52: data.day?.l || null,
      volume: data.day?.v || null,
      marketCap: data.marketCap ? formatMarketCap(data.marketCap) : null,
      priceTimestamp: lastTrade.t ? new Date(lastTrade.t).toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }) : new Date().toLocaleString(),
      exchange: data.tickerDetails?.market || 'NASDAQ'
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Massive Quote fetch failed:', error.message);
    throw error;
  }
}

// ── Fetch Fundamentals/Overview ────────────────────────────────────────

async function fetchMassiveFundamentals(ticker) {
  const source = 'Massive Fundamentals';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('massive')) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    // Use Financials API for fundamental metrics
    // Note: Massive/Polygon financials endpoint structure may vary
    // Fallback: Use aggregates to calculate some metrics
    
    // First try to get company overview via reference endpoint
    const overviewResponse = shouldUseDeploymentApi('massive')
      ? await fetchDeploymentApi('massive', { endpoint: 'tickerDetails', ticker })
      : await fetch(buildMassiveUrl(
          `/v3/reference/tickers/${ticker}`,
          { apiKey: state.apiKeys.massive }
        ));
    let companyData = null;
    
    if (overviewResponse.ok) {
      const overview = await overviewResponse.json();
      companyData = overview.results;
    }
    
    // Get aggregates for price-based calculations
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    
    const aggregatesResponse = shouldUseDeploymentApi('massive')
      ? await fetchDeploymentApi('massive', {
          endpoint: 'aggregates',
          ticker,
          from: oneYearAgo.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
          adjusted: 'true',
          sort: 'asc',
          limit: '252'
        })
      : await fetch(buildMassiveUrl(
          `/v2/aggs/ticker/${ticker}/range/1/day/${oneYearAgo.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}`,
          { 
            apiKey: state.apiKeys.massive,
            adjusted: 'true',
            sort: 'asc',
            limit: '252' // ~1 trading year
          }
        ));
    let aggregatesData = null;
    
    if (aggregatesResponse.ok) {
      aggregatesData = await aggregatesResponse.json();
    }
    
    updateSourceStatus(source, 'success');
    
    // Format helpers
    const formatRatio = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      return parseFloat(value).toFixed(decimals);
    };
    
    const formatPercent = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      const num = parseFloat(value);
      let percentValue;
      if (Math.abs(num) <= 1.0) percentValue = num * 100;
      else if (Math.abs(num) > 100) percentValue = num / 100;
      else percentValue = num;
      return `${percentValue.toFixed(decimals)}%`;
    };
    
    // Calculate 52-week high/low from aggregates if available
    let weekHigh52 = null;
    let weekLow52 = null;
    
    if (aggregatesData?.results) {
      const prices = aggregatesData.results.map(r => r.c).filter(p => p);
      if (prices.length > 0) {
        weekHigh52 = Math.max(...prices);
        weekLow52 = Math.min(...prices);
      }
    }
    
    return {
      // Company Info
      companyName: companyData?.name || null,
      sector: companyData?.sic_description?.split(' - ')[0] || null,
      industry: companyData?.sic_description?.split(' - ')[1] || null,
      exchange: companyData?.primary_exchange || null,
      marketCap: companyData?.market_cap ? formatMarketCap(companyData.market_cap) : null,
      description: companyData?.description || null,
      
      // Valuation Metrics (from company data or calculated)
      peRatio: companyData?.pe_ratio ? formatRatio(companyData.pe_ratio) : null,
      priceToBook: companyData?.price_to_book_ratio ? formatRatio(companyData.price_to_book_ratio) : null,
      priceToSales: companyData?.price_to_sales_ratio ? formatRatio(companyData.price_to_sales_ratio) : null,
      
      // Profitability (if available in financials)
      returnOnEquity: companyData?.return_on_equity ? formatPercent(companyData.return_on_equity) : null,
      profitMargin: companyData?.profit_margin ? formatPercent(companyData.profit_margin) : null,
      operatingMargin: companyData?.operating_margin ? formatPercent(companyData.operating_margin) : null,
      
      // Dividend & Risk
      dividendYield: normalizeDividendYield(companyData?.dividend_yield, 'massive'),
      beta: companyData?.beta ? formatRatio(companyData.beta) : null,
      
      // Per Share Metrics
      eps: companyData?.eps ? `$${parseFloat(companyData.eps).toFixed(2)}` : null,
      bookValuePerShare: companyData?.book_value_per_share ? `$${parseFloat(companyData.book_value_per_share).toFixed(2)}` : null,
      
      // 52-week range from aggregates
      weekHigh52: weekHigh52 ? parseFloat(weekHigh52.toFixed(2)) : null,
      weekLow52: weekLow52 ? parseFloat(weekLow52.toFixed(2)) : null,
      
      // Analyst targets (if available via separate endpoint)
      targetPriceMean: null, // Would need analyst estimates endpoint
      targetPriceHigh: null,
      targetPriceLow: null,
      numberOfAnalysts: null
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Massive Fundamentals fetch failed:', error.message);
    return null;
  }
}

// ── Fetch Income Statement Data ────────────────────────────────────────

async function fetchMassiveIncomeStatement(ticker) {
  const source = 'Massive Income';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('massive')) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    // Financial statements endpoint (if available)
    // Note: Massive/Polygon financials API structure may require subscription
    const response = shouldUseDeploymentApi('massive')
      ? await fetchDeploymentApi('massive', {
          endpoint: 'financials',
          ticker,
          timeframe: 'annual',
          limit: '1'
        })
      : await fetch(buildMassiveUrl(
          `/vX/reference/financials`,
          { 
            apiKey: state.apiKeys.massive,
            ticker: ticker,
            timeframe: 'annual',
            limit: '1'
          }
        ));
    
    if (!response.ok) {
      // Financials may not be available on free tier - return null gracefully
      updateSourceStatus(source, 'pending'); // Not an error, just unavailable
      return null;
    }
    
    const data = await response.json();
    updateSourceStatus(source, 'success');
    
    if (data.results && data.results.length > 0) {
      const latest = data.results[0];
      const financials = latest.financials || {};
      
      return {
        revenueGrowthYoY: financials.revenues ? 
          `$${(parseFloat(financials.revenues) / 1e9).toFixed(1)}B` : null,
        operatingCashFlow: financials.operating_cash_flow ? 
          `$${(parseFloat(financials.operating_cash_flow) / 1e9).toFixed(1)}B` : null,
        freeCashFlow: financials.free_cash_flow ? 
          `$${(parseFloat(financials.free_cash_flow) / 1e9).toFixed(1)}B` : null,
        netIncome: financials.net_income ? 
          `$${(parseFloat(financials.net_income) / 1e9).toFixed(1)}B` : null,
        ebitda: financials.ebitda ? 
          `$${(parseFloat(financials.ebitda) / 1e9).toFixed(1)}B` : null
      };
    }
    
    return null;
  } catch (error) {
    updateSourceStatus(source, 'error');
    console.warn('Massive Income Statement fetch failed:', error.message);
    return null;
  }
}

// ── Fetch Analyst Estimates (if available) ─────────────────────────────

async function fetchMassiveAnalystEstimates(ticker) {
  const source = 'Massive Analyst';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('massive')) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    // Analyst estimates endpoint (premium feature)
    const response = shouldUseDeploymentApi('massive')
      ? await fetchDeploymentApi('massive', { endpoint: 'analyst', ticker })
      : await fetch(buildMassiveUrl(
          `/v1/analyst_estimates/tickers/${ticker}`,
          { apiKey: state.apiKeys.massive }
        ));
    
    if (!response.ok) {
      updateSourceStatus(source, 'pending'); // Not available on all tiers
      return null;
    }
    
    const data = await response.json();
    updateSourceStatus(source, 'success');
    
    if (data.estimates && data.estimates.length > 0) {
      const latest = data.estimates[0];
      return {
        targetPriceMean: latest.target_price_mean || null,
        targetPriceHigh: latest.target_price_high || null,
        targetPriceLow: latest.target_price_low || null,
        numberOfAnalysts: latest.number_of_analysts || null,
        consensusRating: latest.consensus_rating || null
      };
    }
    
    return null;
  } catch (error) {
    updateSourceStatus(source, 'error');
    return null;
  }
}
