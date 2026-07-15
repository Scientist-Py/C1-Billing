/**
 * Chapter One Cafe - Smart Seating & Billing POS Sync Script
 * 
 * Paste this script into your Google Sheet's Extensions -> Apps Script.
 * Deploy it as a Web App:
 * 1. Click "Deploy" -> "New Deployment"
 * 2. Select "Web App"
 * 3. Set Execute as: "Me" (your email)
 * 4. Set Who has access: "Anyone"
 * 5. Copy the generated Web App URL and paste it into your POS settings.
 */

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
var CONFIG = {
  VERIFY_TOKEN: "ChapterOneWebhookToken123!", // Change this to your chosen Meta verification token
  GOOGLE_SHEET_ID: "" // Leave blank to auto-detect active spreadsheet ID
};

var ACTIONS = {
  CHECKIN: "CHECKIN",
  CHECKOUT: "CHECKOUT",
  DELETE_BILL: "DELETE_BILL",
  DELETE_CUSTOMER: "DELETE_CUSTOMER",
  SAVE_INVENTORY: "SAVE_INVENTORY",
  LOG_INVENTORY: "LOG_INVENTORY",
  CLEAR_DATABASE: "CLEAR_DATABASE",
  AUDIT: "AUDIT",
  STAFF_LOGIN: "STAFF_LOGIN",
  STAFF_LOGOUT: "STAFF_LOGOUT",
  SAVE_EXPENSE: "SAVE_EXPENSE",
  DELETE_EXPENSE: "DELETE_EXPENSE"
};

// ==========================================
// RESPONSE FORMATTERS
// ==========================================

function success(message) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "success",
      message: message || ""
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function failure(message) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "error",
      message: message
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// RESOURCE RESOLVERS & CACHE
// ==========================================

function getActiveSpreadsheetId() {
  if (CONFIG.GOOGLE_SHEET_ID && CONFIG.GOOGLE_SHEET_ID.trim().length > 0) {
    return CONFIG.GOOGLE_SHEET_ID;
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  } catch (err) {
    throw new Error("Spreadsheet ID could not be auto-detected. Please configure GOOGLE_SHEET_ID in CONFIG.");
  }
}

/**
 * Request-scoped sheet cache to prevent redundant getSheetByName calls.
 */
function getSheetsCache(ss) {
  return {
    activeCheckins: getOrCreateSheet(ss, "Active CheckIns", 1),
    sales: getOrCreateSheet(ss, "Sales & Bills", 2),
    auditLogs: getOrCreateSheet(ss, "Audit Logs", 3),
    staffAttendance: getOrCreateSheet(ss, "Staff Attendance", 4),
    inventoryItems: getOrCreateSheet(ss, "Inventory Items", 5),
    inventoryLogs: getOrCreateSheet(ss, "Inventory Logs", 6),
    expensesLogs: getOrCreateSheet(ss, "Expenses Logs", 7),
    whatsappEvents: getOrCreateSheet(ss, "WhatsApp Events", 8),
    webhookLogs: getOrCreateSheet(ss, "Webhook Logs", 9)
  };
}

// ==========================================
// ENTRY POINTS (GET / POST)
// ==========================================

/**
 * Handle GET requests (verification of Webhook by Meta OR pull sync request by POS).
 */
