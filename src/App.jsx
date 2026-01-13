import React, { useState, useMemo, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertCircle, 
  Calendar as CalendarIcon,
  DollarSign,
  Clock,
  ChevronLeft,
  ChevronRight,
  List,
  BarChart2,
  PieChart,
  Download,
  Loader2,
  Table
} from 'lucide-react';

/**
 * Trade Analyzer
 * Analyzes trading performance from CSV data.
 */

const TradeAnalyzer = () => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [trades, setTrades] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef(null);

  // --- Template Download Logic ---
  const handleDownloadTemplate = () => {
    const headers = "symbol,trade_type,quantity,price,order_execution_time,order_id,trade_date";
    const rows = [
      "NIFTY24JAN21500CE,buy,50,120.50,2024-01-15T09:15:30,10001,2024-01-15",
      "NIFTY24JAN21500CE,sell,50,145.00,2024-01-15T09:45:00,10002,2024-01-15",
      "TATASTEEL,buy,100,135.00,2024-01-16T10:00:00,10003,2024-01-16",
      "TATASTEEL,sell,100,132.50,2024-01-16T13:30:00,10004,2024-01-16"
    ];
    
    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "trade_analyzer_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- File Handling & Parsing ---

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // --- PDF Export Logic ---
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

      const element = document.getElementById('trade-dashboard-content');
      if (!element) throw new Error("Dashboard element not found");

      const canvas = await window.html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
        ignoreElements: (element) => element.classList.contains('no-export')
      });

      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 297; 
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`Trade_Analyzer_${new Date().toISOString().split('T')[0]}.pdf`);
      
    } catch (err) {
      console.error("PDF Export failed:", err);
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const calculateRealizedPnL = (rawRows, headers) => {
    const findIndexByPriority = (patterns) => {
      for (const pattern of patterns) {
        const idx = headers.findIndex(h => h.includes(pattern));
        if (idx !== -1) return idx;
      }
      return -1;
    };
    
    const idx = {
      symbol: findIndexByPriority(['symbol', 'ticker', 'script']),
      type: findIndexByPriority(['trade_type', 'type', 'side', 'buy/sell']),
      qty: findIndexByPriority(['quantity', 'qty', 'volume']),
      price: findIndexByPriority(['price', 'rate', 'avg_price']),
      date: findIndexByPriority(['order_execution_time', 'time', 'trade_date', 'date']),
      orderId: findIndexByPriority(['order_id', 'orderid', 'order_ref'])
    };

    if (idx.symbol === -1 || idx.type === -1 || idx.qty === -1 || idx.price === -1) {
      throw new Error("Tradebook detected but missing required columns (Symbol, Type, Qty, Price)");
    }

    let parsedRows = rawRows.map((row, i) => {
      const cleanRow = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/['"]+/g, ''));
      if (cleanRow.length < headers.length) return null;

      const dateStr = cleanRow[idx.date];
      let date = new Date(dateStr);
      if (isNaN(date.getTime())) date = new Date();

      return {
        rawDate: date,
        symbol: cleanRow[idx.symbol],
        type: cleanRow[idx.type].toLowerCase(), 
        qty: parseFloat(cleanRow[idx.qty] || 0),
        price: parseFloat(cleanRow[idx.price] || 0),
        orderId: idx.orderId !== -1 ? cleanRow[idx.orderId] : null,
        id: i
      };
    }).filter(r => r && !isNaN(r.qty) && !isNaN(r.price) && r.qty > 0);

    const orderMap = new Map();
    const standaloneRows = [];

    parsedRows.forEach(row => {
      if (row.orderId) {
        const key = `${row.orderId}_${row.type}_${row.symbol}`;
        if (orderMap.has(key)) {
          const existing = orderMap.get(key);
          const totalQty = existing.qty + row.qty;
          const totalVal = (existing.qty * existing.price) + (row.qty * row.price);
          existing.qty = totalQty;
          existing.price = totalVal / totalQty;
          if (row.rawDate < existing.rawDate) existing.rawDate = row.rawDate; 
        } else {
          orderMap.set(key, { ...row });
        }
      } else {
        standaloneRows.push(row);
      }
    });

    const consolidatedRows = [...Array.from(orderMap.values()), ...standaloneRows];
    consolidatedRows.sort((a, b) => a.rawDate - b.rawDate);

    const positions = {}; 
    const realizedTrades = [];

    consolidatedRows.forEach(row => {
      const { symbol, type, qty, price, rawDate } = row;
      
      if (!positions[symbol]) positions[symbol] = { qty: 0, avgPrice: 0 };
      const pos = positions[symbol];

      const isLong = pos.qty > 0;
      const isShort = pos.qty < 0;
      const isBuy = type.includes('buy');
      const isSell = type.includes('sell');

      if ((pos.qty === 0) || (isLong && isBuy) || (isShort && isSell)) {
        const totalValue = (Math.abs(pos.qty) * pos.avgPrice) + (qty * price);
        const totalQty = Math.abs(pos.qty) + qty;
        pos.avgPrice = totalValue / totalQty;
        pos.qty += isBuy ? qty : -qty;
      } 
      else {
        const qtyToClose = Math.min(Math.abs(pos.qty), qty);
        const remainingOrderQty = qty - qtyToClose;

        let tradePnL = 0;
        if (isLong && isSell) {
          tradePnL = (price - pos.avgPrice) * qtyToClose;
          pos.qty -= qtyToClose;
        } else if (isShort && isBuy) {
          tradePnL = (pos.avgPrice - price) * qtyToClose; 
          pos.qty += qtyToClose;
        }

        realizedTrades.push({
          id: `realized_${row.id}_${Math.random()}`,
          date: rawDate,
          symbol: symbol,
          pnl: tradePnL,
          quantity: qtyToClose,
          closePrice: price,
          openPrice: pos.avgPrice,
          type: isBuy ? 'Short Cover' : 'Long Close'
        });

        if (remainingOrderQty > 0) {
          pos.qty = isBuy ? remainingOrderQty : -remainingOrderQty;
          pos.avgPrice = price;
        } else if (pos.qty === 0) {
          pos.avgPrice = 0;
        }
      }
    });

    return realizedTrades;
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("File is empty or has no data rows");

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]+/g, ''));
    
    const hasPnL = headers.some(h => h.includes('pnl') || h.includes('profit') || h.includes('net'));
    const hasQty = headers.some(h => h.includes('quantity') || h.includes('qty'));
    const hasType = headers.some(h => h.includes('trade_type') || h.includes('type'));

    if (!hasPnL && hasQty && hasType) {
      return calculateRealizedPnL(lines.slice(1), headers);
    }

    const pnlIndex = headers.findIndex(h => h.includes('pnl') || h.includes('profit') || h.includes('net'));
    if (pnlIndex === -1) throw new Error("Could not find 'PnL' column. If this is a tradebook, ensure 'Quantity', 'Price', and 'Type' columns exist.");

    const dateIndex = headers.findIndex(h => h.includes('order_execution_time') || h.includes('time') || h.includes('date') || h.includes('closed'));
    const symbolIndex = headers.findIndex(h => h.includes('symbol') || h.includes('ticker'));

    const parsedTrades = lines.slice(1).map((line, idx) => {
      const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/['"]+/g, ''));
      const pnlRaw = values[pnlIndex];
      // FIX: Aggressive cleaning for currency symbols (₹, $, etc)
      const pnl = parseFloat(pnlRaw ? pnlRaw.replace(/[^0-9.-]/g, '') : 0);
      
      let date = new Date();
      if (dateIndex !== -1 && values[dateIndex]) {
        const parsedDate = new Date(values[dateIndex]);
        if (!isNaN(parsedDate)) date = parsedDate;
      }
      const symbol = symbolIndex !== -1 ? values[symbolIndex] : `Trade ${idx + 1}`;

      return {
        id: idx,
        date,
        pnl,
        symbol,
        quantity: values[headers.findIndex(h => h.includes('qty'))] || '-'
      };
    }).filter(t => !isNaN(t.pnl) && t.pnl !== 0);

    // Explicit check for 0 trades after filtering
    if (parsedTrades.length === 0) {
       throw new Error("Columns found, but no valid trades. Check if 'PnL' contains readable numbers.");
    }

    return parsedTrades.sort((a, b) => a.date - b.date);
  };

  const handleFile = (uploadedFile) => {
    setLoading(true);
    setError('');
    setFile(uploadedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsedData = parseCSV(text);
        setTrades(parsedData);
        setLoading(false);
      } catch (err) {
        setError(`Error parsing file: ${err.message}`);
        setLoading(false);
        setTrades([]);
      }
    };
    reader.readAsText(uploadedFile);
  };

  const resetData = () => {
    setFile(null);
    setTrades([]);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  // --- Metrics Calculation ---

  const metrics = useMemo(() => {
    if (trades.length === 0) return null;

    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let maxDrawdown = 0;
    let currentEquity = 0;
    let peakEquity = 0;
    let equityCurve = [];
    
    // Daily Aggregation
    const dailyStats = {};

    trades.forEach(trade => {
      if (trade.pnl > 0) {
        wins++;
        grossProfit += trade.pnl;
      } else {
        losses++;
        grossLoss += Math.abs(trade.pnl);
      }

      currentEquity += trade.pnl;
      if (currentEquity > peakEquity) peakEquity = currentEquity;
      
      const drawdown = peakEquity - currentEquity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      equityCurve.push({ date: trade.date, equity: currentEquity });

      const dateKey = trade.date.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { pnl: 0, count: 0, date: trade.date };
      }
      dailyStats[dateKey].pnl += trade.pnl;
      dailyStats[dateKey].count += 1;
    });

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const lossRate = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
    const avgTradesPerDay = totalTrades / Object.keys(dailyStats).length || 0;

    const days = Object.values(dailyStats);
    const greenDays = days.filter(d => d.pnl > 0);
    const redDays = days.filter(d => d.pnl <= 0);

    const avgDailyWin = greenDays.length > 0 
      ? greenDays.reduce((sum, d) => sum + d.pnl, 0) / greenDays.length 
      : 0;

    const avgDailyLoss = redDays.length > 0
      ? redDays.reduce((sum, d) => sum + d.pnl, 0) / redDays.length
      : 0;
    
    const dailyWinRate = days.length > 0 ? (greenDays.length / days.length) * 100 : 0;

    const avgWinTrade = wins > 0 ? grossProfit / wins : 0;
    const avgLossTrade = losses > 0 ? grossLoss / losses : 0;

    const startDate = trades.length > 0 ? trades[0].date : null;
    const endDate = trades.length > 0 ? trades[trades.length - 1].date : null;

    return {
      totalTrades,
      wins,
      losses,
      winRate,
      lossRate,
      grossProfit,
      grossLoss,
      netProfit: currentEquity,
      maxDrawdown,
      profitFactor,
      avgTradesPerDay,
      equityCurve,
      dailyStats,
      avgDailyWin,
      avgDailyLoss,
      dailyWinRate,
      dailyGreenDays: greenDays.length,
      dailyRedDays: redDays.length,
      avgWinTrade,
      avgLossTrade,
      bestTrade: Math.max(...trades.map(t => t.pnl)),
      worstTrade: Math.min(...trades.map(t => t.pnl)),
      startDate,
      endDate
    };
  }, [trades]);

  // --- Daily Sequence Logic ---
  const dailySequence = useMemo(() => {
    if (trades.length === 0) return null;

    const grouped = {};
    let maxTrades = 0;

    trades.forEach(trade => {
      const dateKey = trade.date.toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(trade);
    });

    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => a.date - b.date);
      if (grouped[key].length > maxTrades) maxTrades = grouped[key].length;
    });

    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

    return { grouped, sortedDates, maxTrades };
  }, [trades]);


  // --- Components ---

  const formatCurrency = (val) => {
    return `₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const StatCard = ({ title, value, subValue, icon: Icon, colorClass }) => {
    const bgColors = {
      'text-emerald-600': 'bg-emerald-100',
      'text-red-600': 'bg-red-100',
      'text-blue-600': 'bg-blue-100',
      'text-purple-600': 'bg-purple-100',
    };
    const bgColor = bgColors[colorClass] || 'bg-slate-100';

    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
          {subValue && <p className={`text-xs mt-2 font-medium ${colorClass}`}>{subValue}</p>}
        </div>
        <div className={`p-3 rounded-lg ${bgColor} ${colorClass}`}>
          <Icon size={20} />
        </div>
      </div>
    );
  };

  const TradeStatsCard = ({ metrics, formatFn }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-1 lg:col-span-2">
      <h4 className="text-sm font-semibold text-slate-500 mb-6 flex items-center gap-2">
         <Activity size={16} /> Trade Performance
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        
        {/* Win Rate Section */}
        <div className="flex flex-col items-center justify-center p-2">
            <span className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-3">Win Rate</span>
            <div className="relative flex items-center justify-center">
              {/* Added explicit style for robust sizing */}
              <svg className="w-24 h-24" style={{ width: '6rem', height: '6rem' }} viewBox="0 0 96 96">
                <g transform="rotate(-90 48 48)">
                  <circle cx="48" cy="48" r="40" stroke="#f1f5f9" strokeWidth="8" fill="none" />
                  <circle cx="48" cy="48" r="40" stroke="#2563eb" strokeWidth="8" fill="none" strokeDasharray={`${metrics.winRate * 2.51} 251`} />
                </g>
              </svg>
              <div className="absolute text-center">
                <span className="block text-xl font-bold text-slate-700">{metrics.winRate.toFixed(1)}%</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-3 font-medium flex gap-3">
                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md">{metrics.wins} Wins</span>
                <span className="px-2 py-1 bg-red-50 text-red-500 rounded-md">{metrics.losses} Losses</span>
            </div>
        </div>

        {/* Averages Section */}
        <div className="flex flex-col justify-center space-y-6 sm:px-6">
           <div>
              <div className="flex justify-between items-end mb-1">
                 <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Avg Win</span>
                 <span className="text-emerald-600 font-bold text-sm">+{formatFn(metrics.avgWinTrade)}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                 <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
              </div>
           </div>
           <div>
              <div className="flex justify-between items-end mb-1">
                 <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Avg Loss</span>
                 <span className="text-red-600 font-bold text-sm">-{formatFn(Math.abs(metrics.avgLossTrade))}</span>
              </div>
               <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                 <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (Math.abs(metrics.avgLossTrade)/metrics.avgWinTrade)*100)}%` }}></div>
              </div>
           </div>
        </div>

        {/* Extremes Section */}
        <div className="flex flex-col justify-center space-y-6 sm:px-6">
             <div className="flex items-center justify-between group">
                <div className="flex flex-col">
                   <span className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">Best Trade</span>
                   <span className="text-emerald-600 font-bold text-lg">+{formatFn(metrics.bestTrade)}</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-100 transition-colors">
                   <TrendingUp size={16} className="text-emerald-600" />
                </div>
             </div>
             <div className="flex items-center justify-between group">
                <div className="flex flex-col">
                   <span className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">Worst Trade</span>
                   <span className="text-red-600 font-bold text-lg">-{formatFn(Math.abs(metrics.worstTrade))}</span>
                </div>
                <div className="p-2 bg-red-50 rounded-lg group-hover:bg-red-100 transition-colors">
                   <TrendingDown size={16} className="text-red-600" />
                </div>
             </div>
        </div>
      </div>
    </div>
  );

  const EquityChart = ({ data }) => {
    const [activePoint, setActivePoint] = useState(null);
    const containerRef = useRef(null);

    if (!data || data.length === 0) return null;
    
    const width = 800;
    const height = 300;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };

    const minVal = Math.min(0, ...data.map(d => d.equity)); 
    const maxVal = Math.max(0, ...data.map(d => d.equity));
    const range = maxVal - minVal || 1;

    // Scale functions
    const getX = (index) => padding.left + (index / (data.length - 1)) * (width - padding.left - padding.right);
    const getY = (val) => height - padding.bottom - ((val - minVal) / range) * (height - padding.top - padding.bottom);

    const points = data.map((d, i) => `${getX(i)},${getY(d.equity)}`).join(' ');
    const zeroLineY = getY(0);

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = width / rect.width;
      const x = (e.clientX - rect.left) * scaleX;
      
      const graphStart = padding.left;
      const graphEnd = width - padding.right;
      const graphWidth = graphEnd - graphStart;

      if (x < graphStart - 10 || x > graphEnd + 10) {
          setActivePoint(null);
          return;
      }

      const ratio = Math.max(0, Math.min(1, (x - graphStart) / graphWidth));
      const index = Math.round(ratio * (data.length - 1));
      
      if (data[index]) {
        setActivePoint({
          x: getX(index),
          y: getY(data[index].equity),
          data: data[index]
        });
      }
    };

    const handleMouseLeave = () => setActivePoint(null);

    return (
      <div className="w-full overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h4 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
          <Activity size={16} /> Cumulative PnL (Equity Curve)
        </h4>
        <div 
          className="relative w-full aspect-[8/3]" 
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
           <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full cursor-crosshair">
            {/* Grid Lines */}
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padding.left} y1={zeroLineY} x2={width - padding.right} y2={zeroLineY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />

            {/* Y Axis Labels */}
            <text x={padding.left - 10} y={padding.top} textAnchor="end" fontSize="10" fill="#64748b" alignmentBaseline="middle">{formatCurrency(maxVal)}</text>
            <text x={padding.left - 10} y={zeroLineY} textAnchor="end" fontSize="10" fill="#64748b" alignmentBaseline="middle">₹0</text>
            <text x={padding.left - 10} y={height - padding.bottom} textAnchor="end" fontSize="10" fill="#64748b" alignmentBaseline="middle">{formatCurrency(minVal)}</text>

            {/* X Axis Labels (First and Last Date) */}
             <text x={padding.left} y={height - 10} textAnchor="start" fontSize="10" fill="#64748b">{data[0]?.date.toLocaleDateString()}</text>
             <text x={width - padding.right} y={height - 10} textAnchor="end" fontSize="10" fill="#64748b">{data[data.length - 1]?.date.toLocaleDateString()}</text>


            {/* Path */}
            <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
            
            {/* Start/End Dots */}
            {data.length > 0 && (
              <>
                 <circle cx={getX(0)} cy={getY(data[0].equity)} r="3" fill="#2563eb" />
                 <circle cx={getX(data.length - 1)} cy={getY(data[data.length - 1].equity)} r="3" fill="#2563eb" />
              </>
            )}

            {/* Tooltip Overlay */}
            {activePoint && (
              <g>
                <line x1={activePoint.x} y1={padding.top} x2={activePoint.x} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 2" />
                <circle cx={activePoint.x} cy={activePoint.y} r="5" fill="#2563eb" stroke="white" strokeWidth="2" />
                
                {/* Tooltip Box */}
                <g transform={`translate(${activePoint.x < width / 2 ? activePoint.x + 10 : activePoint.x - 140}, ${activePoint.y < height / 2 ? activePoint.y : activePoint.y - 60})`}>
                   <rect width="130" height="50" rx="4" fill="rgba(255, 255, 255, 0.95)" stroke="#e2e8f0" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.1))" />
                   <text x="10" y="20" fontSize="10" fill="#64748b" fontWeight="500">
                     {activePoint.data.date.toLocaleDateString()} {activePoint.data.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                   </text>
                   <text x="10" y="38" fontSize="12" fill={activePoint.data.equity >= 0 ? "#059669" : "#dc2626"} fontWeight="bold">
                     {activePoint.data.equity >= 0 ? '+' : ''}{formatCurrency(activePoint.data.equity)}
                   </text>
                </g>
              </g>
            )}
          </svg>
        </div>
      </div>
    );
  };

  const CalendarHeatmap = ({ dailyStats }) => {
    if (!dailyStats) return null;

    const months = useMemo(() => {
      const grouped = {};
      Object.keys(dailyStats).sort().forEach(dateStr => {
        const d = new Date(dateStr);
        const key = `${d.getFullYear()}-${d.getMonth()}`; 
        if (!grouped[key]) grouped[key] = { year: d.getFullYear(), month: d.getMonth(), days: [] };
        grouped[key].days.push({
          day: d.getDate(),
          dateStr,
          data: dailyStats[dateStr]
        });
      });
      return Object.values(grouped);
    }, [dailyStats]);

    const getDayColor = (pnl) => {
      if (pnl > 0) {
        if (pnl > 5000) return 'bg-emerald-600 text-white';
        if (pnl > 2000) return 'bg-emerald-500 text-white';
        if (pnl > 1000) return 'bg-emerald-400 text-white';
        return 'bg-emerald-200 text-emerald-900';
      } else if (pnl < 0) {
         if (pnl < -5000) return 'bg-red-600 text-white';
         if (pnl < -2000) return 'bg-red-500 text-white';
         if (pnl < -1000) return 'bg-red-400 text-white';
         return 'bg-red-200 text-red-900';
      }
      return 'bg-slate-100 text-slate-400';
    };

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h4 className="text-sm font-semibold text-slate-500 mb-6 flex items-center gap-2">
          <CalendarIcon size={16} /> Daily P&L Calendar
        </h4>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {months.map((m) => {
            const date = new Date(m.year, m.month, 1);
            const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            const startDay = date.getDay(); // 0 = Sun
            const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
            
            const gridCells = Array(startDay).fill(null).concat(
              Array.from({ length: daysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const found = m.days.find(d => d.day === dayNum);
                return found || { day: dayNum, data: { pnl: 0, count: 0 } };
              })
            );

            return (
              <div key={`${m.year}-${m.month}`} className="border border-slate-100 rounded-lg p-4">
                <h5 className="font-bold text-slate-700 mb-4 text-center">{monthName}</h5>
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                   {['S','M','T','W','T','F','S'].map((d,i) => (
                     <span key={i} className="text-xs font-semibold text-slate-400">{d}</span>
                   ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {gridCells.map((cell, idx) => (
                    cell === null ? (
                      <div key={`empty-${idx}`} className="aspect-square"></div>
                    ) : (
                      <div 
                        key={cell.day} 
                        className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] sm:text-xs cursor-default group relative ${getDayColor(cell.data.pnl)}`}
                      >
                        <span className="font-medium">{cell.day}</span>
                        {cell.data.pnl !== 0 && (
                          <div className="hidden sm:block opacity-90 scale-75 origin-top">
                             {Math.abs(cell.data.pnl) >= 1000 
                               ? `${(Math.abs(cell.data.pnl)/1000).toFixed(1)}k` 
                               : Math.abs(cell.data.pnl).toFixed(0)}
                          </div>
                        )}
                        
                        {cell.data.pnl !== 0 && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            {cell.data.pnl > 0 ? '+' : ''}{formatCurrency(cell.data.pnl)} ({cell.data.count} trades)
                          </div>
                        )}
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const DailySequenceTable = ({ data }) => {
    if (!data) return null;
    const { grouped, sortedDates, maxTrades } = data;

    return (
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden">
        <h4 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
          <List size={16} /> Daily Trade Sequence
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="p-3 min-w-[120px] sticky left-0 bg-slate-50 border-b border-r border-slate-200 z-10">Date</th>
                <th className="p-3 min-w-[120px] bg-slate-50 border-b border-slate-200 text-center">Net PnL</th>
                {Array.from({ length: maxTrades }).map((_, i) => (
                  <th key={i} className="p-3 min-w-[100px] border-b border-slate-200 text-center font-normal">Trade {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDates.map(date => {
                const dayTrades = grouped[date];
                const dayPnL = dayTrades.reduce((acc, t) => acc + t.pnl, 0);
                
                return (
                  <tr key={date} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white border-r border-slate-100 group-hover:bg-slate-50">
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className={`p-3 font-bold text-center border-r border-slate-100 ${dayPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {dayPnL >= 0 ? '+' : ''}{Math.abs(dayPnL).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                    </td>
                    {Array.from({ length: maxTrades }).map((_, i) => {
                      const trade = dayTrades[i];
                      return (
                        <td key={i} className="p-3 text-center">
                          {trade ? (
                            <div className={`inline-flex flex-col items-center justify-center w-full`}>
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  trade.pnl >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {trade.pnl >= 0 ? '+' : ''}{Math.abs(trade.pnl).toFixed(0)}
                                </span>
                                <span className="text-[10px] text-slate-400 mt-1">
                                    {trade.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                          ) : (
                            <span className="text-slate-200">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-4 md:p-8" id="trade-dashboard-content">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Trade Analyzer</h1>
            <div className="flex flex-col gap-1 mt-1">
               <p className="text-slate-500">
                  Supports <span className="font-semibold text-slate-700">Zerodha Tradebooks</span>
               </p>
               {/* Date Range Display */}
               {metrics && metrics.startDate && (
                 <div className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-100 w-fit px-3 py-1 rounded-full border border-slate-200">
                    <CalendarIcon size={14} className="text-slate-400"/>
                    <span>
                      {metrics.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} 
                      <span className="mx-2 text-slate-400">→</span> 
                      {metrics.endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-xs text-slate-400 ml-1 border-l border-slate-300 pl-2">
                      {Math.ceil((metrics.endDate - metrics.startDate) / (1000 * 60 * 60 * 24)) + 1} Days
                    </span>
                 </div>
               )}
            </div>
          </div>
          {trades.length > 0 && (
            <div className="flex gap-3">
              <button 
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {exporting ? 'Generating...' : 'Export PDF'}
              </button>
              <button 
                onClick={resetData}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg shadow-sm disabled:opacity-75 transition-colors"
              >
                <Upload size={16} /> Upload New File
              </button>
            </div>
          )}
        </div>

        {/* Upload Section */}
        {trades.length === 0 && (
          <div className="w-full max-w-2xl mx-auto mt-12 animate-in fade-in zoom-in duration-300">
            <div 
              className={`
                relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200
                ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'}
                ${loading ? 'opacity-50 pointer-events-none' : ''}
              `}
              onDragEnter={handleDrag} 
              onDragLeave={handleDrag} 
              onDragOver={handleDrag} 
              onDrop={handleDrop}
            >
              {/* File Input - Layer 0 (Hidden but functional for click detection in empty areas) */}
              <input 
                ref={inputRef}
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-0" 
                onChange={handleChange}
                accept=".csv"
              />
              
              {/* Content Container - Layer 1 (Visuals) */}
              <div className="relative z-10 flex flex-col items-center justify-center gap-4 pointer-events-none">
                
                {/* Icon & Heading */}
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-sm">
                  <FileText size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Drop your CSV here</h3>
                  <p className="text-slate-500 mt-2">or click to browse files</p>
                </div>
                
                <div className="w-full max-w-sm border-t border-slate-200 my-2"></div>

                {/* Broker Support Info & Interactive Buttons (Pointer Events Enabled) */}
                <div className="text-sm text-slate-500 max-w-xs mx-auto space-y-4 pointer-events-auto">
                  <div>
                    <p>Using <span className="font-semibold text-slate-700">Zerodha</span>?</p>
                    <p className="text-xs mt-1">
                      Download Tradebook from <a href="https://console.zerodha.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium relative z-20">console.zerodha.com</a>
                    </p>
                  </div>
                  
                  <div>
                    <p>Using <span className="font-semibold text-slate-700">Other Brokers</span>?</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                      className="mt-2 flex items-center justify-center gap-2 mx-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors border border-slate-200 relative z-20 cursor-pointer"
                    >
                      <Table size={14} /> Download CSV Template
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                   <AlertCircle size={12} />
                   <span>Your data remains 100% private. Processing happens locally on your device.</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100">
                <AlertCircle size={20} />
                {error}
              </div>
            )}
            
            {/* Demo Buttons */}
            <div className="mt-8 flex justify-center gap-4">
               <button 
                onClick={() => {
                  const demoTradebook = `trade_date,symbol,trade_type,quantity,price,order_execution_time,order_id
2023-10-01,NIFTY23OCT19500CE,buy,50,100,2023-10-01T09:15:00,1001
2023-10-01,NIFTY23OCT19500CE,sell,50,120,2023-10-01T09:45:00,1002
2023-10-02,BANKNIFTY23OCT44000PE,buy,15,300,2023-10-02T10:00:00,1003
2023-10-02,BANKNIFTY23OCT44000PE,buy,15,280,2023-10-02T10:30:00,1004
2023-10-02,BANKNIFTY23OCT44000PE,sell,30,310,2023-10-02T11:00:00,1005
2023-10-03,RELIANCE,sell,100,2300,2023-10-03T09:20:00,1006
2023-10-03,RELIANCE,buy,100,2290,2023-10-03T14:00:00,1007`;
                  setTrades(parseCSV(demoTradebook));
                }}
                className="text-sm px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium transition-colors"
               >
                 Load Demo Tradebook
               </button>
            </div>
          </div>
        )}

        {/* Dashboard */}
        {metrics && (
          <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* Top Stats Grid (Financials) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard 
                title="Net Profit" 
                value={`${metrics.netProfit >= 0 ? '+' : '-'} ${formatCurrency(metrics.netProfit)}`}
                subValue={`${metrics.totalTrades} Closed Trades`}
                icon={DollarSign}
                colorClass={metrics.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}
              />
               <StatCard 
                title="Max Drawdown" 
                value={`${formatCurrency(metrics.maxDrawdown)}`}
                subValue="Peak to Valley"
                icon={TrendingDown}
                colorClass="text-red-600"
              />
               <StatCard 
                title="Avg Green Day" 
                value={`+${formatCurrency(metrics.avgDailyWin)}`}
                subValue="On winning days"
                icon={TrendingUp}
                colorClass="text-emerald-600"
              />
               <StatCard 
                title="Avg Red Day" 
                value={`-${formatCurrency(Math.abs(metrics.avgDailyLoss))}`}
                subValue="On losing days"
                icon={TrendingDown}
                colorClass="text-red-600"
              />
              <StatCard 
                title="Win Rate (Days)" 
                value={`${metrics.dailyWinRate.toFixed(1)}%`}
                subValue={`${metrics.dailyGreenDays} Green / ${metrics.dailyRedDays} Red`}
                icon={CalendarIcon}
                colorClass="text-blue-600"
              />
            </div>

            {/* Middle Section (Trade Details & Efficiency) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               
               {/* New Consolidated Trade Performance Box (Spans 2 cols) */}
               <TradeStatsCard metrics={metrics} formatFn={formatCurrency} />

               {/* Efficiency Box (Spans 1 col) */}
               <div className="space-y-4">
                 <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-full flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
                        <BarChart2 size={16} /> Efficiency
                      </h4>
                      <div className="space-y-6">
                        <div>
                          <p className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">Profit Factor</p>
                          <p className={`text-3xl font-bold ${metrics.profitFactor > 1.5 ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {metrics.profitFactor.toFixed(2)}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Gross Profit / Gross Loss</p>
                        </div>
                        <div>
                           <p className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">Trade Frequency</p>
                           <p className="text-xl font-bold text-slate-800">{metrics.avgTradesPerDay.toFixed(1)} <span className="text-sm font-normal text-slate-500">trades/day</span></p>
                        </div>
                      </div>
                    </div>
                 </div>
               </div>
            </div>

            {/* Main Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <EquityChart data={metrics.equityCurve} />
                <CalendarHeatmap dailyStats={metrics.dailyStats} />
              </div>
              
              {/* Recent Trades Table (Replaced Cards) */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-0 overflow-hidden flex flex-col h-[600px] lg:col-span-1">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                   <h4 className="text-sm font-semibold text-slate-500 flex items-center gap-2">
                     <FileText size={16} /> Recent Realized Trades
                   </h4>
                </div>
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-sm text-left">
                     <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
                        <tr>
                           <th className="px-4 py-2 font-medium">Symbol</th>
                           <th className="px-4 py-2 font-medium text-right">PnL</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {[...trades].reverse().map((trade) => (
                           <tr key={trade.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                 <div className="font-medium text-slate-700">{trade.symbol}</div>
                                 <div className="text-xs text-slate-400 mt-0.5">
                                    {trade.date.toLocaleDateString()}
                                 </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                 <div className={`font-mono font-bold ${trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {trade.pnl >= 0 ? '+' : ''} {formatCurrency(trade.pnl)}
                                 </div>
                                 {trade.quantity && trade.quantity !== '-' && (
                                     <div className="text-xs text-slate-400">Qty: {trade.quantity}</div>
                                 )}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Daily Sequence Table */}
            <DailySequenceTable data={dailySequence} />

          </div>
        )}
      </div>
    </div>
  );
};

export default TradeAnalyzer;