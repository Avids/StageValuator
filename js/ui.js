// ── Utility Functions ────────────────────────────────────────────────

function toFixedSafe(value, decimals = 0) {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toFixed(decimals);
}

function calculatePercentage(value, min, max) {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function formatMarketCap(value) {
  if (!value) return null;
  if (value >= 1e12) return '$' + (value / 1e12).toFixed(2) + 'T';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
  return '$' + value.toFixed(2);
}

// ── Render Functions ─────────────────────────────────────────────────

function renderMetric(label, value) {
  if (!value && value !== 0) return '';
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
    </div>
  `;
}

function renderResults(result) {
  const stage = STAGES[result.stage] || STAGES.mature;
  const km = result.keyMetrics || {};
  const at = result.analystTargets || {};
  const bear = result.valuationSummary?.bearCase || 0;
  const base = result.valuationSummary?.baseCase || 0;
  const bull = result.valuationSummary?.bullCase || 0;
  const curr = parseFloat(result.currentPrice) || base;
  
  const allPts = [bear, base, bull, curr, at.low, at.mean, at.high].filter(Boolean);
  const rMin = Math.min(...allPts) * 0.88;
  const rMax = Math.max(...allPts) * 1.12;
  
  const consColor = RATING_COLORS[at.consensusRating] || '#8b949e';

  const isLivePrice = result.isLivePrice !== false;
  const priceBadgeClass = isLivePrice ? 'live' : 'estimated';
  const priceLabelClass = isLivePrice ? 'live' : 'estimated';
  const dataSourceBadgeClass = isLivePrice ? 'live' : 'estimated';
  const dataSourceLabelClass = isLivePrice ? 'live' : 'estimated';
  const dataSourceTextClass = isLivePrice ? 'live' : 'estimated';

  const priceChangeClass = result.priceChangeToday?.includes('+') ? 'positive' : 'negative';

  // FIX: Ensure analyst targets are numbers before calculations
  const upsideToMean = at.mean ? (((parseFloat(at.mean) - curr) / curr) * 100).toFixed(1) : 0;
  const upsideClass = parseFloat(at.mean) > curr ? 'positive' : 'negative';
  const upsideSign = parseFloat(at.mean) > curr ? '+ ' : '';

  // Data source indicator
  const dataSourceText = result.hasRealMetrics 
    ? `Price & Metrics: ${result.dataSource}` 
    : `Price: ${result.dataSource} · Metrics: Estimates`;

  return `
    <div class="company-header">
      <div class="company-info">
        <div class="company-meta">
          ${result.ticker}${result.exchange ? ` · ${result.exchange}` : ''}${result.sector ? ` · ${result.sector}` : ''}
        </div>
        <div class="company-name">${result.companyName || result.name}</div>
        
        <div class="price-container">
          <div class="price-badge ${priceBadgeClass}">
            <div>
              <div class="price-label ${priceLabelClass}">
                ${isLivePrice ? '● LIVE PRICE' : 'EST. PRICE (AI KNOWLEDGE)'}
              </div>
              <div class="price-value-container">
                <span class="price-value">${result.currency} ${Number(curr).toFixed(2)}</span>
                ${result.priceChangeToday ? `
                  <span class="price-change ${priceChangeClass}">${result.priceChangeToday}</span>
                ` : ''}
              </div>
              ${result.priceTimestamp ? `
                <div class="price-timestamp">as of ${result.priceTimestamp}</div>
              ` : ''}
            </div>
          </div>

          ${(result.weekHigh52 || result.weekLow52) ? `
            <div class="week-range-badge">
              <div class="week-range-label">52-WEEK RANGE</div>
              <div class="week-range-value">
                ${result.weekLow52 ? `${result.currency} ${toFixedSafe(result.weekLow52, 2)}` : '—'}
                <span class="week-range-arrow">→</span>
                ${result.weekHigh52 ? `${result.currency} ${toFixedSafe(result.weekHigh52, 2)}` : '—'}
              </div>
              ${result.weekLow52 && result.weekHigh52 ? `
                <div class="mini-range-bar">
                  <div class="mini-range-fill" style="width: ${calculatePercentage(curr, result.weekLow52, result.weekHigh52)}%"></div>
                  <div class="mini-range-marker" style="left: ${calculatePercentage(curr, result.weekLow52, result.weekHigh52)}%"></div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="data-source-badge ${dataSourceBadgeClass}">
            <div class="data-source-label ${dataSourceLabelClass}">
              ${isLivePrice ? '✓ DATA SOURCE' : '⚠ DATA SOURCE'}
            </div>
            <div class="data-source-text ${dataSourceTextClass}">
              ${dataSourceText}
            </div>
            <div class="data-source-subtext">${result.hasRealMetrics ? '✓ Real financial data' : '⚠ Estimates only'}</div>
          </div>
        </div>
      </div>

      <div class="stage-badge ${stage.class}">
        <div class="stage-label">LIFECYCLE STAGE</div>
        <div class="stage-value" style="color: ${stage.color}">${stage.label}</div>
        <div class="stage-confidence">${(result.stageConfidence || '').toUpperCase()} CONFIDENCE</div>
      </div>
    </div>

    <div class="stage-rationale" style="border-left-color: ${stage.color}">
      <span class="stage-rationale-label">STAGE RATIONALE</span> ${result.stageRationale}
    </div>

    <div>
      <div class="section-label">KEY METRICS ${result.hasRealMetrics ? '(REAL DATA)' : '(AI ESTIMATES)'}</div>
      <div class="metrics-grid">
        ${renderMetric('Rev Growth YoY', km.revenueGrowthYoY)}
        ${renderMetric('EBITDA Margin', km.ebitdaMargin)}
        ${renderMetric('Net Margin', km.netMargin || km.profitMargin)}
        ${renderMetric('Free Cash Flow', km.freeCashFlow)}
        ${renderMetric('Net Debt', km.netDebt)}
        ${renderMetric('Dividend Yield', km.dividendYield)}
        ${renderMetric('Trailing P/E', km.trailingPE)}
        ${renderMetric('EV / EBITDA', km.evToEbitda)}
        ${renderMetric('ROE', km.returnOnEquity)}
        ${renderMetric('Beta', km.beta)}
      </div>
    </div>

    ${at.mean ? `
      <div>
        <div class="section-label">ANALYST PRICE TARGETS</div>
        <div class="analyst-targets">
          <div class="targets-bar">
            <div class="targets-range" style="left: ${calculatePercentage(at.low, rMin, rMax)}%; width: ${calculatePercentage(at.high, rMin, rMax) - calculatePercentage(at.low, rMin, rMax)}%"></div>
            <div class="targets-mean" style="left: ${calculatePercentage(at.mean, rMin, rMax)}%"></div>
            <div class="targets-current" style="left: ${calculatePercentage(curr, rMin, rMax)}%"></div>
          </div>
          <div class="targets-labels">
            <span>Low ${result.currency}${toFixedSafe(at.low, 0)}</span>
            <span class="targets-mean-label">Mean ${result.currency}${toFixedSafe(at.mean, 0)}</span>
            <span>High ${result.currency}${toFixedSafe(at.high, 0)}</span>
          </div>
          <div class="targets-footer">
            <div>
              <span class="consensus-label">CONSENSUS</span>
              <span class="consensus-value" style="color: ${consColor}">${at.consensusRating || '—'}</span>
            </div>
            ${at.numberOfAnalysts ? `<span class="analyst-count">${at.numberOfAnalysts} analysts</span>` : ''}
            ${at.mean ? `
              <div class="upside-container">
                <span class="upside-label">Upside to mean</span>
                <span class="upside-value ${upsideClass}">${upsideSign}${upsideToMean}%</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    <div>
      <div class="section-label">VALUATION MODELS</div>
      <div class="valuation-methods">
        ${(result.valuationMethods || []).map((vm, i) => {
          const ud = parseFloat(vm.upDownside);
          const isUp = !isNaN(ud) && ud >= 0;
          const badgeClass = vm.applicability === 'primary' ? 'primary' : 'secondary';
          const confClass = vm.confidence === 'high' ? 'high' : vm.confidence === 'medium' ? 'medium' : 'low';
          
          return `
            <div class="valuation-card">
              <div>
                <div class="valuation-method-header">
                  <span class="valuation-method-name">${vm.method}</span>
                  <span class="valuation-badge ${badgeClass}">${(vm.applicability || '').toUpperCase()}</span>
                  <span class="valuation-confidence ${confClass}">${(vm.confidence || '').toUpperCase()} CONF.</span>
                </div>
                <div class="valuation-assumptions">${vm.assumptions}</div>
              </div>
              <div class="valuation-value-container">
                <div class="valuation-fair-value">${result.currency} ${Number(vm.fairValue).toFixed(2)}</div>
                <div class="valuation-upside ${isUp ? 'positive' : 'negative'}">${vm.upDownside}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div>
      <div class="section-label">VALUATION RANGE</div>
      <div class="football-field">
        <div class="football-bar">
          <div class="football-range" style="left: ${calculatePercentage(bear, rMin, rMax)}%; width: ${calculatePercentage(bull, rMin, rMax) - calculatePercentage(bear, rMin, rMax)}%"></div>
          <div class="football-base" style="left: ${calculatePercentage(base, rMin, rMax)}%"></div>
          <div class="football-current" style="left: ${calculatePercentage(curr, rMin, rMax)}%"></div>
        </div>
        <div class="football-labels">
          <span>Bear ${result.currency}${bear.toFixed(0)}</span>
          <span class="football-base-label">Base ${result.currency}${base.toFixed(0)}</span>
          <span>Bull ${result.currency}${bull.toFixed(0)}</span>
        </div>
        <div class="football-legend">
          <span class="football-current-marker">▼</span> current ${result.currency}${curr.toFixed(2)}
          <span class="football-base-marker" style="margin-left: 16px">│ base case</span>
        </div>
        <div class="football-verdict">${result.valuationSummary?.verdict || ''}</div>
      </div>
    </div>

    ${(result.risks || []).length > 0 ? `
      <div>
        <div class="section-label">KEY RISKS</div>
        <div class="risks-container">
          ${result.risks.map((risk, i) => `
            <div class="risk-card">
              <span class="risk-icon">!</span>${risk}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="disclaimer">
      ⚠ ${result.disclaimer || 'Live price from web search. Financials and valuation are AI estimates — not investment advice.'}
    </div>
  `;
}