function doGet(e) {
  try {
    // 1. Meta Webhook Verification Check
    if (e && e.parameter && e.parameter['hub.mode'] === 'subscribe' && e.parameter['hub.verify_token']) {
      if (e.parameter['hub.verify_token'] === CONFIG.VERIFY_TOKEN) {
        return ContentService.createTextOutput(e.parameter['hub.challenge']);
      } else {
        return ContentService.createTextOutput("Forbidden: Verification Token Mismatch")
          .setMimeType(ContentService.MimeType.TEXT);
      }
    }

    // 2. Fallback to existing POS Sync Pull operation
    var sheetId = getActiveSpreadsheetId();
    var ss = SpreadsheetApp.openById(sheetId);
    var sheets = getSheetsCache(ss);
    
    // Fetch active checkins
    var customers = [];
    if (sheets.activeCheckins.getLastRow() > 1) {
      var lastRow = sheets.activeCheckins.getLastRow();
      var data = sheets.activeCheckins.getRange(2, 1, lastRow - 1, 8).getValues();
      for (var i = 0; i < data.length; i++) {
        var rawJson = data[i][7];
        if (rawJson) {
          try {
            var cust = JSON.parse(rawJson);
            if (cust.status !== 'deleted') {
              customers.push(cust);
            }
          } catch(e) {}
        }
      }
    }
    
    // Fetch past bills
    var bills = [];
    if (sheets.sales.getLastRow() > 1) {
      var lastRowSales = sheets.sales.getLastRow();
      var data = sheets.sales.getRange(2, 1, lastRowSales - 1, 16).getValues();
      for (var i = 0; i < data.length; i++) {
        var rawJson = data[i][15];
        if (rawJson) {
          try {
            bills.push(JSON.parse(rawJson));
          } catch(e) {}
        }
      }
    }

    // Fetch Inventory Items
    var inventory = [];
    if (sheets.inventoryItems.getLastRow() > 1) {
      var lastRowInv = sheets.inventoryItems.getLastRow();
      var data = sheets.inventoryItems.getRange(2, 1, lastRowInv - 1, 7).getValues();
      for (var i = 0; i < data.length; i++) {
        var rawJson = data[i][6];
        if (rawJson) {
          try {
            inventory.push(JSON.parse(rawJson));
          } catch(e) {}
        }
      }
    }

    // Fetch Inventory Logs
    var inventoryLogs = [];
    if (sheets.inventoryLogs.getLastRow() > 1) {
      var lastRowInvLogs = sheets.inventoryLogs.getLastRow();
      var data = sheets.inventoryLogs.getRange(2, 1, lastRowInvLogs - 1, 9).getValues();
      for (var i = 0; i < data.length; i++) {
        var rawJson = data[i][8];
        if (rawJson) {
          try {
            inventoryLogs.push(JSON.parse(rawJson));
          } catch(e) {}
        }
      }
    }

    // Fetch Expenses Logs
    var expenses = [];
    if (sheets.expensesLogs.getLastRow() > 1) {
      var lastRowExp = sheets.expensesLogs.getLastRow();
      var data = sheets.expensesLogs.getRange(2, 1, lastRowExp - 1, 9).getValues();
      for (var i = 0; i < data.length; i++) {
        var rawJson = data[i][8];
        if (rawJson) {
          try {
            expenses.push(JSON.parse(rawJson));
          } catch(e) {}
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      customers: customers,
      bills: bills,
      inventory: inventory,
      inventoryLogs: inventoryLogs,
      expenses: expenses
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return failure(err.toString());
  }
}

/**
 * Handle POST requests (Meta Webhook Updates OR POS Sync Push requests).
 */
function doPost(e) {
  var sheetId = "";
  var ss = null;
  var data = null;
  
  try {
    sheetId = getActiveSpreadsheetId();
    ss = SpreadsheetApp.openById(sheetId);
  } catch (err) {
    return failure("Failed to open active spreadsheet: " + err.toString());
  }

  if (!e || !e.postData || !e.postData.contents) {
    return success("Empty POST body");
  }

  // Protect the JSON parser
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    Logger.log("Failed to parse JSON payload: " + e.postData.contents);
    logWebhookError(ss, err, { rawBody: e.postData.contents });
    return success("Processed malformed payload fallback");
  }

  try {
    // 1. Meta Webhook Incoming Payload Dispatcher
    if (data && data.object === 'whatsapp_business_account') {
      var sheets = getSheetsCache(ss);
      return handleWhatsAppWebhook(ss, sheets, data);
    }
    
    // 2. Existing POS Sync Push Actions
    if (data && data.action) {
      var action = data.action;
      var payload = data.payload ?? data.data ?? {}; // Guarantees payload is always an object
      return processPOSRequest(ss, action, payload);
    }
    
    return success("No classified action executed");
  } catch (err) {
    logWebhookError(ss, err, data);
    return success("Sync process halted with warnings: " + err.toString());
  }
}

/**
 * Route POS Sync Actions using switch dispatcher
 */
function processPOSRequest(ss, action, payload) {
  var sheets = getSheetsCache(ss);
  
  switch (action) {
    case ACTIONS.CHECKIN:
      handleCheckin(ss, sheets, payload);
      break;
    case ACTIONS.CHECKOUT:
      handleCheckout(ss, sheets, payload);
      break;
    case ACTIONS.DELETE_BILL:
      handleDeleteBill(ss, sheets, payload);
      break;
    case ACTIONS.DELETE_CUSTOMER:
      handleDeleteCustomer(ss, sheets, payload);
      break;
    case ACTIONS.SAVE_INVENTORY:
    case ACTIONS.LOG_INVENTORY:
      handleInventory(sheets, action, payload);
      break;
    case ACTIONS.CLEAR_DATABASE:
      handleClearDatabase(ss, sheets);
      break;
    case ACTIONS.AUDIT:
      handleAudit(sheets, payload);
      break;
    case ACTIONS.STAFF_LOGIN:
    case ACTIONS.STAFF_LOGOUT:
      handleStaff(sheets, action, payload);
      break;
    case ACTIONS.SAVE_EXPENSE:
    case ACTIONS.DELETE_EXPENSE:
      handleExpenses(sheets, action, payload);
      break;
    default:
      Logger.log("Unknown POS sync action: " + action);
      logWebhookError(ss, new Error("Unknown POS Action: " + action), payload);
      return failure("Action not supported: " + action);
  }
  
  return success();
}

// ==========================================
// ACTION SUB-HANDLERS
// ==========================================

function handleCheckin(ss, sheets, payload) {
  var sheet = sheets.activeCheckins;
  setupHeaders(sheet, ["Customer ID", "Name", "Phone", "Seating Area", "Guests", "Check-In Time", "Notes", "Raw JSON"]);
  
  var checkInTime = formatTimeOnly(payload.entryTime);
  var rowData = [
    payload.id,
    payload.name,
    payload.phone,
    payload.location,
    payload.numGuests,
    checkInTime,
    payload.notes,
    JSON.stringify(payload)
  ];

  var foundRow = findRowIndexById(sheet, 1, payload.id);
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  
  formatCheckinSheet(sheet);
  createOrUpdateDashboard(ss);
}

function handleCheckout(ss, sheets, payload) {
  var itemsSummary = "";
  if (payload.orderedItems && payload.orderedItems.length > 0) {
    var itemsList = [];
    for (var i = 0; i < payload.orderedItems.length; i++) {
      var item = payload.orderedItems[i];
      itemsList.push(item.quantity + "x " + item.name);
    }
    itemsSummary = itemsList.join(", ");
  }

  var checkInTime = "";
  var checkOutTime = "";
  var timeSpent = "";
  var seatingCharge = "";

  if (payload.location === 'Basement') {
    checkInTime = formatTimeOnly(payload.entryTime);
    checkOutTime = formatTimeOnly(payload.exitTime);
    timeSpent = payload.timeSpentMinutes + " mins";
    seatingCharge = payload.basementCharges;
  }

  var salesSheet = sheets.sales;
  setupHeaders(salesSheet, [
    "Bill Number", "Date", "Name", "Phone", "Seating Area", 
    "Check-In", "Check-Out", "Time Spent", "Food Total", 
    "Seating Charge", "Grand Total", "Payment Method", "Status", "Cashier", "Items Ordered", "Raw JSON"
  ]);
  
  var rowData = [
    payload.billNumber,
    payload.date,
    payload.customerName,
    payload.customerPhone,
    payload.location,
    checkInTime,
    checkOutTime,
    timeSpent,
    payload.foodTotal,
    seatingCharge,
    payload.grandTotal,
    payload.paymentMethod,
    payload.status,
    payload.cashierName,
    itemsSummary,
    JSON.stringify(payload)
  ];

  var foundRow = findRowIndexById(salesSheet, 1, payload.billNumber);
  if (foundRow !== -1) {
    salesSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    salesSheet.appendRow(rowData);
  }

  formatSalesSheet(salesSheet);
  
  var checkinSheet = sheets.activeCheckins;
  if (checkinSheet) {
    var foundCheckinRow = findRowIndexById(checkinSheet, 1, payload.customerId);
    if (foundCheckinRow !== -1) {
      checkinSheet.deleteRow(foundCheckinRow);
    }
  }
  
  createOrUpdateDashboard(ss);
}

function handleDeleteBill(ss, sheets, payload) {
  var salesSheet = sheets.sales;
  if (salesSheet) {
    var foundRow = findRowIndexById(salesSheet, 1, payload.billNumber);
    if (foundRow !== -1) {
      salesSheet.deleteRow(foundRow);
    }
  }
  createOrUpdateDashboard(ss);
}

function handleDeleteCustomer(ss, sheets, payload) {
  var sheet = sheets.activeCheckins;
  if (sheet) {
    var foundRow = findRowIndexById(sheet, 1, payload.id);
    if (foundRow !== -1) {
      payload.status = 'deleted';
      sheet.getRange(foundRow, 7).setValue("DELETED");
      sheet.getRange(foundRow, 8).setValue(JSON.stringify(payload));
    }
  }
  createOrUpdateDashboard(ss);
}

function handleInventory(sheets, action, payload) {
  if (action === ACTIONS.SAVE_INVENTORY) {
    var sheet = sheets.inventoryItems;
    setupHeaders(sheet, ["Item ID", "Name", "Quantity", "Unit", "Min Stock", "Last Updated", "Raw JSON"]);
    
    var rowData = [
      payload.id,
      payload.name,
      payload.quantity,
      payload.unit,
      payload.minStock,
      payload.lastUpdated,
      JSON.stringify(payload)
    ];
    
    var foundRow = findRowIndexById(sheet, 1, payload.id);
    if (foundRow !== -1) {
      sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  } else if (action === ACTIONS.LOG_INVENTORY) {
    var sheet = sheets.inventoryLogs;
    setupHeaders(sheet, ["Log ID", "Item ID", "Item Name", "Adjusted Qty", "Type", "Reason", "Timestamp", "User", "Raw JSON"]);
    
    sheet.appendRow([
      payload.id,
      payload.itemId,
      payload.itemName,
      payload.quantityAdjusted,
      payload.type,
      payload.reason,
      payload.timestamp,
      payload.user,
      JSON.stringify(payload)
    ]);
  }
}

function handleClearDatabase(ss, sheets) {
  var list = [sheets.activeCheckins, sheets.sales, sheets.auditLogs, sheets.inventoryItems, sheets.inventoryLogs];
  for (var i = 0; i < list.length; i++) {
    var sheet = list[i];
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
  }
  createOrUpdateDashboard(ss);
}

function handleAudit(sheets, payload) {
  var auditSheet = sheets.auditLogs;
  setupHeaders(auditSheet, ["Timestamp", "User ID", "Cashier", "Action", "Details"]);
  auditSheet.appendRow([
    payload.timestamp,
    payload.userId,
    payload.username,
    payload.action,
    payload.details
  ]);
  formatAuditSheet(auditSheet);
}

function handleStaff(sheets, action, payload) {
  var sheet = sheets.staffAttendance;
  setupHeaders(sheet, ["Session ID", "User ID", "Staff Name", "Date", "Login Time", "Logout Time", "Duration (Mins)"]);
  
  if (action === ACTIONS.STAFF_LOGIN) {
    var loginTime = formatTimeOnly(payload.loginTime);
    sheet.appendRow([
      payload.sessionId,
      payload.userId,
      payload.username,
      payload.date,
      loginTime,
      "",
      ""
    ]);
  } else if (action === ACTIONS.STAFF_LOGOUT) {
    var logoutTime = formatTimeOnly(payload.logoutTime);
    var foundRow = findRowIndexById(sheet, 1, payload.sessionId);
    
    if (foundRow !== -1) {
      sheet.getRange(foundRow, 6).setValue(logoutTime);
      sheet.getRange(foundRow, 7).setValue(payload.durationMinutes);
    } else {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var allValues = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
        for (var r = allValues.length - 1; r >= 0; r--) {
          if (allValues[r][1] === payload.userId && allValues[r][5] === "") {
            var rowNum = r + 2;
            sheet.getRange(rowNum, 6).setValue(logoutTime);
            sheet.getRange(rowNum, 7).setValue(payload.durationMinutes);
            break;
          }
        }
      }
    }
  }
  formatStaffSheet(sheet);
}

function handleExpenses(sheets, action, payload) {
  var sheet = sheets.expensesLogs;
  setupHeaders(sheet, ["Expense ID", "Date", "Item Name", "Category", "Qty/Vol", "Price/Cost", "Purchaser", "Notes", "Raw JSON"]);

  if (action === ACTIONS.SAVE_EXPENSE) {
    var rowData = [
      payload.id,
      payload.date,
      payload.itemName,
      payload.category,
      payload.quantity,
      payload.price,
      payload.purchaser,
      payload.notes || "",
      JSON.stringify(payload)
    ];
    
    var foundRow = findRowIndexById(sheet, 1, payload.id);
    if (foundRow !== -1) {
      sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    formatExpensesSheet(sheet);
  } else if (action === ACTIONS.DELETE_EXPENSE) {
    var foundRow = findRowIndexById(sheet, 1, payload.id);
    if (foundRow !== -1) {
      sheet.deleteRow(foundRow);
    }
  }
}

// ==========================================
// REUSABLE HELPER UTILITIES
// ==========================================

/**
 * Reusable ID lookup helper to search a column and return 1-based Row Index
 */
function findRowIndexById(sheet, columnNumber, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var values = sheet.getRange(2, columnNumber, lastRow - 1, 1).getValues();
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0]).trim() === String(id).trim()) {
      return r + 2;
    }
  }
  return -1;
}

