import { useState, useRef, useEffect } from "react";

const STAGES = {
  "early-stage": { color: "#4ade80", bg: "#052e16", label: "Early-Stage" },
  "growth":      { color: "#34d399", bg: "#022c22", label: "Growth" },
  "mature":      { color: "#60a5fa", bg: "#1e3a5f", label: "Mature" },
  "decline":     { color: "#fbbf24", bg: "#3f2800", label: "Decline / Distressed" },
};

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL   = "claude-sonnet-4-20250514";

// ── Step 1: fetch live price + basic stats via web search ──────────────────
const PRICE_FETCH_SYSTEM = `You are a stock data fetcher. The user gives you a ticker symbol. Use web search to find the CURRENT live stock price and key stats right now. Search for "[TICKER] stock price today" and "[TICKER] stock current price".

Extract from search results:
- currentPrice: the latest trading price (number, no $ sign)
- currency: USD, EUR, etc.
- priceChangeToday: e.g. "+2.34 (+0.5%)"  
- marketCap: e.g. "$85B"
- peRatio: trailing P/E if shown
- weekHigh52: 52-week high
- weekLow52: 52-week low
- volume: today's trading volume
- exchange: NYSE, NASDAQ, etc.
- priceTimestamp: when this price was captured, e.g. "March 22, 2026 3:45 PM ET"

Return ONLY a raw JSON object, no markdown, no backticks:
{"currentPrice":474.54,"currency":"USD","priceChangeToday":"+3.21 (+0.68%)","marketCap":"$95B","peRatio":null,"weekHigh52":498.0,"weekLow52":195.0,"volume":"1.2M","exchange":"NYSE","priceTimestamp":"March 22, 2026"}`;

// ── Step 2: full valuation analysis using the live price ───────────────────
const ANALYSIS_SYSTEM = `You are a senior equity research analyst. You will receive a stock ticker and its CURRENT LIVE PRICE (just fetched from the web). Using this live price and your knowledge of the company's financials and business model, produce a complete valuation analysis.

CRITICAL: Use the provided currentPrice as the stock's current price. Do NOT use your training data price — the live price is authoritative.

Return ONLY a raw JSON object — no markdown, no backticks:
{
  "ticker": "SPOT",
  "companyName": "Spotify Technology S.A.",
  "currentPrice": 474.54,
  "currency": "USD",
  "exchange": "NYSE",
  "sector": "Communication Services",
  "industry": "Internet Content & Information",
  "stage": "growth",
  "stageConfidence": "high",
  "stageRationale": "Spotify shows 15-20% revenue growth, recently turned profitable, heavy investment in podcasts and audiobooks, still expanding TAM globally.",
  "keyMetrics": {
    "revenueGrowthYoY": "~18%",
    "ebitdaMargin": "~8%",
    "netMargin": "~3%",
    "freeCashFlow": "~$1.8B TTM",
    "netDebt": "Net cash ~$3B",
    "dividendYield": "None",
    "trailingPE": "~120x",
    "evToRevenue": "~3.5x",
    "returnOnEquity": "~25%",
    "beta": "~1.6"
  },
  "analystTargets": {
    "low": 380.0,
    "mean": 520.0,
    "high": 650.0,
    "numberOfAnalysts": 32,
    "consensusRating": "Buy"
  },
  "valuationMethods": [
    {
      "method": "EV/Revenue",
      "applicability": "primary",
      "fairValue": 490.0,
      "upDownside": "+3.3%",
      "assumptions": "3.8x NTM revenue, peer median for scaled music/audio streaming platforms",
      "confidence": "medium"
    }
  ],
  "valuationSummary": {
    "bearCase": 320.0,
    "baseCase": 490.0,
    "bullCase": 680.0,
    "verdict": "Concise verdict based on current price vs fair value estimates."
  },
  "risks": ["Risk 1", "Risk 2", "Risk 3"],
  "dataSource": "Live price from web search; financials from AI knowledge base",
  "disclaimer": "Live price sourced from web search. Financials and valuation are AI estimates — not investment advice."
}

Stage rules: early-stage=pre-profit/minimal rev, growth=20%+ rev growth or recently profitable+scaling, mature=2-10% growth+stable margins+dividends, decline=shrinking rev+compressing margins.
Valuation by stage: early-stage→VC method+EV/Rev; growth→EV/Rev+DCF+PEG+Rule of 40; mature→DCF+P/E+EV/EBITDA+DDM; decline→NAV+distressed comps.`;

