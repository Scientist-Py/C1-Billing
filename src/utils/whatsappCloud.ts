import type { Bill, CafeSettings } from '../types';
import { generateReceiptPDFBlob } from './pdfGenerator';

export interface WhatsAppMessage {
  conversationId: string;
  customerId: string;
  customerName: string;
  phone: string;
  direction: 'incoming' | 'outgoing';
  messageType: string;
  templateName: string;
  messageText: string;
  mediaType: string;
  mediaUrl: string;
  billNumber: string;
  whatsappMessageId: string;
  deliveryStatus: 'scheduled' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  staffName: string;
}

export const uploadMediaToMeta = async (
  fileBlob: Blob,
  filename: string,
  mimeType: string,
  accessToken: string,
  phoneNumberId: string
): Promise<string> => {
  if (!accessToken || !phoneNumberId) {
    throw new Error('Meta API credentials missing — check Access Token and Phone Number ID in Settings.');
  }

  const formData = new FormData();
  formData.append('file', fileBlob, filename);
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', mimeType);

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errJson = await response.json();
      errorMsg = errJson?.error?.message || errorMsg;
    } catch (_) {}
    throw new Error(`Meta Media upload failed (HTTP ${response.status}): ${errorMsg}`);
  }

  const data = await response.json();
  return data.id;
};

export const sendWhatsAppMedia = async (
  accessToken: string,
  phoneNumberId: string,
  to: string,
  type: 'image' | 'document',
  mediaId: string,
  filename?: string
): Promise<{ messageId: string }> => {
  let cleanPhone = to.replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

  const payload: Record<string, any> = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type,
  };

  if (type === 'image') {
    payload.image = { id: mediaId };
  } else {
    payload.document = { id: mediaId, filename: filename || 'file.pdf' };
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson?.error?.message || `Meta media send failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  return { messageId: data?.messages?.[0]?.id || 'unknown' };
};

export const getWhatsAppMediaBlob = async (
  mediaId: string,
  accessToken: string
): Promise<Blob> => {
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to get media metadata: ${metaRes.statusText}`);
  }
  const metaData = await metaRes.json();
  const downloadUrl = metaData.url;
  if (!downloadUrl) {
    throw new Error('Download URL not found in metadata.');
  }

  const fileRes = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!fileRes.ok) {
    throw new Error(`Failed to download media file: ${fileRes.statusText}`);
  }
  return await fileRes.blob();
};

export const uploadPDFToMeta = async (
  pdfBlob: Blob,
  accessToken: string,
  phoneNumberId: string
): Promise<string> => {
  return uploadMediaToMeta(pdfBlob, 'invoice.pdf', 'application/pdf', accessToken, phoneNumberId);
};

/**
 * Official WhatsApp Cloud API Integration Helper.
 * Uses Meta Graph API v21.0 for all media uploads and template message delivery.
 *
 * Flow:
 *   1. Generate PDF Blob
 *   2. POST /PHONE_NUMBER_ID/media  →  receive media_id
 *   3. POST /PHONE_NUMBER_ID/messages with approved invoice_receipt template + media_id
 *
 * Failures are queued for retry. Billing is NEVER blocked.
 */



/** ================================================================
 *  SECTION 2: TEMPLATE MESSAGE SEND
 *  ================================================================ */

interface SendTemplateOptions {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode?: string;
  mediaId?: string;
  mediaUrl?: string; // Added for campaign link URLs
  mediaType?: 'document' | 'image'; // Added to support image templates
  bodyParams?: { type: 'text'; text: string }[];
}

/**
 * Send an approved Meta WhatsApp Template message.
 *
 * Constructs the exact payload format required by Meta:
 *   - header.type = "document" | "image"
 *   - body.parameters = text variables
 *
 * API: POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
 */