/**
 * Parses and appends incoming Meta WhatsApp events to the Google Sheet.
 */
function handleWhatsAppWebhook(ss, sheets, data) {
  try {
    if (!data || !data.entry || !data.entry.length) {
      return success("No entries to parse");
    }

    var parsedEvents = parseWhatsAppEvent(data);
    
    for (var i = 0; i < parsedEvents.length; i++) {
      var event = parsedEvents[i];
      if (event) {
        saveWhatsAppEvent(sheets, event, data);
        updateBillCRMTimeline(sheets, event);
      }
    }
    
    return success("Parsed webhook events count: " + parsedEvents.length);
  } catch (err) {
    logWebhookError(ss, err, data);
    return success("Webhook process halted with warnings: " + err.toString());
  }
}

/**
 * Reusable Meta Webhook Event Parser with strict defensive null guards
 */
function parseWhatsAppEvent(data) {
  var events = [];
  if (!data || !data.entry || !data.entry.length) return events;
  
  for (var e = 0; e < data.entry.length; e++) {
    var entry = data.entry[e];
    if (!entry || !entry.changes || !entry.changes.length) continue;
    
    for (var c = 0; c < entry.changes.length; c++) {
      var change = entry.changes[c];
      if (!change || !change.value) continue;
      var value = change.value;
      
      var timestamp = new Date().toISOString();
      
      // 1. Customer Message (Incoming)
      if (value.messages && value.messages.length > 0) {
        for (var m = 0; m < value.messages.length; m++) {
          var msg = value.messages[m];
          if (!msg) continue;

          if (msg.timestamp) {
            var unixTime = parseInt(msg.timestamp) * 1000;
            if (!isNaN(unixTime)) timestamp = new Date(unixTime).toISOString();
          }
          
          var contactName = "";
          if (value.contacts && value.contacts[0] && value.contacts[0].profile) {
            contactName = value.contacts[0].profile.name || "";
          }

          var bodyText = "";
          if (msg.type === 'text' && msg.text) {
            bodyText = msg.text.body || "";
          } else if (msg.type === 'button' && msg.button) {
            bodyText = msg.button.text || "";
          } else {
            bodyText = "[Media: " + (msg.type || "unknown") + "]";
          }

          events.push({
            timestamp: timestamp,
            eventType: "message",
            phone: msg.from || "",
            messageId: msg.id || "",
            direction: "incoming",
            status: "received",
            message: bodyText,
            customerName: contactName,
            failureReason: "",
            templateName: ""
          });
        }
      }
      
      // 2. Status Updates (Outgoing Sent, Delivered, Read, Failed)
      if (value.statuses && value.statuses.length > 0) {
        for (var s = 0; s < value.statuses.length; s++) {
          var status = value.statuses[s];
          if (!status) continue;

          if (status.timestamp) {
            var unixTime = parseInt(status.timestamp) * 1000;
            if (!isNaN(unixTime)) timestamp = new Date(unixTime).toISOString();
          }

          var failMsg = "";
          if (status.errors && status.errors.length > 0 && status.errors[0]) {
            failMsg = status.errors[0].message || status.errors[0].title || "Unknown failure";
          }

          events.push({
            timestamp: timestamp,
            eventType: "status",
            phone: status.recipient_id || "",
            messageId: status.id || "",
            direction: "outgoing",
            status: status.status || "",
            message: "",
            customerName: "",
            failureReason: failMsg,
            templateName: ""
          });
        }
      }
    }
  }
  return events;
}

