import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Bill, CafeSettings } from '../types';
import logo from '../assets/logo.jpg';

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null as any); // Resolve null on error to proceed without logo
  });
};

/**
 * Generates and downloads a highly styled, modern, and attractive PDF receipt in A5 format.
 * Prevents text overlapping and alignment bugs by using a standard A5 layout.
 */
export const downloadReceiptPDF = async (
  billObj: Bill,
  settings: CafeSettings,
  isCopy: boolean = false
) => {
  // A5 format: 148mm x 210mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5'
  });

  // 1. Center/Left aligned Logo & Shop Details Header
  let startY = 12;
  try {
    const img = await loadImage(logo);
    if (img) {
      // Draw logo on the left (X: 15, Y: 12)
      doc.addImage(img, 'JPEG', 15, startY, 18, 18);
    }
  } catch (err) {
    console.warn('Failed to load logo for PDF receipt:', err);
  }

  // Cafe Details (aligned next to the logo at X: 36)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(92, 61, 46); // Warm Coffee primary: #5c3d2e
  doc.text(settings.name, 36, startY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // Slate 600
  doc.text(settings.address, 36, startY + 10, { maxWidth: 55 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // Slate 700
  doc.text(`Phone: ${settings.phone}`, 36, startY + 17);

  // Right-aligned Invoice Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(92, 61, 46); // Coffee
  doc.text('INVOICE', 133, startY + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(billObj.billNumber, 133, startY + 10, { align: 'right' });

  if (isCopy) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28); // Red 700
    doc.text('(COPY)', 133, startY + 15, { align: 'right' });
  }

  // Top heavy divider line
  startY += 21;
  doc.setDrawColor(92, 61, 46);
  doc.setLineWidth(0.4);
  doc.line(15, startY, 133, startY);
  doc.setLineWidth(0.1);
  doc.line(15, startY + 0.6, 133, startY + 0.6);

  // 2. Metadata Box (Rounded Card)
  startY += 4;
  doc.setFillColor(250, 248, 246); // Warm cream tint: #faf8f6
  doc.roundedRect(15, startY, 118, 19, 2, 2, 'F');

  // Metadata content
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 90, 75); // Brown accent
  doc.text('GUEST DETAILS', 18, startY + 4.5);
  doc.text('SESSION DETAILS', 78, startY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85); // Slate 700
  doc.text(`Name: ${billObj.customerName}`, 18, startY + 10);
  doc.text(`Phone: ${billObj.customerPhone}`, 18, startY + 14.5);

  const formattedDate = (billObj.location === 'Main Hall' || billObj.location === 'Takeaway')
    ? new Date(billObj.exitTime).toLocaleDateString()
    : new Date(billObj.exitTime).toLocaleString();
  doc.text(`Date: ${formattedDate}`, 78, startY + 10);

  let areaText = `Area: ${billObj.location}`;
  if (billObj.location === 'Basement') {
    const eTime = new Date(billObj.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const xTime = new Date(billObj.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    areaText = `Area: Basement (${eTime} - ${xTime}, ${billObj.timeSpentMinutes} mins)`;
  }
  doc.text(areaText, 78, startY + 14.5);

  // Separator before items table
  startY += 23;
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.2);
  doc.line(15, startY, 133, startY);

  // 3. Products Table
  const tableData = billObj.orderedItems.map(item => [
    item.name,
    item.price.toFixed(2),
    `${item.quantity}x`,
    (item.price * item.quantity).toFixed(2)
  ]);

  if (billObj.basementCharges > 0) {
    tableData.push([
      `Basement Seating Fee (${billObj.timeSpentMinutes} min)`,
      (billObj.basementCharges / 1).toFixed(2),
      '1x',
      billObj.basementCharges.toFixed(2)
    ]);
  }

  autoTable(doc, {
    startY: startY + 2.5,
    margin: { left: 15, right: 15 },
    head: [['Item Name', 'Unit Price', 'Qty', 'Total']],
    body: tableData,
    theme: 'striped',
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      font: 'helvetica',
      textColor: [51, 65, 85]
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: [92, 61, 46], // Coffee color primary
      textColor: [255, 255, 255],
      fontSize: 8.5
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22, halign: 'right' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.row.section === 'body') {
        if (data.row.index % 2 === 0) {
          data.cell.styles.fillColor = [252, 250, 248]; // Light warm zebra striping
        }
      }
    }
  });

  let finalY = (doc as any).lastAutoTable.finalY + 8;

  // 4. Billing Totals Area
  const drawTotalRow = (label: string, value: string, isBold: boolean = false, yOffset: number = 0) => {
    if (isBold) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.setFontSize(9.5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105); // Slate 600
      doc.setFontSize(8);
    }
    doc.text(label, 104, finalY + yOffset, { align: 'right' });
    doc.text(value, 133, finalY + yOffset, { align: 'right' });
  };

  let offset = 0;
  drawTotalRow('Subtotal:', `${billObj.subtotal.toFixed(2)}`, false, offset);

  if (billObj.discount > 0) {
    offset += 5;
    drawTotalRow('Discount:', `-${billObj.discount.toFixed(2)}`, false, offset);
  }

  if (billObj.extraCharges > 0) {
    offset += 5;
    drawTotalRow('Extra Charges:', `+${billObj.extraCharges.toFixed(2)}`, false, offset);
  }

  offset += 5;
  drawTotalRow(`GST (${settings.gstPercentage}%):`, `${billObj.tax.toFixed(2)}`, false, offset);

  // Grand Total Box
  offset += 6.5;
  doc.setDrawColor(92, 61, 46);
  doc.setFillColor(252, 250, 248);
  doc.setLineWidth(0.25);
  doc.rect(78, finalY + offset - 4.8, 55, 7.2, 'FD'); // background highlight box
  drawTotalRow('Grand Total:', `${settings.currency}${billObj.grandTotal.toFixed(2)}`, true, offset - 0.2);

  // 5. Cashier & Payment Details (Left side, aligned with Totals)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(`Payment: ${billObj.paymentMethod} (${billObj.status})`, 15, finalY);
  doc.text(`Cashier: ${billObj.cashierName}`, 15, finalY + 4.5);

  // Footer divider line
  const footerY = Math.max(193, finalY + offset + 14);
  
  // Only draw final divider & footer if we haven't overflowed onto a new page, or let it flow naturally
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(15, footerY - 4.5, 133, footerY - 4.5);

  // 6. Centered Footer Message
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 100, 90); // Coffee footer text
  doc.text(settings.receiptFooter, 74, footerY, { align: 'center', maxWidth: 110 });

  // Save
  const prefix = isCopy ? 'COPY_' : '';
  const cleanName = billObj.customerName.replace(/\s+/g, '_');
  doc.save(`${prefix}${billObj.billNumber}_${cleanName}.pdf`);
};