export const sendWhatsAppTemplate = async (
  options: SendTemplateOptions
): Promise<{ messageId: string }> => {
  const {
    phoneNumberId,
    accessToken,
    to,
    templateName,
    languageCode = 'en',
    mediaId,
    mediaUrl,
    mediaType = 'document',
    bodyParams = [],
  } = options;

  if (!accessToken || !phoneNumberId) {
    throw new Error('Meta API credentials missing — check Access Token and Phone Number ID in Settings.');
  }

  // Normalize phone: strip non-digits, prepend India +91 if 10-digit local number
  let cleanPhone = to.replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  // Build components array — only include entries that are actually needed
  const components: object[] = [];
  const hasMedia = mediaId || mediaUrl;

  if (hasMedia) {
    const mediaObj: Record<string, any> = {};
    if (mediaId) {
      mediaObj.id = mediaId;
    } else if (mediaUrl) {
      mediaObj.link = mediaUrl;
    }

    if (mediaType === 'document' && mediaId) {
      mediaObj.filename = 'Chapter_One_Invoice.pdf';
    }

    components.push({
      type: 'header',
      parameters: [
        {
          type: mediaType,
          [mediaType]: mediaObj,
        },
      ],
    });
  }

  if (bodyParams.length > 0) {
    // Body component with named text variables ({{1}}, {{2}}, {{3}} etc.)
    components.push({
      type: 'body',
      parameters: bodyParams,
    });
  }

  // Construct exact payload as per Meta API spec
  const messagePayload: Record<string, any> = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  // Only attach components key if there are actual components to send
  // (sending "components": [] or "components": undefined causes API rejection)
  if (components.length > 0) {
    messagePayload.template.components = components;
  }

  // ── DIAGNOSTIC LOG ─────────────────────────────────────────────
  console.log('[WA-DIAG] ============ WHATSAPP TEMPLATE SEND ============');
  console.log('[WA-DIAG] Endpoint: POST https://graph.facebook.com/v21.0/' + phoneNumberId + '/messages');
  console.log('[WA-DIAG] Language code being sent:', languageCode);
  if (bodyParams.length > 0) {
    console.log('[WA-DIAG] Body parameter {{1}}:', bodyParams[0]?.text ?? '(not set)');
    console.log('[WA-DIAG] Body parameter {{2}}:', bodyParams[1]?.text ?? '(not set)');
    console.log('[WA-DIAG] Body parameter {{3}}:', bodyParams[2]?.text ?? '(not set)');
  }
  console.log('[WA-DIAG] Exact request JSON body:');
  console.log(JSON.stringify(messagePayload, null, 2));
  console.log('[WA-DIAG] ====================================================');
  // ────────────────────────────────────────────────────────────────

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    }
  );

  // ── DIAGNOSTIC LOG ─────────────────────────────────────────────
  const rawResponseText = await response.text();
  console.log('[WA-DIAG] Meta /messages HTTP status:', response.status, response.statusText);
  console.log('[WA-DIAG] Exact Meta response body:');
  console.log(rawResponseText);
  // ────────────────────────────────────────────────────────────────

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errJson = JSON.parse(rawResponseText);
      errorMsg = errJson?.error?.message || errorMsg;
    } catch (_) { /* ignore parse errors */ }
    throw new Error(`Meta template send failed (HTTP ${response.status}): ${errorMsg}`);
  }

  const data = JSON.parse(rawResponseText);
  const messageId: string = data?.messages?.[0]?.id || 'unknown';
  return { messageId };
};

/** ================================================================
 *  SECTION 3: CRM SPREADSHEET SYNC
 *  ================================================================ */

/**
 * Post a customer upsert or timeline event to the secondary CRM Spreadsheet.
 * Never touches the POS Google Sheet.
 */
export const syncToCRMSpreadsheet = async (
  action: 'UPSERT_CUSTOMER' | 'ADD_TIMELINE_EVENT' | 'ADD_WHATSAPP_MESSAGE' | 'MARK_MESSAGES_AS_READ',
  payload: any,
  crmScriptUrl: string
): Promise<void> => {
  if (!crmScriptUrl || !crmScriptUrl.trim()) {
    throw new Error('CRM Spreadsheet Web App URL is not configured in Settings.');
  }

  const response = await fetch(crmScriptUrl, {
    method: 'POST',
    // Google Apps Script Web Apps require text/plain to avoid CORS preflight failure
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });

  if (!response.ok) {
    throw new Error(`CRM sync failed (HTTP ${response.status}): ${response.statusText}`);
  }
};

/** ================================================================
 *  SECTION 4: PRIMARY CHECKOUT ORCHESTRATOR (BACKGROUND, NON-BLOCKING)
 *  ================================================================ */