/**
 * Saves or updates WhatsApp Events with state transitions
 */
function saveWhatsAppEvent(sheets, event, rawJson) {
  var sheet = sheets.whatsappEvents;
  setupHeaders(sheet, [
    "Timestamp", "Event Type", "Customer Phone", "Message ID", 
    "Direction", "Status", "Message", "Template", "Failure Reason", "Raw JSON"
  ]);

  var foundRowIndex = findRowIndexById(sheet, 4, event.messageId);

  var rowData = [
    event.timestamp,
    event.eventType,
    event.phone,
    event.messageId,
    event.direction,
    event.status,
    event.message,
    event.templateName,
    event.failureReason,
    JSON.stringify(rawJson)
  ];

  if (foundRowIndex !== -1) {
    sheet.getRange(foundRowIndex, 1).setValue(event.timestamp);
    sheet.getRange(foundRowIndex, 6).setValue(event.status);
    if (event.failureReason) {
      sheet.getRange(foundRowIndex, 9).setValue(event.failureReason);
    }
    sheet.getRange(foundRowIndex, 10).setValue(JSON.stringify(rawJson));
  } else {
    sheet.appendRow(rowData);
  }

  formatWhatsAppEventsSheet(sheet);
}

/**
 * Append delivery events directly to the customer's CRM profile JSON inside Sales Ledger.
 */
