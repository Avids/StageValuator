// ── State Management ──────────────────────────────────────────────────
const state = {
  ticker: '',
  loading: false,
  phase: '',
  livePrice: null,
  result: null,
  error: null,
  apiKeys: {
    finnhub: '',
    alphaVantage: '',
    massive: '',  // YOUR MASSIVE API
    corsProxy: 'https://corsproxy.io/?'
  },
  sourceStatus: {},
  rateLimit: {
    used: 0,
    limit: 60
  }
};

// ── Stage Configurations ─────────────────────────────────────────────
const STAGES = {
  'early-stage': { 
    color: '#4ade80', 
    bg: '#c6f6d5', 
    label: 'Early-Stage',
    class: 'stage-early'
  },
  'growth': { 
    color: '#059669', 
    bg: '#a7f3d0', 
    label: 'Growth',
    class: 'stage-growth'
  },
  'mature': { 
    color: '#2563eb', 
    bg: '#bfdbfe', 
    label: 'Mature',
    class: 'stage-mature'
  },
  'decline': { 
    color: '#d97706', 
    bg: '#fde68a', 
    label: 'Decline / Distressed',
    class: 'stage-decline'
  }
};

// ── Known Company Stages ─────────────────────────────────────────────
const KNOWN_STAGES = {
  'AAPL': 'mature', 'MSFT': 'mature', 'GOOGL': 'mature', 'META': 'mature',
  'AMZN': 'mature', 'NVDA': 'growth', 'TSLA': 'growth', 'PLTR': 'growth',
  'SNOW': 'early-stage', 'RBLX': 'early-stage', 'UBER': 'growth',
  'COIN': 'growth', 'LYFT': 'growth', 'ABNB': 'growth'
};

// ── Rating Colors ────────────────────────────────────────────────────
const RATING_COLORS = {
  'Strong Buy': '#059669',
  'Buy': '#10b981',
  'Hold': '#d97706',
  'Sell': '#dc2626',
  'Strong Sell': '#b91c1c'
};
