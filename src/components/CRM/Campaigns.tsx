import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Send, 
  Plus, 
  Play, 
  Pause, 
  XCircle, 
  CheckCircle, 
  Eye, 
  Image as ImageIcon,
  Trash2,
  Calendar,
  Filter
} from 'lucide-react';
import type { CRMProfile, CafeSettings, Campaign } from '../../types';
import { getCampaigns, saveCampaign, deleteCampaign } from '../../utils/db';
import { SyncEngine } from '../../utils/syncEngine';
import { uploadMediaToMeta } from '../../utils/whatsappCloud';
import { useToast } from '../../context/toastContext';

interface CampaignsTabProps {
  settings: CafeSettings;
  profiles: CRMProfile[];
  onRefreshInbox: () => void;
}

const MESSAGE_EXAMPLES = [
  {
    title: "Weekend Coffee & Pastry Special",
    name: "Weekend Special",
    type: "Weekend Offer",
    text: "Get 20% OFF on all cold brews and pastries this Saturday and Sunday! Show this message at the counter to redeem."
  },
  {
    title: "Happy Birthday Celebration Treat",
    name: "Birthday Special",
    type: "Birthday Offer",
    text: "Happy Birthday! Celebrate your special day at Chapter One. Present this coupon to enjoy a free latte of your choice on us!"
  },
  {
    title: "Loyalty Customer Reward Code",
    name: "Loyalty Coupon",
    type: "Marketing",
    text: "Thank you for being a regular guest! Here is a special ₹100 discount coupon valid on any order above ₹500."
  },
  {
    title: "New Fresh Smashed Avocado Toast",
    name: "Avocado Toast Launch",
    type: "New Menu Launch",
    text: "Our new healthy breakfast menu is live! Try the fresh Avocado Smashed Toast this week and get flat ₹50 OFF."
  },
  {
    title: "Festive Season Celebration Discount",
    name: "Festival Celebration",
    type: "Festival Offer",
    text: "Celebrate this festive season with Chapter One! Bring your family and get a flat 10% discount on your group bill."
  }
];

