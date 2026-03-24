// ── Company Stage Determination ──────────────────────────────────────

function determineStage(priceData) {
  const pe = priceData.peRatio ? parseFloat(priceData.peRatio) : 0;
  const priceChange = priceData.priceChangeToday || '';
  const isPositive = priceChange.includes('+');
  
  // Check known companies first
  if (KNOWN_STAGES[priceData.ticker]) {
    return {
      stage: KNOWN_STAGES[priceData.ticker],
      confidence: 'high',
      rationale: getStageRationale(KNOWN_STAGES[priceData.ticker], priceData)
    };
  }
  
  // Use REAL metrics for stage determination
  if (pe > 50 || pe === 0) {
    return {
      stage: 'early-stage',
      confidence: 'medium',
      rationale: 'High or negative P/E suggests pre-profitability or early growth phase.'
    };
  } else if (pe > 25 && isPositive) {
    return {
      stage: 'growth',
      confidence: 'medium',
      rationale: 'Moderate-high P/E with positive momentum indicates growth phase.'
    };
  } else if (pe > 10 && pe <= 25) {
    return {
      stage: 'mature',
      confidence: 'medium',
      rationale: 'Reasonable P/E ratio suggests mature company with stable earnings.'
    };
  } else {
    return {
      stage: 'decline',
      confidence: 'low',
      rationale: 'Low P/E may indicate value trap or declining business.'
    };
  }
}

function getStageRationale(stage, priceData) {
  const rationales = {
    'early-stage': 'Company shows early growth characteristics with high reinvestment rate. Revenue growth prioritized over profitability.',
    'growth': 'Strong revenue growth with improving margins. Company scaling operations and gaining market share.',
    'mature': 'Stable revenue growth with consistent profitability. Established market position with potential dividend payments.',
    'decline': 'Revenue contraction or margin compression observed. Company facing competitive pressures.'
  };
  return rationales[stage] || rationales['mature'];
}
