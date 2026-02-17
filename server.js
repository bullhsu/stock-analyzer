import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper: fetch with user-agent to avoid blocks
async function fetchYahoo(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`Yahoo API returned ${res.status}`);
  return res;
}

// Helper: detect and normalize stock symbol
function normalizeSymbol(raw) {
  let sym = raw.toUpperCase().trim();
  // Taiwan stocks: pure digits (e.g. 2330) → 2330.TW
  if (/^\d{4,6}$/.test(sym)) {
    sym = sym + '.TW';
  }
  return sym;
}

// API: Get stock historical data
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '6mo', interval = '1d' } = req.query;
    const sym = normalizeSymbol(symbol);

    // Calculate date range
    const endDate = Math.floor(Date.now() / 1000);
    let startDate;
    const now = new Date();
    switch (period) {
      case '1mo': startDate = Math.floor(new Date(now.setMonth(now.getMonth() - 1)).getTime() / 1000); break;
      case '3mo': startDate = Math.floor(new Date(now.setMonth(now.getMonth() - 3)).getTime() / 1000); break;
      case '6mo': startDate = Math.floor(new Date(now.setMonth(now.getMonth() - 6)).getTime() / 1000); break;
      case '1y': startDate = Math.floor(new Date(now.setFullYear(now.getFullYear() - 1)).getTime() / 1000); break;
      case '2y': startDate = Math.floor(new Date(now.setFullYear(now.getFullYear() - 2)).getTime() / 1000); break;
      case '5y': startDate = Math.floor(new Date(now.setFullYear(now.getFullYear() - 5)).getTime() / 1000); break;
      default: startDate = Math.floor(new Date(now.setMonth(now.getMonth() - 6)).getTime() / 1000);
    }

    // Fetch chart data from Yahoo Finance v8 API
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${startDate}&period2=${endDate}&interval=${interval}&includePrePost=false`;
    const chartRes = await fetchYahoo(chartUrl);
    const chartJson = await chartRes.json();

    if (!chartJson.chart || !chartJson.chart.result || chartJson.chart.result.length === 0) {
      return res.status(404).json({ error: `No data found for symbol: ${sym}` });
    }

    const result = chartJson.chart.result[0];
    const meta = result.meta;
    const timestamps = result.timestamp;
    const ohlcv = result.indicators.quote[0];

    if (!timestamps || timestamps.length === 0) {
      return res.status(404).json({ error: `No historical data for ${sym}` });
    }

    // Format OHLCV data
    const data = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = ohlcv.open[i];
      const h = ohlcv.high[i];
      const l = ohlcv.low[i];
      const c = ohlcv.close[i];
      const v = ohlcv.volume[i];
      if (o == null || h == null || l == null || c == null) continue;

      const date = new Date(timestamps[i] * 1000);
      const dateStr = date.toISOString().split('T')[0];
      data.push({
        time: dateStr,
        open: parseFloat(o.toFixed(2)),
        high: parseFloat(h.toFixed(2)),
        low: parseFloat(l.toFixed(2)),
        close: parseFloat(c.toFixed(2)),
        volume: v || 0,
      });
    }

    // Build info object from meta
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const change = currentPrice && previousClose ? currentPrice - previousClose : null;
    const changePercent = change && previousClose ? (change / previousClose) * 100 : null;

    const info = {
      name: meta.shortName || meta.longName || sym,
      exchange: meta.exchangeName || '',
      currency: meta.currency || 'USD',
      currentPrice: currentPrice,
      change: change,
      changePercent: changePercent,
      volume: meta.regularMarketVolume || null,
    };

    res.json({ symbol: sym, info, data });
  } catch (error) {
    console.error('Error fetching stock data:', error.message);
    res.status(500).json({ error: `Failed to fetch data for ${req.params.symbol}: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Stock Analyzer running at http://localhost:3000`);
});