export const CampaignsTab: React.FC<CampaignsTabProps> = ({ 
  settings, 
  profiles, 
  onRefreshInbox 
}) => {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Specific customer target search state
  const [specificCustomerPhone, setSpecificCustomerPhone] = useState<string>('All');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [searchSuggestions, setSearchSuggestions] = useState<CRMProfile[]>([]);

  // Form State
  const [campaignName, setCampaignName] = useState('');
  const [campaignType, setCampaignType] = useState('Marketing');
  const [offerText, setOfferText] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [offerImageBase64, setOfferImageBase64] = useState<string>('');

  // Filters State
  const [minSpend, setMinSpend] = useState<string>('');
  const [minVisits, setMinVisits] = useState<string>('');
  const [lastVisitDays, setLastVisitDays] = useState<string>('All');
  const [reviewGiven, setReviewGiven] = useState<string>('All');
  const [birthdayFilter, setBirthdayFilter] = useState<string>('All');
  const [phoneExists, setPhoneExists] = useState<string>('All');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');

  // Loaded active list of recipients based on live filters
  const [filteredRecipients, setFilteredRecipients] = useState<CRMProfile[]>([]);

  // Load Campaigns
  const loadAllCampaigns = async () => {
    const list = await getCampaigns();
    list.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
    setCampaigns(list);
    
    if (selectedCampaign) {
      const fresh = list.find(c => c.id === selectedCampaign.id);
      if (fresh) setSelectedCampaign(fresh);
    }
    // Call background refresh from sheet
    onRefreshInbox();
  };

  useEffect(() => {
    loadAllCampaigns();
    const interval = setInterval(loadAllCampaigns, 5000);
    return () => clearInterval(interval);
  }, [selectedCampaign?.id]);

  // Compute live audience list based on current filters
  useEffect(() => {
    if (specificCustomerPhone !== 'All') {
      const match = profiles.filter(p => p.phone === specificCustomerPhone);
      setFilteredRecipients(match);
      return;
    }

    const now = new Date();
    const filtered = profiles.filter(profile => {
      if (!profile) return false;

      const spend = Number(profile.totalLifetimeSpend) || 0;
      const visits = Number(profile.visitCount) || 0;
      const cleanPhone = String(profile.phone).replace(/\D/g, '');

      const passesSpend = minSpend ? spend >= Number(minSpend) : null;
      const passesVisits = minVisits ? visits >= Number(minVisits) : null;

      let passesLastVisit = null;
      if (lastVisitDays !== 'All' && profile.lastVisit) {
        const lastVisitDate = new Date(profile.lastVisit);
        const diffDays = Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24));
        passesLastVisit = diffDays >= Number(lastVisitDays);
      }

      let passesReview = null;
      if (reviewGiven !== 'All') {
        const given = String(profile.googleReviewStatus).toLowerCase() === 'completed';
        passesReview = (reviewGiven === 'Yes' ? given : !given);
      }

      let passesBirthday = null;
      if (birthdayFilter !== 'All') {
        const birthdayStr = (profile as any).birthday;
        if (birthdayStr) {
          const bday = new Date(birthdayStr);
          const currentMonth = now.getMonth();
          const currentDate = now.getDate();
          
          if (birthdayFilter === 'Today') {
            passesBirthday = bday.getDate() === currentDate && bday.getMonth() === currentMonth;
          } else if (birthdayFilter === 'This Month') {
            passesBirthday = bday.getMonth() === currentMonth;
          }
        } else {
          passesBirthday = false;
        }
      }

      const passesPhone = phoneExists === 'Yes' ? cleanPhone.length >= 10 : null;
      const passesTag = selectedTag !== 'All' ? (profile.tags && profile.tags.includes(selectedTag)) : null;

      const conditions = [passesSpend, passesVisits, passesLastVisit, passesReview, passesBirthday, passesPhone, passesTag]
        .filter(c => c !== null) as boolean[];

      if (conditions.length === 0) return true;

      if (filterLogic === 'AND') {
        return conditions.every(c => c === true);
      } else {
        return conditions.some(c => c === true);
      }
    });

    setFilteredRecipients(filtered);
  }, [profiles, minSpend, minVisits, lastVisitDays, reviewGiven, birthdayFilter, phoneExists, selectedTag, filterLogic, specificCustomerPhone]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setOfferImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const dataURItoBlob = (dataURI: string) => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  const handleSendCampaign = async () => {
    if (!campaignName.trim()) {
      toast.warning('Missing Name', 'Please specify a Campaign Name.');
      return;
    }
    if (!offerText.trim()) {
      toast.warning('Missing Offer Text', 'Please fill in the Offer Text body.');
      return;
    }
    if (filteredRecipients.length === 0) {
      toast.warning('Empty Audience', 'Smart Audience list is empty. Modify filters to select recipients.');
      return;
    }

    const token = settings.waAccessToken || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN || '';
    const phoneId = settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '';

    if (!token || !phoneId) {
      toast.error('Configuration Error', 'Meta credentials missing from settings. Cannot send campaigns.');
      return;
    }

    const campaignId = `camp_${Date.now()}`;
    toast.info('Uploading Assets', 'Initializing campaign and uploading assets...');

    try {
      let mediaId = '';
      if (offerImageBase64) {
        try {
          const blob = dataURItoBlob(offerImageBase64);
          mediaId = await uploadMediaToMeta(blob, 'campaign_offer.jpg', 'image/jpeg', token, phoneId);
        } catch (uploadErr: any) {
          toast.warning('Upload Failed', `Image upload failed: ${uploadErr.message}. Sending text-only templates instead.`);
        }
      }

      const newCampaign: Campaign = {
        id: campaignId,
        name: campaignName,
        type: campaignType,
        templateName: 'coupon_offer',
        offerImage: offerImageBase64 || undefined,
        mediaId: mediaId || undefined,
        offerText: offerText,
        expiryDate: expiryDate,
        recipients: filteredRecipients.map(r => ({
          name: r.name,
          phone: r.phone,
          lifetimeSpend: r.totalLifetimeSpend || 0,
          visits: r.visitCount || 0,
          deliveryStatus: 'queued'
        })),
        status: 'sending',
        metrics: {
          queued: filteredRecipients.length,
          sending: 0,
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          blocked: 0
        },
        startTime: new Date().toISOString()
      };

      await saveCampaign(newCampaign);

      for (const recipient of newCampaign.recipients) {
        await SyncEngine.enqueue('WHATSAPP_SEND', {
          customerPhone: recipient.phone,
          customerName: recipient.name,
          billNumber: '',
          grandTotal: 0,
          waToken: token,
          waPhoneId: phoneId,
          waTemplate: 'coupon_offer',
          waLang: settings.waLanguage || 'en',
          crmScriptUrl: settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL || '',
          isCampaign: true,
          campaignId: campaignId,
          campaignName: campaignName,
          offerImage: mediaId || offerImageBase64 || undefined,
          offerText: offerText,
          expiryDate: expiryDate
        });
      }

      toast.success('Campaign Started', `Campaign "${campaignName}" started. Enqueued ${filteredRecipients.length} messages.`);
      
      setShowBuilder(false);
      setSelectedCampaign(newCampaign);
      loadAllCampaigns();
    } catch (err: any) {
      toast.error('Campaign Failed', `Failed to start campaign: ${err.message}`);
    }
  };

  const handlePauseCampaign = async (campaign: Campaign) => {
    const updated: Campaign = { ...campaign, status: 'paused' };
    await saveCampaign(updated);
    toast.info('Campaign Paused', `Campaign "${campaign.name}" paused.`);
    loadAllCampaigns();
  };

  const handleResumeCampaign = async (campaign: Campaign) => {
    const updated: Campaign = { ...campaign, status: 'sending' };
    await saveCampaign(updated);
    toast.success('Campaign Resumed', `Campaign "${campaign.name}" resumed.`);
    SyncEngine.processQueue();
    loadAllCampaigns();
  };

  const handleCancelCampaign = async (campaign: Campaign) => {
    const updated: Campaign = { 
      ...campaign, 
      status: 'cancelled',
      endTime: new Date().toISOString()
    };
    updated.recipients.forEach(r => {
      if (r.deliveryStatus === 'queued' || r.deliveryStatus === 'sending') {
        r.deliveryStatus = 'blocked';
        r.failureReason = 'Cancelled by operator';
      }
    });
    updated.metrics.blocked = updated.recipients.filter(r => r.deliveryStatus === 'blocked').length;
    updated.metrics.queued = 0;
    updated.metrics.sending = 0;
    
    await saveCampaign(updated);
    toast.warning('Campaign Cancelled', `Campaign "${campaign.name}" cancelled.`);
    loadAllCampaigns();
  };

  const handlePurgeCampaign = async (id: string) => {
    if (confirm('Are you sure you want to delete this campaign log from the system?')) {
      await deleteCampaign(id);
      setSelectedCampaign(null);
      loadAllCampaigns();
      toast.info('Registry Purged', 'Campaign log deleted.');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start animate-fade-in text-apple-gray-800">
      
      {/* LEFT COLUMN: CAMPAIGNS LIST DIRECTORY */}
      <div className="xl:col-span-1 bg-white border border-apple-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-apple-gray-50">
          <span className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider">Campaign Registry</span>
          <button
            onClick={() => {
              setShowBuilder(true);
              setSelectedCampaign(null);
              setCampaignName('');
              setOfferText('');
              setExpiryDate('');
              setOfferImageBase64('');
            }}
            className="p-1.5 bg-apple-gray-800 hover:bg-apple-gray-900 text-white rounded-lg cursor-pointer transition-all flex items-center justify-center"
            title="Create Campaign"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
          {campaigns.length === 0 ? (
            <p className="text-[10px] text-[#86868b] font-light text-center py-6">No marketing campaigns generated yet.</p>
          ) : (
            campaigns.map(camp => {
              const isSelected = selectedCampaign?.id === camp.id;
              const totalRecipients = camp.recipients.length;
              const completedCount = camp.metrics.sent + camp.metrics.failed + camp.metrics.blocked;
              const pct = totalRecipients > 0 ? Math.round((completedCount / totalRecipients) * 100) : 0;

              return (
                <div
                  key={camp.id}
                  onClick={() => {
                    setSelectedCampaign(camp);
                    setShowBuilder(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all space-y-2 ${
                    isSelected 
                      ? 'bg-apple-blue-50 border-apple-blue-150 shadow-sm'
                      : 'bg-apple-gray-50/40 border-apple-gray-100 hover:border-apple-blue-500/20'
                  }`}
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <h4 className="text-[11px] font-bold truncate max-w-[120px]">{camp.name}</h4>
                      <p className="text-[8px] text-[#86868b] uppercase tracking-wider">{camp.type}</p>
                    </div>
                    <span className={`text-[7.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      camp.status === 'sending' ? 'bg-blue-50 text-blue-600 border border-blue-100 animate-pulse' :
                      camp.status === 'completed' ? 'bg-green-50 text-green-600 border border-green-100' :
                      camp.status === 'paused' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                      camp.status === 'cancelled' ? 'bg-red-50 text-red-600 border border-red-100' :
                      'bg-apple-gray-100 text-apple-gray-600'
                    }`}>
                      {camp.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px] text-[#86868b]">
                      <span>{completedCount} of {totalRecipients} sent</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-1 bg-apple-gray-150 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          camp.status === 'completed' ? 'bg-green-500' : 'bg-apple-blue-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT WORKPLACE COLUMN */}
      <div className="xl:col-span-3 space-y-6">

        {/* 1. BUILDER PANEL */}
        {showBuilder && (
          <div className="bg-white border border-apple-gray-100 p-6 rounded-2xl shadow-sm space-y-6 animate-fade-in">
            <h3 className="text-sm font-bold text-apple-gray-800 pb-2 border-b border-apple-gray-50">Create New Campaign Offer</h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#86868b] uppercase">Campaign Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Coffee Lovers Discount"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      className="w-full text-xs px-3.5 py-2 border border-apple-gray-100 rounded-xl outline-none focus:border-apple-blue-500 bg-apple-gray-50/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#86868b] uppercase">Campaign Type</label>
                    <select
                      value={campaignType}
                      onChange={(e) => setCampaignType(e.target.value)}
                      className="w-full text-xs px-3.5 py-2 border border-apple-gray-100 rounded-xl outline-none focus:border-apple-blue-500 bg-apple-gray-50/50"
                    >
                      <option value="Marketing">Marketing (General)</option>
                      <option value="Birthday Offer">Birthday Offer</option>
                      <option value="Festival Offer">Festival Offer</option>
                      <option value="Weekend Offer">Weekend Offer</option>
                      <option value="New Menu Launch">New Menu Launch</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#86868b] uppercase">Meta Template</label>
                    <input
                      type="text"
                      value="coupon_offer"
                      disabled
                      className="w-full text-xs px-3.5 py-2 border border-apple-gray-100 rounded-xl bg-apple-gray-100 text-[#86868b]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#86868b] uppercase">Expiry Date</label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full text-xs px-3.5 py-2 border border-apple-gray-100 rounded-xl outline-none focus:border-apple-blue-500 bg-apple-gray-50/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase block">Offer Image</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      id="offerImageFile"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="offerImageFile"
                      className="px-4 py-2 border border-apple-gray-150 rounded-xl text-xs font-semibold cursor-pointer hover:bg-apple-gray-50 transition-all flex items-center gap-1.5"
                    >
                      <ImageIcon className="w-4 h-4 text-apple-gray-500" />
                      Upload Offer Graphic
                    </label>
                    {offerImageBase64 && (
                      <span className="text-[10px] text-green-600 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Graphic loaded
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase">Offer Text Body</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Get 20% OFF on all cold brews this weekend only!"
                    value={offerText}
                    onChange={(e) => setOfferText(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-apple-gray-100 rounded-xl outline-none focus:border-apple-blue-500 bg-apple-gray-50/50 resize-none font-light leading-relaxed"
                  />
                </div>

                {/* 4-5 Concrete Examples */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider block">💡 Click to autofill sample offer text:</label>
                  <div className="grid grid-cols-1 gap-2 max-h-[140px] overflow-y-auto pr-1 no-scrollbar">
                    {MESSAGE_EXAMPLES.map((ex, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setOfferText(ex.text);
                          setCampaignType(ex.type);
                          setCampaignName(ex.name);
                        }}
                        className="w-full text-left p-2.5 bg-white hover:bg-apple-gray-50 border border-apple-gray-150 rounded-xl cursor-pointer transition-colors text-[10px] text-apple-gray-800 space-y-1"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-[#86868b]">{ex.title}</span>
                          <span className="text-[8px] bg-apple-gray-100 text-[#86868b] px-1.5 py-0.5 rounded font-mono uppercase">{ex.type}</span>
                        </div>
                        <p className="line-clamp-2 text-apple-gray-600 leading-snug font-light">{ex.text}</p>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="border border-apple-gray-100 rounded-2xl p-4 bg-apple-gray-50/50 space-y-4">
                  {/* Target Specific Customer Search (Optional) */}
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-bold text-[#86868b] uppercase block">Target Specific Customer (Optional)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search by name or phone..."
                        value={customerSearchQuery}
                        onChange={(e) => {
                          setCustomerSearchQuery(e.target.value);
                          if (e.target.value.trim().length >= 2) {
                            const q = e.target.value.toLowerCase();
                            const matches = profiles.filter(p => 
                              p.name.toLowerCase().includes(q) || 
                              p.phone.includes(q)
                            );
                            setSearchSuggestions(matches.slice(0, 5));
                          } else {
                            setSearchSuggestions([]);
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-apple-gray-100 rounded-xl outline-none text-xs"
                      />
                      {specificCustomerPhone !== 'All' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSpecificCustomerPhone('All');
                            setCustomerSearchQuery('');
                            setSearchSuggestions([]);
                          }}
                          className="px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg text-[9px] cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Customer search suggestions dropdown */}
                    {customerSearchQuery.trim().length >= 2 && searchSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 bg-white border border-apple-gray-100 rounded-xl shadow-lg z-30 p-1 mt-1 max-h-[150px] overflow-y-auto">
                        {searchSuggestions.map(s => (
                          <button
                            key={s.phone}
                            type="button"
                            onClick={() => {
                              setSpecificCustomerPhone(s.phone);
                              setCustomerSearchQuery(`${s.name} (${s.phone})`);
                              setSearchSuggestions([]);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-apple-gray-50 text-[10px] text-apple-gray-800 flex justify-between items-center cursor-pointer"
                          >
                            <span className="font-semibold">{s.name}</span>
                            <span className="font-mono text-[#86868b]">{s.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-apple-gray-150">
                    <span className="text-[10px] font-bold text-apple-gray-800 uppercase flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5 text-apple-blue-500" /> Smart Audience Filters
                    </span>
                    <div className="flex items-center gap-1.5 bg-white border border-apple-gray-100 rounded-lg p-0.5 shadow-sm">
                      <button
                        onClick={() => setFilterLogic('AND')}
                        className={`px-2 py-0.5 text-[8px] font-bold rounded ${
                          filterLogic === 'AND' ? 'bg-apple-gray-800 text-white' : 'text-[#86868b]'
                        }`}
                      >
                        AND
                      </button>
                      <button
                        onClick={() => setFilterLogic('OR')}
                        className={`px-2 py-0.5 text-[8px] font-bold rounded ${
                          filterLogic === 'OR' ? 'bg-apple-gray-800 text-white' : 'text-[#86868b]'
                        }`}
                      >
                        OR
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[10px]">
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Min Lifetime Spend</label>
                      <input
                        type="number"
                        placeholder="₹1000"
                        value={minSpend}
                        onChange={(e) => setMinSpend(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Min Visits count</label>
                      <input
                        type="number"
                        placeholder="3 visits"
                        value={minVisits}
                        onChange={(e) => setMinVisits(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Last Visit Age</label>
                      <select
                        value={lastVisitDays}
                        onChange={(e) => setLastVisitDays(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-[10px]"
                      >
                        <option value="All">All visits</option>
                        <option value="30">&gt; 30 Days ago</option>
                        <option value="60">&gt; 60 Days ago</option>
                        <option value="90">&gt; 90 Days ago</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Review Given?</label>
                      <select
                        value={reviewGiven}
                        onChange={(e) => setReviewGiven(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-[10px]"
                      >
                        <option value="All">All customers</option>
                        <option value="Yes">Completed</option>
                        <option value="No">Pending</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Birthday schedule</label>
                      <select
                        value={birthdayFilter}
                        onChange={(e) => setBirthdayFilter(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-[10px]"
                      >
                        <option value="All">All dates</option>
                        <option value="Today">Today</option>
                        <option value="This Month">This Month</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Phone Exists?</label>
                      <select
                        value={phoneExists}
                        onChange={(e) => setPhoneExists(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-[10px]"
                      >
                        <option value="All">All accounts</option>
                        <option value="Yes">Has Number</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#86868b] font-bold uppercase">Select Tag</label>
                      <select
                        value={selectedTag}
                        onChange={(e) => setSelectedTag(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-apple-gray-100 rounded-lg outline-none text-[10px]"
                      >
                        <option value="All">All tags</option>
                        <option value="VIP">VIP</option>
                        <option value="Student">Student</option>
                        <option value="Family">Family</option>
                        <option value="Office">Office</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-apple-gray-150">
                    <span className="text-[10px] text-apple-gray-600 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-apple-blue-500" />
                      Live Audience Count:
                      <strong className="text-apple-gray-800 text-xs font-mono">{filteredRecipients.length} customers matched</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    onClick={() => setShowBuilder(false)}
                    className="px-5 py-2 border border-apple-gray-150 hover:bg-apple-gray-50 text-apple-gray-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendCampaign}
                    className="px-6 py-2 bg-gradient-to-r from-apple-blue-500 to-indigo-600 hover:from-apple-blue-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" /> Dispatch Campaign Offer
                  </button>
                </div>
              </div>

              {/* MOCK PREVIEW COLUMN */}
              <div className="space-y-3 flex flex-col items-center justify-start border-l border-apple-gray-100 pl-4">
                <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider self-start flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-[#86868b]" /> WhatsApp Live Message Preview
                </label>
                
                <div className="w-[280px] bg-[#efeae2] border border-apple-gray-150 rounded-3xl p-4 shadow-inner relative flex flex-col aspect-[9/16] overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-4 bg-black/5 flex justify-center items-center text-[7px] text-apple-gray-500 font-mono">
                    WhatsApp Sandbox Environment
                  </div>
                  
                  <div className="mt-6 bg-white p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[90%] self-end space-y-2 border border-apple-gray-100 flex flex-col">
                    <span className="text-[7.5px] font-bold text-apple-blue-500 uppercase tracking-wider">Chapter One Cafe</span>
                    
                    <div className="w-full aspect-video rounded-xl bg-apple-gray-50 border border-apple-gray-150 overflow-hidden flex items-center justify-center relative">
                      {offerImageBase64 ? (
                        <img 
                          src={offerImageBase64} 
                          alt="Offer graphic" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-apple-gray-200" />
                      )}
                    </div>

                    <div className="space-y-1.5 text-[9.5px] text-apple-gray-800 leading-relaxed font-light">
                      <p>
                        Hi <strong>[Guest Name]</strong>,
                      </p>
                      <p className="font-mono text-apple-gray-900 bg-apple-gray-50 p-1.5 rounded-lg border border-apple-gray-100">
                        {offerText || 'Offer description text will display here.'}
                      </p>
                      {expiryDate && (
                        <p className="text-[8px] text-red-500 font-bold flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-red-500" /> Valid until: {new Date(expiryDate).toLocaleDateString([], { dateStyle: 'medium' })}
                        </p>
                      )}
                    </div>

                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      className="w-full py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 border border-amber-300 shadow-sm"
                    >
                      Redeem Coupon Code
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. CAMPAIGN DETAILS & REPORTS PANEL */}
        {selectedCampaign ? (
          <div className="bg-white border border-apple-gray-100 p-6 rounded-2xl shadow-sm space-y-6 animate-fade-in text-apple-gray-800">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-apple-gray-50 gap-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  🎁 {selectedCampaign.name}
                  <span className={`text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    selectedCampaign.status === 'sending' ? 'bg-blue-50 text-blue-600 border border-blue-100 animate-pulse' :
                    selectedCampaign.status === 'completed' ? 'bg-green-50 text-green-600 border border-green-100' :
                    selectedCampaign.status === 'paused' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    selectedCampaign.status === 'cancelled' ? 'bg-red-50 text-red-600 border border-red-100' :
                    'bg-apple-gray-100 border-apple-gray-200'
                  }`}>
                    {selectedCampaign.status}
                  </span>
                </h3>
                <p className="text-[10px] text-[#86868b] font-light mt-0.5">
                  Type: {selectedCampaign.type} | Started: {new Date(selectedCampaign.startTime || '').toLocaleString()}
                </p>
              </div>

              <div className="flex gap-2">
                {selectedCampaign.status === 'sending' && (
                  <button
                    onClick={() => handlePauseCampaign(selectedCampaign)}
                    className="px-3 py-1.5 border border-amber-250 text-amber-600 hover:bg-amber-50 bg-amber-50/50 rounded-xl text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                  >
                    <Pause className="w-3 h-3" /> Pause Campaign
                  </button>
                )}
                {selectedCampaign.status === 'paused' && (
                  <button
                    onClick={() => handleResumeCampaign(selectedCampaign)}
                    className="px-3 py-1.5 border border-green-250 text-green-600 hover:bg-green-50 bg-green-50/50 rounded-xl text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Resume Campaign
                  </button>
                )}
                {(selectedCampaign.status === 'sending' || selectedCampaign.status === 'paused') && (
                  <button
                    onClick={() => handleCancelCampaign(selectedCampaign)}
                    className="px-3 py-1.5 border border-red-250 text-red-600 hover:bg-red-50 bg-red-50/50 rounded-xl text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                  >
                    <XCircle className="w-3 h-3" /> Cancel Campaign
                  </button>
                )}
                <button
                  onClick={() => handlePurgeCampaign(selectedCampaign.id)}
                  className="px-3 py-1.5 border border-apple-gray-150 text-[#86868b] hover:text-red-500 hover:bg-apple-gray-50 rounded-xl text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                  title="Purge Campaign log"
                >
                  <Trash2 className="w-3 h-3" /> Delete Log
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              <div className="p-3 bg-apple-gray-50/50 rounded-xl border border-apple-gray-100">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Audience</span>
                <span className="text-sm font-bold font-mono">{selectedCampaign.recipients.length}</span>
              </div>
              <div className="p-3 bg-blue-50/20 rounded-xl border border-blue-100/50">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Queueing</span>
                <span className="text-sm font-bold font-mono text-apple-blue-500">{selectedCampaign.metrics.queued}</span>
              </div>
              <div className="p-3 bg-green-50/20 rounded-xl border border-green-100/50">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Sent</span>
                <span className="text-sm font-bold font-mono text-green-600">{selectedCampaign.metrics.sent}</span>
              </div>
              <div className="p-3 bg-sky-50/20 rounded-xl border border-sky-100/50">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Delivered</span>
                <span className="text-sm font-bold font-mono text-sky-600">{selectedCampaign.metrics.delivered}</span>
              </div>
              <div className="p-3 bg-indigo-50/20 rounded-xl border border-indigo-100/50">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Read</span>
                <span className="text-sm font-bold font-mono text-indigo-600">{selectedCampaign.metrics.read}</span>
              </div>
              <div className="p-3 bg-red-50/20 rounded-xl border border-red-100/50">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Failed</span>
                <span className="text-sm font-bold font-mono text-red-600">{selectedCampaign.metrics.failed}</span>
              </div>
              <div className="p-3 bg-apple-gray-100 rounded-xl border border-apple-gray-150">
                <span className="text-[8px] uppercase font-bold text-[#86868b] tracking-wider block mb-1">Blocked</span>
                <span className="text-sm font-bold font-mono text-apple-gray-800">{selectedCampaign.metrics.blocked}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Recipient Log Details
              </h4>
              
              <div className="border border-apple-gray-100 rounded-2xl overflow-hidden shadow-inner overflow-x-auto">
                <table className="w-full text-[10.5px] border-collapse text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-apple-gray-50 border-b border-apple-gray-100 text-[#86868b] font-bold text-[9px] uppercase tracking-wide">
                      <th className="p-3">Customer Name</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3 font-mono">Spend</th>
                      <th className="p-3">Visits</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 font-mono">Meta Message ID</th>
                      <th className="p-3">Failure Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-apple-gray-50 font-light">
                    {selectedCampaign.recipients.map((rec, index) => {
                      return (
                        <tr key={index} className="hover:bg-apple-gray-50/50">
                          <td className="p-3 font-bold">{rec.name}</td>
                          <td className="p-3 font-mono text-[#86868b]">{rec.phone}</td>
                          <td className="p-3 font-mono">₹{rec.lifetimeSpend.toFixed(2)}</td>
                          <td className="p-3 text-center">{rec.visits}</td>
                          <td className="p-3">
                            <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              rec.deliveryStatus === 'queued' ? 'bg-apple-gray-100 text-apple-gray-600' :
                              rec.deliveryStatus === 'sent' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                              rec.deliveryStatus === 'delivered' ? 'bg-sky-50 text-sky-600 border border-sky-100' :
                              rec.deliveryStatus === 'read' ? 'bg-green-50 text-green-600 border border-green-100' :
                              rec.deliveryStatus === 'failed' ? 'bg-red-50 text-red-600 border border-red-100' :
                              'bg-[#f5f5f7] text-apple-gray-400'
                            }`}>
                              {rec.deliveryStatus}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[9px] text-[#86868b]">
                            {rec.messageId || '—'}
                          </td>
                          <td className="p-3 text-red-500 font-light max-w-xs truncate" title={rec.failureReason}>
                            {rec.failureReason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          !showBuilder && (
            <div className="bg-white border border-apple-gray-100 p-12 rounded-2xl text-center text-[#86868b] flex flex-col items-center justify-center gap-2 border-dashed">
              <ImageIcon className="w-10 h-10 text-apple-gray-200" />
              <span className="text-xs font-light">Select a campaign from the registry or create a new campaign to dispatch offers.</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};