/**
 * Runs the full WhatsApp invoice flow in the background after checkout.
 * This function NEVER throws — all errors are caught and queued for retry.
 * Billing ALWAYS completes regardless of network or API state.
 *
 * Flow:
 *   generateReceiptPDFBlob → uploadPDFToMeta → sendWhatsAppTemplate → syncToCRMSpreadsheet
 */
export const sendCheckoutInvoice = (bill: Bill, settings: CafeSettings): void => {
  // Fire and forget — do NOT await this function at the call site
  _runCheckoutInvoiceBackground(bill, settings).catch((err) => {
    // This outer catch should never be reached since _runCheckoutInvoiceBackground
    // has its own internal try/catch, but kept as a final safety net
    console.error('Unexpected error in sendCheckoutInvoice outer wrapper:', err);
  });
};

/**
 * Internal async implementation of the checkout invoice background task.
 * Separated from sendCheckoutInvoice so the outer function is synchronous (void, non-blocking).
 */
async function _runCheckoutInvoiceBackground(bill: Bill, settings: CafeSettings): Promise<void> {
  const token     = (settings.waAccessToken   || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN   || '').trim();
  const phoneId   = (settings.waPhoneNumberId || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const template  = (settings.waTemplateName  || import.meta.env.VITE_WHATSAPP_TEMPLATE_NAME  || 'invoice_receipt').trim();
  const lang      = (settings.waLanguage      || import.meta.env.VITE_WHATSAPP_LANGUAGE       || 'en').trim();
  const crmUrl    = (settings.crmScriptUrl    || import.meta.env.VITE_CRM_SCRIPT_URL          || '').trim();

  let cleanPhone = bill.customerPhone.replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  if (!cleanPhone) {
    console.warn('[WhatsApp] Customer has no phone number — skipping invoice delivery.');
    return;
  }

  let mediaId = '';
  let messageId = '';
  let whatsappDelivered = false;

  // ----------------------------------------------------------------
  // STEP 1 & 2: Generate PDF → Upload to Meta → Send template
  // ----------------------------------------------------------------
  if (token && phoneId) {
    try {
      // 1. Generate the invoice PDF as a Blob
      const pdfBlob = await generateReceiptPDFBlob(bill, settings);

      // 2. Upload PDF to Meta media endpoint — get back a media_id
      mediaId = await uploadPDFToMeta(pdfBlob, token, phoneId);
      console.log(`[WhatsApp] PDF uploaded. media_id: ${mediaId}`);

      // 3. Send the pre-approved invoice_receipt template with media_id
      const sendResult = await sendWhatsAppTemplate({
        phoneNumberId: phoneId,
        accessToken: token,
        to: bill.customerPhone,
        templateName: template,
        languageCode: lang,
        mediaId,
        bodyParams: [
          { type: 'text', text: bill.customerName },
          { type: 'text', text: bill.billNumber },
          { type: 'text', text: `₹${bill.grandTotal.toFixed(2)}` },
        ],
      });

      messageId = sendResult.messageId;
      whatsappDelivered = true;
      console.log(`[WhatsApp] Template sent. message_id: ${messageId}`);

      // Schedule review request if automatic reviews are enabled
      if (settings.reviewEnableAuto) {
        try {
          const { Scheduler } = await import('./scheduler');
          await Scheduler.scheduleReview(bill, settings);
        } catch (schedErr: any) {
          console.warn('[WhatsApp] Failed to schedule review request:', schedErr.message);
          window.dispatchEvent(new CustomEvent('review-schedule-skipped', { detail: { reason: `Error: ${schedErr.message}` } }));
        }
      } else {
        console.log('[WhatsApp] Automatic reviews disabled in settings:', settings);
        window.dispatchEvent(new CustomEvent('review-schedule-skipped', { 
          detail: { 
            reason: `Automatic reviews are disabled in Settings. Value: ${settings?.reviewEnableAuto} (type: ${typeof settings?.reviewEnableAuto})` 
          } 
        }));
      }

    } catch (waErr: any) {
      console.warn('[WhatsApp] Delivery failed — queuing for retry.', waErr.message);

      // Queue only the minimal retry data — NOT the full sendCheckoutInvoice call
      // to avoid creating infinite retry loops
      try {
        const { SyncEngine } = await import('./syncEngine');
        await SyncEngine.enqueue('WHATSAPP_SEND', {
          billId: bill.id,
          billNumber: bill.billNumber,
          customerName: bill.customerName,
          customerPhone: bill.customerPhone,
          grandTotal: bill.grandTotal,
          paymentMethod: bill.paymentMethod,
          date: bill.date,
          // Store credentials at time of queue so retry doesn't need to re-read settings
          waToken: token,
          waPhoneId: phoneId,
          waTemplate: template,
          waLang: lang,
          crmScriptUrl: crmUrl,
        });
        console.log('[WhatsApp] Task queued in SyncEngine for retry.');
      } catch (queueErr: any) {
        console.error('[WhatsApp] Failed to queue retry task:', queueErr.message);
      }

      // Continue to CRM sync even if WhatsApp failed — they are independent
    }
  } else {
    console.info('[WhatsApp] Credentials not configured — skipping API delivery (no token/phoneId).');
  }

  // ----------------------------------------------------------------
  // STEP 3: Sync to CRM Spreadsheet (independent of WhatsApp result)
  // ----------------------------------------------------------------
  if (crmUrl) {
    const pointsEarned = Math.floor(bill.grandTotal / 100);

    try {
      // A. Upsert customer master record
      await syncToCRMSpreadsheet('UPSERT_CUSTOMER', {
        customer: {
          customerId: `crm_${cleanPhone}`,
          name: bill.customerName,
          phone: bill.customerPhone,
          lastVisit: bill.date,
          totalLifetimeSpend: bill.grandTotal,
          loyaltyPoints: pointsEarned,
          preferredPayment: bill.paymentMethod,
          lastInvoice: bill.billNumber,
          whatsappOptIn: true,
        },
      }, crmUrl);
    } catch (crmErr: any) {
      console.warn('[CRM] UPSERT_CUSTOMER failed:', crmErr.message);
    }

    try {
      // B. Log the purchase event
      await syncToCRMSpreadsheet('ADD_TIMELINE_EVENT', {
        event: {
          id: `purchase_${bill.id}`,
          phone: bill.customerPhone,
          timestamp: new Date().toISOString(),
          eventType: 'Purchase',
          description: `Checkout: Bill #${bill.billNumber} — ₹${bill.grandTotal.toFixed(2)} via ${bill.paymentMethod}.`,
        },
      }, crmUrl);
    } catch (crmErr: any) {
      console.warn('[CRM] Purchase timeline event failed:', crmErr.message);
    }

    // C. Log WhatsApp delivery event (only if it was sent)
    if (whatsappDelivered) {
      try {
        await syncToCRMSpreadsheet('ADD_TIMELINE_EVENT', {
          event: {
            id: `wa_sent_${messageId}`,
            phone: bill.customerPhone,
            timestamp: new Date().toISOString(),
            eventType: 'Invoice Sent',
            description: `WhatsApp template "${template}" dispatched. media_id: ${mediaId}, message_id: ${messageId}.`,
          },
        }, crmUrl);
      } catch (crmErr: any) {
        console.warn('[CRM] Invoice Sent timeline event failed:', crmErr.message);
      }

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
            messageText: `Your invoice for Order #${bill.billNumber} is attached. Total Amount: ₹${bill.grandTotal.toFixed(2)}`,
            mediaType: 'application/pdf',
            mediaUrl: mediaId,
            billNumber: bill.billNumber,
            whatsappMessageId: messageId,
            deliveryStatus: 'sent',
            timestamp: new Date().toISOString(),
            staffName: 'System',
          }
        }, crmUrl);
      } catch (crmErr: any) {
        console.warn('[CRM] Log WHATSAPP_MESSAGES failed:', crmErr.message);
      }
    }

    // D. Log loyalty points
    if (pointsEarned > 0) {
      try {
        await syncToCRMSpreadsheet('ADD_TIMELINE_EVENT', {
          event: {
            id: `loyalty_${bill.id}`,
            phone: bill.customerPhone,
            timestamp: new Date().toISOString(),
            eventType: 'Loyalty Earned',
            description: `+${pointsEarned} loyalty points earned (Rs. ${bill.grandTotal.toFixed(2)} spend / 100).`,
          },
        }, crmUrl);
      } catch (crmErr: any) {
        console.warn('[CRM] Loyalty Earned timeline event failed:', crmErr.message);
      }
    }
  }

  // ----------------------------------------------------------------
  // STEP 4: Send Google Review Request automatically in the background (REMOVED per request)
  // ----------------------------------------------------------------
}