function updateBillCRMTimeline(sheets, event) {
  var salesSheet = sheets.sales;
  if (!salesSheet) return;

  var lastRow = salesSheet.getLastRow();
  if (lastRow <= 1) return;

  var data = salesSheet.getRange(2, 1, lastRow - 1, 16).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    var rawJson = data[i][15];
    if (rawJson) {
      try {
        var bill = JSON.parse(rawJson);
        var billPhoneClean = String(bill.customerPhone).replace(/\D/g, '');
        var eventPhoneClean = String(event.phone).replace(/\D/g, '');
        
        if (billPhoneClean && eventPhoneClean && (billPhoneClean.endsWith(eventPhoneClean) || eventPhoneClean.endsWith(billPhoneClean))) {
          if (!bill.deliveryStatusHistory) bill.deliveryStatusHistory = [];
          
          bill.deliveryStatusHistory.push({
            timestamp: event.timestamp,
            status: event.status
          });
          
          if (event.status === 'read') {
            bill.readStatus = 'read';
          }
          
          var rowNum = i + 2;
          salesSheet.getRange(rowNum, 16).setValue(JSON.stringify(bill));
          break;
        }
      } catch (err) {}
    }
  }
}

/**
 * Logs Webhook exceptions.
 */
function logWebhookError(ss, error, payload) {
  try {
    var sheet = getOrCreateSheet(ss, "Webhook Logs", 9);
    setupHeaders(sheet, ["Timestamp", "Error Message", "Stack Trace", "Payload"]);
    sheet.appendRow([
      new Date().toISOString(),
      error.toString(),
      error.stack || "",
      JSON.stringify(payload)
    ]);
  } catch (err) {
    Logger.log("Failed to log webhook error to sheet: " + err.toString());
  }
}

