import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  Clock, 
  UtensilsCrossed,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import type { Bill, CafeSettings } from '../types';
import { getBills } from '../utils/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateAIDailySummary } from '../utils/ai';

interface ReportsProps {
  settings: CafeSettings;
}

export const Reports: React.FC<ReportsProps> = ({
  settings
}) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  // Analytics State
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    foodSalesTotal: 0,
    basementSalesTotal: 0,
    averageBill: 0,
    highestBill: 0,
    lowestBill: 0,
    billCount: 0,
    mainHallRevenue: 0,
    basementRevenue: 0,
  });

  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [foodSalesBreakdown, setFoodSalesBreakdown] = useState<{ name: string; quantity: number; revenue: number }[]>([]);
  const [hourDistribution, setHourDistribution] = useState<{ hour: string; billsCount: number; revenue: number }[]>([]);

  // AI Summary State
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const loadReportsData = async () => {
      const allBills = await getBills();
      setBills(allBills);
      calculateReportMetrics(allBills, reportType);
      
      // Clear active AI summary when report type changes to avoid confusion
      setAiSummary('');
      setSummaryError(null);
    };
    loadReportsData();
  }, [reportType]);

  const calculateReportMetrics = (allBills: Bill[], type: 'daily' | 'weekly' | 'monthly') => {
    // Filter bills based on report type range
    const now = new Date();
    let filtered: Bill[] = [];

    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);

    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0,0,0,0);

    const startOfMonth = new Date();
    startOfMonth.setDate(now.getDate() - 30);
    startOfMonth.setHours(0,0,0,0);

    if (type === 'daily') {
      filtered = allBills.filter(b => new Date(b.exitTime) >= startOfToday);
    } else if (type === 'weekly') {
      filtered = allBills.filter(b => new Date(b.exitTime) >= startOfWeek);
    } else {
      filtered = allBills.filter(b => new Date(b.exitTime) >= startOfMonth);
    }

    setFilteredBills(filtered);

    if (filtered.length === 0) {
      setMetrics({
        totalRevenue: 0,
        foodSalesTotal: 0,
        basementSalesTotal: 0,
        averageBill: 0,
        highestBill: 0,
        lowestBill: 0,
        billCount: 0,
        mainHallRevenue: 0,
        basementRevenue: 0,
      });
      setFoodSalesBreakdown([]);
      setHourDistribution([]);
      return;
    }

    const totalRevenue = filtered.reduce((sum, b) => sum + b.grandTotal, 0);
    const foodSalesTotal = filtered.reduce((sum, b) => sum + b.foodTotal, 0);
    const basementSalesTotal = filtered.reduce((sum, b) => sum + b.basementCharges, 0);
    const billCount = filtered.length;
    const averageBill = totalRevenue / billCount;

    const prices = filtered.map(b => b.grandTotal);
    const highestBill = Math.max(...prices);
    const lowestBill = Math.min(...prices);

    const mainHallRevenue = filtered.filter(b => b.location === 'Main Hall').reduce((sum, b) => sum + b.grandTotal, 0);
    const basementRevenue = filtered.filter(b => b.location === 'Basement').reduce((sum, b) => sum + b.grandTotal, 0);

    setMetrics({
      totalRevenue,
      foodSalesTotal,
      basementSalesTotal,
      averageBill,
      highestBill,
      lowestBill,
      billCount,
      mainHallRevenue,
      basementRevenue
    });

    // Itemized Sales
    const itemsMap: Record<string, { qty: number; rev: number }> = {};
    filtered.forEach(b => {
      b.orderedItems.forEach(item => {
        if (!itemsMap[item.name]) {
          itemsMap[item.name] = { qty: 0, rev: 0 };
        }
        itemsMap[item.name].qty += item.quantity;
        itemsMap[item.name].rev += item.price * item.quantity;
      });
    });

    const breakdown = Object.entries(itemsMap).map(([name, val]) => ({
      name,
      quantity: val.qty,
      revenue: val.rev
    })).sort((a, b) => b.quantity - a.quantity);
    setFoodSalesBreakdown(breakdown);

    // Hourly Distribution
    const hourMap: Record<number, { count: number; rev: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { count: 0, rev: 0 };
    }

    filtered.forEach(b => {
      const date = new Date(b.exitTime);
      const hour = date.getHours();
      if (hourMap[hour]) {
        hourMap[hour].count += 1;
        hourMap[hour].rev += b.grandTotal;
      }
    });

    const hourlyList = Object.entries(hourMap).map(([hour, val]) => {
      const hInt = parseInt(hour, 10);
      const ampm = hInt >= 12 ? 'PM' : 'AM';
      const dispHour = hInt % 12 === 0 ? 12 : hInt % 12;
      return {
        hour: `${dispHour} ${ampm}`,
        billsCount: val.count,
        revenue: val.rev
      };
    }).filter(h => h.billsCount > 0);

    setHourDistribution(hourlyList);
  };

  const handleGenerateAISummary = async () => {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    setAiSummary('');

    try {
      const now = new Date();
      let startOfCurrent = new Date();
      let startOfPrev = new Date();
      let endOfPrev = new Date();

      if (reportType === 'daily') {
        startOfCurrent.setHours(0, 0, 0, 0);

        startOfPrev.setDate(startOfCurrent.getDate() - 1);
        startOfPrev.setHours(0, 0, 0, 0);

        endOfPrev = new Date(startOfCurrent);
      } else if (reportType === 'weekly') {
        startOfCurrent.setDate(now.getDate() - 7);
        startOfCurrent.setHours(0, 0, 0, 0);

        startOfPrev.setDate(now.getDate() - 14);
        startOfPrev.setHours(0, 0, 0, 0);

        endOfPrev = new Date(startOfCurrent);
      } else {
        startOfCurrent.setDate(now.getDate() - 30);
        startOfCurrent.setHours(0, 0, 0, 0);

        startOfPrev.setDate(now.getDate() - 60);
        startOfPrev.setHours(0, 0, 0, 0);

        endOfPrev = new Date(startOfCurrent);
      }

      const currentBillsList = bills.filter(b => new Date(b.exitTime) >= startOfCurrent);
      const prevBillsList = bills.filter(
        b => new Date(b.exitTime) >= startOfPrev && new Date(b.exitTime) < endOfPrev
      );

      if (!settings.groqApiKey || settings.groqApiKey.trim().length === 0) {
        throw new Error('Groq API Key is not set. Please enter your API Key in the Settings tab.');
      }

      const summary = await generateAIDailySummary(
        currentBillsList,
        prevBillsList,
        settings.groqApiKey
      );
      setAiSummary(summary);
    } catch (err: any) {
      setSummaryError(err.message || 'An error occurred while generating AI Insights.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // CSV Exporter for Excel
  const exportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Bill Number,Date,Customer Name,Phone,Seating Location,Seating Charge,Food Total,GST Tax,Grand Total,Payment Method,Status\n';

    filteredBills.forEach((b) => {
      const row = [
        b.billNumber,
        b.date,
        `"${b.customerName}"`,
        b.customerPhone,
        b.location,
        b.basementCharges.toFixed(2),
        b.foodTotal.toFixed(2),
        b.tax.toFixed(2),
        b.grandTotal.toFixed(2),
        b.paymentMethod,
        b.status
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ChapterOneCafe_Sales_Report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Report Compiler
  const exportPDFReport = () => {
    const doc = new jsPDF();
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('CHAPTER ONE CAFE - SALES AUDIT REPORT', 14, 20);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Report Period: ${reportType.toUpperCase()} | Generated: ${new Date().toLocaleString()}`, 14, 26);
    doc.text(`Cafe Location: ${settings.address}`, 14, 30);
    
    doc.setLineWidth(0.2);
    doc.line(14, 33, 196, 33);

    // Grid of Key Financial Statistics
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Financial Overview Metrics', 14, 40);

    autoTable(doc, {
      startY: 43,
      head: [['KPI Indicator', 'Accumulated Valuation']],
      body: [
        ['Total Cumulative Revenue', `${settings.currency}${metrics.totalRevenue.toFixed(2)}`],
        ['Food & Beverage Receipts', `${settings.currency}${metrics.foodSalesTotal.toFixed(2)}`],
        ['Basement Time Charges', `${settings.currency}${metrics.basementSalesTotal.toFixed(2)}`],
        ['Main Hall Dining Total', `${settings.currency}${metrics.mainHallRevenue.toFixed(2)}`],
        ['Average Invoice Valuation', `${settings.currency}${metrics.averageBill.toFixed(2)}`],
        ['Total Orders Settled', `${metrics.billCount} Bills`],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5 }
    });

    // Top Selling Foods
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Product Velocity Breakdown', 14, finalY);

    const fBody = foodSalesBreakdown.map(item => [
      item.name,
      `${item.quantity} Units`,
      `${settings.currency}${item.revenue.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: finalY + 3,
      head: [['Item Name', 'Quantity Sold', 'Gross Revenue']],
      body: fBody.slice(0, 10),
      theme: 'grid',
      styles: { fontSize: 8 }
    });

    doc.save(`Sales_Report_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 select-none animate-fade-in">
      {/* Controls Bar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-apple-gray-100/80 shadow-apple-card gap-4">
        {/* Toggle Filters */}
        <div className="bg-[#f5f5f7] p-1 rounded-xl flex border border-apple-gray-100">
          {(['daily', 'weekly', 'monthly'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                reportType === type
                  ? 'bg-white text-apple-gray-800 shadow-sm'
                  : 'text-[#86868b] hover:text-apple-gray-800'
              }`}
            >
              {type} Report
            </button>
          ))}
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateAISummary}
            disabled={isGeneratingSummary}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Insights</span>
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-apple-gray-100 hover:bg-apple-gray-50 rounded-xl text-xs font-semibold text-apple-gray-800 shadow-sm cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            <span>Export Excel / CSV</span>
          </button>
          
          <button
            onClick={exportPDFReport}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-apple-gray-100 hover:bg-apple-gray-50 rounded-xl text-xs font-semibold text-apple-gray-800 shadow-sm cursor-pointer"
          >
            <FileText className="w-4 h-4 text-red-500" />
            <span>Export Summary PDF</span>
          </button>
        </div>
      </div>

      {/* AI Summary Card */}
      {(isGeneratingSummary || aiSummary || summaryError) && (
        <div className="bg-gradient-to-r from-purple-50/50 via-indigo-50/50 to-blue-50/50 border border-indigo-100 rounded-3xl p-6 shadow-apple-card animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-200/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-apple-gray-800">✨ AI Executive Insights</h4>
                <p className="text-[10px] text-[#86868b] font-medium mt-0.5">
                  Natural-language business intelligence summary ({reportType} report)
                </p>
              </div>
            </div>
            
            {aiSummary && !isGeneratingSummary && (
              <button
                onClick={handleGenerateAISummary}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-apple-gray-50 border border-apple-gray-100 rounded-xl text-[10px] font-bold text-apple-gray-800 shadow-sm cursor-pointer transition-all"
              >
                <RefreshCw className="w-3 h-3 text-indigo-600" />
                <span>Regenerate</span>
              </button>
            )}
          </div>

          <div className="mt-4 border-t border-indigo-50/50 pt-4">
            {isGeneratingSummary ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] text-indigo-600 font-semibold animate-pulse">
                  Analyzing transactions and compiling intelligence report...
                </span>
              </div>
            ) : summaryError ? (
              <div className="flex items-center gap-2 text-red-600 bg-red-50/50 border border-red-100 rounded-2xl p-4 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{summaryError}</span>
              </div>
            ) : (
              <div className="text-xs text-apple-gray-800 leading-relaxed font-light select-text">
                {/* Format markdown bold blocks from Groq Llama summary */}
                {aiSummary.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="mb-2 last:mb-0">
                    {paragraph.split(/(\*\*.*?\*\*)/g).map((part, pIdx) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={pIdx} className="font-bold text-indigo-950">{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    })}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-4 gap-6">
        <div className="apple-card">
          <span className="text-[10px] font-bold text-apple-gray-300 uppercase tracking-wider block">Gross Period Sales</span>
          <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">
            {settings.currency}{metrics.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[10px] text-[#86868b] mt-1">Seating fees + food billing</p>
        </div>

        <div className="apple-card">
          <span className="text-[10px] font-bold text-apple-gray-300 uppercase tracking-wider block">Food Sales Share</span>
          <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">
            {settings.currency}{metrics.foodSalesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[10px] text-green-500 font-semibold mt-1">
            {metrics.totalRevenue > 0 ? ((metrics.foodSalesTotal/metrics.totalRevenue)*100).toFixed(1) : 0}% of gross
          </p>
        </div>

        <div className="apple-card">
          <span className="text-[10px] font-bold text-apple-gray-300 uppercase tracking-wider block">Basement Hourly Share</span>
          <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">
            {settings.currency}{metrics.basementSalesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[10px] text-orange-500 font-semibold mt-1">
            {metrics.totalRevenue > 0 ? ((metrics.basementSalesTotal/metrics.totalRevenue)*100).toFixed(1) : 0}% of gross
          </p>
        </div>

        <div className="apple-card">
          <span className="text-[10px] font-bold text-apple-gray-300 uppercase tracking-wider block">Completed Bills</span>
          <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">
            {metrics.billCount} settlements
          </h3>
          <p className="text-[10px] text-[#86868b] mt-1">
            AOV: {settings.currency}{metrics.averageBill.toFixed(0)} per customer
          </p>
        </div>
      </div>

      {/* Breakdown grids */}
      <div className="grid grid-cols-2 gap-6">
        
        {/* Left: Product velocity table */}
        <div className="apple-card flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-[#86868b]" />
              <span>F&B Product Velocity</span>
            </h4>
            
            <div className="overflow-y-auto max-h-[300px] no-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-apple-gray-50 text-apple-gray-300 font-bold">
                    <th className="pb-2.5">Item Name</th>
                    <th className="pb-2.5 text-center">Volume Sold</th>
                    <th className="pb-2.5 text-right">Revenue Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-50 text-apple-gray-800">
                  {foodSalesBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-20 text-apple-gray-300 italic font-light">
                        No products sold in this period.
                      </td>
                    </tr>
                  ) : (
                    foodSalesBreakdown.map(item => (
                      <tr key={item.name} className="hover:bg-apple-gray-50/50">
                        <td className="py-2.5 font-semibold">{item.name}</td>
                        <td className="py-2.5 text-center font-mono font-medium">{item.quantity} pcs</td>
                        <td className="py-2.5 text-right font-bold">{settings.currency}{item.revenue.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Hourly Activity & occupancy */}
        <div className="apple-card flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#86868b]" />
              <span>Hourly Traffic & Revenue Distribution</span>
            </h4>
            
            <div className="overflow-y-auto max-h-[300px] no-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-apple-gray-50 text-apple-gray-300 font-bold">
                    <th className="pb-2.5">Hour block</th>
                    <th className="pb-2.5 text-center">Checkout Count</th>
                    <th className="pb-2.5 text-right">Sales Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-50 text-apple-gray-800">
                  {hourDistribution.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-20 text-apple-gray-300 italic font-light">
                        No transactions registered in this period.
                      </td>
                    </tr>
                  ) : (
                    hourDistribution.map(item => (
                      <tr key={item.hour} className="hover:bg-apple-gray-50/50">
                        <td className="py-2.5 font-semibold">{item.hour}</td>
                        <td className="py-2.5 text-center font-mono font-medium">{item.billsCount} checkouts</td>
                        <td className="py-2.5 text-right font-bold">{settings.currency}{item.revenue.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
