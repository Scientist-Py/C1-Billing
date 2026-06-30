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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    var ss = SpreadsheetApp.openById(sheetId);
    
    var action = data.action;
    var payload = data.payload;
    
    if (action === 'CHECKIN') {
      var sheet = getOrCreateSheet(ss, "Active CheckIns", 1);
      setupHeaders(sheet, ["Customer ID", "Name", "Phone", "Seating Area", "Guests", "Check-In Time", "Notes"]);
      
      var checkInTime = formatTimeOnly(payload.entryTime);
      
      sheet.appendRow([
        payload.id,
        payload.name,
        payload.phone,
        payload.location,
        payload.numGuests,
        checkInTime,
        payload.notes
      ]);
      
      // Apply styles
      formatCheckinSheet(sheet);
      
      // Update Dashboard Metric Cards
      createOrUpdateDashboard(ss);
      
    } else if (action === 'CHECKOUT') {
      // Create a consolidated string of all items ordered
      var itemsSummary = "";
      if (payload.orderedItems && payload.orderedItems.length > 0) {
        var itemsList = [];
        for (var i = 0; i < payload.orderedItems.length; i++) {
          var item = payload.orderedItems[i];
          itemsList.push(item.quantity + "x " + item.name);
        }
        itemsSummary = itemsList.join(", ");
      }

      // Calculations based on Seating Area
      var checkInTime = "";
      var checkOutTime = "";
      var timeSpent = "";
      var seatingCharge = "";

      if (payload.location === 'Basement') {
        checkInTime = formatTimeOnly(payload.entryTime);
        checkOutTime = formatTimeOnly(payload.exitTime);
        timeSpent = payload.timeSpentMinutes + " mins";
        seatingCharge = payload.basementCharges;
      } else {
        // Main Hall / Lounge: Don't write check-in, checkout, or time spent
        checkInTime = "";
        checkOutTime = "";
        timeSpent = "";
        seatingCharge = "";
      }

      // 1. Log Checkout Sales
      var salesSheet = getOrCreateSheet(ss, "Sales & Bills", 2);
      setupHeaders(salesSheet, [
        "Bill Number", "Date", "Name", "Phone", "Seating Area", 
        "Check-In", "Check-Out", "Time Spent", "Food Total", 
        "Seating Charge", "Grand Total", "Payment Method", "Status", "Cashier", "Items Ordered"
      ]);
      
      salesSheet.appendRow([
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
        itemsSummary
      ]);

      // Apply clean formatting
      formatSalesSheet(salesSheet);
      
      // 2. Clear customer from "Active CheckIns" sheet
      var checkinSheet = ss.getSheetByName("Active CheckIns");
      if (checkinSheet) {
        var lastRowCheckin = checkinSheet.getLastRow();
        if (lastRowCheckin > 1) {
          var values = checkinSheet.getRange(2, 1, lastRowCheckin - 1, 3).getValues();
          for (var r = 0; r < values.length; r++) {
            if (values[r][0] === payload.customerId || values[r][2] === payload.customerPhone) {
              checkinSheet.deleteRow(r + 2);
              break;
            }
          }
        }
      }
      
      // Update Dashboard Metric Cards & Rebuild Charts
      createOrUpdateDashboard(ss);
      
    } else if (action === 'AUDIT') {
      var auditSheet = getOrCreateSheet(ss, "Audit Logs", 3);
      setupHeaders(auditSheet, ["Timestamp", "User ID", "Cashier", "Action", "Details"]);
      auditSheet.appendRow([
        payload.timestamp,
        payload.userId,
        payload.username,
        payload.action,
        payload.details
      ]);
      
      formatAuditSheet(auditSheet);
      
    } else if (action === 'STAFF_LOGIN') {
      var sheet = getOrCreateSheet(ss, "Staff Attendance", 4);
      setupHeaders(sheet, ["Session ID", "User ID", "Staff Name", "Date", "Login Time", "Logout Time", "Duration (Mins)"]);
      
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
      
      formatStaffSheet(sheet);
      
    } else if (action === 'STAFF_LOGOUT') {
      var sheet = getOrCreateSheet(ss, "Staff Attendance", 4);
      var lastRow = sheet.getLastRow();
      
      if (lastRow > 1) {
        var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        var logoutTime = formatTimeOnly(payload.logoutTime);
        var found = false;
        
        for (var r = 0; r < values.length; r++) {
          if (values[r][0] === payload.sessionId) {
            var rowNum = r + 2;
            sheet.getRange(rowNum, 6).setValue(logoutTime);
            sheet.getRange(rowNum, 7).setValue(payload.durationMinutes);
            found = true;
            break;
          }
        }
        
        if (!found) {
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
      
      formatStaffSheet(sheet);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, name, index) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name, index);
  }
  return sheet;
}

// Charcoal Headers
function setupHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold");
    range.setBackground("#202124"); // Dark Charcoal
    range.setFontColor("#ffffff");   // Crisp White
    range.setHorizontalAlignment("center");
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 28);       // POS style height
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

// Clean Styles for check-ins
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
        areaCell.setBackground("#fce8e6").setFontColor("#c5221f").setFontWeight("bold"); // Soft Red
      } else if (areaVal === 'Main Hall') {
        areaCell.setBackground("#e6f4ea").setFontColor("#137333").setFontWeight("bold"); // Soft Green
      } else if (areaVal === 'Takeaway') {
        areaCell.setBackground("#e8f0fe").setFontColor("#1a73e8").setFontWeight("bold"); // Soft Blue
      }
    }

    for (var col = 1; col <= 7; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling checkins sheet: " + err.toString());
  }
}

