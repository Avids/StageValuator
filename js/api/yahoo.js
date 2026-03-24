// ── Yahoo Finance API (Fallback - No API Key Required) ───────────────

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
    throw error;
  }
}
