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
    
    // Helper function to format percentage correctly
    const formatPercent = (value, decimals = 0) => {
      if (value === null || value === undefined || isNaN(value)) return null;
      const num = parseFloat(value);
      // If value is already > 1, assume it's already in percentage form
      // If value is <= 1, assume it's in decimal form and multiply by 100
      const percentValue = num > 1 ? num : num * 100;
      return `${percentValue.toFixed(decimals)}%`;
    };
    
    // REAL financial metrics from Finnhub - with proper percentage formatting
    return {
      // Valuation Metrics (REAL)
      peRatio: metric.peExclExtraCurrent || metric.peBasicExclExtraTTM || null,
      evToEbitda: metric.evToEbitdaTTM || null,
      evToRevenue: metric.evToSalesTTM || null,
      priceToBook: metric.priceToBook || null,
      priceToSales: metric.priceToSalesTTM || null,
      
      // Profitability Metrics (REAL) - with proper percentage formatting
      returnOnEquity: formatPercent(metric.roeTTM, 2),  // Fixed: 2 decimal places
      returnOnAssets: formatPercent(metric.roaTTM, 2),
      profitMargin: formatPercent(metric.netMarginTTM, 2),
      operatingMargin: formatPercent(metric.operMarginTTM, 2),
      grossMargin: formatPercent(metric.grossMarginTTM, 2),
      
      // Dividend & Risk (REAL)
      dividendYield: metric.dividendYieldIndicatedAnnual 
        ? `${(metric.dividendYieldIndicatedAnnual * 100).toFixed(2)}%` 
        : 'None',
      beta: metric.beta || null,
      
      // Per Share Metrics (REAL)
      eps: metric.epsTTM || null,
      bookValuePerShare: metric.bookValuePerShareMRQ || null,
      freeCashFlowPerShare: metric.freeCashFlowPerShareTTM || null,
      revenuePerShare: metric.revenuePerShareTTM || null,
      
      // Analyst Targets (REAL)
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