// Clean Styles for Sales History & Badges
function formatSalesSheet(sheet) {
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    
    var fullRange = sheet.getRange(1, 1, lastRow, 15);
    fullRange.setFontFamily("Arial");
    sheet.setHideGridlines(false);
    
    // Grid borders
    sheet.getRange(2, 1, lastRow - 1, 15).setBorder(true, true, true, true, true, true, "#e8e8ed", SpreadsheetApp.BorderStyle.SOLID);
    
    // Center Align Metadata (Bill, Date, Phone, Area, In, Out, Spent)
    sheet.getRange(2, 1, lastRow - 1, 2).setHorizontalAlignment("center");
    sheet.getRange(2, 4, lastRow - 1, 5).setHorizontalAlignment("center");
    
    // Right Align Pricing (Food Total, Seating Charge, Grand Total) & Set Currency
    var priceRange = sheet.getRange(2, 9, lastRow - 1, 3);
    priceRange.setHorizontalAlignment("right");
    priceRange.setNumberFormat("₹#,##0.00");
    
    // Center Align Payment method, Status, Cashier
    sheet.getRange(2, 12, lastRow - 1, 3).setHorizontalAlignment("center");
    
    // Left Align & Wrap Items list
    var itemsRange = sheet.getRange(2, 15, lastRow - 1, 1);
    itemsRange.setHorizontalAlignment("left");
    itemsRange.setWrap(true);
    
    // --- ADVANCED CONDITIONAL BADGES ---
    for (var r = 2; r <= lastRow; r++) {
      // 1. Status Badges (Column 13)
      var statusCell = sheet.getRange(r, 13);
      var statusVal = statusCell.getValue();
      if (statusVal === 'Paid') {
        statusCell.setBackground("#c6efce").setFontColor("#006100").setFontWeight("bold"); // Light Green
      } else if (statusVal === 'Pending') {
        statusCell.setBackground("#ffc7ce").setFontColor("#9c0006").setFontWeight("bold"); // Light Red
      }
      
      // 2. Payment Method Badges (Column 12)
      var payCell = sheet.getRange(r, 12);
      var payVal = payCell.getValue();
      if (payVal === 'UPI') {
        payCell.setBackground("#e1bee7").setFontColor("#4a148c").setFontWeight("bold"); // Light Purple
      } else if (payVal === 'Cash') {
        payCell.setBackground("#fff9c4").setFontColor("#f57f17").setFontWeight("bold"); // Soft Gold
      } else if (payVal === 'Card') {
        payCell.setBackground("#b2ebf2").setFontColor("#006064").setFontWeight("bold"); // Soft Cyan
      } else if (payVal === 'Split') {
        payCell.setBackground("#ffe0b2").setFontColor("#e65100").setFontWeight("bold"); // Soft Orange
      }

      // 3. Seating Area Badges (Column 5)
      var areaCell = sheet.getRange(r, 5);
      var areaVal = areaCell.getValue();
      if (areaVal === 'Basement') {
        areaCell.setBackground("#fce8e6").setFontColor("#c5221f").setFontWeight("bold"); // Soft Red
      } else if (areaVal === 'Main Hall') {
        areaCell.setBackground("#e6f4ea").setFontColor("#137333").setFontWeight("bold"); // Soft Green
      } else if (areaVal === 'Takeaway') {
        areaCell.setBackground("#e8f0fe").setFontColor("#1a73e8").setFontWeight("bold"); // Soft Blue
      }
    }
    
    // Auto-fit column widths
    for (var col = 1; col <= 15; col++) {
      sheet.autoResizeColumn(col);
    }
  } catch (err) {
    Logger.log("Err styling sales sheet: " + err.toString());
  }
}

// Clean Styles for Audits
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

// === INTERACTIVE DASHBOARD BUILDER ===
function createOrUpdateDashboard(ss) {
  try {
    var dashboardSheet = getOrCreateSheet(ss, "Dashboard", 0);
    var dataSheet = getOrCreateSheet(ss, "DashboardData", 4); // Place it at the end
    
    // Hide data sheet tab completely so it stays hidden in the background
    dataSheet.hideSheet();
    
    // 1. Setup helper tables on dataSheet (NEVER HIDDEN rows, so charts plot correctly)
    // A:B - Payment Methods Split
    dataSheet.getRange("A1:B4").setValues([
      ["Cash", "=SUMIF('Sales & Bills'!L2:L, \"Cash\", 'Sales & Bills'!K2:K)"],
      ["UPI", "=SUMIF('Sales & Bills'!L2:L, \"UPI\", 'Sales & Bills'!K2:K)"],
      ["Card", "=SUMIF('Sales & Bills'!L2:L, \"Card\", 'Sales & Bills'!K2:K)"],
      ["Split", "=SUMIF('Sales & Bills'!L2:L, \"Split\", 'Sales & Bills'!K2:K)"]
    ]);
    
    // D:E - Daily Revenue Trend Query
    dataSheet.getRange("D1").setValue("=QUERY('Sales & Bills'!B2:K, \"select B, sum(K) where B is not null group by B label B 'Date', sum(K) 'Revenue'\", 0)");
    
    // G:H - Seating Area Sales Summary (Main Hall vs Basement)
    dataSheet.getRange("G1:H3").setValues([
      ["Seating Area", "Revenue"],
      ["Main Hall", "=SUMIF('Sales & Bills'!E2:E, \"Main Hall\", 'Sales & Bills'!K2:K)"],
      ["Basement", "=SUMIF('Sales & Bills'!E2:E, \"Basement\", 'Sales & Bills'!K2:K)"]
    ]);
    
    // J:K - Cashier Performance Standings Query
    dataSheet.getRange("J1").setValue("=QUERY('Sales & Bills'!B2:N, \"select N, sum(K) where N is not null group by N label N 'Cashier', sum(K) 'Sales'\", 0)");
    
    // 2. Setup Dashboard metric cards
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
