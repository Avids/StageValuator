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
    bg: '#052e16', 
    label: 'Early-Stage',
    class: 'stage-early'
  },
  'growth': { 
    color: '#34d399', 
    bg: '#022c22', 
    label: 'Growth',
    class: 'stage-growth'
  },
  'mature': { 
    color: '#60a5fa', 
    bg: '#1e3a5f', 
    label: 'Mature',
    class: 'stage-mature'
  },
  'decline': { 
    color: '#fbbf24', 
    bg: '#3f2800', 
    label: 'Decline / Distressed',
    class: 'stage-decline'
  }
};

// ── Known Company Stages (for better accuracy) ───────────────────────
const KNOWN_STAGES = {
  'AAPL': 'mature', 'MSFT': 'mature', 'GOOGL': 'mature', 'META': 'mature',
  'AMZN': 'mature', 'NVDA': 'growth', 'TSLA': 'growth', 'PLTR': 'growth',
  'SNOW': 'early-stage', 'RBLX': 'early-stage', 'UBER': 'growth',
  'COIN': 'growth', 'LYFT': 'growth', 'ABNB': 'growth'
};

// ── Rating Colors ────────────────────────────────────────────────────
const RATING_COLORS = {
  'Strong Buy': '#4ade80',
  'Buy': '#86efac',
  'Hold': '#fbbf24',
  'Sell': '#f87171',
  'Strong Sell': '#ef4444'
};
