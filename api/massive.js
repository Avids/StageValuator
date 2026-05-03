const MASSIVE_BASE_URL = 'https://api.massive.com';

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

function getDate(value) {
  const date = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function buildUpstreamUrl(query, apiKey) {
  const ticker = getTicker(query.ticker);
  if (!ticker) return null;

  const endpoint = String(query.endpoint || '');
  let path = '';
  const params = new URLSearchParams();

  if (endpoint === 'snapshot') {
    path = `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`;
  } else if (endpoint === 'tickerDetails') {
    path = `/v3/reference/tickers/${ticker}`;
  } else if (endpoint === 'aggregates') {
    const from = getDate(query.from);
    const to = getDate(query.to);
    if (!from || !to) return null;
    path = `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`;
    params.set('adjusted', query.adjusted === 'false' ? 'false' : 'true');
    params.set('sort', query.sort === 'desc' ? 'desc' : 'asc');
    params.set('limit', String(Math.min(parseInt(query.limit, 10) || 252, 5000)));
  } else if (endpoint === 'financials') {
    path = '/vX/reference/financials';
    params.set('ticker', ticker);
    params.set('timeframe', query.timeframe === 'quarterly' ? 'quarterly' : 'annual');
    params.set('limit', String(Math.min(parseInt(query.limit, 10) || 1, 10)));
  } else if (endpoint === 'analyst') {
    path = `/v1/analyst_estimates/tickers/${ticker}`;
  } else {
    return null;
  }

  params.set('apiKey', apiKey);
  return `${MASSIVE_BASE_URL}${path}?${params.toString()}`;
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: 'Massive deployment API key is not configured' });
  }

  const upstreamUrl = buildUpstreamUrl(req.query, apiKey);
  if (!upstreamUrl) {
    return sendJson(res, 400, { error: 'Unsupported Massive request' });
  }

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
