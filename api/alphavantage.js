const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

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
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: 'Alpha Vantage deployment API key is not configured' });
  }

  const ticker = getTicker(req.query.symbol);
  if (!ticker) {
    return sendJson(res, 400, { error: 'Valid symbol is required' });
  }

  const fn = String(req.query.function || '');
  const allowedFunctions = new Set(['GLOBAL_QUOTE', 'OVERVIEW', 'INCOME_STATEMENT']);
  if (!allowedFunctions.has(fn)) {
    return sendJson(res, 400, { error: 'Unsupported Alpha Vantage function' });
  }

  const upstreamUrl = `${ALPHA_VANTAGE_BASE_URL}?function=${encodeURIComponent(fn)}&symbol=${ticker}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(upstreamUrl);
    const body = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
};
