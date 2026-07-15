import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  User, 
  FileText, 
  Trash2, 
  Send, 
  Loader2, 
  Sparkles, 
  Eye, 
  Info,
  Check,
  CheckCheck,
  Paperclip,
  Smile,
  FileDown,
  X,
  Clock
} from 'lucide-react';
import type { Bill, CafeSettings, CRMProfile } from '../../types';
import { getBills } from '../../utils/db';
import { getLoyaltyTier } from '../../utils/loyalty';
import { useToast } from '../../context/toastContext';
import { PDFPreviewModal } from '../PDFPreviewModal';
import { CRMDashboard } from './CRMDashboard';
import { queryGroqAI } from '../../utils/ai';
import type { WhatsAppMessage } from '../../utils/whatsappCloud';
import { 
  uploadMediaToMeta, 
  sendWhatsAppMedia, 
  getWhatsAppMediaBlob 
} from '../../utils/whatsappCloud';

interface CRMProps {
  settings: CafeSettings;
  currentUser: { id: string; username: string; role: string };
}

const normalizePhone = (phone: string | number | undefined | null): string => {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 10) {
    return '91' + clean;
  }
  return clean;
};

export const CRM: React.FC<CRMProps> = ({ settings, currentUser }) => {
  const toast = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [profiles, setProfiles] = useState<CRMProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<CRMProfile | null>(null);
  
  // Tabs: 'dashboard' | 'inbox' | 'overview' | 'timeline' | 'invoices' | 'whatsapp' | 'notes' | 'analytics'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inbox' | 'overview' | 'timeline' | 'invoices' | 'whatsapp' | 'notes' | 'analytics'>('dashboard');
  
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('All');
  
  // Note state
  const [noteText, setNoteText] = useState('');
  const [customerNotes, setCustomerNotes] = useState<string[]>([]);
  

  
  // PDF Preview State
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewName, setPreviewName] = useState('');
  
  // AI summary state
  const [aiSummary, setAiSummary] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  // New WhatsApp Inbox State
  const [selectedConversationPhone, setSelectedConversationPhone] = useState<string | null>(null);
  const [inboxMessages, setInboxMessages] = useState<WhatsAppMessage[]>([]);
  const [allInboxMessages, setAllInboxMessages] = useState<WhatsAppMessage[]>([]);
  const [inboxSearchTerm, setInboxSearchTerm] = useState('');
  const [inboxReplyText, setInboxReplyText] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [mediaCache, setMediaCache] = useState<Record<string, string>>({});
  const [isPollLoading, setIsPollLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchWhatsAppMessages = async (showLoading = false) => {
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;
    if (!url) return;
    if (showLoading) setIsPollLoading(true);
    try {
      const res = await fetch(`${url}?action=GET_WHATSAPP_MESSAGES`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const validData = data.filter(m => m && m.phone && m.timestamp);
          validData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          setAllInboxMessages(validData);
        } else {
          console.warn('GET_WHATSAPP_MESSAGES returned non-array:', data);
          setAllInboxMessages([]);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch WhatsApp messages:', err);
    } finally {
      if (showLoading) setIsPollLoading(false);
    }
  };

  const markMessagesAsRead = async (phone: string) => {
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'MARK_MESSAGES_AS_READ', phone }),
      });
      setAllInboxMessages(prev => prev.map(m => {
        if (m && m.phone && phone && String(m.phone).replace(/\D/g, '') === String(phone).replace(/\D/g, '') && m.direction === 'incoming') {
          return { ...m, deliveryStatus: 'read' };
        }
        return m;
      }));
    } catch (err) {
      console.warn('Failed to mark messages as read:', err);
    }
  };

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [inboxMessages]);

  // Load messages for a specific conversation phone
  useEffect(() => {
    if (selectedConversationPhone) {
      const filtered = allInboxMessages.filter(
        (m) => m && m.phone && String(m.phone).replace(/\D/g, '') === String(selectedConversationPhone).replace(/\D/g, '')
      );
      setInboxMessages(filtered);
      
      const unreadCount = filtered.filter(m => m.direction === 'incoming' && m.deliveryStatus !== 'read').length;
      if (unreadCount > 0) {
        markMessagesAsRead(selectedConversationPhone);
      }
    } else {
      setInboxMessages([]);
    }
  }, [selectedConversationPhone, allInboxMessages]);

  // Media pre-fetching cache logic
  useEffect(() => {
    const token = settings.waAccessToken || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
    if (!token) return;

    inboxMessages.forEach(async (msg) => {
      if ((msg.messageType === 'image' || msg.messageType === 'document') && msg.mediaUrl && !mediaCache[msg.mediaUrl]) {
        try {
          const blob = await getWhatsAppMediaBlob(msg.mediaUrl, token);
          const objectUrl = URL.createObjectURL(blob);
          setMediaCache(prev => ({ ...prev, [msg.mediaUrl]: objectUrl }));
        } catch (err) {
          console.warn(`Failed to prefetch media for ID ${msg.mediaUrl}:`, err);
        }
      }
    });
  }, [inboxMessages, settings.waAccessToken]);

  // Periodic polling for background updates
  useEffect(() => {
    fetchWhatsAppMessages(true);

    const interval = setInterval(() => {
      if (activeTab === 'inbox') {
        fetchWhatsAppMessages(false);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Auto-set WhatsApp conversation phone when Catalog -> WhatsApp tab is active
  useEffect(() => {
    if (activeTab === 'whatsapp' && selectedProfile) {
      setSelectedConversationPhone(selectedProfile.phone);
    }
  }, [activeTab, selectedProfile]);

  const handleSendInboxChat = async (text?: string) => {
    const textMsg = (text || inboxReplyText).trim();
    if (!selectedConversationPhone || !textMsg) return;

    const phone = selectedConversationPhone;
    const token = settings.waAccessToken || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
    const phoneId = settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;

    if (!token || !phoneId) {
      toast.error('Credentials Missing', 'Meta WhatsApp credentials are not configured in system settings.');
      return;
    }

    const profile = profiles.find(p => p && p.phone && normalizePhone(p.phone) === normalizePhone(phone));
    const customerName = profile?.name || phone;

    const tempMsgId = `temp_${Date.now()}`;
    const localMsg: WhatsAppMessage = {
      conversationId: normalizePhone(phone),
      customerId: `crm_${normalizePhone(phone)}`,
      customerName,
      phone: normalizePhone(phone),
      direction: 'outgoing',
      messageType: 'text',
      templateName: '',
      messageText: textMsg,
      mediaType: '',
      mediaUrl: '',
      billNumber: '',
      whatsappMessageId: tempMsgId,
      deliveryStatus: 'pending',
      timestamp: new Date().toISOString(),
      staffName: currentUser.username,
    };
    setAllInboxMessages(prev => [...prev, localMsg]);
    if (!text) setInboxReplyText('');

    try {
      const cleanPhone = normalizePhone(phone);

      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: textMsg }
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson?.error?.message || 'Meta API returned error status.');
      }

      const resData = await response.json();
      const realMsgId = resData?.messages?.[0]?.id || 'unknown';

      setAllInboxMessages(prev => prev.map(m => m.whatsappMessageId === tempMsgId ? { ...m, whatsappMessageId: realMsgId, deliveryStatus: 'sent' } : m));

      if (url) {
        const finalMsg = { ...localMsg, whatsappMessageId: realMsgId, deliveryStatus: 'sent' };
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ADD_WHATSAPP_MESSAGE', message: finalMsg })
        });
      }
    } catch (err: any) {
      toast.error('Send Failed', err.message || 'Failed to dispatch custom text.');
      setAllInboxMessages(prev => prev.filter(m => m.whatsappMessageId !== tempMsgId));
    }
  };

  const handleSendTemplate = async (templateType: 'review' | 'coupon' | 'invoice', billObj?: Bill) => {
    if (!selectedConversationPhone) return;

    const phone = selectedConversationPhone;
    const token = settings.waAccessToken || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
    const phoneId = settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      toast.error('Credentials Missing', 'Meta WhatsApp credentials are not configured in system settings.');
      return;
    }

    const profile = profiles.find(p => p && p.phone && normalizePhone(p.phone) === normalizePhone(phone));
    const customerName = profile?.name || phone;

    if (templateType === 'invoice') {
      if (!billObj) return;
      toast.info('Sending Invoice', 'Uploading PDF and sending template...');
      try {
        const { sendCheckoutInvoice } = await import('../../utils/whatsappCloud');
        sendCheckoutInvoice(billObj, settings);
        toast.success('Dispatched', `Invoice template resent to customer ${customerName}.`);
        setTimeout(() => fetchWhatsAppMessages(false), 2000);
      } catch (err: any) {
        toast.error('Resend Failed', err.message);
      }
      return;
    }

    if (templateType === 'review') {
      toast.info('Sending Review', 'Dispatching Google Review request template...');
      try {
        const template = (settings.reviewTemplateName || 'google_review_request').trim();
        const lang = (settings.waLanguage || 'en').trim();
        const { sendWhatsAppTemplate, syncToCRMSpreadsheet } = await import('../../utils/whatsappCloud');

        const res = await sendWhatsAppTemplate({
          phoneNumberId: phoneId,
          accessToken: token,
          to: phone,
          templateName: template,
          languageCode: lang,
          bodyParams: [
            { type: 'text', text: customerName }
          ]
        });

        const cleanPhone = normalizePhone(phone);
        await syncToCRMSpreadsheet('ADD_WHATSAPP_MESSAGE', {
          message: {
            conversationId: cleanPhone,
            customerId: `crm_${cleanPhone}`,
            customerName: customerName,
            phone: cleanPhone,
            direction: 'outgoing',
            messageType: 'template',
            templateName: template,
            messageText: `Hi ${customerName}, please share your review about your visit!`,
            mediaType: '',
            mediaUrl: '',
            billNumber: billObj?.billNumber || '',
            whatsappMessageId: res.messageId,
            deliveryStatus: 'sent',
            timestamp: new Date().toISOString(),
            staffName: currentUser.username || 'System'
          }
        }, settings.crmScriptUrl || '');

        toast.success('Dispatched', 'Google review request template sent successfully.');
        setTimeout(() => fetchWhatsAppMessages(false), 2000);
      } catch (err: any) {
        toast.error('Send Failed', err.message);
      }
      return;
    }

    let messageText = '';
    if (templateType === 'coupon') {
      messageText = `Hello ${customerName} 😊\n\nHere is your exclusive coupon code: **CHAPTERONE10** for 10% off on your next purchase!\n\nThank you for being a valued guest. We look forward to serving you again! ☕🍕`;
    }

    await handleSendInboxChat(messageText);
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversationPhone) return;

    const phone = selectedConversationPhone;
    const token = settings.waAccessToken || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
    const phoneId = settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;

    if (!token || !phoneId) {
      toast.error('Credentials Missing', 'Meta WhatsApp credentials are not configured in system settings.');
      return;
    }

    const profile = profiles.find(p => p && p.phone && normalizePhone(p.phone) === normalizePhone(phone));
    const customerName = profile?.name || phone;

    setAttachmentUploading(true);
    toast.info('Uploading attachment', 'Uploading media file to Meta servers...');

    try {
      const isPdf = file.type === 'application/pdf';
      const fileType = isPdf ? 'document' : 'image';

      const mediaId = await uploadMediaToMeta(file, file.name, file.type, token, phoneId);
      const sendResult = await sendWhatsAppMedia(token, phoneId, phone, fileType, mediaId, file.name);

      const localMsg: WhatsAppMessage = {
        conversationId: normalizePhone(phone),
        customerId: `crm_${normalizePhone(phone)}`,
        customerName,
        phone: normalizePhone(phone),
        direction: 'outgoing',
        messageType: fileType,
        templateName: '',
        messageText: isPdf ? file.name : `Sent image: ${file.name}`,
        mediaType: file.type,
        mediaUrl: mediaId,
        billNumber: '',
        whatsappMessageId: sendResult.messageId,
        deliveryStatus: 'sent',
        timestamp: new Date().toISOString(),
        staffName: currentUser.username,
      };

      setAllInboxMessages(prev => [...prev, localMsg]);

      const objectUrl = URL.createObjectURL(file);
      setMediaCache(prev => ({ ...prev, [mediaId]: objectUrl }));

      if (url) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ADD_WHATSAPP_MESSAGE', message: localMsg })
        });
      }

      toast.success('Media Dispatched', `File ${file.name} sent successfully.`);
    } catch (err: any) {
      toast.error('Upload Failed', err.message || 'Failed to send file attachment.');
    } finally {
      setAttachmentUploading(false);
      e.target.value = '';
    }
  };

  // Load directory profiles and all local bills on initialization
  const loadProfilesAndData = async () => {
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;
    
    // First, load all POS bills to combine details
    let allBills: Bill[] = [];
    try {
      allBills = await getBills();
      setBills(allBills);
    } catch (e) {
      console.warn('Failed to load bills:', e);
    }

    if (url) {
      try {
        const res = await fetch(`${url}?action=GET_PROFILES`);
        if (res.ok) {
          const data = await res.json();
          const mappedProfiles: CRMProfile[] = data.map((row: any) => {
            const phone = String(row.phone || '').trim();
            const customerBills = allBills.filter(b => b.customerPhone.trim() === phone);
            
            const totalSpend = Number(row.totalLifetimeSpend || 0);
            const loyaltyPoints = Number(row.loyaltyPoints || 0);
            const favItems = row.favouriteItems ? String(row.favouriteItems).split(', ') : [];
            const tags = row.tags ? String(row.tags).split(', ') : [];
            
            // Extract notes
            let notesList: string[] = [];
            if (row.notes) {
              try {
                notesList = JSON.parse(row.notes);
              } catch (_) {
                notesList = String(row.notes).split('; ').filter(Boolean);
              }
            }

            return {
              customerId: row.customerId || `crm_${phone}`,
              name: row.name || 'Anonymous Guest',
              phone,
              visitCount: Number(row.visitCount || customerBills.length || 1),
              memberSince: row.created || row.memberSince || (customerBills[0]?.date || ''),
              lastVisit: row.lastVisit || (customerBills[customerBills.length - 1]?.date || ''),
              totalLifetimeSpend: totalSpend || customerBills.reduce((sum, b) => sum + b.grandTotal, 0),
              averageBill: Number(row.averageBill || 0) || (totalSpend / Number(row.visitCount || 1)),
              favouriteItems: favItems.length > 0 ? favItems : customerBills.slice(0, 3).map(b => b.orderedItems[0]?.name).filter(Boolean),
              favouriteCategory: row.favouriteCategory || 'Coffee & Snacks',
              recentOrders: row.recentOrders ? String(row.recentOrders).split(', ') : customerBills.slice(-5).map(b => `${b.date}: ${b.billNumber}`),
              orderFrequency: row.orderFrequency || (customerBills.length > 5 ? 'Weekly' : 'Occasional'),
              whatsappHistory: [],
              invoiceHistory: customerBills.map(b => ({
                billId: b.id,
                billNumber: b.billNumber,
                grandTotal: b.grandTotal,
                date: b.date
              })),
              deliveryStatusHistory: [],
              readStatus: row.readStatus || 'read',
              googleReviewStatus: row.googleReviewStatus || 'Pending',
              loyaltyPoints: loyaltyPoints || Math.floor(totalSpend / 100),
              tags: tags.length > 0 ? tags : (customerBills.length > 5 ? ['VIP', 'Regular'] : ['New Guest']),
              customLabels: [],
              notes: notesList
            };
          });
          setProfiles(mappedProfiles);
          return;
        }
      } catch (err) {
        console.warn('Failed to load profiles from CRM Script, falling back to local compilation:', err);
      }
    }

    // Local compiled profiles fallback
    try {
      const phoneGroups: Record<string, Bill[]> = {};
      allBills.forEach((b) => {
        const phone = b.customerPhone.trim();
        if (phone) {
          if (!phoneGroups[phone]) phoneGroups[phone] = [];
          phoneGroups[phone].push(b);
        }
      });

      const compiledProfiles: CRMProfile[] = Object.entries(phoneGroups).map(([phone, customerBills]) => {
        customerBills.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const name = customerBills[customerBills.length - 1].customerName;
        const totalSpend = customerBills.reduce((acc, curr) => acc + curr.grandTotal, 0);
        const loyaltyPoints = Math.floor(totalSpend / 100);

        const itemCounts: Record<string, number> = {};
        customerBills.forEach((b) => {
          b.orderedItems.forEach((item) => {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
          });
        });
        const favouriteItems = Object.entries(itemCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([itemName]) => itemName)
          .slice(0, 3);

        return {
          customerId: `crm_${phone}`,
          name,
          phone,
          visitCount: customerBills.length,
          memberSince: customerBills[0].date,
          lastVisit: customerBills[customerBills.length - 1].date,
          totalLifetimeSpend: totalSpend,
          averageBill: totalSpend / customerBills.length,
          favouriteItems,
          favouriteCategory: 'Coffee & Snacks',
          recentOrders: customerBills.slice(-5).map((b) => `${b.date}: ${b.billNumber}`),
          orderFrequency: customerBills.length > 5 ? 'Weekly' : 'Occasional',
          whatsappHistory: [],
          invoiceHistory: customerBills.map((b) => ({
            billId: b.id,
            billNumber: b.billNumber,
            grandTotal: b.grandTotal,
            date: b.date,
          })),
          deliveryStatusHistory: [],
          readStatus: 'read',
          googleReviewStatus: 'Pending',
          loyaltyPoints,
          tags: customerBills.length > 5 ? ['VIP', 'Regular'] : ['New Guest'],
          customLabels: [],
          notes: []
        };
      });
      setProfiles(compiledProfiles);
    } catch (err) {
      console.error('Failed to compile CRM customer profiles:', err);
    }
  };

  useEffect(() => {
    loadProfilesAndData();
  }, [settings.crmScriptUrl]);

  // Load timeline events for selected profile
  const loadTimeline = async (phone: string) => {
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;
    if (url) {
      try {
        const res = await fetch(`${url}?action=GET_TIMELINE&phone=${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setTimelineEvents(data);
          return;
        }
      } catch (err) {
        console.warn('Failed to fetch CRM timeline, falling back to local compilation:', err);
      }
    }
    
    // Fallback local timeline compilation
    const customerBills = bills.filter((b) => b.customerPhone.trim() === phone.trim());
    const events: any[] = [];
    if (customerBills.length > 0) {
      events.push({
        id: `evt_create_${phone}`,
        phone,
        timestamp: customerBills[0].entryTime,
        eventType: 'Created',
        description: 'First joined Chapter One Cafe profile catalog.',
      });
    }
    customerBills.forEach((b) => {
      events.push({
        id: `evt_visit_${b.id}`,
        phone,
        timestamp: b.entryTime,
        eventType: 'Visited',
        description: `Checked in at ${b.location} seating section.`,
      });
      events.push({
        id: `evt_inv_${b.id}`,
        phone,
        timestamp: b.exitTime,
        eventType: 'Invoice Generated',
        description: `Settled checkout payment for Bill #${b.billNumber} (Total: ${settings.currency}${b.grandTotal.toFixed(2)}) via ${b.paymentMethod}.`,
      });
    });
    setTimelineEvents(events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  };

  useEffect(() => {
    if (selectedProfile) {
      loadTimeline(selectedProfile.phone);
      setCustomerNotes(selectedProfile.notes || []);
      setAiSummary('');
    } else {
      setTimelineEvents([]);
      setCustomerNotes([]);
      setAiSummary('');
    }
  }, [selectedProfile]);

  // AI customer summary trigger using Groq
  const generateCustomerSummary = async () => {
    if (!selectedProfile) return;
    setLoadingAI(true);
    setAiSummary('');
    try {
      const prompt = `Summarize customer ${selectedProfile.name} who visited ${selectedProfile.visitCount} times, usually orders ${selectedProfile.favouriteItems.join(', ') || 'nothing yet'}, spends around Rs. ${selectedProfile.averageBill.toFixed(0)} per ticket. Tone: brief, professional cashier tips. Maximum 80 words.`;
      const systemPrompt = `You are a helpful POS AI Assistant helping cache staff serve returning customers better.`;
      
      const summary = await queryGroqAI(prompt, systemPrompt);
      setAiSummary(summary);
      toast.success('AI Insights Loaded', `Summary generated for ${selectedProfile.name}`);
    } catch (err: any) {
      toast.error('AI Summary Failed', err.message);
    } finally {
      setLoadingAI(false);
    }
  };

  // Add notes logs
  const handleAddNote = async () => {
    if (!selectedProfile || !noteText.trim()) return;
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;
    const updatedNotes = [...customerNotes, noteText.trim()];
    
    // Add timeline log
    const timelineEvent = {
      id: `note_${Date.now()}`,
      phone: selectedProfile.phone,
      timestamp: new Date().toISOString(),
      eventType: 'Manual Notes',
      description: `Manual Note: "${noteText.trim()}" (logged by ${currentUser.username})`
    };

    if (url) {
      try {
        const { syncToCRMSpreadsheet } = await import('../../utils/whatsappCloud');
        
        // 1. Update customer master notes column
        await syncToCRMSpreadsheet('UPSERT_CUSTOMER', {
          customer: {
            phone: selectedProfile.phone,
            notes: JSON.stringify(updatedNotes)
          }
        }, url);

        // 2. Add timeline event log
        await syncToCRMSpreadsheet('ADD_TIMELINE_EVENT', { event: timelineEvent }, url);
        
        toast.success('Note Logged', 'Customer profile notes updated successfully.');
        setCustomerNotes(updatedNotes);
        setNoteText('');
        loadTimeline(selectedProfile.phone);
      } catch (err) {
        toast.error('Sync Queued', 'Note queued offline for database sync.');
        // Queue in Sync Engine
        try {
          const { SyncEngine } = await import('../../utils/syncEngine');
          await SyncEngine.enqueue('CRM_UPSERT', {
            crmScriptUrl: url,
            phone: selectedProfile.phone,
            notes: JSON.stringify(updatedNotes)
          });
          await SyncEngine.enqueue('CRM_TIMELINE', {
            crmScriptUrl: url,
            event: timelineEvent
          });
        } catch (e) {
          console.error(e);
        }
        setCustomerNotes(updatedNotes);
        setNoteText('');
      }
    } else {
      toast.info('Local Save', 'Note saved in current local session.');
      setCustomerNotes(updatedNotes);
      setNoteText('');
    }
  };

  // Deleting notes (restricted to admin)
  const handleDeleteNote = async (idxToDelete: number) => {
    if (currentUser.role !== 'admin') {
      toast.warning('Access Denied', 'Only system administrators can purge customer note files.');
      return;
    }

    if (!selectedProfile) return;
    const updatedNotes = customerNotes.filter((_, idx) => idx !== idxToDelete);
    const url = settings.crmScriptUrl || import.meta.env.VITE_CRM_SCRIPT_URL;

    if (url) {
      try {
        const { syncToCRMSpreadsheet } = await import('../../utils/whatsappCloud');
        await syncToCRMSpreadsheet('UPSERT_CUSTOMER', {
          customer: {
            phone: selectedProfile.phone,
            notes: JSON.stringify(updatedNotes)
          }
        }, url);
        toast.success('Note Deleted', 'Customer note purged from CRM spreadsheet.');
        setCustomerNotes(updatedNotes);
      } catch (err) {
        toast.error('Deletion Failed', 'Failed to update sheet.');
      }
    } else {
      setCustomerNotes(updatedNotes);
    }
  };

  // Resend or preview invoice PDF
  const handlePreviewInvoice = async (billId: string) => {
    const targetBill = bills.find(b => b.id === billId);
    if (!targetBill) {
      toast.error('Bill Not Found', 'Could not locate the receipt details.');
      return;
    }
    try {
      const { buildReceiptPDFDoc } = await import('../../utils/pdfGenerator');
      const doc = await buildReceiptPDFDoc(targetBill, settings);
      const blob = doc.output('blob');
      setPreviewBlob(blob);
      setPreviewName(`ChapterOne_Invoice_${targetBill.billNumber}.pdf`);
    } catch (err: any) {
      toast.error('Rendering Failed', err.message);
    }
  };

  const handleResendInvoice = async (billId: string) => {
    const targetBill = bills.find(b => b.id === billId);
    if (!targetBill) return;
    toast.info('Sending Invoice', 'Uploading and generating receipt template...');
    try {
      const { sendCheckoutInvoice } = await import('../../utils/whatsappCloud');
      // Triggers background upload and template delivery
      sendCheckoutInvoice(targetBill, settings);
      toast.success('Dispatched', `Invoice resent to customer ${targetBill.customerName}.`);
    } catch (err: any) {
      toast.error('Resend Failed', err.message);
    }
  };



  const renderWhatsAppChatPanel = (phone: string) => {
    const profile = profiles.find(p => p && p.phone && normalizePhone(p.phone) === normalizePhone(phone));
    const customerName = profile?.name || phone;
    const messages = allInboxMessages.filter(
      (m) => m && m.phone && normalizePhone(m.phone) === normalizePhone(phone)
    );
    const EMOJIS = ['☕', '🍕', '🍰', '🥐', '🥤', '😊', '👍', '❤️', '⭐', '🎉', '💡', '💰', '👋', '🙏', '🙌', '✨', '🍽️', '🥗', '🍔', '🍟'];

    // Compute Customer mini-dashboard statistics
    const customerBills = bills.filter(b => b.customerPhone && normalizePhone(b.customerPhone) === normalizePhone(phone));
    const totalSpent = customerBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);
    const visitCount = customerBills.length;
    const avgBillValue = visitCount > 0 ? totalSpent / visitCount : 0;
    const loyaltyPoints = profile?.loyaltyPoints || 0;
    const loyaltyTier = getLoyaltyTier(loyaltyPoints);

    const itemCounts: Record<string, number> = {};
    customerBills.forEach(b => {
      if (b.orderedItems && Array.isArray(b.orderedItems)) {
        b.orderedItems.forEach(item => {
          itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
        });
      }
    });
    const mostOrderedItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => ({ name, qty }));

    return (
      <div className="flex border border-apple-gray-100 bg-[#f5f5f7]/30 rounded-2xl overflow-hidden animate-fade-in relative h-[600px] w-full">
        {/* Chat Message Panel */}
        <div className="flex-1 flex flex-col h-full bg-[#efeae2] border-r border-apple-gray-100">
        <div className="p-4 bg-white border-b border-apple-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">
              {customerName[0]}
            </div>
            <div>
              <h4 className="text-xs font-bold text-apple-gray-800">{customerName}</h4>
              <span className="text-[9px] text-[#86868b] font-mono">{phone}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-[#86868b] font-light bg-apple-gray-50 border border-apple-gray-100 px-2 py-1 rounded-lg">
            <Info className="w-3.5 h-3.5" />
            <span>Direct Custom Replies</span>
          </div>
        </div>

        <div 
          className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col bg-[#efeae2] relative"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M50 50c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10s-10-4.477-10-10 4.477-10 10-10zM10 10c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10S0 25.523 0 20s4.477-10 10-10zm10 8c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm40 40c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8z'/%3E%3C/g%3E%3C/svg%3E")`
          }}
        >
          {messages.map((msg) => {
            const isIncoming = msg.direction === 'incoming';
            const isTemplate = msg.messageType === 'template';
            const isImage = msg.messageType === 'image';
            const isDoc = msg.messageType === 'document';

            const isReview = msg.templateName === 'google_review_request' || (msg.messageText && (msg.messageText.includes('Google Review') || msg.messageText.includes('Please tap the Review button') || msg.messageText.includes('Google review request')));
            const isCoupon = msg.messageText && (msg.messageText.includes('CHAPTERONE10') || msg.messageText.includes('coupon code'));

            return (
              <div 
                key={msg.whatsappMessageId} 
                className={`flex flex-col max-w-[70%] ${isIncoming ? 'self-start items-start' : 'self-end items-end'}`}
              >
                <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                  isIncoming 
                    ? 'bg-white text-apple-gray-800 rounded-tl-none border border-apple-gray-100 shadow-sm' 
                    : 'bg-[#d9fdd3] text-apple-gray-800 rounded-tr-none shadow-sm'
                }`}>
                  {!isIncoming && msg.staffName && (
                    <div className="text-[8px] font-bold text-apple-blue-500 mb-1">
                      {msg.staffName}
                    </div>
                  )}

                  {(isTemplate && msg.billNumber) ? (
                    <div className="bg-white border border-apple-gray-100 rounded-xl p-3.5 shadow-sm space-y-2.5 max-w-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-apple-gray-100">
                        <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider">Invoice Receipt</span>
                        <span className="text-[9px] font-mono text-[#86868b] bg-apple-gray-50 border border-apple-gray-100 px-1.5 py-0.5 rounded">#{msg.billNumber}</span>
                      </div>
                      
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-[#86868b]">Total Amount:</span>
                          <span className="font-bold text-apple-gray-800 font-mono">
                            {settings.currency}{(bills.find(b => b.billNumber === msg.billNumber)?.grandTotal || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#86868b]">Payment Status:</span>
                          <span className={`font-bold uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded-full border ${
                            bills.find(b => b.billNumber === msg.billNumber)
                              ? 'bg-green-50 text-green-600 border-green-100'
                              : 'bg-amber-50 text-amber-600 border-amber-100'
                          }`}>
                            {bills.find(b => b.billNumber === msg.billNumber) ? 'Settled' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={async () => {
                            const b = bills.find(x => x.billNumber === msg.billNumber);
                            if (b) {
                              toast.info('Downloading PDF', `Generating PDF for Bill #${msg.billNumber}...`);
                              try {
                                const { buildReceiptPDFDoc } = await import('../../utils/pdfGenerator');
                                const doc = await buildReceiptPDFDoc(b, settings);
                                doc.save(`Receipt_${msg.billNumber}.pdf`);
                                toast.success('Downloaded', 'PDF downloaded successfully.');
                              } catch (err: any) {
                                toast.error('Download Failed', err.message);
                              }
                            } else {
                              toast.error('Not Found', 'Cannot locate bill in local database.');
                            }
                          }}
                          className="px-2 py-1.5 bg-apple-gray-50 hover:bg-apple-gray-100 border border-apple-gray-150 rounded-lg text-[10px] font-bold text-apple-gray-800 flex items-center justify-center gap-1 transition-all cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5 text-apple-gray-500" />
                          Open PDF
                        </button>
                        <button
                          onClick={() => {
                            const b = bills.find(x => x.billNumber === msg.billNumber);
                            if (b) handleSendTemplate('invoice', b);
                          }}
                          className="px-2 py-1.5 bg-[#0071e3]/10 hover:bg-[#0071e3]/20 border border-apple-blue-100 rounded-lg text-[10px] font-bold text-apple-blue-600 flex items-center justify-center gap-1 transition-all cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Resend
                        </button>
                      </div>
                    </div>
                  ) : isReview ? (
                    <div className="bg-white border border-amber-100 rounded-xl p-3.5 shadow-sm space-y-3 max-w-xs text-apple-gray-800">
                      <div className="flex items-center justify-between pb-2 border-b border-amber-50">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">⭐</span>
                          <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider">Review Request</span>
                        </div>
                        {msg.deliveryStatus === 'failed' && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                            Failed
                          </span>
                        )}
                      </div>

                      {/* Stepper progress timeline inside the message */}
                      <div className="flex items-center justify-between text-[8px] font-bold text-[#86868b] px-1 py-1 bg-apple-gray-50/50 rounded-lg">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[8px] ${
                            (msg.deliveryStatus === 'scheduled' || msg.deliveryStatus === 'sent' || msg.deliveryStatus === 'delivered' || msg.deliveryStatus === 'read')
                              ? 'bg-amber-400 border-amber-400 text-white font-bold'
                              : 'bg-white border-apple-gray-250 text-transparent'
                          }`}>
                            ✓
                          </div>
                          <span>Scheduled</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 transition-colors duration-300 ${
                          (msg.deliveryStatus === 'sent' || msg.deliveryStatus === 'delivered' || msg.deliveryStatus === 'read')
                            ? 'bg-amber-400'
                            : 'bg-apple-gray-200'
                        }`} />
                        <div className="flex flex-col items-center gap-0.5">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[8px] ${
                            (msg.deliveryStatus === 'sent' || msg.deliveryStatus === 'delivered' || msg.deliveryStatus === 'read')
                              ? 'bg-amber-400 border-amber-400 text-white font-bold'
                              : 'bg-white border-apple-gray-250 text-transparent'
                          }`}>
                            ✓
                          </div>
                          <span>Sent</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 transition-colors duration-300 ${
                          (msg.deliveryStatus === 'delivered' || msg.deliveryStatus === 'read')
                            ? 'bg-amber-400'
                            : 'bg-apple-gray-200'
                        }`} />
                        <div className="flex flex-col items-center gap-0.5">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[8px] ${
                            (msg.deliveryStatus === 'delivered' || msg.deliveryStatus === 'read')
                              ? 'bg-amber-400 border-amber-400 text-white font-bold'
                              : 'bg-white border-apple-gray-250 text-transparent'
                          }`}>
                            ✓
                          </div>
                          <span>Delivered</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 transition-colors duration-300 ${
                          (msg.deliveryStatus === 'read')
                            ? 'bg-apple-blue-500'
                            : 'bg-apple-gray-200'
                        }`} />
                        <div className="flex flex-col items-center gap-0.5">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border text-[8px] ${
                            msg.deliveryStatus === 'read'
                              ? 'bg-apple-blue-500 border-apple-blue-500 text-white font-bold'
                              : 'bg-white border-apple-gray-250 text-transparent'
                          }`}>
                            ✓
                          </div>
                          <span className={msg.deliveryStatus === 'read' ? 'text-apple-blue-500' : ''}>Read</span>
                        </div>
                      </div>

                      <p className="text-[11px] leading-relaxed text-apple-gray-700 bg-apple-gray-50/50 p-2 rounded-lg border border-apple-gray-100 font-light">
                        {msg.messageText.includes('scheduled for')
                          ? `Review solicitation will be sent automatically.`
                          : (msg.messageText.split('\n\n')[1] || msg.messageText)
                        }
                      </p>

                      {msg.deliveryStatus === 'failed' ? (
                        <button
                          onClick={async () => {
                            toast.info('Resending Review', 'Retrying review request template...');
                            try {
                              const { Scheduler } = await import('../../utils/scheduler');
                              await Scheduler.resendReview(msg, settings);
                              toast.success('Review Resent', 'Review request sent to Meta API.');
                              setTimeout(() => fetchWhatsAppMessages(false), 2000);
                            } catch (err: any) {
                              toast.error('Resend Failed', err.message);
                            }
                          }}
                          className="w-full py-1.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Resend Review
                        </button>
                      ) : (
                        <a
                          href="https://review-system-khaki.vercel.app/"
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                        >
                          Submit Feedback
                        </a>
                      )}
                    </div>
                  ) : isCoupon ? (
                    <div className="bg-white border-2 border-dashed border-apple-blue-200 rounded-xl p-3.5 shadow-sm space-y-2.5 max-w-xs text-apple-gray-800">
                      <div className="flex items-center gap-2 pb-2 border-b border-apple-blue-55">
                        <div className="w-7 h-7 rounded-full bg-apple-blue-50 text-apple-blue-500 flex items-center justify-center font-bold text-xs">
                          🎁
                        </div>
                        <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider">Coupon Code</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-apple-gray-700">Get 10% off your next checkout order!</p>
                      <div className="flex justify-between items-center bg-apple-gray-50 border border-apple-gray-150 px-2.5 py-1.5 rounded-lg">
                        <span className="text-xs font-mono font-bold tracking-wider text-apple-gray-800">CHAPTERONE10</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('CHAPTERONE10');
                            toast.success('Copied', 'Coupon code copied to clipboard!');
                          }}
                          className="text-[9px] font-bold text-apple-blue-500 hover:underline cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ) : isImage ? (
                    <div className="space-y-1.5 max-w-xs">
                      {mediaCache[msg.mediaUrl] ? (
                        <div className="rounded-xl overflow-hidden border border-apple-gray-100 shadow-sm max-h-48 flex items-center justify-center bg-apple-gray-50">
                          <img 
                            src={mediaCache[msg.mediaUrl]} 
                            alt="WhatsApp attachment" 
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => {
                              const win = window.open();
                              if (win) win.document.write(`<img src="${mediaCache[msg.mediaUrl]}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-48 h-32 rounded-xl border border-apple-gray-150 flex flex-col items-center justify-center gap-2 bg-apple-gray-50 text-[#86868b]">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-[9px]">Downloading image...</span>
                        </div>
                      )}
                      {msg.messageText && msg.messageText !== '[Image]' && (
                        <p className="text-xs text-apple-gray-700 leading-relaxed px-1">{msg.messageText}</p>
                      )}
                    </div>
                  ) : isDoc ? (
                    <div className="bg-white border border-apple-gray-100 rounded-xl p-3 shadow-sm flex items-center justify-between gap-4 max-w-xs">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="w-8 h-8 text-apple-blue-500 shrink-0" />
                        <div className="overflow-hidden">
                          <p className="text-[11px] font-bold text-apple-gray-800 truncate leading-snug">{msg.messageText}</p>
                          <span className="text-[9px] text-[#86868b] uppercase font-mono">PDF Attachment</span>
                        </div>
                      </div>
                      {mediaCache[msg.mediaUrl] ? (
                        <button
                          onClick={() => {
                            const win = window.open();
                            if (win) win.document.write(`<iframe src="${mediaCache[msg.mediaUrl]}" style="width:100%; height:100vh; border:none;" />`);
                          }}
                          className="p-1.5 bg-apple-gray-50 hover:bg-apple-gray-100 border border-apple-gray-200 rounded-lg text-apple-gray-600 transition-all cursor-pointer"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin text-apple-gray-400 shrink-0" />
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.messageText}</p>
                  )}

                  <div className="flex items-center justify-end gap-1 text-[8px] font-mono mt-1 text-[#86868b]">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {!isIncoming && (
                      <span className="text-[9px]">
                        {msg.deliveryStatus === 'scheduled' ? <Clock className="w-2.5 h-2.5 text-amber-500" /> :
                         msg.deliveryStatus === 'pending' ? <Clock className="w-2.5 h-2.5 text-apple-gray-400" /> :
                         msg.deliveryStatus === 'sent' ? <Check className="w-3 h-3 text-apple-gray-400" /> :
                         msg.deliveryStatus === 'delivered' ? <CheckCheck className="w-3 h-3 text-apple-gray-400" /> :
                         msg.deliveryStatus === 'read' ? <CheckCheck className="w-3 h-3 text-apple-blue-500" /> :
                         msg.deliveryStatus === 'failed' ? <X className="w-3 h-3 text-red-500" /> :
                         <X className="w-3 h-3 text-red-500" />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {emojiPickerOpen && (
          <div className="absolute bottom-16 left-4 bg-white border border-apple-gray-150 rounded-xl p-3 shadow-lg z-20 w-48">
            <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-apple-gray-100">
              <span className="text-[9px] font-bold text-apple-gray-800 uppercase tracking-wider">Quick Emojis</span>
              <button onClick={() => setEmojiPickerOpen(false)} className="text-[#86868b] hover:text-apple-gray-800 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2 text-base">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => {
                    setInboxReplyText(prev => prev + e);
                    setEmojiPickerOpen(false);
                  }}
                  className="hover:scale-125 transition-all cursor-pointer text-center"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="p-3.5 bg-white border-t border-apple-gray-100 flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-[10px] font-bold">
            <span className="text-[#86868b] uppercase text-[8px] tracking-wider mr-1 shrink-0">Templates:</span>
            <button
              onClick={() => handleSendTemplate('review')}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-150 text-amber-700 rounded-lg transition-all cursor-pointer shrink-0"
            >
              ⭐ Review Request
            </button>
            <button
              onClick={() => handleSendTemplate('coupon')}
              className="px-2.5 py-1 bg-[#0071e3]/10 hover:bg-[#0071e3]/20 border border-apple-blue-100 text-apple-blue-600 rounded-lg transition-all cursor-pointer shrink-0"
            >
              🎁 10% Off Coupon
            </button>
            {profile && profile.invoiceHistory && profile.invoiceHistory.length > 0 && (
              <div className="relative group">
                <button className="px-2.5 py-1 bg-green-50 hover:bg-green-100 border border-green-150 text-green-700 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1">
                  📄 Resend Invoice
                </button>
                <div className="absolute bottom-full left-0 mb-1 bg-white border border-apple-gray-150 rounded-lg shadow-lg hidden group-hover:block max-h-40 overflow-y-auto w-44 z-10 p-1">
                  <div className="text-[8px] uppercase tracking-wider text-[#86868b] p-1 border-b border-apple-gray-100 font-bold mb-1">Select bill to send</div>
                  {profile.invoiceHistory.map((inv: any) => {
                    const billObj = bills.find(b => b.billNumber === inv.billNumber);
                    return (
                      <button
                        key={inv.billNumber}
                        onClick={() => {
                          if (billObj) handleSendTemplate('invoice', billObj);
                        }}
                        className="w-full text-left p-1 text-[9px] hover:bg-apple-gray-50 rounded text-apple-gray-800 flex justify-between font-mono cursor-pointer"
                      >
                        <span>#{inv.billNumber}</span>
                        <span>{settings.currency}{inv.grandTotal.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachmentUploading}
              className="p-2 hover:bg-apple-gray-50 text-apple-gray-500 rounded-xl transition-all cursor-pointer border border-apple-gray-100"
              title="Attach File (Image/PDF)"
            >
              {attachmentUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-apple-blue-500" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleSendFile} 
              accept="image/*,application/pdf" 
              className="hidden" 
            />

            <button
              onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
              className="p-2 hover:bg-apple-gray-50 text-apple-gray-500 rounded-xl transition-all cursor-pointer border border-apple-gray-100"
              title="Emojis"
            >
              <Smile className="w-4 h-4" />
            </button>

            <input
              type="text"
              placeholder={attachmentUploading ? "Uploading file..." : "Type a custom reply..."}
              value={inboxReplyText}
              onChange={(e) => setInboxReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendInboxChat();
              }}
              disabled={attachmentUploading}
              className="flex-1 text-xs border border-apple-gray-200 rounded-xl px-3 py-2 outline-none bg-apple-gray-50 focus:border-apple-blue-500 focus:bg-white transition-all text-apple-gray-800 font-light"
            />

            <button
              onClick={() => handleSendInboxChat()}
              disabled={!inboxReplyText.trim() || attachmentUploading}
              className="p-2 bg-gradient-to-r from-apple-blue-500 to-[#0071e3] text-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar: Customer CRM Mini-Dashboard */}
        <div className="w-80 bg-white flex flex-col h-full overflow-y-auto p-5 space-y-6 shrink-0">
          <div className="flex flex-col items-center text-center space-y-2 pb-4 border-b border-apple-gray-100">
            <div className="w-16 h-16 rounded-full bg-apple-blue-50 border border-apple-blue-100 text-apple-blue-500 flex items-center justify-center font-bold text-xl shadow-sm shrink-0">
              {customerName[0]}
            </div>
            <div>
              <h3 className="text-xs font-bold text-apple-gray-800 truncate max-w-[220px]">{customerName}</h3>
              <span className="text-[9px] text-[#86868b] font-mono block mt-0.5">{phone}</span>
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border mt-2 ${
              loyaltyTier === 'Gold' ? 'bg-amber-50 text-amber-600 border-amber-250 shadow-sm' :
              loyaltyTier === 'Silver' ? 'bg-slate-50 text-slate-600 border-slate-200 shadow-sm' :
              'bg-orange-50/50 text-orange-600 border-orange-255/50 shadow-sm'
            }`}>
              👑 {loyaltyTier} Tier
            </span>
          </div>

          <div className="space-y-4">
            <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider block">Customer Insights</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-apple-gray-50/50 border border-apple-gray-100 rounded-xl text-center shadow-sm">
                <span className="text-[9px] text-[#86868b] block font-medium uppercase tracking-wider">Total Visits</span>
                <span className="text-sm font-bold text-apple-gray-800 block mt-1">{visitCount}</span>
              </div>
              <div className="p-3 bg-apple-gray-50/50 border border-apple-gray-100 rounded-xl text-center shadow-sm">
                <span className="text-[9px] text-[#86868b] block font-medium uppercase tracking-wider">Total Spent</span>
                <span className="text-sm font-bold text-apple-gray-800 block mt-1">{settings.currency}{totalSpent.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-3 bg-apple-gray-50/50 border border-apple-gray-100 rounded-xl flex justify-between items-center text-xs shadow-sm">
              <span className="text-[9px] text-[#86868b] font-medium uppercase tracking-wider">Avg Order Value</span>
              <span className="font-bold text-apple-gray-800 font-mono">{settings.currency}{avgBillValue.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider block">Top Ordered Items</span>
            {mostOrderedItems.length === 0 ? (
              <span className="text-[10px] text-[#86868b] italic block font-light">No order history available.</span>
            ) : (
              <div className="space-y-2">
                {mostOrderedItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-2 bg-apple-gray-50/30 border border-apple-gray-100/50 rounded-lg shadow-sm">
                    <span className="text-apple-gray-850 truncate max-w-[170px]">{item.name}</span>
                    <span className="text-[10px] font-mono text-[#86868b] font-bold bg-apple-gray-50 border border-apple-gray-100 px-1.5 py-0.5 rounded">x{item.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Filter profiles based on search and tier
  const filteredProfiles = profiles.filter((p) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      p.favouriteItems.some((item) => item.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const tier = getLoyaltyTier(p.loyaltyPoints);
    const matchesTier = tierFilter === 'All' || tier === tierFilter;

    return matchesSearch && matchesTier;
  });

  return (
    <div className="space-y-6">
      
      {/* CRM Segment Sub-Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-apple-gray-800">Customer Relationship Subsystem</h2>
          <p className="text-xs text-[#86868b] font-light">Interact with guest covers, review loyalty progress, and handle direct WhatsApp chat logs.</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-apple cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'bg-apple-gray-800 text-white shadow-sm' 
                : 'bg-white border border-apple-gray-100 text-[#86868b] hover:text-apple-gray-800'
            }`}
          >
            Insights Dashboard
          </button>
          <button
            onClick={() => {
              setActiveTab('overview');
              if (profiles.length > 0 && !selectedProfile) setSelectedProfile(profiles[0]);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-apple cursor-pointer ${
              (activeTab !== 'dashboard' && activeTab !== 'inbox') 
                ? 'bg-apple-gray-800 text-white shadow-sm' 
                : 'bg-white border border-apple-gray-100 text-[#86868b] hover:text-apple-gray-800'
            }`}
          >
            Customer Catalog
          </button>
          <button
            onClick={() => {
              setActiveTab('inbox');
              if (allInboxMessages.length > 0 && !selectedConversationPhone) {
                const uniqPhones = Array.from(new Set(allInboxMessages.map(m => m.phone)));
                if (uniqPhones.length > 0) setSelectedConversationPhone(uniqPhones[0]);
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-apple cursor-pointer ${
              activeTab === 'inbox' 
                ? 'bg-apple-gray-800 text-white shadow-sm' 
                : 'bg-white border border-apple-gray-100 text-[#86868b] hover:text-apple-gray-800'
            }`}
          >
            WhatsApp Inbox
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <CRMDashboard 
          bills={bills} 
          profiles={profiles} 
          messages={inboxMessages}
          currency={settings.currency} 
          onSelectCustomer={(p) => {
            setSelectedProfile(p);
            setActiveTab('overview');
          }}
        />
      ) : activeTab === 'inbox' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in">
          {/* Left Column: WhatsApp Conversations Sidebar */}
          <div className="lg:col-span-1 space-y-4 bg-white border border-apple-gray-100 p-4 rounded-2xl h-[600px] flex flex-col shadow-sm">
            <div className="flex justify-between items-center pb-2 border-b border-apple-gray-50">
              <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                WhatsApp Chats
                {isPollLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-apple-blue-500" />}
              </span>
              <button
                onClick={() => fetchWhatsAppMessages(true)}
                className="text-[9px] font-bold text-apple-blue-500 hover:underline cursor-pointer"
              >
                Refresh
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-apple-gray-300" />
              <input
                type="text"
                placeholder="Search chats or messages..."
                value={inboxSearchTerm}
                onChange={(e) => setInboxSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 border border-apple-gray-100 rounded-xl outline-none bg-apple-gray-50 focus:border-apple-blue-500 transition-apple text-apple-gray-800 font-light"
              />
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {(() => {
                const conversationGroups: Record<string, WhatsAppMessage[]> = {};
                if (Array.isArray(allInboxMessages)) {
                  allInboxMessages.forEach(m => {
                    if (!m || !m.phone) return;
                    const p = normalizePhone(m.phone);
                    if (!p) return;
                    if (!conversationGroups[p]) conversationGroups[p] = [];
                    conversationGroups[p].push(m);
                  });
                }

                const compiledConversations = Object.entries(conversationGroups).map(([phone, msgs]) => {
                  const profile = profiles.find(p => p && p.phone && normalizePhone(p.phone) === phone);
                  const customerName = profile?.name || (msgs[0] && msgs[0].customerName) || phone;

                  const lastMsg = msgs[msgs.length - 1];
                  const lastMsgText = lastMsg ? String(lastMsg.messageText || '') : '';
                  const lastMsgTime = lastMsg && lastMsg.timestamp ? new Date(lastMsg.timestamp) : new Date(0);
                  const lastMsgType = lastMsg ? String(lastMsg.messageType || 'text') : 'text';
                  const lastMsgDirection = lastMsg ? String(lastMsg.direction || 'incoming') : 'incoming';
                  const lastMsgStatus = lastMsg ? String(lastMsg.deliveryStatus || 'sent') : 'sent';

                  const unreadCount = msgs.filter(m => m && m.direction === 'incoming' && m.deliveryStatus !== 'read').length;

                  return {
                    phone,
                    customerName,
                    lastMsgText,
                    lastMsgType,
                    lastMsgDirection,
                    lastMsgStatus,
                    lastMsgTime,
                    unreadCount,
                  };
                });

                compiledConversations.sort((a, b) => b.lastMsgTime.getTime() - a.lastMsgTime.getTime());

                const filtered = compiledConversations.filter(c => 
                  c.customerName.toLowerCase().includes(inboxSearchTerm.toLowerCase()) ||
                  c.phone.includes(inboxSearchTerm) ||
                  c.lastMsgText.toLowerCase().includes(inboxSearchTerm.toLowerCase())
                );

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-8 text-[#86868b] text-xs font-light">
                      No conversations found.
                    </div>
                  );
                }

                return filtered.map((c) => {
                  const isSelected = selectedConversationPhone === c.phone;
                  return (
                    <div
                      key={c.phone}
                      onClick={() => setSelectedConversationPhone(c.phone)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-apple-blue-50 border-apple-blue-150 shadow-sm' 
                          : 'bg-apple-gray-50/40 border-apple-gray-100 hover:border-apple-blue-500/20'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-apple-gray-100 border border-apple-gray-200 text-apple-gray-800 flex items-center justify-center font-bold text-xs shrink-0">
                          {c.customerName[0]}
                        </div>
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs font-bold text-apple-gray-800 truncate leading-snug">{c.customerName}</h4>
                            <span className="text-[9px] text-[#86868b] font-mono">({c.phone})</span>
                          </div>
                          <p className="text-[10px] text-[#86868b] truncate mt-0.5 flex items-center gap-1">
                            {c.lastMsgDirection === 'outgoing' && (
                              <span className="shrink-0">
                                {c.lastMsgStatus === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-apple-blue-500" /> :
                                 c.lastMsgStatus === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-apple-gray-400" /> :
                                 <Check className="w-3.5 h-3.5 text-apple-gray-400" />}
                              </span>
                            )}
                            {c.lastMsgType === 'image' ? '📷 Image' :
                             c.lastMsgType === 'document' ? '📄 Document' :
                             c.lastMsgText}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[8px] text-[#86868b] font-mono">
                          {c.lastMsgTime.getTime() > 0 ? c.lastMsgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-[9px]">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Right Column: Active Conversation */}
          <div className="lg:col-span-2">
            {selectedConversationPhone ? (
              renderWhatsAppChatPanel(selectedConversationPhone)
            ) : (
              <div className="flex flex-col items-center justify-center h-[600px] bg-white border border-apple-gray-100 rounded-2xl shadow-sm text-center p-6 text-[#86868b]">
                <div className="w-16 h-16 rounded-full bg-green-50 text-green-500 flex items-center justify-center font-bold text-2xl mb-4 border border-green-100">
                  💬
                </div>
                <h3 className="text-sm font-bold text-apple-gray-800 mb-1">WhatsApp Web Client</h3>
                <p className="text-xs font-light max-w-xs leading-relaxed">Select a customer profile conversation from the sidebar directory to view incoming messages, check delivery status, and send custom replies.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: Customer Catalog Directory */}
          <div className="lg:col-span-1 space-y-4">
            <div className="apple-card p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-apple-gray-800 uppercase tracking-wider">Directory list</span>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="text-[10px] border border-apple-gray-100 rounded-lg px-2 py-1 bg-white text-apple-gray-800 outline-none"
                >
                  <option value="All">All Tiers</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Platinum">Platinum</option>
                </select>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-apple-gray-300" />
                <input
                  type="text"
                  placeholder="Search customer catalog..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs pl-9 pr-4 py-2 border border-apple-gray-100 rounded-xl outline-none bg-apple-gray-50 focus:border-apple-blue-500 transition-apple text-apple-gray-800 font-light"
                />
              </div>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredProfiles.map((p) => {
                const tier = getLoyaltyTier(p.loyaltyPoints);
                const isSelected = selectedProfile?.phone === p.phone;
                return (
                  <div
                    key={p.phone}
                    onClick={() => setSelectedProfile(p)}
                    className={`apple-card p-4 cursor-pointer hover:border-apple-blue-500/20 transition-all ${
                      isSelected ? 'border-apple-blue-500 shadow-sm' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-apple-gray-50 border border-apple-gray-100 flex items-center justify-center font-bold text-apple-gray-800 text-xs">
                          {p.name[0]}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-apple-gray-800">{p.name}</h4>
                          <p className="text-[10px] text-[#86868b] font-mono mt-0.5">{p.phone}</p>
                        </div>
                      </div>

                      <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                        tier === 'Platinum' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                        tier === 'Gold' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        tier === 'Silver' ? 'bg-slate-50 text-slate-600 border-slate-100' :
                        'bg-orange-50 text-orange-600 border-orange-100'
                      }`}>
                        {tier}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Customer File & Sub-tabs Detail panel */}
          <div className="lg:col-span-2 space-y-4">
            {selectedProfile ? (
              <div className="apple-card p-6 space-y-5">
                
                {/* Profile Card Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-apple-gray-100 pb-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-full bg-apple-blue-50 text-apple-blue-500 flex items-center justify-center font-bold text-lg border border-apple-blue-100">
                      {selectedProfile.name[0]}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-apple-gray-800">{selectedProfile.name}</h3>
                      <p className="text-[10px] text-[#86868b] font-mono mt-0.5">{selectedProfile.phone}</p>
                    </div>
                  </div>

                  {/* Loyalty Progress Tracker */}
                  <div className="w-full md:w-48 space-y-1.5">
                    <div className="flex justify-between text-[9px] font-bold text-apple-gray-800">
                      <span>{getLoyaltyTier(selectedProfile.loyaltyPoints)} Tier</span>
                      <span className="font-mono">{selectedProfile.loyaltyPoints} Points</span>
                    </div>
                    <div className="w-full h-1.5 bg-apple-gray-50 border border-apple-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min((selectedProfile.loyaltyPoints / 1000) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Sub-Tabs Selector */}
                <div className="flex border-b border-apple-gray-50 pb-px gap-1 overflow-x-auto no-scrollbar">
                  {(['overview', 'timeline', 'invoices', 'whatsapp', 'notes', 'analytics'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 border-b-2 text-xs font-bold capitalize transition-apple shrink-0 cursor-pointer ${
                        activeTab === tab 
                          ? 'border-apple-blue-500 text-apple-blue-500' 
                          : 'border-transparent text-[#86868b] hover:text-apple-gray-800'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Sub-Tab Panels Routing */}
                
                {/* 1. OVERVIEW PANEL */}
                {activeTab === 'overview' && (
                  <div className="space-y-5 animate-fade-in">
                    
                    {/* Key Customer Statistics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div className="bg-[#f5f5f7]/40 border border-apple-gray-50 p-3.5 rounded-2xl">
                        <span className="text-[9px] text-[#86868b] font-bold uppercase tracking-wider block">Covers Visits</span>
                        <span className="text-sm font-bold text-apple-gray-800 block mt-1">{selectedProfile.visitCount} visits</span>
                      </div>
                      <div className="bg-[#f5f5f7]/40 border border-apple-gray-50 p-3.5 rounded-2xl">
                        <span className="text-[9px] text-[#86868b] font-bold uppercase tracking-wider block">Lifetime Spend</span>
                        <span className="text-sm font-bold text-apple-gray-800 block mt-1 font-mono">{settings.currency}{selectedProfile.totalLifetimeSpend.toFixed(2)}</span>
                      </div>
                      <div className="bg-[#f5f5f7]/40 border border-apple-gray-50 p-3.5 rounded-2xl">
                        <span className="text-[9px] text-[#86868b] font-bold uppercase tracking-wider block">Average Ticket</span>
                        <span className="text-sm font-bold text-apple-gray-800 block mt-1 font-mono">{settings.currency}{selectedProfile.averageBill.toFixed(2)}</span>
                      </div>
                      <div className="bg-[#f5f5f7]/40 border border-apple-gray-50 p-3.5 rounded-2xl">
                        <span className="text-[9px] text-[#86868b] font-bold uppercase tracking-wider block">Review Status</span>
                        <span className="text-sm font-bold text-apple-gray-800 block mt-1">{selectedProfile.googleReviewStatus}</span>
                      </div>
                    </div>

                    {/* Metadata Card Info */}
                    <div className="bg-[#f5f5f7]/30 border border-apple-gray-100 p-4 rounded-2xl space-y-2 text-xs">
                      <div className="flex justify-between py-1">
                        <span className="text-[#86868b]">Member Since:</span>
                        <span className="font-bold text-apple-gray-800">{selectedProfile.memberSince || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[#86868b]">Last Session Date:</span>
                        <span className="font-bold text-apple-gray-800">{selectedProfile.lastVisit || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[#86868b]">Preferred Seating Section:</span>
                        <span className="font-bold text-apple-gray-800">{selectedProfile.favouriteCategory || 'Main Hall'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-[#86868b]">Order Frequency Interval:</span>
                        <span className="font-bold text-apple-gray-800">{selectedProfile.orderFrequency}</span>
                      </div>
                    </div>

                    {/* Favourite Dishes and Tags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Favourite Items</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProfile.favouriteItems.length > 0 ? (
                            selectedProfile.favouriteItems.map(item => (
                              <span key={item} className="text-[10px] font-bold px-2.5 py-1 bg-white border border-apple-gray-100 rounded-xl text-apple-gray-800">
                                {item}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-[#86868b] font-light">No items recorded yet.</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Profile Tags</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedProfile.tags.map(tag => (
                            <span key={tag} className="text-[9px] font-bold px-2 py-0.5 bg-apple-gray-50 border border-apple-gray-100 rounded-full text-apple-gray-800">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Groq AI customer assistant summary block */}
                    <div className="p-4 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border border-indigo-100 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
                          <Sparkles className="w-4 h-4 text-indigo-500" />
                          <span>AI Customer Insights (Groq)</span>
                        </div>
                        <button
                          onClick={generateCustomerSummary}
                          disabled={loadingAI}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Analyze'}
                        </button>
                      </div>

                      {aiSummary ? (
                        <p className="text-xs text-indigo-950 font-light leading-relaxed">
                          {aiSummary}
                        </p>
                      ) : (
                        <p className="text-[10px] text-indigo-400 font-light">
                          Click analyze to compile AI promotional hints, item pairing suggestions, and review trends for {selectedProfile.name}.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. TIMELINE EVENTS LIST */}
                {activeTab === 'timeline' && (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 animate-fade-in">
                    {timelineEvents.map((evt) => {
                      const text = evt.description.toLowerCase();
                      let bulletColor = 'bg-apple-blue-500';
                      let cardBg = 'bg-[#f5f5f7]/30';
                      let borderStyle = 'border-apple-gray-100';
                      let textStyle = 'text-apple-gray-800';
                      let badgeLabel = 'Event';

                      if (text.includes('failed') || text.includes('error')) {
                        bulletColor = 'bg-red-500 animate-pulse';
                        cardBg = 'bg-red-50/30';
                        borderStyle = 'border-red-200';
                        textStyle = 'text-red-900';
                        badgeLabel = 'Failed';
                      } else if (text.includes('read')) {
                        bulletColor = 'bg-sky-500';
                        cardBg = 'bg-sky-50/20';
                        borderStyle = 'border-sky-200';
                        textStyle = 'text-sky-900';
                        badgeLabel = 'Read';
                      } else if (text.includes('delivered') || text.includes('dispatched') || text.includes('sent successfully')) {
                        bulletColor = 'bg-green-500';
                        cardBg = 'bg-green-50/20';
                        borderStyle = 'border-green-200';
                        textStyle = 'text-green-950';
                        badgeLabel = 'Delivered';
                      } else if (text.includes('loyalty') || text.includes('points')) {
                        bulletColor = 'bg-amber-500';
                        cardBg = 'bg-amber-50/20';
                        borderStyle = 'border-amber-200';
                        textStyle = 'text-amber-900';
                        badgeLabel = 'Loyalty';
                      } else if (text.includes('manual note')) {
                        bulletColor = 'bg-purple-500';
                        cardBg = 'bg-purple-50/20';
                        borderStyle = 'border-purple-200';
                        textStyle = 'text-purple-900';
                        badgeLabel = 'Note';
                      } else if (text.includes('checkout') || text.includes('purchase') || text.includes('invoice generated')) {
                        bulletColor = 'bg-apple-blue-500';
                        cardBg = 'bg-[#e8f3ff]/10';
                        borderStyle = 'border-apple-blue-100';
                        textStyle = 'text-apple-gray-800';
                        badgeLabel = 'Purchase';
                      }

                      return (
                        <div 
                          key={evt.id} 
                          className={`p-4 rounded-2xl border ${borderStyle} ${cardBg} space-y-1.5 transition-all hover:shadow-sm`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${bulletColor}`} />
                              <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                                badgeLabel === 'Failed' ? 'bg-red-100 text-red-600' :
                                badgeLabel === 'Delivered' ? 'bg-green-100 text-green-600' :
                                badgeLabel === 'Read' ? 'bg-sky-100 text-sky-600' :
                                badgeLabel === 'Loyalty' ? 'bg-amber-100 text-amber-600' :
                                badgeLabel === 'Note' ? 'bg-purple-100 text-purple-600' :
                                'bg-apple-gray-100 text-apple-gray-600'
                              }`}>
                                {badgeLabel}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono text-[#86868b]">
                              {new Date(evt.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className={`text-[10.5px] font-light leading-relaxed ${textStyle}`}>
                            {evt.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. INVOICES HISTORY GRID */}
                {activeTab === 'invoices' && (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 animate-fade-in">
                    {selectedProfile.invoiceHistory.length > 0 ? (
                      selectedProfile.invoiceHistory.map((inv) => (
                        <div key={inv.billId} className="p-4 bg-white border border-apple-gray-100 rounded-2xl flex items-center justify-between hover:shadow-sm transition-all">
                          <div className="space-y-1 flex items-center gap-3">
                            <div className="p-2.5 bg-apple-gray-50 text-apple-gray-800 rounded-xl">
                              <FileText className="w-4.5 h-4.5 text-[#86868b]" />
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-apple-gray-800">Bill #{inv.billNumber}</h5>
                              <p className="text-[10px] text-[#86868b]">{inv.date}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-apple-gray-800 font-mono mr-2">{settings.currency}{inv.grandTotal.toFixed(2)}</span>
                            
                            <button
                              onClick={() => handlePreviewInvoice(inv.billId)}
                              className="p-2 hover:bg-apple-gray-100 rounded-xl transition-apple text-apple-gray-800"
                              title="Preview PDF"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleResendInvoice(inv.billId)}
                              className="p-2 hover:bg-apple-gray-100 rounded-xl transition-apple text-apple-blue-500"
                              title="Resend WhatsApp Invoice"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-[#86868b] text-xs font-light">No billing sessions linked.</div>
                    )}
                  </div>
                )}

                {/* 4. WHATSAPP CONVERSATIONAL CHAT INBOX */}
                {activeTab === 'whatsapp' && selectedProfile && selectedProfile.phone && (
                  renderWhatsAppChatPanel(selectedProfile.phone)
                )}

                {/* 5. NOTES DIRECTORY PANEL */}
                {activeTab === 'notes' && (
                  <div className="space-y-4 animate-fade-in">
                    
                    {/* Add note log Form */}
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        placeholder="Likes extra cheese? Birthday today? Log a staff note..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="w-full text-xs border border-apple-gray-200 rounded-xl px-3 py-2 outline-none bg-white text-apple-gray-800 focus:border-apple-blue-500 font-light resize-none"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleAddNote}
                          disabled={!noteText.trim()}
                          className="px-4 py-1.5 bg-apple-gray-800 text-white rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          Log Note
                        </button>
                      </div>
                    </div>

                    {/* Notes logs lists */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-apple-gray-800 uppercase tracking-wider block">Staff Notes Directory</span>
                      {customerNotes.length > 0 ? (
                        customerNotes.map((note, idx) => (
                          <div key={idx} className="p-3.5 bg-apple-gray-50 border border-apple-gray-100 rounded-xl flex items-center justify-between group">
                            <span className="text-xs text-apple-gray-800 font-light leading-relaxed">{note}</span>
                            
                            {currentUser.role === 'admin' && (
                              <button
                                onClick={() => handleDeleteNote(idx)}
                                className="p-1 hover:bg-red-50 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-apple"
                                title="Delete Note (Admin Only)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-[#86868b] text-xs font-light">No custom logs logged.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* 6. ANALYTICS TABS */}
                {activeTab === 'analytics' && (
                  <div className="space-y-4 animate-fade-in text-xs font-light text-apple-gray-800">
                    <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Session Spending Analytics</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-apple-gray-50 rounded-2xl border border-apple-gray-100 space-y-2">
                        <span className="text-[#86868b] font-medium block">Average Cover Spend</span>
                        <span className="text-lg font-bold text-apple-gray-800 font-mono">
                          {settings.currency}{selectedProfile.averageBill.toFixed(2)}
                        </span>
                      </div>

                      <div className="p-4 bg-apple-gray-50 rounded-2xl border border-apple-gray-100 space-y-2">
                        <span className="text-[#86868b] font-medium block">Highest Checkout</span>
                        <span className="text-lg font-bold text-apple-gray-800 font-mono">
                          {settings.currency}{(Math.max(...selectedProfile.invoiceHistory.map(h => h.grandTotal), 0) || selectedProfile.totalLifetimeSpend).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-apple-gray-100 rounded-2xl">
                      <span className="text-[9px] uppercase font-bold text-[#86868b] tracking-wider block mb-3">Recent Visit History</span>
                      <div className="space-y-2.5">
                        {selectedProfile.recentOrders.slice(0, 5).map((ord, idx) => (
                          <div key={idx} className="flex justify-between py-1 border-b border-apple-gray-50 last:border-0">
                            <span className="text-[#86868b]">{ord.split(': ')[0] || 'Session'}</span>
                            <span className="font-bold text-apple-gray-800">{ord.split(': ')[1] || ord}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="apple-card text-center p-12 text-[#86868b] flex flex-col items-center justify-center gap-2 border-dashed">
                <User className="w-10 h-10 text-apple-gray-200" />
                <span className="text-xs font-light">Select a customer from the directory to view detailed profile and timeline.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Large Immersive PDF Preview Modal */}
      {previewBlob && (
        <PDFPreviewModal
          pdfBlob={previewBlob}
          fileName={previewName}
          onClose={() => setPreviewBlob(null)}
        />
      )}
    </div>
  );
};
export default CRM;
