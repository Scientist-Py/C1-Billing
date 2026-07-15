import { initDB } from './db';
import type { CafeSettings, Bill } from '../types';
import { sendWhatsAppTemplate, syncToCRMSpreadsheet } from './whatsappCloud';
import { SyncEngine } from './syncEngine';

export interface ScheduledJob {
  id: string; // e.g. review_billId
  type: 'review' | 'coupon' | 'birthday' | 'loyalty' | 'festival';
  status: 'scheduled' | 'sent' | 'failed';
  scheduledTime: string; // ISO date string
  createdAt: string; // ISO date string
  payload: {
    billId: string;
    billNumber: string;
    customerPhone: string;
    customerName: string;
    waToken: string;
    waPhoneId: string;
    waTemplate: string;
    waLang: string;
    crmScriptUrl: string;
  };
  retryCount: number;
}

export const getScheduledJobs = async (): Promise<ScheduledJob[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('scheduledJobs', 'readonly');
    const store = transaction.objectStore('scheduledJobs');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const saveScheduledJob = async (job: ScheduledJob): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('scheduledJobs', 'readwrite');
    const store = transaction.objectStore('scheduledJobs');
    const request = store.put(job);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteScheduledJob = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('scheduledJobs', 'readwrite');
    const store = transaction.objectStore('scheduledJobs');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export class Scheduler {
  private static intervalId: number | null = null;
  private static isProcessing = false;
  private static activeTimeouts = new Map<string, any>();

  public static async init(settings: CafeSettings) {
    if (settings.reviewSchedulerEnabled === false) {
      console.log('[Scheduler] Background Scheduler is disabled in settings.');
      this.stop();
      return;
    }

    console.log('[Scheduler] Initializing Background Scheduler...');
    
    // Clear any existing intervals / timeouts
    this.stop();

    // Perform immediate check and run background checking loop
    this.processPendingJobs(settings).catch(console.error);

    this.intervalId = window.setInterval(() => {
      this.processPendingJobs(settings).catch(console.error);
    }, 10000); // Poll every 10 seconds
  }

  public static stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const timeout of this.activeTimeouts.values()) {
      window.clearTimeout(timeout);
    }
    this.activeTimeouts.clear();
  }

  public static async scheduleReview(bill: Bill, settings: CafeSettings) {
    if (!settings.reviewEnableAuto) {
      console.log('[Scheduler] Auto reviews disabled, skipping scheduling.');
      return;
    }

    const token     = (settings.waAccessToken   || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN   || '').trim();
    const phoneId   = (settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const template  = (settings.reviewTemplateName || import.meta.env.VITE_WHATSAPP_REVIEW_TEMPLATE || 'google_review_request').trim();
    const lang      = (settings.waLanguage      || import.meta.env.VITE_WHATSAPP_LANGUAGE       || 'en').trim();
    const crmUrl    = (settings.crmScriptUrl    || import.meta.env.VITE_CRM_SCRIPT_URL          || '').trim();

    let cleanPhone = bill.customerPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }
    if (!cleanPhone) {
      console.warn('[Scheduler] Customer has no phone number — skipping review scheduling.');
      return;
    }

    const delayMinutes = settings.reviewDelayMinutes ?? 10;
    const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
    const jobId = `review_${bill.id}`;

    const job: ScheduledJob = {
      id: jobId,
      type: 'review',
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      scheduledTime,
      payload: {
        billId: bill.id,
        billNumber: bill.billNumber,
        customerPhone: bill.customerPhone,
        customerName: bill.customerName,
        waToken: token,
        waPhoneId: phoneId,
        waTemplate: template,
        waLang: lang,
        crmScriptUrl: crmUrl
      },
      retryCount: 0
    };

    // Save locally
    await saveScheduledJob(job);
    console.log(`[Scheduler] Review job scheduled for ${bill.customerName} at ${scheduledTime}`);

    // Store Review activity row inside the existing WhatsApp messages table
    if (crmUrl) {
      try {
        await syncToCRMSpreadsheet('ADD_WHATSAPP_MESSAGE', {
          message: {
            conversationId: cleanPhone,
            customerId: `crm_${cleanPhone}`,
            customerName: bill.customerName,
            phone: cleanPhone,
            direction: 'outgoing',
            messageType: 'template',
            templateName: template,
            messageText: `Google review request scheduled for ${bill.customerName}`,
            mediaType: '',
            mediaUrl: '',
            billNumber: bill.billNumber,
            whatsappMessageId: `scheduled_review_${bill.id}`,
            deliveryStatus: 'scheduled',
            timestamp: new Date().toISOString(),
            staffName: 'System'
          }
        }, crmUrl);
      } catch (err: any) {
        console.warn('[Scheduler] Failed to log Scheduled status to CRM Sheet:', err.message);
        // Queue in sync tasks so it syncs later
        await SyncEngine.enqueue('WHATSAPP_SEND', {
          customerPhone: bill.customerPhone,
          customerName: bill.customerName,
          billNumber: bill.billNumber,
          grandTotal: 0,
          waToken: token,
          waPhoneId: phoneId,
          waTemplate: template,
          waLang: lang,
          crmScriptUrl: crmUrl,
          isScheduledPlaceholder: true // flag to identify this is the scheduled status log
        });
      }
    }

    // Dispatch real-time scheduling event for toast
    window.dispatchEvent(new CustomEvent('review-scheduled', { detail: { customerName: bill.customerName, time: scheduledTime } }));

    // Trigger immediate timeout run
    const delayMs = Math.max(0, new Date(scheduledTime).getTime() - Date.now());
    const timeout = window.setTimeout(() => {
      this.processPendingJobs(settings).catch(console.error);
    }, delayMs);
    this.activeTimeouts.set(jobId, timeout);
  }

  private static async processPendingJobs(settings: CafeSettings) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const jobs = await getScheduledJobs();
      const now = new Date().toISOString();
      const dueJobs = jobs.filter(j => j.status === 'scheduled' && j.scheduledTime <= now);

      for (const job of dueJobs) {
        console.log(`[Scheduler] Processing job ${job.id} for ${job.payload.customerName}...`);
        
        // Remove active timeout if exists
        if (this.activeTimeouts.has(job.id)) {
          window.clearTimeout(this.activeTimeouts.get(job.id));
          this.activeTimeouts.delete(job.id);
        }

        try {
          const { waPhoneId, waToken, customerPhone, waTemplate, waLang, customerName, billNumber, crmScriptUrl } = job.payload;
          
          if (!waToken || !waPhoneId) {
            throw new Error('Meta API credentials missing for scheduled review.');
          }

          // 1. Send the Meta Template google_review_request
          const sendResult = await sendWhatsAppTemplate({
            phoneNumberId: waPhoneId,
            accessToken: waToken,
            to: customerPhone,
            templateName: waTemplate,
            languageCode: waLang,
            bodyParams: [
              { type: 'text', text: customerName } // {{1}} Customer Name
            ]
          });

          const messageId = sendResult.messageId;
          console.log(`[Scheduler] Meta template review sent successfully. messageId: ${messageId}`);

          // 2. Update CRM Spreadsheet with Status = Sent
          if (crmScriptUrl) {
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
                messageText: `Hi ${customerName}, please share your review about your visit!`,
                mediaType: '',
                mediaUrl: '',
                billNumber: billNumber,
                whatsappMessageId: messageId, // update with real Meta message ID
                deliveryStatus: 'sent',
                timestamp: new Date().toISOString(),
                staffName: 'System'
              }
            }, crmScriptUrl);
          }

          // 3. Dispatch review-sent event for toast
          window.dispatchEvent(new CustomEvent('review-sent', { detail: { customerName } }));

          // Delete job as it is successfully sent
          await deleteScheduledJob(job.id);

        } catch (err: any) {
          console.warn(`[Scheduler] Job ${job.id} failed to process:`, err.message);

          // If retry is enabled, enqueue in Sync Queue
          if (settings.reviewRetryEnabled !== false) {
            try {
              await SyncEngine.enqueue('WHATSAPP_SEND', {
                customerPhone: job.payload.customerPhone,
                customerName: job.payload.customerName,
                billNumber: job.payload.billNumber,
                grandTotal: 0,
                waToken: job.payload.waToken,
                waPhoneId: job.payload.waPhoneId,
                waTemplate: job.payload.waTemplate,
                waLang: job.payload.waLang,
                crmScriptUrl: job.payload.crmScriptUrl,
                isReviewRequest: true
              });
              console.log('[Scheduler] Failed review dispatch enqueued in SyncEngine.');
            } catch (queueErr) {
              console.error('[Scheduler] Failed to queue review retry task:', queueErr);
            }
          }

          // Log failure status to CRM Sheet
          if (job.payload.crmScriptUrl) {
            try {
              let cleanPhone = job.payload.customerPhone.replace(/\D/g, '');
              if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

              await syncToCRMSpreadsheet('ADD_WHATSAPP_MESSAGE', {
                message: {
                  conversationId: cleanPhone,
                  customerId: `crm_${cleanPhone}`,
                  customerName: job.payload.customerName,
                  phone: cleanPhone,
                  direction: 'outgoing',
                  messageType: 'template',
                  templateName: job.payload.waTemplate,
                  messageText: `Google review request dispatch failed: ${err.message}`,
                  mediaType: '',
                  mediaUrl: '',
                  billNumber: job.payload.billNumber,
                  whatsappMessageId: `scheduled_review_${job.payload.billId}`,
                  deliveryStatus: 'failed',
                  timestamp: new Date().toISOString(),
                  staffName: 'System'
                }
              }, job.payload.crmScriptUrl);
            } catch (_) {}
          }

          // Delete job so we don't try forever in this loop
          await deleteScheduledJob(job.id);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Manual resend for failed review cards
  public static async resendReview(msg: any, settings: CafeSettings) {
    const token     = (settings.waAccessToken   || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN   || '').trim();
    const phoneId   = (settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const template  = (msg.templateName         || settings.reviewTemplateName || 'google_review_request').trim();
    const lang      = (settings.waLanguage      || import.meta.env.VITE_WHATSAPP_LANGUAGE       || 'en').trim();
    const crmUrl    = (settings.crmScriptUrl    || import.meta.env.VITE_CRM_SCRIPT_URL          || '').trim();

    if (!token || !phoneId) {
      throw new Error('Meta API credentials missing — check Access Token and Phone Number ID in Settings.');
    }

    const sendResult = await sendWhatsAppTemplate({
      phoneNumberId: phoneId,
      accessToken: token,
      to: msg.phone,
      templateName: template,
      languageCode: lang,
      bodyParams: [
        { type: 'text', text: msg.customerName }
      ]
    });

    const messageId = sendResult.messageId;

    if (crmUrl) {
      let cleanPhone = msg.phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

      await syncToCRMSpreadsheet('ADD_WHATSAPP_MESSAGE', {
        message: {
          conversationId: cleanPhone,
          customerId: `crm_${cleanPhone}`,
          customerName: msg.customerName,
          phone: cleanPhone,
          direction: 'outgoing',
          messageType: 'template',
          templateName: template,
          messageText: `Hi ${msg.customerName}, please share your review about your visit!`,
          mediaType: '',
          mediaUrl: '',
          billNumber: msg.billNumber,
          whatsappMessageId: messageId,
          deliveryStatus: 'sent',
          timestamp: new Date().toISOString(),
          staffName: 'System'
        }
      }, crmUrl);
    }

    // Trigger toast
    window.dispatchEvent(new CustomEvent('review-sent', { detail: { customerName: msg.customerName } }));
  }
}
