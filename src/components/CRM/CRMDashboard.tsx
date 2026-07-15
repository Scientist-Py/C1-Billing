import React from 'react';
import { 
  Users, 
  UserCheck, 
  UserPlus, 
  DollarSign, 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Send,
  Star,
  Award
} from 'lucide-react';
import type { Bill, CRMProfile } from '../../types';
import type { WhatsAppMessage } from '../../utils/whatsappCloud';
import { getLoyaltyTier } from '../../utils/loyalty';

interface CRMDashboardProps {
  bills: Bill[];
  profiles: CRMProfile[];
  messages: WhatsAppMessage[];
  currency: string;
  onSelectCustomer: (profile: CRMProfile) => void;
}

export const CRMDashboard: React.FC<CRMDashboardProps> = ({ 
  bills, 
  profiles, 
  messages = [], 
  currency, 
  onSelectCustomer 
}) => {
  
  // 1. Core Financials
  const totalSpend = profiles.reduce((acc, curr) => acc + curr.totalLifetimeSpend, 0);
  const averageSpend = profiles.length > 0 ? totalSpend / profiles.length : 0;

  // 2. New vs Returning logic
  const newCustomers = profiles.filter((p) => p.visitCount === 1);

  // 3. Today's visitors based on bills
  const todayStr = new Date().toLocaleDateString('en-CA');
  const todayBills = bills.filter((b) => b.date === todayStr);
  const todayUniquePhones = new Set(todayBills.map((b) => b.customerPhone));
  const todayCoversCount = todayUniquePhones.size;

  // 4. Unread Messages in Inbox
  const unreadMessagesCount = profiles.filter((p) => p.readStatus === 'unread').length;

  // 5. WhatsApp Message Analytics Calculations
  const outgoingMessages = messages.filter(m => m.direction === 'outgoing');

  // A. Invoice Templates Analytics
  const invoiceMessages = outgoingMessages.filter(
    m => m.templateName === 'invoice_receipt' || 
         m.messageText.includes('invoice') || 
         m.messageText.includes('Order #')
  );
  const invoiceSentCount = invoiceMessages.filter(m => m.deliveryStatus !== 'scheduled').length;
  const invoiceReadCount = invoiceMessages.filter(m => m.deliveryStatus === 'read').length;
  const invoiceFailedCount = invoiceMessages.filter(m => m.deliveryStatus === 'failed').length;

  // B. Google Review Templates Analytics
  const reviewMessages = outgoingMessages.filter(
    m => m.templateName === 'google_review_request' || 
         m.messageText.includes('review') || 
         m.messageText.includes('feedback') ||
         m.messageText.includes('share your review')
  );
  const reviewScheduledCount = reviewMessages.filter(m => m.deliveryStatus === 'scheduled').length;
  const reviewSentCount = reviewMessages.filter(m => m.deliveryStatus !== 'scheduled' && m.deliveryStatus !== 'failed').length;
  const reviewReadCount = reviewMessages.filter(m => m.deliveryStatus === 'read').length;
  const reviewFailedCount = reviewMessages.filter(m => m.deliveryStatus === 'failed').length;

  // C. Overall Delivery Rate
  const totalAttempted = outgoingMessages.filter(m => m.deliveryStatus !== 'scheduled').length;
  const totalFailed = outgoingMessages.filter(m => m.deliveryStatus === 'failed').length;
  const waDeliveryRate = totalAttempted > 0 ? ((totalAttempted - totalFailed) / totalAttempted) * 100 : 100;

  // D. Failed Message logs for diagnostic list
  const recentFailures = outgoingMessages
    .filter(m => m.deliveryStatus === 'failed')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  // 6. Loyalty Point Analytics
  const totalLoyaltyPoints = profiles.reduce((acc, curr) => acc + (curr.loyaltyPoints || 0), 0);
  
  let bronzeCount = 0;
  let silverCount = 0;
  let goldCount = 0;
  let platinumCount = 0;

  profiles.forEach(p => {
    const tier = getLoyaltyTier(p.loyaltyPoints || 0);
    if (tier === 'Platinum') platinumCount++;
    else if (tier === 'Gold') goldCount++;
    else if (tier === 'Silver') silverCount++;
    else bronzeCount++;
  });

  const totalTierSum = bronzeCount + silverCount + goldCount + platinumCount || 1;

  // Top Customers (sorted by lifetime spend)
  const topCustomers = [...profiles]
    .sort((a, b) => b.totalLifetimeSpend - a.totalLifetimeSpend)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Analytics Hero Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric Card: Today's Covers */}
        <div className="apple-card p-5 flex items-center justify-between shadow-sm bg-white border border-apple-gray-100">
          <div className="space-y-1">
            <span className="text-[10px] text-[#86868b] uppercase tracking-wider font-bold">Today's Visitors</span>
            <h3 className="text-xl font-bold text-apple-gray-800">{todayCoversCount}</h3>
            <p className="text-[9px] text-green-500 font-medium flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              <span>Checked in today</span>
            </p>
          </div>
          <div className="p-3.5 bg-blue-50 text-apple-blue-500 rounded-2xl">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Metric Card: New Customers */}
        <div className="apple-card p-5 flex items-center justify-between shadow-sm bg-white border border-apple-gray-100">
          <div className="space-y-1">
            <span className="text-[10px] text-[#86868b] uppercase tracking-wider font-bold">New Registrations</span>
            <h3 className="text-xl font-bold text-apple-gray-800">{newCustomers.length}</h3>
            <p className="text-[9px] text-[#86868b] font-medium">First-time visitors</p>
          </div>
          <div className="p-3.5 bg-green-50 text-green-500 rounded-2xl">
            <UserPlus className="w-5 h-5" />
          </div>
        </div>

        {/* Metric Card: Average Spend */}
        <div className="apple-card p-5 flex items-center justify-between shadow-sm bg-white border border-apple-gray-100">
          <div className="space-y-1">
            <span className="text-[10px] text-[#86868b] uppercase tracking-wider font-bold">Average Spend</span>
            <h3 className="text-xl font-bold text-apple-gray-800 font-mono">
              {currency}{averageSpend.toFixed(2)}
            </h3>
            <p className="text-[9px] text-indigo-500 font-medium flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" />
              <span>Per customer ticket</span>
            </p>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-500 rounded-2xl">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Metric Card: WhatsApp Unread */}
        <div className="apple-card p-5 flex items-center justify-between shadow-sm bg-white border border-apple-gray-100">
          <div className="space-y-1">
            <span className="text-[10px] text-[#86868b] uppercase tracking-wider font-bold">Unread Chat Inbox</span>
            <h3 className="text-xl font-bold text-apple-gray-800">{unreadMessagesCount}</h3>
            <p className="text-[9px] text-[#86868b] font-medium">Conversations unreplied</p>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-500 rounded-2xl">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Stats Row: WhatsApp & Reviews Delivery Subsystems */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Subsystem Delivery Rates Widget */}
        <div className="apple-card p-6 space-y-6 lg:col-span-1 bg-white border border-apple-gray-100 shadow-sm">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider border-b border-apple-gray-100 pb-3">
            CRM Cloud Delivery Rates
          </h4>

          <div className="space-y-4">
            {/* WhatsApp rate */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#86868b] font-medium">Global Delivery Rate</span>
                <span className="font-bold text-apple-gray-800 font-mono">{waDeliveryRate.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-apple-gray-50 border border-apple-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    waDeliveryRate >= 90 ? 'bg-green-500' : waDeliveryRate >= 75 ? 'bg-amber-500' : 'bg-red-500'
                  }`} 
                  style={{ width: `${waDeliveryRate}%` }}
                />
              </div>
            </div>

            {/* Loyalty points in circulation */}
            <div className="flex items-center justify-between p-3.5 bg-apple-gray-50 rounded-2xl border border-apple-gray-100">
              <div className="flex items-center gap-2.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-[#86868b]">Circulated Loyalty Points</span>
              </div>
              <span className="text-xs font-bold text-apple-gray-800 font-mono">{totalLoyaltyPoints} pts</span>
            </div>

            {/* Total Registered Covers count */}
            <div className="flex items-center justify-between p-3.5 bg-apple-gray-50 rounded-2xl border border-apple-gray-100">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-apple-gray-400" />
                <span className="text-xs text-[#86868b]">Directory Size</span>
              </div>
              <span className="text-xs font-bold text-apple-gray-800 font-mono">{profiles.length} covers</span>
            </div>
          </div>
        </div>

        {/* Detailed WhatsApp Dispatch Matrix */}
        <div className="apple-card p-6 space-y-4 lg:col-span-2 bg-white border border-apple-gray-100 shadow-sm">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider border-b border-apple-gray-100 pb-3">
            WhatsApp Template Dispatch Matrix
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Invoice receipts stats */}
            <div className="bg-apple-gray-50/50 border border-apple-gray-100 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-apple-gray-800 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-apple-blue-500" />
                  Invoice Receipts
                </span>
                <span className="text-[10px] font-bold text-apple-blue-500 bg-apple-blue-50 px-2 py-0.5 rounded-full uppercase">
                  Template
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded-xl border border-apple-gray-100">
                  <span className="text-[9px] text-[#86868b] block uppercase">Sent</span>
                  <span className="font-mono text-sm font-bold text-apple-gray-800">{invoiceSentCount}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-apple-gray-100">
                  <span className="text-[9px] text-[#86868b] block uppercase">Read</span>
                  <span className="font-mono text-sm font-bold text-green-600">{invoiceReadCount}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-apple-gray-100">
                  <span className="text-[9px] text-[#86868b] block uppercase">Failed</span>
                  <span className="font-mono text-sm font-bold text-red-500">{invoiceFailedCount}</span>
                </div>
              </div>
            </div>

            {/* Google Reviews stats */}
            <div className="bg-apple-gray-50/50 border border-apple-gray-100 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-apple-gray-800 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  Google Reviews
                </span>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase">
                  Template
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="bg-white p-1.5 rounded-xl border border-apple-gray-100">
                  <span className="text-[8px] text-[#86868b] block uppercase">Queue</span>
                  <span className="font-mono text-xs font-bold text-amber-500">{reviewScheduledCount}</span>
                </div>
                <div className="bg-white p-1.5 rounded-xl border border-apple-gray-100">
                  <span className="text-[8px] text-[#86868b] block uppercase">Sent</span>
                  <span className="font-mono text-xs font-bold text-apple-gray-800">{reviewSentCount}</span>
                </div>
                <div className="bg-white p-1.5 rounded-xl border border-apple-gray-100">
                  <span className="text-[8px] text-[#86868b] block uppercase">Read</span>
                  <span className="font-mono text-xs font-bold text-green-600">{reviewReadCount}</span>
                </div>
                <div className="bg-white p-1.5 rounded-xl border border-apple-gray-100">
                  <span className="text-[8px] text-[#86868b] block uppercase">Fail</span>
                  <span className="font-mono text-xs font-bold text-red-500">{reviewFailedCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Failed Messages Tracker & Loyalty Tier Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Failed Dispatches Tracker */}
        <div className="apple-card p-6 space-y-4 bg-white border border-apple-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider border-b border-apple-gray-100 pb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Failed Cloud Dispatches (Manual Actions Required)
            </h4>

            {recentFailures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <p className="text-xs font-bold text-apple-gray-800">All delivery systems functional</p>
                <p className="text-[10px] text-[#86868b]">No failed WhatsApp messages logged in database.</p>
              </div>
            ) : (
              <div className="divide-y divide-apple-gray-50 mt-2">
                {recentFailures.map((msg) => (
                  <div key={msg.whatsappMessageId} className="flex items-center justify-between py-2.5">
                    <div>
                      <h5 className="text-[11px] font-bold text-apple-gray-800">{msg.customerName}</h5>
                      <span className="text-[9px] text-[#86868b] font-mono">{msg.phone}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100 uppercase tracking-wide">
                        {msg.templateName === 'google_review_request' ? 'Review Request' : 'Invoice Bill'}
                      </span>
                      <span className="text-[8px] text-[#86868b] block font-mono mt-0.5">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {recentFailures.length > 0 && (
            <p className="text-[8px] text-[#86868b] bg-red-50/50 p-2 rounded-lg border border-red-100 mt-2 font-light">
              💡 Open customer conversations showing a red badge inside the Chat Inbox tab and click **Resend** to dispatch them manually.
            </p>
          )}
        </div>

        {/* Loyalty Tier Distribution Dashboard */}
        <div className="apple-card p-6 space-y-4 bg-white border border-apple-gray-100 shadow-sm">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider border-b border-apple-gray-100 pb-3 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            Loyalty Tier Distribution
          </h4>

          <div className="space-y-3">
            {/* Bronze Tier */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-orange-600 font-bold uppercase tracking-wide text-[9px]">Bronze Tier</span>
                <span className="font-bold text-apple-gray-800 text-[10px]">{bronzeCount} ({((bronzeCount / totalTierSum) * 100).toFixed(0)}%)</span>
              </div>
              <div className="w-full h-1.5 bg-apple-gray-50 border border-apple-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(bronzeCount / totalTierSum) * 100}%` }} />
              </div>
            </div>

            {/* Silver Tier */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wide text-[9px]">Silver Tier</span>
                <span className="font-bold text-apple-gray-800 text-[10px]">{silverCount} ({((silverCount / totalTierSum) * 100).toFixed(0)}%)</span>
              </div>
              <div className="w-full h-1.5 bg-apple-gray-50 border border-apple-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-slate-500 rounded-full" style={{ width: `${(silverCount / totalTierSum) * 100}%` }} />
              </div>
            </div>

            {/* Gold Tier */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-amber-500 font-bold uppercase tracking-wide text-[9px]">Gold Tier</span>
                <span className="font-bold text-apple-gray-800 text-[10px]">{goldCount} ({((goldCount / totalTierSum) * 100).toFixed(0)}%)</span>
              </div>
              <div className="w-full h-1.5 bg-apple-gray-50 border border-apple-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(goldCount / totalTierSum) * 100}%` }} />
              </div>
            </div>

            {/* Platinum Tier */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-indigo-600 font-bold uppercase tracking-wide text-[9px]">Platinum Tier</span>
                <span className="font-bold text-apple-gray-800 text-[10px]">{platinumCount} ({((platinumCount / totalTierSum) * 100).toFixed(0)}%)</span>
              </div>
              <div className="w-full h-1.5 bg-apple-gray-50 border border-apple-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${(platinumCount / totalTierSum) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Top Spend Customer Valuations */}
      <div className="apple-card p-6 space-y-4 bg-white border border-apple-gray-100 shadow-sm">
        <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider border-b border-apple-gray-100 pb-3">
          Top Lifetime Customer Valuations
        </h4>

        <div className="divide-y divide-apple-gray-50">
          {topCustomers.map((c, idx) => {
            const tier = getLoyaltyTier(c.loyaltyPoints);
            return (
              <div 
                key={c.phone} 
                onClick={() => onSelectCustomer(c)}
                className="flex items-center justify-between py-3.5 hover:bg-apple-gray-50/50 rounded-xl px-2 transition-apple cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-apple-gray-50 border border-apple-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-apple-gray-800">
                    #{idx + 1}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-apple-gray-800 group-hover:text-apple-blue-500 transition-apple">
                      {c.name}
                    </h5>
                    <p className="text-[10px] text-[#86868b] font-mono mt-0.5">{c.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-apple-gray-800 font-mono block">
                      {currency}{c.totalLifetimeSpend.toFixed(2)}
                    </span>
                    <span className="text-[8px] text-[#86868b] block font-medium uppercase tracking-wide">
                      {c.visitCount} visits
                    </span>
                  </div>

                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                    tier === 'Platinum' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                    tier === 'Gold' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                    tier === 'Silver' ? 'bg-slate-50 text-slate-600 border-slate-100' :
                    'bg-orange-50 text-orange-600 border-orange-100'
                  }`}>
                    {tier}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-apple-gray-300 group-hover:translate-x-0.5 transition-apple" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
