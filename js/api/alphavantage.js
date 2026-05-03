// ── Alpha Vantage API Functions ──────────────────────────────────────

async function fetchAlphaVantageQuote(ticker) {
  const source = 'Alpha Vantage Quote';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('alphaVantage')) {
    updateSourceStatus(source, 'error');
    throw new Error('Alpha Vantage API key not configured');
  }
  
  try {
    const response = shouldUseDeploymentApi('alphaVantage')
      ? await fetchDeploymentApi('alphavantage', { function: 'GLOBAL_QUOTE', symbol: ticker })
      : await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${state.apiKeys.alphaVantage}`);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const quote = data['Global Quote'];
    
    if (!quote || !quote['05. price']) {
      if (data['Note']) throw new Error('API rate limit exceeded');
      throw new Error('Invalid ticker or no data');
    }
    
    const currentPrice = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change'] || 0);
    const changePercent = quote['10. change percent']?.replace('%', '') || 0;
    const changeSign = change >= 0 ? '+' : '';
    
    updateSourceStatus(source, 'success');
    
    return {
      source: 'Alpha Vantage',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      currency: 'USD',
      priceChangeToday: `${changeSign}${change.toFixed(2)} (${changeSign}${changePercent}%)`,
      priceTimestamp: quote['07. latest trading day'] || new Date().toLocaleDateString()
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    throw error;
  }
}

async function fetchAlphaVantageFundamentals(ticker) {
  const source = 'Alpha Vantage Fundamentals';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('alphaVantage')) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    const response = shouldUseDeploymentApi('alphaVantage')
      ? await fetchDeploymentApi('alphavantage', { function: 'OVERVIEW', symbol: ticker })
      : await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${state.apiKeys.alphaVantage}`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data || !data.Symbol) return null;
    
    updateSourceStatus(source, 'success');
    
    const formatPercent = (value, decimals = 2) => {
      if (!value || value === 'null') return null;
      const num = parseFloat(value);
      if (isNaN(num)) return null;
      let percentValue;
      if (Math.abs(num) <= 1.0) percentValue = num * 100;
      else if (Math.abs(num) > 100) percentValue = num / 100;
      else percentValue = num;
      return `${percentValue.toFixed(decimals)}%`;
    };
    
    const formatRatio = (value, decimals = 2) => {
      if (!value || value === 'null') return null;
      const num = parseFloat(value);
      if (isNaN(num)) return null;
      return num.toFixed(decimals);
    };
    
    return {
      companyName: data.Name || null,
      sector: data.Sector || null,
      industry: data.Industry || null,
      exchange: data.Exchange || null,
      marketCap: data.MarketCapitalization ? formatMarketCap(data.MarketCapitalization) : null,
      peRatio: formatRatio(data.PERatio),
      priceToBook: formatRatio(data.PriceToBookRatio),
      priceToSales: formatRatio(data.PriceToSalesRatioTTM),
      returnOnEquity: formatPercent(data.ReturnOnEquityTTM, 2),
      returnOnAssets: formatPercent(data.ReturnOnAssetsTTM, 2),
      profitMargin: formatPercent(data.ProfitMargin, 2),
      operatingMargin: formatPercent(data.OperatingMarginTTM, 2),
      dividendYield: data.DividendYield ? formatPercent(data.DividendYield, 2) : 'None',
      beta: formatRatio(data.Beta),
      eps: data.EPS ? `$${parseFloat(data.EPS).toFixed(2)}` : null,
      bookValuePerShare: data.BookValue ? `$${parseFloat(data.BookValue).toFixed(2)}` : null,
      targetPriceMean: data.AnalystTargetPrice ? parseFloat(data.AnalystTargetPrice) : null
    };
  } catch (error) {
    updateSourceStatus(source, 'error');
    return null;
  }
}

async function fetchAlphaVantageIncome(ticker) {
  const source = 'Alpha Vantage Income';
  updateSourceStatus(source, 'pending');
  
  if (!hasApiAccess('alphaVantage')) {
    updateSourceStatus(source, 'error');
    return null;
  }
  
  try {
    const response = shouldUseDeploymentApi('alphaVantage')
      ? await fetchDeploymentApi('alphavantage', { function: 'INCOME_STATEMENT', symbol: ticker })
      : await fetch(`https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${ticker}&apikey=${state.apiKeys.alphaVantage}`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    updateSourceStatus(source, 'success');
    
    if (data['annualReports'] && data['annualReports'].length > 0) {
      const latest = data['annualReports'][0];
      return {
        revenueGrowthYoY: latest.totalRevenue ? `$${(parseFloat(latest.totalRevenue) / 1e9).toFixed(1)}B` : null,
        operatingCashFlow: latest.operatingCashflow ? `$${(parseFloat(latest.operatingCashflow) / 1e9).toFixed(1)}B` : null,
        freeCashFlow: latest.freeCashFlow ? `$${(parseFloat(latest.freeCashFlow) / 1e9).toFixed(1)}B` : null
      };
    }
    
    return null;
  } catch (error) {
    updateSourceStatus(source, 'error');
    return null;
  }
}
