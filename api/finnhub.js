const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getTicker(symbol) {
  const ticker = String(symbol || '').trim().toUpperCase();
  return /^[A-Z0-9.-]{1,15}$/.test(ticker) ? ticker : '';
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: 'Finnhub deployment API key is not configured' });
  }

  const ticker = getTicker(req.query.symbol);
  if (!ticker) {
    return sendJson(res, 400, { error: 'Valid symbol is required' });
  }

  const endpoint = String(req.query.endpoint || '');
  const routes = {
    quote: `/quote?symbol=${ticker}`,
    profile: `/stock/profile2?symbol=${ticker}`,
    metrics: `/stock/metric?symbol=${ticker}&metric=all`,
    recommendations: `/stock/recommendation?symbol=${ticker}`
  };

  if (!routes[endpoint]) {
    return sendJson(res, 400, { error: 'Unsupported Finnhub endpoint' });
  }

  try {
    const upstream = await fetch(`${FINNHUB_BASE_URL}${routes[endpoint]}&token=${encodeURIComponent(apiKey)}`);
    const body = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
};
