function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = function handler(req, res) {
  sendJson(res, 200, {
    finnhub: !!process.env.FINNHUB_API_KEY,
    alphaVantage: !!process.env.ALPHA_VANTAGE_API_KEY,
    massive: !!(process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY)
  });
};