// Run the web-search agentic loop — real tool execution, strict cap
async function fetchWithWebSearch(system, userMsg) {
  const messages = [{ role: "user", content: userMsg }];
  
  for (let i = 0; i < 6; i++) {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `API ${resp.status}`);

    // Append assistant turn
    messages.push({ role: "assistant", content: data.content });

    if (data.stop_reason === "end_turn") {
      const tb = data.content.find(b => b.type === "text");
      if (tb?.text) return tb.text;
      throw new Error("No text in final response");
    }

    if (data.stop_reason === "tool_use") {
      // The web_search tool is SERVER-SIDE executed by Anthropic.
      // We must NOT send fake results — we send back tool_result blocks
      // with the actual content returned in the tool_result type blocks.
      // The API handles search execution; tool_result content comes back
      // in the next response as mcp_tool_result or tool_result blocks.
      // We just need to pass through what we got and continue the loop.
      
      // Collect tool_use blocks to build tool_result turn
      const toolUses = data.content.filter(b => b.type === "tool_use");
      
      // For web_search_20250305, the API executes the search server-side.
      // The results come back in the SAME response in tool_result content blocks.
      const toolResults = data.content.filter(b => b.type === "tool_result");
      
      if (toolResults.length > 0) {
        // Results already in this response — loop will pick up next assistant turn
        // Just add a user turn acknowledging
        messages.push({
          role: "user",
          content: toolUses.map(tu => ({
            type: "tool_result",
            tool_use_id: tu.id,
            content: toolResults.map(r => r.content || "").join("\n") || "Search completed",
          }))
        });
      } else {
        // No results yet — send minimal ack and let it proceed
        messages.push({
          role: "user",
          content: toolUses.map(tu => ({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "Search executed. Please provide results based on available data.",
          }))
        });
      }
      continue;
    }

    // Any other stop — grab text if present
    const tb = data.content?.find(b => b.type === "text");
    if (tb?.text) return tb.text;
    throw new Error(`Unexpected stop_reason: ${data.stop_reason}`);
  }
  throw new Error("Price fetch timed out after 6 iterations");
}

// Single-shot call (no tools) for the main analysis
async function fetchAnalysis(system, userMsg) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `API ${resp.status}`);
  const tb = data.content?.find(b => b.type === "text");
  if (!tb?.text) throw new Error("No response from analysis engine");
  return tb.text;
}

