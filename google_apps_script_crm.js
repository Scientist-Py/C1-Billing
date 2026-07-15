/**
 * Chapter One Cafe — Standalone CRM Spreadsheet Backend Apps Script.
 * 
 * Manages Customer Master records, WhatsApp Delivery Status timelines, 
 * incoming client messages, loyalty tiers, and AI promotional insights.
 * 
 * Deployment:
 * 1. Open your CRM Google Sheet.
 * 2. Go to Extensions -> Apps Script.
 * 3. Replace all existing code with this file.
 * 4. Click Deploy -> New Deployment. Select "Web App".
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 5. Copy the generated Web App URL and configure it in the POS settings.
 */

// Webhook validation token (configure the same value in Meta Developer Console and POS Settings)
var WEBHOOK_VERIFY_TOKEN = "chapterone_crm_webhook_token";

/**
 * Handle GET requests (Meta Webhook verification & POS fetches).
 */
function doGet(e) {
  var action = e.parameter.action;
  
  // 1. Meta Webhook Verification check
  if (e.parameter["hub.mode"] === "subscribe" && e.parameter["hub.verify_token"]) {
    if (e.parameter["hub.verify_token"] === WEBHOOK_VERIFY_TOKEN) {
      return ContentService.createTextOutput(e.parameter["hub.challenge"])
        .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput("Forbidden: Verification Token Mismatch")
      .setMimeType(ContentService.MimeType.TEXT);
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 2. Fetch all customer profiles
  if (action === "GET_PROFILES") {
    var sheet = getOrCreateSheet(ss, "CustomerMaster");
    var data = getSheetDataJson(sheet);
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 3. Fetch customer timeline events
  if (action === "GET_TIMELINE") {
    var sheet = getOrCreateSheet(ss, "CustomerTimeline");
    var data = getSheetDataJson(sheet);
    var phone = e.parameter.phone;
    if (phone) {
      // Filter by customer phone number
      var targetPhone = cleanPhoneNumber(phone);
      data = data.filter(function(row) {
        return cleanPhoneNumber(row.phone) === targetPhone;
      });
    }
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 4. Fetch WhatsApp messages
  if (action === "GET_WHATSAPP_MESSAGES") {
    var sheet = getOrCreateSheet(ss, "WHATSAPP_MESSAGES");
    var data = getSheetDataJson(sheet);
    var phone = e.parameter.phone;
    if (phone) {
      var targetPhone = cleanPhoneNumber(phone);
      data = data.filter(function(row) {
        return cleanPhoneNumber(row.phone) === targetPhone;
      });
    }
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ error: "Unsupported action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests (POS checkout updates & Meta webhook delivery reports).
 */
function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload;
  
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid JSON format" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 1. Handle incoming Meta Webhook statuses & messages
  if (payload.object === "whatsapp_business_account" && payload.entry) {
    handleWhatsAppWebhook(ss, payload);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", source: "webhook" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 2. Handle standard POS operations
  var action = payload.action;
  
  if (action === "UPSERT_CUSTOMER") {
    var sheet = getOrCreateSheet(ss, "CustomerMaster");
    var customer = payload.customer;
    upsertCustomer(sheet, customer);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "ADD_TIMELINE_EVENT") {
    var sheet = getOrCreateSheet(ss, "CustomerTimeline");
    var event = payload.event;
    addTimelineEvent(sheet, event);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "ADD_WHATSAPP_MESSAGE") {
    addWhatsAppMessage(ss, payload.message);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "MARK_MESSAGES_AS_READ") {
    var sheet = getOrCreateSheet(ss, "WHATSAPP_MESSAGES");
    markMessagesAsRead(sheet, payload.phone);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "DELETE_CONVERSATION") {
    var sheet = getOrCreateSheet(ss, "WHATSAPP_MESSAGES");
    deleteConversation(sheet, payload.phone);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ error: "Unsupported action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Upsert customer record in CustomerMaster sheet.
 */
function upsertCustomer(sheet, customer) {
  var phone = cleanPhoneNumber(customer.phone);
  if (!phone) return;
  
  var requiredHeaders = [
    "customerId", "name", "phone", "created", "lastVisit", "visitCount", 
    "totalLifetimeSpend", "averageBill", "favouriteItems", "favouriteCategory", 
    "recentOrders", "orderFrequency", "whatsappHistory", "deliveryStatusHistory", 
    "readStatus", "googleReviewStatus", "loyaltyPoints", "tags", "customLabels", 
    "whatsappOptIn", "preferredPayment", "lastInvoice", "vipTier", "notes", "birthday"
  ];
  var headers = ensureHeadersExist(sheet, requiredHeaders);
  var data = sheet.getDataRange().getValues();
  var phoneColIdx = headers.indexOf("phone");
  
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (cleanPhoneNumber(data[i][phoneColIdx]) === phone) {
      rowIndex = i + 1; // 1-indexed row number
      break;
    }
  }
  
  var rowData = [];
  headers.forEach(function(header) {
    var value = customer[header];
    if (value === undefined) {
      // Retain or set fallback values
      if (header === "created") value = new Date().toISOString();
      else if (header === "lastVisit") value = new Date().toISOString();
      else if (header === "visitCount") value = 1;
      else if (header === "totalSpend") value = 0;
      else if (header === "averageBill") value = 0;
      else if (header === "loyaltyPoints") value = 0;
      else if (header === "whatsappOptIn") value = true;
      else value = "";
    }
    
    // Convert array/object details to string for spreadsheet display
    if (Array.isArray(value)) {
      value = value.join(", ");
    } else if (typeof value === "object" && value !== null) {
      value = JSON.stringify(value);
    }
    rowData.push(value);
  });
  
  if (rowIndex > -1) {
    // Update existing row
    // Preserve created date if updating
    var createdColIdx = headers.indexOf("created");
    if (createdColIdx > -1) {
      rowData[createdColIdx] = data[rowIndex - 1][createdColIdx];
    }
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Append new row
    sheet.appendRow(rowData);
  }
}

/**
 * Add a new event row to the CustomerTimeline sheet.
 */
function addTimelineEvent(sheet, event) {
  var headers = getHeaders(sheet);
  var rowData = [];
  headers.forEach(function(header) {
    var value = event[header];
    if (value === undefined) {
      if (header === "timestamp") value = new Date().toISOString();
      else value = "";
    }
    rowData.push(value);
  });
  sheet.appendRow(rowData);
}

/**
 * Handle Webhook events received from Meta.
 */
function handleWhatsAppWebhook(ss, payload) {
  var timelineSheet = getOrCreateSheet(ss, "CustomerTimeline");
  var masterSheet = getOrCreateSheet(ss, "CustomerMaster");
  
  payload.entry.forEach(function(entry) {
    if (!entry.changes) return;
    entry.changes.forEach(function(change) {
      var val = change.value;
      if (!val) return;
      
      // 1. Message status reports (sent, delivered, read, failed)
      if (val.statuses) {
        val.statuses.forEach(function(status) {
          var recipientPhone = cleanPhoneNumber(status.recipient_id);
          var statusType = status.status; // e.g. "sent", "delivered", "read", "failed"
          var msgId = status.id;
          
          var desc = "WhatsApp message invoice update: status changed to " + statusType.toUpperCase() + ".";
          if (status.errors && status.errors.length > 0) {
            desc += " Error: " + status.errors[0].message;
          }
          
          addTimelineEvent(timelineSheet, {
            id: "webhook_status_" + msgId + "_" + statusType,
            phone: recipientPhone,
            timestamp: new Date(Number(status.timestamp) * 1000).toISOString(),
            eventType: "Invoice " + statusType.charAt(0).toUpperCase() + statusType.slice(1),
            description: desc
          });
          
          // Log status report in WHATSAPP_MESSAGES
          updateWhatsAppMessageStatus(ss, msgId, statusType);
        });
      }
      
      // 2. Incoming messages from customers
      if (val.messages) {
        val.messages.forEach(function(msg) {
          var senderPhone = cleanPhoneNumber(msg.from);
          var body = "";
          var mediaType = "";
          var mediaUrl = "";
          
          if (msg.type === "text" && msg.text) {
            body = msg.text.body;
          } else if (msg.type === "image" && msg.image) {
            body = msg.image.caption || "[Image]";
            mediaType = msg.image.mime_type || "image/jpeg";
            mediaUrl = msg.image.id;
          } else if (msg.type === "document" && msg.document) {
            body = msg.document.filename || "[Document]";
            mediaType = msg.document.mime_type || "application/pdf";
            mediaUrl = msg.document.id;
          } else {
            body = "[Received " + msg.type + " message]";
          }
          
          // Log incoming message in timeline
          addTimelineEvent(timelineSheet, {
            id: "incoming_" + msg.id,
            phone: senderPhone,
            timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
            eventType: "Incoming Message",
            description: "Message body: \"" + body + "\""
          });
          
          // Try to look up customer name from CustomerMaster
          var customerName = getCustomerNameFromMaster(masterSheet, senderPhone);
          if (!customerName) {
            if (val.contacts && val.contacts.length > 0 && val.contacts[0].profile) {
              customerName = val.contacts[0].profile.name;
            }
          }
          if (!customerName) {
            customerName = senderPhone;
          }
          
          // Log incoming message in WHATSAPP_MESSAGES
          addWhatsAppMessage(ss, {
            conversationId: senderPhone,
            customerId: "crm_" + senderPhone,
            customerName: customerName,
            phone: senderPhone,
            direction: "incoming",
            messageType: msg.type,
            templateName: "",
            messageText: body,
            mediaType: mediaType,
            mediaUrl: mediaUrl,
            billNumber: "",
            whatsappMessageId: msg.id,
            deliveryStatus: "read",
            timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
            staffName: ""
          });
          
          // Increment visit notes or set opt-in status if they say STOP or OPTIN
          var cleanBody = body.trim().toUpperCase();
          if (cleanBody === "STOP" || cleanBody === "UNSUBSCRIBE") {
            updateCustomerOptIn(masterSheet, senderPhone, false);
          } else if (cleanBody === "START" || cleanBody === "SUBSCRIBE" || cleanBody === "OPTIN") {
            updateCustomerOptIn(masterSheet, senderPhone, true);
          }
        });
      }
    });
  });
}

/**
 * Opt-in or Opt-out customer from WhatsApp campaigns.
 */
function updateCustomerOptIn(sheet, phone, status) {
  var headers = getHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  var phoneColIdx = headers.indexOf("phone");
  var optInColIdx = headers.indexOf("whatsappOptIn");
  
  if (phoneColIdx === -1 || optInColIdx === -1) return;
  
  for (var i = 1; i < data.length; i++) {
    if (cleanPhoneNumber(data[i][phoneColIdx]) === phone) {
      sheet.getCell(i + 1, optInColIdx + 1).setValue(status);
      break;
    }
  }
}

/**
 * Helper: ensure we get or create the requested spreadsheet name and apply standard headers.
 */
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  
  sheet = ss.insertSheet(name);
  var defaultHeaders = [];
  if (name === "CustomerMaster") {
    defaultHeaders = [
      "customerId", "name", "phone", "created", "lastVisit", "visitCount", 
      "totalLifetimeSpend", "averageBill", "favouriteItems", "favouriteCategory", 
      "recentOrders", "orderFrequency", "whatsappHistory", "deliveryStatusHistory", 
      "readStatus", "googleReviewStatus", "loyaltyPoints", "tags", "customLabels", 
      "whatsappOptIn", "preferredPayment", "lastInvoice", "vipTier", "notes", "birthday"
    ];
  } else if (name === "CustomerTimeline") {
    defaultHeaders = ["id", "phone", "timestamp", "eventType", "description"];
  } else if (name === "WHATSAPP_MESSAGES") {
    defaultHeaders = [
      "conversationId", "customerId", "customerName", "phone", "direction",
      "messageType", "templateName", "messageText", "mediaType", "mediaUrl",
      "billNumber", "whatsappMessageId", "deliveryStatus", "timestamp", "staffName"
    ];
  }
  
  if (defaultHeaders.length > 0) {
    sheet.appendRow(defaultHeaders);
    sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold");
  }
  return sheet;
}

/**
 * Helper: serialize spreadsheet rows into an array of JSON objects.
 */
function getSheetDataJson(sheet) {
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length <= 1) return [];
  
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var result = [];
  
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var cellVal = row[c];
      // Auto-parse numbers or formatted text
      obj[headers[c]] = cellVal;
    }
    result.push(obj);
  }
  return result;
}

/**
 * Helper: extract list of header strings from a sheet.
 */
function getHeaders(sheet) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  return range.getValues()[0].map(function(h) { return String(h).trim(); });
}

function ensureHeadersExist(sheet, requiredHeaders) {
  var headers = getHeaders(sheet);
  var missing = [];
  requiredHeaders.forEach(function(h) {
    if (headers.indexOf(h) === -1) {
      missing.push(h);
    }
  });
  if (missing.length > 0) {
    var lastCol = sheet.getLastColumn();
    var range = sheet.getRange(1, lastCol + 1, 1, missing.length);
    range.setValues([missing]);
    range.setFontWeight("bold");
    return getHeaders(sheet);
  }
  return headers;
}

/**
 * Helper: standardize formatting of phone numbers (remove symbols, space, handle country codes).
 */
function cleanPhoneNumber(phone) {
  if (!phone) return "";
  var clean = String(phone).replace(/\D/g, "");
  if (clean.length === 10) {
    clean = "91" + clean; // Default India prefix
  }
  return clean;
}

function updateWhatsAppMessageStatus(ss, msgId, statusType) {
  var sheet = getOrCreateSheet(ss, "WHATSAPP_MESSAGES");
  var headers = getHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  var msgIdColIdx = headers.indexOf("whatsappMessageId");
  var statusColIdx = headers.indexOf("deliveryStatus");
  if (msgIdColIdx === -1 || statusColIdx === -1) return;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][msgIdColIdx]).trim() === String(msgId).trim()) {
      sheet.getRange(i + 1, statusColIdx + 1).setValue(statusType);
      break;
    }
  }
}