function getOrCreateSheet(ss, name, index) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, index);
  }
  return sheet;
}

function setupHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold");
    range.setBackground("#202124");
    range.setFontColor("#ffffff");
    range.setHorizontalAlignment("center");
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 28);
    sheet.setFrozenRows(1);
  }
}

function formatTimeOnly(isoString) {
  if (!isoString) return "";
  var d = new Date(isoString);
  try {
    var timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(d, timezone, "hh:mm a");
  } catch (err) {
    var hours = d.getHours();
    var minutes = d.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
  }
}

function formatCheckinSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var fullRange = sheet.getRange(1, 1, lastRow, 7);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    sheet.getRange(2, 1, lastRow - 1, 7).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, lastRow - 1, 1).setHorizontalAlignment("center");
    sheet.getRange(2, 3, lastRow - 1, 4).setHorizontalAlignment("center");
    
    for (var r = 2; r <= lastRow; r++) {
      var areaCell = sheet.getRange(r, 4);
      var areaVal = areaCell.getValue();
      if (areaVal === 'Basement') {
        areaCell.setBackground("#fce8e6").setFontColor("#c5221f").setFontWeight("bold");
      } else if (areaVal === 'Main Hall') {
        areaCell.setBackground("#e6f4ea").setFontColor("#137333").setFontWeight("bold");
      } else if (areaVal === 'Takeaway') {
        areaCell.setBackground("#e8f0fe").setFontColor("#1a73e8").setFontWeight("bold");
      }
    }
    for (var col = 1; col <= 7; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling checkins sheet: " + err.toString());
  }
}

function formatSalesSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var fullRange = sheet.getRange(1, 1, lastRow, 15);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    sheet.getRange(2, 1, lastRow - 1, 15).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, lastRow - 1, 2).setHorizontalAlignment("center");
    sheet.getRange(2, 4, lastRow - 1, 5).setHorizontalAlignment("center");
    
    var priceRange = sheet.getRange(2, 9, lastRow - 1, 3);
    priceRange.setHorizontalAlignment("right");
    priceRange.setNumberFormat("₹#,##0.00");
    sheet.getRange(2, 12, lastRow - 1, 3).setHorizontalAlignment("center");
    
    var itemsRange = sheet.getRange(2, 15, lastRow - 1, 1);
    itemsRange.setHorizontalAlignment("left");
    itemsRange.setWrap(true);
    
    for (var r = 2; r <= lastRow; r++) {
      var statusCell = sheet.getRange(r, 13);
      var statusVal = statusCell.getValue();
      if (statusVal === 'Paid') {
        statusCell.setBackground("#c6efce").setFontColor("#006100").setFontWeight("bold");
      } else if (statusVal === 'Pending') {
        statusCell.setBackground("#ffc7ce").setFontColor("#9c0006").setFontWeight("bold");
      }
      
      var payCell = sheet.getRange(r, 12);
      var payVal = payCell.getValue();
      if (payVal === 'UPI') {
        payCell.setBackground("#e1bee7").setFontColor("#4a148c").setFontWeight("bold");
      } else if (payVal === 'Cash') {
        payCell.setBackground("#fff9c4").setFontColor("#f57f17").setFontWeight("bold");
      } else if (payVal === 'Card') {
        payCell.setBackground("#b2ebf2").setFontColor("#006064").setFontWeight("bold");
      } else if (payVal === 'Split') {
        payCell.setBackground("#ffe0b2").setFontColor("#e65100").setFontWeight("bold");
      }

      var areaCell = sheet.getRange(r, 5);
      var areaVal = areaCell.getValue();
      if (areaVal === 'Basement') {
        areaCell.setBackground("#fce8e6").setFontColor("#c5221f").setFontWeight("bold");
      } else if (areaVal === 'Main Hall') {
        areaCell.setBackground("#e6f4ea").setFontColor("#137333").setFontWeight("bold");
      } else if (areaVal === 'Takeaway') {
        areaCell.setBackground("#e8f0fe").setFontColor("#1a73e8").setFontWeight("bold");
      }
    }
    for (var col = 1; col <= 15; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling sales sheet: " + err.toString());
  }
}

function formatAuditSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var fullRange = sheet.getRange(1, 1, lastRow, 5);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    sheet.getRange(2, 1, lastRow - 1, 5).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, lastRow - 1, 4).setHorizontalAlignment("center");
    for (var col = 1; col <= 5; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling audit sheet: " + err.toString());
  }
}

function formatExpensesSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var fullRange = sheet.getRange(1, 1, lastRow, 9);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    sheet.getRange(2, 1, lastRow - 1, 9).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, lastRow - 1, 2).setHorizontalAlignment("center");
    sheet.getRange(2, 4, lastRow - 1, 4).setHorizontalAlignment("center");
    for (var col = 1; col <= 9; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling expenses sheet: " + err.toString());
  }
}

function formatWhatsAppEventsSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    
    var fullRange = sheet.getRange(1, 1, lastRow, 9);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    
    sheet.getRange(2, 1, lastRow - 1, 9).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, lastRow - 1, 6).setHorizontalAlignment("center");
    
    for (var r = 2; r <= lastRow; r++) {
      var statusCell = sheet.getRange(r, 6);
      var statusVal = statusCell.getValue();
      if (statusVal === 'read') {
        statusCell.setBackground("#e8f0fe").setFontColor("#1a73e8").setFontWeight("bold");
      } else if (statusVal === 'delivered') {
        statusCell.setBackground("#e6f4ea").setFontColor("#137333").setFontWeight("bold");
      } else if (statusVal === 'failed') {
        statusCell.setBackground("#fce8e6").setFontColor("#c5221f").setFontWeight("bold");
      } else if (statusVal === 'sent') {
        statusCell.setBackground("#fff9c4").setFontColor("#f57f17").setFontWeight("bold");
      }
    }
    
    for (var col = 1; col <= 9; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling WhatsApp events sheet: " + err.toString());
  }
}

