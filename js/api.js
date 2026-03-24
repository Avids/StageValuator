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
    
    // Better percentage formatter with range detection
    const formatPercent = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      const num = parseFloat(value);
      
      // Detect if already in percentage form or decimal form
      // Typical ranges:
      // - ROE: -100% to +200% (as percentage) or -1.0 to 2.0 (as decimal)
      // - Margins: -100% to +100% (as percentage) or -1.0 to 1.0 (as decimal)
      
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
    
    // Format ratios (no percentage)
    const formatRatio = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      return parseFloat(value).toFixed(decimals);
    };
    
    return {
      // Valuation Metrics
      peRatio: formatRatio(metric.peExclExtraCurrent || metric.peBasicExclExtraTTM),
      evToEbitda: formatRatio(metric.evToEbitdaTTM),
      evToRevenue: formatRatio(metric.evToSalesTTM),
      priceToBook: formatRatio(metric.priceToBook),
      priceToSales: formatRatio(metric.priceToSalesTTM),
      
      // Profitability Metrics - with proper percentage handling
      returnOnEquity: formatPercent(metric.roeTTM, 2),
      returnOnAssets: formatPercent(metric.roaTTM, 2),
      profitMargin: formatPercent(metric.netMarginTTM, 2),
      operatingMargin: formatPercent(metric.operMarginTTM, 2),
      grossMargin: formatPercent(metric.grossMarginTTM, 2),
      
      // Dividend Yield (special handling - usually small decimal)
      dividendYield: metric.dividendYieldIndicatedAnnual !== null && metric.dividendYieldIndicatedAnnual !== undefined
        ? `${(parseFloat(metric.dividendYieldIndicatedAnnual) * 100).toFixed(2)}%`
        : 'None',
      
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
