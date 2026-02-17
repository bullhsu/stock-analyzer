/* ========================================
   美股分析工具 — Main Application Logic
   ======================================== */

(function () {
    'use strict';

    // ---- State ----
    let currentSymbol = '';
    let currentPeriod = '6mo';
    let currentData = null;
    let chart = null;
    let candleSeries = null;
    let volumeSeries = null;
    let ma20Series = null;
    let ma60Series = null;
    let ma120Series = null;

    // ---- DOM ----
    const $ = (sel) => document.querySelector(sel);
    const symbolInput = $('#symbolInput');
    const searchBtn = $('#searchBtn');
    const infoBar = $('#infoBar');
    const placeholder = $('#placeholder');
    const chartContainer = $('#chartContainer');
    const chartMain = $('#chartMain');
    const loadingOverlay = $('#loadingOverlay');
    const toast = $('#toast');
    const maLegend = $('#maLegend');
    const vpCanvas = $('#volumeProfileCanvas');

    // ---- Init ----
    function init() {
        searchBtn.addEventListener('click', handleSearch);
        symbolInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        // Period buttons
        document.querySelectorAll('.period-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentPeriod = btn.dataset.period;
                if (currentSymbol) fetchAndRender(currentSymbol, currentPeriod);
            });
        });

        // MA toggles
        $('#maToggle20').addEventListener('change', (e) => {
            if (ma20Series) ma20Series.applyOptions({ visible: e.target.checked });
        });
        $('#maToggle60').addEventListener('change', (e) => {
            if (ma60Series) ma60Series.applyOptions({ visible: e.target.checked });
        });
        $('#maToggle120').addEventListener('change', (e) => {
            if (ma120Series) ma120Series.applyOptions({ visible: e.target.checked });
        });

        // Resize
        window.addEventListener('resize', handleResize);
    }

    // ---- Search ----
    function handleSearch() {
        const symbol = symbolInput.value.trim().toUpperCase();
        if (!symbol) {
            showToast('請輸入股票代號');
            symbolInput.focus();
            return;
        }
        currentSymbol = symbol;
        fetchAndRender(symbol, currentPeriod);
    }

    // ---- Fetch Data ----
    async function fetchAndRender(symbol, period) {
        showLoading(true);
        try {
            const res = await fetch(`/api/stock/${symbol}?period=${period}`);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || '找不到該股票資料');
            }
            const json = await res.json();
            if (!json.data || json.data.length === 0) {
                throw new Error('該股票無歷史資料');
            }
            currentData = json;
            updateInfoBar(json);
            renderChart(json.data);
            // VP is drawn via chart subscription after renderChart
            placeholder.style.display = 'none';
            chartContainer.style.display = 'flex';
            infoBar.style.display = 'flex';
            maLegend.style.display = 'flex';
        } catch (err) {
            showToast(err.message);
        } finally {
            showLoading(false);
        }
    }

    // ---- Info Bar ----
    function updateInfoBar(json) {
        const info = json.info;
        $('#infoSymbol').textContent = json.symbol;
        $('#infoName').textContent = info.name || '';
        if (info.currentPrice != null) {
            $('#infoPrice').textContent = `$${info.currentPrice.toFixed(2)}`;
        } else {
            const lastBar = json.data[json.data.length - 1];
            $('#infoPrice').textContent = `$${lastBar.close.toFixed(2)}`;
        }

        const changeEl = $('#infoChange');
        if (info.change != null && info.changePercent != null) {
            const sign = info.change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${info.change.toFixed(2)} (${sign}${info.changePercent.toFixed(2)}%)`;
            changeEl.className = `info-change ${info.change >= 0 ? 'up' : 'down'}`;
        } else {
            changeEl.textContent = '';
        }

        $('#infoExchange').textContent = info.exchange ? `📍 ${info.exchange}` : '';
        if (info.volume) {
            $('#infoVolume').textContent = `📊 Vol: ${formatNumber(info.volume)}`;
        }
    }

    // ---- Chart ----
    // Store subscription unsub functions to clean up on re-render
    let vpUnsubscribers = [];

    function renderChart(data) {
        // Clean up previous subscriptions
        vpUnsubscribers.forEach((fn) => fn());
        vpUnsubscribers = [];

        // Destroy existing chart
        if (chart) {
            chart.remove();
            chart = null;
        }

        const container = chartMain;
        const width = container.clientWidth;
        const height = container.clientHeight;

        chart = LightweightCharts.createChart(container, {
            width,
            height,
            layout: {
                background: { type: 'solid', color: '#0f0f1a' },
                textColor: '#9898b0',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.03)' },
                horzLines: { color: 'rgba(255,255,255,0.03)' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: 'rgba(99,102,241,0.3)', labelBackgroundColor: '#6366f1' },
                horzLine: { color: 'rgba(99,102,241,0.3)', labelBackgroundColor: '#6366f1' },
            },
            rightPriceScale: {
                borderColor: 'rgba(255,255,255,0.06)',
                scaleMargins: { top: 0.05, bottom: 0.25 },
            },
            timeScale: {
                borderColor: 'rgba(255,255,255,0.06)',
                timeVisible: false,
            },
        });

        // Candlestick
        candleSeries = chart.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderUpColor: '#22c55e',
            borderDownColor: '#ef4444',
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });
        candleSeries.setData(data);

        // Volume
        const volumeData = data.map((d) => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)',
        }));
        volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeSeries.setData(volumeData);

        // Moving Averages
        ma20Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
        ma60Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
        ma120Series = chart.addLineSeries({ color: '#a855f7', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });

        ma20Series.setData(calcMA(data, 20));
        ma60Series.setData(calcMA(data, 60));
        ma120Series.setData(calcMA(data, 120));

        // Apply visibility from toggles
        ma20Series.applyOptions({ visible: $('#maToggle20').checked });
        ma60Series.applyOptions({ visible: $('#maToggle60').checked });
        ma120Series.applyOptions({ visible: $('#maToggle120').checked });

        chart.timeScale().fitContent();

        // Pre-compute volume profile bins (doesn't change with zoom)
        vpBinData = computeVPBins(data);

        // Subscribe to chart scale changes to keep VP in sync
        // Use a debounced redraw to avoid excessive redraws
        let vpRafId = null;
        const scheduleVPRedraw = () => {
            if (vpRafId) cancelAnimationFrame(vpRafId);
            vpRafId = requestAnimationFrame(() => {
                renderVolumeProfile();
                vpRafId = null;
            });
        };

        // Subscribe to visible range changes (scroll/zoom)
        chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleVPRedraw);
        vpUnsubscribers.push(() => chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleVPRedraw));

        // Also subscribe to crosshair move as a proxy for price scale changes
        chart.subscribeCrosshairMove(scheduleVPRedraw);
        vpUnsubscribers.push(() => chart.unsubscribeCrosshairMove(scheduleVPRedraw));

        // Initial draws: try multiple times to handle layout timing
        setTimeout(() => renderVolumeProfile(), 50);
        setTimeout(() => renderVolumeProfile(), 200);
        setTimeout(() => renderVolumeProfile(), 500);
    }

    // ---- Moving Average ----
    function calcMA(data, period) {
        const result = [];
        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += data[j].close;
            }
            result.push({
                time: data[i].time,
                value: parseFloat((sum / period).toFixed(2)),
            });
        }
        return result;
    }

    // ---- Volume Profile ----
    // Cached bin data (recomputed only when stock/period changes)
    let vpBinData = null;

    function computeVPBins(data) {
        if (!data || data.length === 0) return null;

        let minPrice = Infinity, maxPrice = -Infinity;
        data.forEach((d) => {
            if (d.low < minPrice) minPrice = d.low;
            if (d.high > maxPrice) maxPrice = d.high;
        });

        const priceRange = maxPrice - minPrice;
        if (priceRange <= 0) return null;

        const numBins = 80; // fixed bins for accuracy
        const binSize = priceRange / numBins;
        const bins = new Array(numBins).fill(0);
        const binsBuy = new Array(numBins).fill(0);
        const binsSell = new Array(numBins).fill(0);

        data.forEach((d) => {
            const vol = d.volume;
            const isBuy = d.close > d.open;
            for (let i = 0; i < numBins; i++) {
                const binLow = minPrice + i * binSize;
                const binHigh = binLow + binSize;
                const overlap = Math.max(0, Math.min(d.high, binHigh) - Math.max(d.low, binLow));
                const candleRange = d.high - d.low || 1;
                const proportion = overlap / candleRange;
                const allocated = vol * proportion;
                bins[i] += allocated;
                if (isBuy) binsBuy[i] += allocated;
                else binsSell[i] += allocated;
            }
        });

        const maxVol = Math.max(...bins);
        if (maxVol === 0) return null;

        const sortedVols = [...bins].sort((a, b) => b - a);
        const threshold = sortedVols[Math.floor(numBins * 0.20)] || 0;
        const currentPrice = data[data.length - 1].close;

        return { minPrice, maxPrice, priceRange, numBins, binSize, bins, binsBuy, binsSell, maxVol, threshold, currentPrice };
    }

    function renderVolumeProfile() {
        const canvas = vpCanvas;
        const wrapper = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;

        const rect = wrapper.getBoundingClientRect();
        const headerH = wrapper.querySelector('.vp-header').offsetHeight;
        const legendH = wrapper.querySelector('.vp-legend').offsetHeight;
        const canvasW = rect.width;
        const canvasH = rect.height - headerH - legendH;

        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        canvas.style.width = canvasW + 'px';
        canvas.style.height = canvasH + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, canvasW, canvasH);

        if (!vpBinData || !candleSeries || !chart) return;

        const { minPrice, maxPrice, priceRange, numBins, binSize, bins, binsBuy, binsSell, maxVol, threshold, currentPrice } = vpBinData;

        // Detect mobile: VP is stacked below the chart when its width matches chartMain
        const isMobile = window.innerWidth <= 768;

        let priceToY;
        const vpPadding = { top: 8, bottom: 8 };
        const priceAxisW = isMobile ? 60 : 0;  // Reserve space for price labels on mobile

        if (isMobile) {
            // Standalone mode: self-contained Y mapping with own price scale
            const drawH = canvasH - vpPadding.top - vpPadding.bottom;
            priceToY = (price) => {
                const ratio = (price - minPrice) / priceRange;
                return vpPadding.top + (1 - ratio) * drawH;
            };
        } else {
            // Desktop mode: sync with chart's price coordinates
            const chartRect = chartMain.getBoundingClientRect();
            const vpRect = canvas.getBoundingClientRect();
            const yOffset = chartRect.top - vpRect.top;

            priceToY = (price) => {
                const chartY = candleSeries.priceToCoordinate(price);
                if (chartY === null) return null;
                return chartY + yOffset;
            };

            // Test if coordinate mapping is working
            const testTop = priceToY(maxPrice);
            const testBot = priceToY(minPrice);
            if (testTop === null || testBot === null) return;
        }

        // Drawing area
        const padding = { left: 4, right: 12 + priceAxisW };
        const drawW = canvasW - padding.left - padding.right;

        // Draw each bin
        for (let i = 0; i < numBins; i++) {
            const binLow = minPrice + i * binSize;
            const binHigh = binLow + binSize;

            const y1 = priceToY(binHigh);  // top of bar (higher price = lower Y)
            const y2 = priceToY(binLow);   // bottom of bar

            if (y1 === null || y2 === null) continue;

            const barY = y1;
            const barH = Math.max(y2 - y1 - 1, 1); // -1 for gap between bars

            // Skip bars outside visible area
            if (barY + barH < 0 || barY > canvasH) continue;

            const isHigh = bins[i] >= threshold;
            const barWidth = (bins[i] / maxVol) * drawW;
            const buyWidth = bins[i] > 0 ? (binsBuy[i] / bins[i]) * barWidth : 0;
            const sellWidth = barWidth - buyWidth;

            if (isHigh) {
                ctx.fillStyle = 'rgba(99, 102, 241, 0.7)';
                ctx.fillRect(padding.left, barY, buyWidth, barH);
                ctx.fillStyle = 'rgba(139, 92, 246, 0.7)';
                ctx.fillRect(padding.left + buyWidth, barY, sellWidth, barH);
            } else {
                ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
                ctx.fillRect(padding.left, barY, buyWidth, barH);
                ctx.fillStyle = 'rgba(139, 92, 246, 0.25)';
                ctx.fillRect(padding.left + buyWidth, barY, sellWidth, barH);
            }
        }

        // Current price line
        const currentY = priceToY(currentPrice);
        if (currentY !== null) {
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(padding.left, currentY);
            ctx.lineTo(canvasW - padding.right, currentY);
            ctx.stroke();
            ctx.restore();

            // Draw current price label on mobile
            if (isMobile) {
                const priceLabel = currentPrice.toFixed(priceRange > 100 ? 0 : 2);
                ctx.fillStyle = '#f59e0b';
                ctx.font = `bold 10px 'Inter', sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText(priceLabel, canvasW - priceAxisW + 4, currentY + 3);
            }
        }

        // Mark support/resistance on high-volume bins
        ctx.font = `9px 'Inter', sans-serif`;
        ctx.textAlign = 'left';
        for (let i = 0; i < numBins; i++) {
            if (bins[i] >= threshold) {
                const binMid = minPrice + (i + 0.5) * binSize;
                const y = priceToY(binMid);
                if (y === null || y < 0 || y > canvasH) continue;

                const barWidth = (bins[i] / maxVol) * drawW;
                ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
                const label = binMid < currentPrice ? '支撐' : '壓力';
                ctx.fillText(`◀ ${label}`, padding.left + barWidth + 4, y + 3);
            }
        }

        // Draw price scale on mobile
        if (isMobile) {
            const scaleX = canvasW - priceAxisW;
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(scaleX, 0);
            ctx.lineTo(scaleX, canvasH);
            ctx.stroke();

            // Draw price tick marks
            const numTicks = 6;
            ctx.fillStyle = 'rgba(152, 152, 176, 0.8)';
            ctx.font = `10px 'Inter', sans-serif`;
            ctx.textAlign = 'left';
            const decimals = priceRange > 100 ? 0 : 2;
            for (let t = 0; t <= numTicks; t++) {
                const price = minPrice + (t / numTicks) * priceRange;
                const y = priceToY(price);
                if (y === null) continue;

                ctx.fillText(price.toFixed(decimals), scaleX + 4, y + 3);

                // Light grid line
                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(scaleX, y);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // ---- Helpers ----
    function showLoading(show) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }

    function showToast(msg) {
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }

    function formatNumber(n) {
        if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toString();
    }

    function handleResize() {
        if (chart) {
            chart.applyOptions({
                width: chartMain.clientWidth,
                height: chartMain.clientHeight,
            });
        }
        // VP redraws via subscription, but force one for resize
        if (vpBinData) {
            renderVolumeProfile();
        }
    }

    // ---- Boot ----
    init();
})();