function createOrUpdateDashboard(ss) {
  try {
    var dashboardSheet = getOrCreateSheet(ss, "Dashboard", 0);
    var dataSheet = getOrCreateSheet(ss, "DashboardData", 4);
    dataSheet.hideSheet();
    
    dataSheet.getRange("A1:B4").setValues([
      ["Cash", "=SUMIF('Sales & Bills'!L2:L, \"Cash\", 'Sales & Bills'!K2:K)"],
      ["UPI", "=SUMIF('Sales & Bills'!L2:L, \"UPI\", 'Sales & Bills'!K2:K)"],
      ["Card", "=SUMIF('Sales & Bills'!L2:L, \"Card\", 'Sales & Bills'!K2:K)"],
      ["Split", "=SUMIF('Sales & Bills'!L2:L, \"Split\", 'Sales & Bills'!K2:K)"]
    ]);
    
    dataSheet.getRange("D1").setValue("=QUERY('Sales & Bills'!B2:K, \"select B, sum(K) where B is not null group by B label B 'Date', sum(K) 'Revenue'\", 0)");
    
    dataSheet.getRange("G1:H3").setValues([
      ["Seating Area", "Revenue"],
      ["Main Hall", "=SUMIF('Sales & Bills'!E2:E, \"Main Hall\", 'Sales & Bills'!K2:K)"],
      ["Basement", "=SUMIF('Sales & Bills'!E2:E, \"Basement\", 'Sales & Bills'!K2:K)"]
    ]);
    
    dataSheet.getRange("J1").setValue("=QUERY('Sales & Bills'!B2:N, \"select N, sum(K) where N is not null group by N label N 'Cashier', sum(K) 'Sales'\", 0)");
    
    dashboardSheet.setHideGridlines(false);
    dashboardSheet.getRange("A1:F2").merge()
      .setValue("CHAPTER ONE CAFE - ANALYTICS COCKPIT")
      .setFontWeight("bold")
      .setFontSize(14)
      .setBackground("#202124")
      .setFontColor("#ffffff")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
      
    var labelRange = dashboardSheet.getRange("A4:F4");
    labelRange.setValues([[
      "Total Revenue", "Avg Ticket Size", "Seating Revenue", "Food Revenue", "UPI Revenue", "Active Seating"
    ]]);
    labelRange.setFontWeight("bold")
      .setBackground("#f3f3f3")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setFontSize(9)
      .setFontFamily("Arial");
      
    var valueRange = dashboardSheet.getRange("A5:F5");
    valueRange.setValues([[
      "=SUM('Sales & Bills'!K2:K)",
      "=IFERROR(AVERAGE('Sales & Bills'!K2:K), 0)",
      "=SUM('Sales & Bills'!J2:J)",
      "=SUM('Sales & Bills'!I2:I)",
      "=SUMIF('Sales & Bills'!L2:L, \"UPI\", 'Sales & Bills'!K2:K)",
      "=IFERROR(COUNTA('Active CheckIns'!A2:A)-1, 0)"
    ]]);
    valueRange.setFontWeight("bold")
      .setFontSize(15)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setFontColor("#1d1d1f")
      .setFontFamily("Arial");
    
    dashboardSheet.getRange("A5:E5").setNumberFormat("₹#,##0.00");
    dashboardSheet.getRange("F5").setNumberFormat("#,##0");

    var cardRange = dashboardSheet.getRange("A4:F5");
    cardRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
    
    for (var col = 1; col <= 6; col++) {
      dashboardSheet.setColumnWidth(col, 135);
    }
  } catch (err) {
    Logger.log("Err creating dashboard: " + err.toString());
  }
}

function formatStaffSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var fullRange = sheet.getRange(1, 1, lastRow, 7);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    sheet.getRange(2, 1, lastRow - 1, 7).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, lastRow - 1, 2).setHorizontalAlignment("center");
    sheet.getRange(2, 4, lastRow - 1, 4).setHorizontalAlignment("center");
    for (var col = 1; col <= 7; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling staff sheet: " + err.toString());
  }
}
