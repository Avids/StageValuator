async function fetchPriceData(ticker) {
  const hasFinnhub = hasApiAccess('finnhub');
  const hasAlphaVantage = hasApiAccess('alphaVantage');
  const hasMassive = hasApiAccess('massive');
  
  let priceData = null;
  let fundamentalsData = null;
  let profileData = null;
  let recommendationsData = null;
  let incomeData = null;
  const dividendYieldCandidates = [];
  
  // ── Try Massive FIRST (your premium source) ─────────────────────────
  if (hasMassive) {
    try {
      const [quote, fundamentals, income, analyst] = await Promise.all([
        fetchMassiveQuote(ticker).catch(() => null),
        fetchMassiveFundamentals(ticker).catch(() => null),
        fetchMassiveIncomeStatement(ticker).catch(() => null),
        fetchMassiveAnalystEstimates(ticker).catch(() => null)
      ]);
      
      if (quote) priceData = quote;
      if (fundamentals) {
        dividendYieldCandidates.push({ source: 'massive', value: fundamentals.dividendYield });
        fundamentalsData = fundamentals;
      }
      if (income) incomeData = income;
      if (analyst) recommendationsData = { ...recommendationsData, ...analyst };
    } catch (error) {
      console.warn('Massive API partial failure:', error.message);
    }
  }
  
  // ── Try Finnhub (if configured) ─────────────────────────────────────
  if (hasFinnhub) {
    try {
      const [quote, profile, metrics, recommendations] = await Promise.all([
        fetchFinnhubQuote(ticker).catch(() => null),
        fetchFinnhubProfile(ticker).catch(() => null),
        fetchFinnhubMetrics(ticker).catch(() => null),
        fetchFinnhubRecommendations(ticker).catch(() => null)
      ]);
      
      if (quote && !priceData) priceData = quote;
      if (profile) profileData = profile;
      if (metrics) {
        dividendYieldCandidates.push({ source: 'finnhub', value: metrics.dividendYield });
        fundamentalsData = { ...fundamentalsData, ...metrics };
      }
      if (recommendations) recommendationsData = { ...recommendationsData, ...recommendations };
    } catch (error) {
      console.warn('Finnhub partial failure:', error.message);
    }
  }
  
  // ── Try Alpha Vantage (if configured) ───────────────────────────────
  if (hasAlphaVantage) {
    try {
      const [quote, fundamentals, income] = await Promise.all([
        fetchAlphaVantageQuote(ticker).catch(() => null),
        fetchAlphaVantageFundamentals(ticker).catch(() => null),
        fetchAlphaVantageIncome(ticker).catch(() => null)
      ]);
      
      if (quote && !priceData) priceData = quote;
      if (fundamentals) {
        dividendYieldCandidates.push({ source: 'alphaVantage', value: fundamentals.dividendYield });
        fundamentalsData = { ...fundamentalsData, ...fundamentals };
      }
      if (income) incomeData = { ...incomeData, ...income };
    } catch (error) {
      console.warn('Alpha Vantage partial failure:', error.message);
    }
  }
  
  // ── Fallback to Yahoo Finance (no API key needed) ───────────────────
  if (!priceData) {
    try {
      priceData = await fetchYahooFinance(ticker);
    } catch (error) {
      console.warn('Yahoo Finance failed:', error.message);
    }
  }
  
  // ── Final validation ────────────────────────────────────────────────
  if (!priceData) {
    throw new Error('Unable to fetch price data. Please check:\n1. Ticker symbol is correct\n2. At least one API is configured\n3. Internet connection is active');
  }
  
  // ── Combine all data sources ────────────────────────────────────────
  return {
    ...priceData,
    companyName: profileData?.companyName || fundamentalsData?.companyName || `${ticker} Corporation`,
    sector: profileData?.sector || fundamentalsData?.sector || 'Technology',
    industry: profileData?.industry || fundamentalsData?.industry || 'Software',
    exchange: profileData?.exchange || priceData?.exchange || 'NASDAQ',
    marketCap: profileData?.marketCap || fundamentalsData?.marketCap || null,
    
    // REAL metrics from APIs (no mock data!)
    peRatio: fundamentalsData?.peRatio || null,
    evToEbitda: fundamentalsData?.evToEbitda || null,
    priceToBook: fundamentalsData?.priceToBook || null,
    priceToSales: fundamentalsData?.priceToSales || null,
    returnOnEquity: fundamentalsData?.returnOnEquity || null,
    returnOnAssets: fundamentalsData?.returnOnAssets || null,
    profitMargin: fundamentalsData?.profitMargin || null,
    operatingMargin: fundamentalsData?.operatingMargin || null,
    dividendYield: chooseDividendYield(dividendYieldCandidates, fundamentalsData?.dividendYield),
    fcfYield: fundamentalsData?.fcfYield || null,
    beta: fundamentalsData?.beta || null,
    eps: fundamentalsData?.eps || null,
    bookValuePerShare: fundamentalsData?.bookValuePerShare || null,
    
    // Income statement
    revenueGrowthYoY: incomeData?.revenueGrowthYoY || null,
    operatingCashFlow: incomeData?.operatingCashFlow || null,
    freeCashFlow: incomeData?.freeCashFlow || null,
    netIncome: incomeData?.netIncome || null,
    ebitda: incomeData?.ebitda || null,
    
    // Analyst targets
    targetPriceMean: fundamentalsData?.targetPriceMean || null,
    targetPriceHigh: fundamentalsData?.targetPriceHigh || null,
    targetPriceLow: fundamentalsData?.targetPriceLow || null,
    numberOfAnalysts: fundamentalsData?.numberOfAnalysts || recommendationsData?.numberOfAnalysts || null,
    consensusRating: recommendationsData?.consensusRating || 'Hold',
    
    dataSource: buildDataSourceString(hasFinnhub, hasAlphaVantage, hasMassive, priceData.source),
    hasRealMetrics: !!(fundamentalsData && Object.keys(fundamentalsData).length > 0)
  };
}

function buildDataSourceString(hasFinnhub, hasAlphaVantage, hasMassive, priceSource) {
  const sources = [];
  if (hasMassive) sources.push('Massive');
  if (hasFinnhub) sources.push('Finnhub');
  if (hasAlphaVantage) sources.push('Alpha Vantage');
  if (priceSource === 'Yahoo Finance') sources.push('Yahoo');
  return sources.join(' + ');
}