function addWhatsAppMessage(ss, message) {
  var sheet = getOrCreateSheet(ss, "WHATSAPP_MESSAGES");
  var requiredHeaders = [
    "conversationId", "customerId", "customerName", "phone", "direction",
    "messageType", "templateName", "messageText", "mediaType", "mediaUrl",
    "billNumber", "whatsappMessageId", "deliveryStatus", "timestamp", "staffName"
  ];
  var headers = ensureHeadersExist(sheet, requiredHeaders);
  var data = sheet.getDataRange().getValues();
  var msgIdColIdx = headers.indexOf("whatsappMessageId");
  
  var msgId = message.whatsappMessageId;
  var rowIndex = -1;
  
  if (msgId && msgIdColIdx > -1) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][msgIdColIdx]).trim() === String(msgId).trim()) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  // Fallback lookup: match by billNumber and templateName (helps transition "Scheduled" -> "Sent" / "Failed")
  var billColIdx = headers.indexOf("billNumber");
  var templateColIdx = headers.indexOf("templateName");
  if (rowIndex === -1 && message.billNumber && message.templateName && billColIdx > -1 && templateColIdx > -1) {
    for (var i = 1; i < data.length; i++) {
      var sheetBill = String(data[i][billColIdx]).trim();
      var msgBill = String(message.billNumber).trim();
      var sheetTemplate = String(data[i][templateColIdx]).trim();
      var msgTemplate = String(message.templateName).trim();
      if (sheetBill === msgBill && sheetTemplate === msgTemplate) {
        rowIndex = i + 1;
        break;
      }
    }
  }
  
  var rowData = [];
  headers.forEach(function(header) {
    var value = message[header];
    if (value === undefined) value = "";
    rowData.push(value);
  });
  
  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function markMessagesAsRead(sheet, phone) {
  var headers = getHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  
  var phoneColIdx = headers.indexOf("phone");
  var dirColIdx = headers.indexOf("direction");
  var statusColIdx = headers.indexOf("deliveryStatus");
  
  if (phoneColIdx === -1 || dirColIdx === -1 || statusColIdx === -1) return;
  
  var targetPhone = cleanPhoneNumber(phone);
  for (var i = 1; i < data.length; i++) {
    if (cleanPhoneNumber(data[i][phoneColIdx]) === targetPhone && 
        data[i][dirColIdx] === "incoming" && 
        data[i][statusColIdx] !== "read") {
      sheet.getRange(i + 1, statusColIdx + 1).setValue("read");
    }
  }
}

function getCustomerNameFromMaster(masterSheet, phone) {
  var headers = getHeaders(masterSheet);
  var data = masterSheet.getDataRange().getValues();
  
  var phoneColIdx = headers.indexOf("phone");
  var nameColIdx = headers.indexOf("name");
  
  if (phoneColIdx === -1 || nameColIdx === -1) return null;
  
  var targetPhone = cleanPhoneNumber(phone);
  for (var i = 1; i < data.length; i++) {
    if (cleanPhoneNumber(data[i][phoneColIdx]) === targetPhone) {
      return data[i][nameColIdx];
    }
  }
  return null;
}

function deleteConversation(sheet, phone) {
  var headers = getHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  var phoneColIdx = headers.indexOf("phone");
  if (phoneColIdx === -1) return;
  
  var targetPhone = cleanPhoneNumber(phone);
  for (var i = data.length - 1; i >= 1; i--) {
    if (cleanPhoneNumber(data[i][phoneColIdx]) === targetPhone) {
      sheet.deleteRow(i + 1);
    }
  }
}
