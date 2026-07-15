import type { SyncTask } from '../types';
import { initDB } from './db';

// Generic IndexedDB helper methods for syncTasks store
export const getSyncTasks = async (): Promise<SyncTask[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncTasks', 'readonly');
    const store = transaction.objectStore('syncTasks');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveSyncTask = async (task: SyncTask): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncTasks', 'readwrite');
    const store = transaction.objectStore('syncTasks');
    const request = store.put(task);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteSyncTask = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('syncTasks', 'readwrite');
    const store = transaction.objectStore('syncTasks');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Centered Sync Engine managing all external API communications,
 * providing offline queues and retries.
 */
export class SyncEngine {
  private static isProcessing = false;

  /**
   * Enqueue a new sync task for processing.
   */
  public static async enqueue(
    type: 'CHECKIN' | 'CHECKOUT' | 'EXPENSE' | 'AUDIT' | 'CRM_UPSERT' | 'CRM_TIMELINE' | 'WHATSAPP_SEND',
    payload: any
  ): Promise<void> {
    // Prevent duplicate review sends/logs
    if (type === 'WHATSAPP_SEND') {
      const existingTasks = await getSyncTasks();
      const isDuplicate = existingTasks.some(t => 
        t.type === 'WHATSAPP_SEND' &&
        t.payload?.billNumber === payload.billNumber &&
        (t.payload?.waTemplate === payload.waTemplate || t.payload?.isReviewRequest === payload.isReviewRequest) &&
        t.payload?.isScheduledPlaceholder === payload.isScheduledPlaceholder
      );
      if (isDuplicate) {
        console.log(`[SyncEngine] Skipping queueing duplicate WhatsApp send task for bill ${payload.billNumber}`);
        return;
      }
    }

    const task: SyncTask = {
      id: `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    };
    await saveSyncTask(task);
    
    // Trigger immediate background run (non-blocking)
    this.processQueue().catch((err) =>
      console.warn('Background sync failed to start:', err)
    );
  }

  /**
   * Process all pending and failed tasks in the queue.
   */
  public static async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const tasks = await getSyncTasks();
      const sortedTasks = tasks
        .filter((t) => t.status === 'pending' || t.status === 'failed')
        .sort((a, b) => {
          const aNew = (a.retryCount || 0) === 0;
          const bNew = (b.retryCount || 0) === 0;
          if (aNew && !bNew) return -1;
          if (!aNew && bNew) return 1;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });

      for (const task of sortedTasks) {
        task.status = 'processing';
        await saveSyncTask(task);

        try {
          await this.executeTask(task);
          // Success: remove task
          await deleteSyncTask(task.id);
        } catch (error: any) {
          task.retryCount += 1;
          task.lastError = error?.message || 'Unknown network error';
          if (task.retryCount >= 5) {
            task.status = 'blocked';
          } else {
            task.status = 'failed';
          }
          await saveSyncTask(task);
          
          // Stop queue processing on first network failure (network is offline)
          console.warn(`Sync task ${task.id} failed, halting queue. Error:`, error);
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Perform the actual HTTP Sync call.
   */
  private static async executeTask(task: SyncTask): Promise<void> {
    // --- CRM Spreadsheet tasks ---
    if (task.type === 'CRM_UPSERT' || task.type === 'CRM_TIMELINE') {
      const { crmScriptUrl, ...restPayload } = task.payload;
      if (!crmScriptUrl) throw new Error('CRM Script URL missing from task payload.');
      
      const action = task.type === 'CRM_UPSERT' ? 'UPSERT_CUSTOMER' : 'ADD_TIMELINE_EVENT';
      const response = await fetch(crmScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...restPayload }),
      });
      if (!response.ok) throw new Error(`CRM Spreadsheet returned HTTP ${response.status}`);
      return;
    }

    // --- WhatsApp Cloud API send (retry / campaign path) ---
    if (task.type === 'WHATSAPP_SEND') {
      const {
        customerPhone,
        customerName,
        billNumber,
        grandTotal,
        waToken,
        waPhoneId,
        waTemplate,
        waLang,
        crmScriptUrl,
        isScheduledPlaceholder,
        isReviewRequest,
        isCampaign,
        campaignId,
        campaignName,
        offerImage,
        offerText,
        expiryDate
      } = task.payload;

      // Handle offline scheduled placeholder sync
      if (isScheduledPlaceholder) {
        if (crmScriptUrl) {
          const { syncToCRMSpreadsheet } = await import('./whatsappCloud');
          let cleanPhone = customerPhone.replace(/\D/g, '');
          if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
          await syncToCRMSpreadsheet('ADD_WHATSAPP_MESSAGE', {
            message: {
              conversationId: cleanPhone,
              customerId: `crm_${cleanPhone}`,
              customerName: customerName,
              phone: cleanPhone,
              direction: 'outgoing',
              messageType: 'template',
              templateName: waTemplate,
              messageText: `Google review request scheduled for ${customerName}`,
              mediaType: '',
              mediaUrl: '',
              billNumber: billNumber,
              whatsappMessageId: `scheduled_review_${task.id}`,
              deliveryStatus: 'scheduled',
              timestamp: new Date().toISOString(),
              staffName: 'System'
            }
          }, crmScriptUrl);
        }
        return;
      }

      if (!waToken || !waPhoneId) {
        throw new Error('WhatsApp credentials missing from retry task payload.');
      }

      const { sendWhatsAppTemplate, syncToCRMSpreadsheet } = await import('./whatsappCloud');
      const isReview = waTemplate === 'google_review_request' || isReviewRequest;

      let sendResult: { messageId: string };
      try {
        if (isCampaign) {
          const isUrl = offerImage?.startsWith('http');
          sendResult = await sendWhatsAppTemplate({
            phoneNumberId: waPhoneId,
            accessToken: waToken,
            to: customerPhone,
            templateName: waTemplate || 'coupon_offer',
            languageCode: waLang || 'en',
            mediaType: offerImage ? 'image' : undefined,
            mediaId: offerImage && !isUrl ? offerImage : undefined,
            mediaUrl: offerImage && isUrl ? offerImage : undefined,
            bodyParams: [
              { type: 'text', text: customerName },
              { type: 'text', text: offerText || '' },
              { type: 'text', text: expiryDate || '' }
            ]
          });
        } else {
          // Retry only Step 2 + 3 — we cannot regenerate the PDF in a retry worker
          // so we send the template without document attachment as a graceful degradation
          sendResult = await sendWhatsAppTemplate({
            phoneNumberId: waPhoneId,
            accessToken: waToken,
            to: customerPhone,
            templateName: waTemplate || 'invoice_receipt',
            languageCode: waLang || 'en',
            bodyParams: isReview ? [
              { type: 'text', text: customerName }
            ] : [
              { type: 'text', text: customerName },
              { type: 'text', text: billNumber },
              { type: 'text', text: `₹${Number(grandTotal).toFixed(2)}` },
            ],
          });
        }

        // If part of a campaign, update campaign recipient status to 'sent'
        if (isCampaign && campaignId) {
          const { getCampaigns, saveCampaign } = await import('./db');
          const campaigns = await getCampaigns();
          const campaign = campaigns.find(c => c.id === campaignId);
          if (campaign) {
            const recipient = campaign.recipients.find(r => r.phone === customerPhone);
            if (recipient) {
              recipient.deliveryStatus = 'sent';
              recipient.messageId = sendResult.messageId;
              recipient.timestamp = new Date().toISOString();
            }
            campaign.metrics.sent = campaign.recipients.filter(r => r.deliveryStatus === 'sent').length;
            campaign.metrics.queued = campaign.recipients.filter(r => r.deliveryStatus === 'queued').length;
            campaign.metrics.sending = campaign.recipients.filter(r => r.deliveryStatus === 'sending').length;
            await saveCampaign(campaign);
            window.dispatchEvent(new CustomEvent('campaign-progress', { detail: { campaignId } }));
          }
        }
      } catch (err: any) {
        if (isCampaign && campaignId) {
          const { getCampaigns, saveCampaign } = await import('./db');
          const campaigns = await getCampaigns();
          const campaign = campaigns.find(c => c.id === campaignId);
          if (campaign) {
            const recipient = campaign.recipients.find(r => r.phone === customerPhone);
            if (recipient) {
              recipient.deliveryStatus = 'failed';
              recipient.failureReason = err.message || 'Meta API error';
              recipient.timestamp = new Date().toISOString();
            }
            campaign.metrics.failed = campaign.recipients.filter(r => r.deliveryStatus === 'failed').length;
            campaign.metrics.queued = campaign.recipients.filter(r => r.deliveryStatus === 'queued').length;
            campaign.metrics.sending = campaign.recipients.filter(r => r.deliveryStatus === 'sending').length;
            await saveCampaign(campaign);
            window.dispatchEvent(new CustomEvent('campaign-progress', { detail: { campaignId } }));
          }
          // Do not rethrow so task is marked complete (erased from syncTasks queue)
          return;
        }
        throw err;
      }

      // Log to CRM if URL is available
      if (crmScriptUrl) {
        let cleanPhone = customerPhone.replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

        try {
          await syncToCRMSpreadsheet('ADD_TIMELINE_EVENT', {
            event: {
              id: `wa_retry_${sendResult.messageId}`,
              phone: cleanPhone,
              timestamp: new Date().toISOString(),
              eventType: isCampaign ? 'Campaign Sent' : (isReview ? 'Review Sent' : 'Invoice Sent'),
              description: isCampaign
                ? `WhatsApp campaign template "${waTemplate || 'coupon_offer'}" sent to ${customerName}. message_id: ${sendResult.messageId}`
                : (isReview
                    ? `WhatsApp review template sent on retry (queued offline). message_id: ${sendResult.messageId}`
                    : `WhatsApp template sent on retry (no PDF — queued offline). message_id: ${sendResult.messageId}`),
            },
          }, crmScriptUrl);
        } catch (_) {}

        try {
          await syncToCRMSpreadsheet('ADD_WHATSAPP_MESSAGE', {
            message: {
              conversationId: cleanPhone,
              customerId: `crm_${cleanPhone}`,
              customerName: customerName,
              phone: cleanPhone,
              direction: 'outgoing',
              messageType: 'template',
              templateName: waTemplate || (isCampaign ? 'coupon_offer' : 'invoice_receipt'),
              messageText: isCampaign
                ? `🎁 Campaign [${campaignName || 'Coupon Offer'}]: ${offerText} (Valid until ${expiryDate})`
                : (isReview
                    ? `Hi ${customerName}, please share your review about your visit!`
                    : `Your invoice for Order #${billNumber} is attached. Total Amount: ₹${Number(grandTotal).toFixed(2)}`),
              mediaType: (isCampaign && offerImage) ? 'image' : '',
              mediaUrl: (isCampaign && offerImage) ? offerImage : '',
              billNumber: billNumber || '',
              whatsappMessageId: sendResult.messageId,
              deliveryStatus: 'sent',
              timestamp: new Date().toISOString(),
              staffName: 'System',
            }
          }, crmScriptUrl);
        } catch (_) {}
      }
      return;
    }

    // --- POS Google Sheets tasks ---
    const db = await initDB();
    
    const settings = await new Promise<any>((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('cafe_settings');
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => resolve(null);
    });

    if (!settings?.googleSheetsUrl) {
      throw new Error('Google Sheets URL not configured in POS Settings.');
    }

    const response = await fetch(settings.googleSheetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: task.type,
        data: task.payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Sheet returned HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Apps Script returned success=false');
    }
  }
}