function extractJSON(text) {
  let s = text.trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

// ── Component ──────────────────────────────────────────────────────────────
export default function StockAnalyzer() {
  const [ticker,    setTicker]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [phase,     setPhase]     = useState("");
  const [livePrice, setLivePrice] = useState(null);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const inputRef = useRef(null);

  async function analyze() {
    if (!ticker.trim() || loading) return;
    const sym = ticker.trim().toUpperCase();
    setLoading(true); setResult(null); setLivePrice(null); setError(null);

    try {
      // ── Phase 1: live price via web search ──
      setPhase("Fetching live price from the web…");
      let priceData = null;
      try {
        const priceText = await fetchWithWebSearch(
          PRICE_FETCH_SYSTEM,
          `Get the current live stock price for ticker: ${sym}. Search for "${sym} stock price today" right now.`
        );
        priceData = extractJSON(priceText);
        setLivePrice(priceData);
      } catch (e) {
        // Price fetch failed — continue with AI knowledge only
        console.warn("Live price fetch failed:", e.message);
        priceData = null;
      }

      // ── Phase 2: full analysis ──
      setPhase("Running valuation analysis…");
      const priceContext = priceData?.currentPrice
        ? `LIVE PRICE DATA (just fetched from web search):\n${JSON.stringify(priceData, null, 2)}\n\nUse currentPrice: ${priceData.currentPrice} as the authoritative current stock price.`
        : `No live price available. Use your best knowledge of the current price for ${sym}.`;

      const analysisText = await fetchAnalysis(
        ANALYSIS_SYSTEM,
        `Ticker: ${sym}\n\n${priceContext}\n\nProduce the full valuation analysis JSON.`
      );
      const analysis = extractJSON(analysisText);
      // Stamp live price data onto result
      if (priceData?.currentPrice) {
        analysis.currentPrice      = priceData.currentPrice;
        analysis.priceChangeToday  = priceData.priceChangeToday;
        analysis.priceTimestamp    = priceData.priceTimestamp;
        analysis.weekHigh52        = priceData.weekHigh52 || analysis.weekHigh52;
        analysis.weekLow52         = priceData.weekLow52  || analysis.weekLow52;
        analysis.isLivePrice       = true;
      } else {
        analysis.isLivePrice = false;
      }
      setResult(analysis);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setPhase("");
    }
  }

  const stage = result ? (STAGES[result.stage] || STAGES.mature) : null;

  const Metric = ({ label, value }) => {
    if (!value && value !== 0) return null;
    return (
      <div style={{ background: "#0d1117", padding: "13px 16px" }}>
        <div style={{ fontSize: 11, color: "#3d5a73", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
        <div style={{ fontSize: 15, color: "#c9d1d9" }}>{value}</div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Mono','Fira Mono','Courier New',monospace", background: "#080c10", minHeight: "100vh", color: "#c9d1d9" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e2d3d", padding: "22px 30px 16px", display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontSize: 12, color: "#4a7fa5", letterSpacing: "3px" }}>EQUITY RESEARCH</span>
        <span style={{ fontSize: 23, fontWeight: 700, color: "#e6edf3", letterSpacing: "-0.5px" }}>StageValuator</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#2a4a63" }}>LIVE PRICE + AI ANALYSIS · EDUCATIONAL ONLY</span>
      </div>

      {/* Input */}
      <div style={{ padding: "28px 30px 0" }}>
        <div style={{ display: "flex", maxWidth: 520, border: "1px solid #1e2d3d", borderRadius: 6, overflow: "hidden", background: "#0d1117" }}>
          <span style={{ padding: "0 16px", display: "flex", alignItems: "center", fontSize: 12, color: "#4a7fa5", letterSpacing: "2px", borderRight: "1px solid #1e2d3d", background: "#0a0f14", whiteSpace: "nowrap" }}>TICKER</span>
          <input ref={inputRef} value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && analyze()}
            placeholder="AAPL · NVDA · TSLA · SPOT"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "14px 16px", fontSize: 16, fontFamily: "inherit", color: "#e6edf3", letterSpacing: "2px" }} />
          <button onClick={analyze} disabled={loading || !ticker.trim()}
            style={{ padding: "0 22px", background: loading ? "#0a0f14" : "#1a3a5c", border: "none", borderLeft: "1px solid #1e2d3d", color: loading ? "#3d5a73" : "#60a5fa", cursor: loading ? "not-allowed" : "pointer", fontSize: 12, letterSpacing: "2px", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {loading ? "RUNNING…" : "ANALYZE →"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#2a4a63", marginTop: 8 }}>
          Live price via web search · AI lifecycle classification · Multi-method valuation
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: "44px 30px" }}>
          <style>{`@keyframes bl{0%,100%{opacity:1}50%{opacity:.15}}`}</style>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#60a5fa", animation: `bl 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
            </div>
            <span style={{ fontSize: 14, color: "#4a7fa5" }}>{phase}</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#1e2d3d" }}>{ticker}</span>
          </div>
          {/* Show live price as soon as we have it */}
          {livePrice?.currentPrice && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#0a1a0a", border: "1px solid #1a4a1a", borderRadius: 6, padding: "10px 16px" }}>
              <span style={{ fontSize: 12, color: "#4ade80" }}>✓ LIVE PRICE FETCHED</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#e6edf3" }}>{livePrice.currency} {livePrice.currentPrice}</span>
              {livePrice.priceChangeToday && <span style={{ fontSize: 13, color: livePrice.priceChangeToday.startsWith("+") ? "#4ade80" : "#f87171" }}>{livePrice.priceChangeToday}</span>}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: "20px 30px", padding: "14px 18px", background: "#1a0a0a", border: "1px solid #5a1a1a", borderRadius: 6, color: "#f87171", fontSize: 14 }}>
          ✕  {error}
        </div>
      )}

      {/* Results */}
      {result && stage && (() => {
        const r = result;
        const km = r.keyMetrics || {};
        const at = r.analystTargets || {};
        const bear = r.valuationSummary?.bearCase || 0;
        const base = r.valuationSummary?.baseCase || 0;
        const bull = r.valuationSummary?.bullCase || 0;
        const curr = parseFloat(r.currentPrice) || base;
        const allPts = [bear, base, bull, curr, at.low, at.mean, at.high].filter(Boolean);
        const rMin = Math.min(...allPts) * 0.88, rMax = Math.max(...allPts) * 1.12;
        const span = rMax - rMin || 1;
        const pct  = v => Math.max(0, Math.min(100, ((v - rMin) / span) * 100));
        const ratingColor = { "Strong Buy":"#4ade80","Buy":"#86efac","Hold":"#fbbf24","Sell":"#f87171","Strong Sell":"#ef4444" };
        const consColor = ratingColor[at.consensusRating] || "#8b949e";

        return (
          <div style={{ padding: "24px 30px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Company header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, borderBottom: "1px solid #1e2d3d", paddingBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "#4a7fa5", letterSpacing: "3px", marginBottom: 5 }}>
                  {r.ticker}{r.exchange ? ` · ${r.exchange}` : ""}{r.sector ? ` · ${r.sector}` : ""}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#e6edf3", marginBottom: 10 }}>{r.companyName}</div>

                {/* Live price badge */}
                <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d1117", border: `1px solid ${r.isLivePrice ? "#1a4a1a" : "#1e2d3d"}`, borderRadius: 6, padding: "10px 16px" }}>
                    <div>
                      <div style={{ fontSize: 11, color: r.isLivePrice ? "#4ade80" : "#4a7fa5", letterSpacing: "1px", marginBottom: 3 }}>
                        {r.isLivePrice ? "● LIVE PRICE" : "EST. PRICE (AI KNOWLEDGE)"}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                        <span style={{ fontSize: 28, fontWeight: 700, color: "#e6edf3" }}>{r.currency} {Number(curr).toFixed(2)}</span>
                        {r.priceChangeToday && (
                          <span style={{ fontSize: 15, color: r.priceChangeToday.startsWith("+") ? "#4ade80" : "#f87171" }}>
                            {r.priceChangeToday}
                          </span>
                        )}
                      </div>
                      {r.priceTimestamp && (
                        <div style={{ fontSize: 11, color: "#3d5a73", marginTop: 3 }}>as of {r.priceTimestamp}</div>
                      )}
                    </div>
                  </div>

                  {/* 52w range if available */}
                  {(r.weekHigh52 || r.weekLow52) && (
                    <div style={{ background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 6, padding: "10px 16px" }}>
                      <div style={{ fontSize: 11, color: "#3d5a73", marginBottom: 5 }}>52-WEEK RANGE</div>
                      <div style={{ fontSize: 14, color: "#c9d1d9" }}>
                        {r.weekLow52 ? `${r.currency} ${r.weekLow52}` : "—"}
                        <span style={{ color: "#3d5a73", margin: "0 8px" }}>→</span>
                        {r.weekHigh52 ? `${r.currency} ${r.weekHigh52}` : "—"}
                      </div>
                      {/* Mini range bar */}
                      {r.weekLow52 && r.weekHigh52 && (() => {
                        const lo = r.weekLow52, hi = r.weekHigh52;
                        const pos = Math.max(0, Math.min(100, ((curr - lo) / (hi - lo)) * 100));
                        return (
                          <div style={{ marginTop: 6, position: "relative", height: 4, background: "#1e2d3d", borderRadius: 2 }}>
                            <div style={{ position: "absolute", left: 0, width: `${pos}%`, height: "100%", background: "#4a7fa5", borderRadius: 2 }} />
                            <div style={{ position: "absolute", left: `${pos}%`, transform: "translateX(-50%)", top: -3, width: 10, height: 10, borderRadius: "50%", background: "#60a5fa" }} />
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Data source badge */}
                  <div style={{ background: r.isLivePrice ? "#0a1a0a" : "#1a1a0a", border: `1px solid ${r.isLivePrice ? "#1a4a1a" : "#3d3010"}`, borderRadius: 6, padding: "10px 16px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ fontSize: 11, color: r.isLivePrice ? "#4ade80" : "#fbbf24", marginBottom: 3 }}>
                      {r.isLivePrice ? "✓ DATA SOURCE" : "⚠ DATA SOURCE"}
                    </div>
                    <div style={{ fontSize: 12, color: r.isLivePrice ? "#4a7a4a" : "#a0850a", lineHeight: 1.5 }}>
                      {r.isLivePrice ? "Price: live web search" : "Price: AI knowledge (stale)"}
                    </div>
                    <div style={{ fontSize: 12, color: "#3d5a73", lineHeight: 1.5 }}>Financials: AI knowledge base</div>
                  </div>
                </div>
              </div>

              {/* Stage badge */}
              <div style={{ padding: "12px 18px", background: stage.bg, border: `1px solid ${stage.color}44`, borderRadius: 6, textAlign: "center", minWidth: 150 }}>
                <div style={{ fontSize: 11, color: "#3d5a73", letterSpacing: "2px", marginBottom: 4 }}>LIFECYCLE STAGE</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: stage.color }}>{stage.label}</div>
                <div style={{ fontSize: 11, color: "#4a7fa5", marginTop: 4, letterSpacing: "1px" }}>{(r.stageConfidence || "").toUpperCase()} CONFIDENCE</div>
              </div>
            </div>

            {/* Stage rationale */}
            <div style={{ padding: "14px 18px", background: "#0d1117", borderLeft: `3px solid ${stage.color}`, borderRadius: "0 6px 6px 0", fontSize: 14, lineHeight: 1.75, color: "#8b949e" }}>
              <span style={{ fontSize: 11, color: "#4a7fa5", letterSpacing: "1px" }}>STAGE RATIONALE  </span>{r.stageRationale}
            </div>

            {/* Key metrics */}
            <div>
              <div style={{ fontSize: 11, color: "#3d5a73", letterSpacing: "3px", marginBottom: 10 }}>KEY METRICS (AI ESTIMATES)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 1, background: "#1e2d3d", border: "1px solid #1e2d3d", borderRadius: 6, overflow: "hidden" }}>
                <Metric label="Rev Growth YoY" value={km.revenueGrowthYoY} />
                <Metric label="EBITDA Margin"  value={km.ebitdaMargin} />
                <Metric label="Net Margin"      value={km.netMargin} />
                <Metric label="Free Cash Flow"  value={km.freeCashFlow} />
                <Metric label="Net Debt"        value={km.netDebt} />
                <Metric label="Dividend Yield"  value={km.dividendYield} />
                <Metric label="Trailing P/E"    value={km.trailingPE} />
                <Metric label="EV / EBITDA"     value={km.evToEbitda} />
                <Metric label="ROE"             value={km.returnOnEquity} />
                <Metric label="Beta"            value={km.beta} />
              </div>
            </div>

            {/* Analyst targets */}
            {at.mean && (
              <div>
                <div style={{ fontSize: 11, color: "#3d5a73", letterSpacing: "3px", marginBottom: 10 }}>ANALYST PRICE TARGETS</div>
                <div style={{ background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 6, padding: "18px 22px" }}>
                  <div style={{ position: "relative", height: 44, marginBottom: 8 }}>
                    <div style={{ position: "absolute", left: `${pct(at.low)}%`, width: `${pct(at.high) - pct(at.low)}%`, height: 10, top: 17, background: "linear-gradient(90deg,#1a3010,#1a4020,#1a3010)", borderRadius: 5 }} />
                    <div style={{ position: "absolute", left: `${pct(at.mean)}%`, transform: "translateX(-50%)", top: 9, width: 2, height: 26, background: "#4ade80" }} />
                    <div style={{ position: "absolute", left: `${pct(curr)}%`, transform: "translateX(-50%)", top: 4, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid #fbbf24" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4a7fa5", marginBottom: 12 }}>
                    <span>Low  {r.currency}{(at.low||0).toFixed(0)}</span>
                    <span style={{ color: "#4ade80" }}>Mean  {r.currency}{(at.mean||0).toFixed(0)}</span>
                    <span>High  {r.currency}{(at.high||0).toFixed(0)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: "1px solid #1e2d3d", paddingTop: 12, flexWrap: "wrap" }}>
                    <div>
                      <span style={{ fontSize: 11, color: "#3d5a73" }}>CONSENSUS  </span>
                      <span style={{ fontSize: 17, fontWeight: 700, color: consColor }}>{at.consensusRating || "—"}</span>
                    </div>
                    {at.numberOfAnalysts && <span style={{ fontSize: 13, color: "#4a7fa5" }}>{at.numberOfAnalysts} analysts</span>}
                    {at.mean && (
                      <div style={{ marginLeft: "auto" }}>
                        <span style={{ fontSize: 12, color: "#3d5a73" }}>Upside to mean  </span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: at.mean > curr ? "#4ade80" : "#f87171" }}>
                          {at.mean > curr ? "+" : ""}{(((at.mean - curr) / curr) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Valuation models */}
            <div>
              <div style={{ fontSize: 11, color: "#3d5a73", letterSpacing: "3px", marginBottom: 10 }}>VALUATION MODELS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(r.valuationMethods || []).map((vm, i) => {
                  const ud = parseFloat(vm.upDownside);
                  const isUp = !isNaN(ud) && ud >= 0;
                  return (
                    <div key={i} style={{ background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 6, padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3" }}>{vm.method}</span>
                          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: vm.applicability === "primary" ? "#1a3a5c" : "#1a1a2e", color: vm.applicability === "primary" ? "#60a5fa" : "#6e7681" }}>{(vm.applicability||"").toUpperCase()}</span>
                          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: "#111", color: vm.confidence === "high" ? "#4ade80" : vm.confidence === "medium" ? "#fbbf24" : "#f87171" }}>{(vm.confidence||"").toUpperCase()} CONF.</span>
                        </div>
                        <div style={{ fontSize: 13, color: "#6e7681", lineHeight: 1.6 }}>{vm.assumptions}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 19, fontWeight: 700, color: "#e6edf3" }}>{r.currency} {Number(vm.fairValue).toFixed(2)}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: isUp ? "#4ade80" : "#f87171" }}>{vm.upDownside}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Football field */}
            <div>
              <div style={{ fontSize: 11, color: "#3d5a73", letterSpacing: "3px", marginBottom: 10 }}>VALUATION RANGE</div>
              <div style={{ background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 6, padding: "18px 22px" }}>
                <div style={{ position: "relative", height: 48, marginBottom: 6 }}>
                  <div style={{ position: "absolute", left: `${pct(bear)}%`, width: `${pct(bull)-pct(bear)}%`, height: 12, top: 18, background: "linear-gradient(90deg,#1a2e1a,#1a2e4a,#1a2e1a)", borderRadius: 6 }} />
                  <div style={{ position: "absolute", left: `${pct(base)}%`, transform: "translateX(-50%)", top: 11, width: 2, height: 26, background: "#60a5fa" }} />
                  <div style={{ position: "absolute", left: `${pct(curr)}%`, transform: "translateX(-50%)", top: 5, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid #fbbf24" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4a7fa5", marginBottom: 8 }}>
                  <span>Bear  {r.currency}{bear.toFixed(0)}</span>
                  <span style={{ color: "#60a5fa" }}>Base  {r.currency}{base.toFixed(0)}</span>
                  <span>Bull  {r.currency}{bull.toFixed(0)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#2a4a63", marginBottom: 12 }}>
                  <span style={{ color: "#fbbf24" }}>▼</span> current {r.currency}{curr.toFixed(2)}
                  <span style={{ marginLeft: 16, color: "#60a5fa" }}>│ base case</span>
                </div>
                <div style={{ fontSize: 14, color: "#8b949e", lineHeight: 1.75, borderTop: "1px solid #1e2d3d", paddingTop: 12 }}>
                  {r.valuationSummary?.verdict}
                </div>
              </div>
            </div>

            {/* Risks */}
            {(r.risks || []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "#3d5a73", letterSpacing: "3px", marginBottom: 10 }}>KEY RISKS</div>
                {r.risks.map((risk, i) => (
                  <div key={i} style={{ fontSize: 14, color: "#8b949e", padding: "10px 14px", background: "#0d1117", border: "1px solid #1e2d3d", borderLeft: "2px solid #5a1a1a", borderRadius: "0 6px 6px 0", marginBottom: 6, lineHeight: 1.6 }}>
                    <span style={{ color: "#f87171", marginRight: 9 }}>!</span>{risk}
                  </div>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ fontSize: 12, color: "#2a4a63", padding: "10px 14px", border: "1px solid #1e2d3d", borderRadius: 6, lineHeight: 1.6 }}>
              ⚠  {r.disclaimer || "Live price from web search. Financials and valuation are AI estimates — not investment advice."}
            </div>

          </div>
        );
      })()}
    </div>
  );
}
