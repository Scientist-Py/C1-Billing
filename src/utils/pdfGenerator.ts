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
 * Generates and downloads a highly styled, modern, and attractive PDF receipt.
 * Binds dynamically to the Chapter One Cafe theme.
 */
export const downloadReceiptPDF = async (
  billObj: Bill,
  settings: CafeSettings,
  isCopy: boolean = false
) => {
  // Base heights:
  // - Header with logo + name + address + phone + divider = ~50mm
  // - Metadata info block = ~30mm
  // - Totals, cashier details, and footer = ~45mm
  // Each table row is about 4.5mm
  const baseHeight = 125;
  const rowHeight = 4.5;
  const itemCount = billObj.orderedItems.length + (billObj.basementCharges > 0 ? 1 : 0);
  const calculatedHeight = Math.max(160, baseHeight + itemCount * rowHeight);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, calculatedHeight]
  });

  let startY = 8;

  // 1. Center Aligned Logo
  try {
    const img = await loadImage(logo);
    if (img) {
      // Draw centered circular/square logo
      doc.addImage(img, 'JPEG', 32, startY, 16, 16);
      startY += 19;
    }
  } catch (err) {
    console.warn('Failed to load logo for PDF receipt:', err);
  }

  // 2. Cafe Name & Address Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(92, 61, 46); // Warm Coffee primary: #5c3d2e
  doc.text(settings.name, 40, startY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105); // Slate 600
  
  startY += 4.5;
  doc.text(settings.address, 40, startY, { align: 'center', maxWidth: 70 });

  startY += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Phone: ${settings.phone}`, 40, startY, { align: 'center' });

  // Styled primary double border / heavy divider
  startY += 3;
  doc.setDrawColor(92, 61, 46);
  doc.setLineWidth(0.4);
  doc.line(5, startY, 75, startY);
  doc.setLineWidth(0.1);
  doc.line(5, startY + 0.6, 75, startY + 0.6);

  // 3. Invoice Metadata
  startY += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42); // Slate 900
  const title = isCopy ? `INVOICE: ${billObj.billNumber} (COPY)` : `INVOICE: ${billObj.billNumber}`;
  doc.text(title, 5, startY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85); // Slate 700

  startY += 4.5;
  const formattedDate = (billObj.location === 'Main Hall' || billObj.location === 'Takeaway')
    ? new Date(billObj.exitTime).toLocaleDateString()
    : new Date(billObj.exitTime).toLocaleString();
  doc.text(`Date: ${formattedDate}`, 5, startY);

  startY += 4.5;
  doc.text(`Guest Name: ${billObj.customerName}`, 5, startY);

  startY += 4.5;
  doc.text(`Phone No: ${billObj.customerPhone}`, 5, startY);

  if (billObj.location !== 'Main Hall') {
    startY += 4.5;
    doc.text(`Area: ${billObj.location}`, 5, startY);
  }

  if (billObj.location === 'Basement') {
    startY += 4.5;
    const eTime = new Date(billObj.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const xTime = new Date(billObj.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    doc.text(`Duration: ${eTime} - ${xTime} (${billObj.timeSpentMinutes} mins)`, 5, startY);
  }

  // Thin separator before item list
  startY += 3;
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.2);
  doc.line(5, startY, 75, startY);

  // 4. Products Table
  const tableData = billObj.orderedItems.map(item => [
    item.name,
    `${item.quantity}x`,
    `${(item.price * item.quantity).toFixed(2)}`
  ]);

  if (billObj.basementCharges > 0) {
    tableData.push([
      `Basement Seating Fee (${billObj.timeSpentMinutes} min)`,
      '1x',
      billObj.basementCharges.toFixed(2)
    ]);
  }

  autoTable(doc, {
    startY: startY + 2,
    margin: { left: 5, right: 5 },
    head: [['Item Name', 'Qty', 'Total']],
    body: tableData,
    theme: 'striped',
    styles: {
      fontSize: 7,
      cellPadding: 1.2,
      font: 'helvetica',
      textColor: [51, 65, 85]
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: [92, 61, 46], // Coffee color primary
      textColor: [255, 255, 255],
      fontSize: 7.5
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 16, halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.row.section === 'body') {
        if (data.row.index % 2 === 0) {
          data.cell.styles.fillColor = [252, 250, 248]; // Light warm cream tint for zebra striping
        }
      }
    }
  });

  let finalY = (doc as any).lastAutoTable.finalY + 4.5;

  // 5. Totals Area
  const drawTotalRow = (label: string, value: string, isBold: boolean = false, yOffset: number = 0) => {
    if (isBold) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.setFontSize(8.5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105); // Slate 600
      doc.setFontSize(7.5);
    }
    doc.text(label, 42, finalY + yOffset, { align: 'right' });
    doc.text(value, 75, finalY + yOffset, { align: 'right' });
  };

  let offset = 0;
  drawTotalRow('Subtotal:', `${billObj.subtotal.toFixed(2)}`, false, offset);

  if (billObj.discount > 0) {
    offset += 4.5;
    drawTotalRow('Discount:', `-${billObj.discount.toFixed(2)}`, false, offset);
  }

  if (billObj.extraCharges > 0) {
    offset += 4.5;
    drawTotalRow('Extra Charges:', `+${billObj.extraCharges.toFixed(2)}`, false, offset);
  }

  offset += 4.5;
  drawTotalRow(`GST (${settings.gstPercentage}%):`, `${billObj.tax.toFixed(2)}`, false, offset);

  // Grand Total Highlight Box
  offset += 5.5;
  doc.setDrawColor(92, 61, 46);
  doc.setFillColor(252, 250, 248);
  doc.setLineWidth(0.25);
  doc.rect(32, finalY + offset - 4.2, 43, 6, 'FD'); // background box
  drawTotalRow('Grand Total:', `${settings.currency}${billObj.grandTotal.toFixed(2)}`, true, offset - 0.2);

  finalY += offset + 7;

  // 6. Cashier & Payment
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(`Payment: ${billObj.paymentMethod} (${billObj.status})`, 5, finalY);
  doc.text(`Cashier: ${billObj.cashierName}`, 5, finalY + 3.5);

  // Divider
  finalY += 7;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(5, finalY, 75, finalY);

  // 7. Footer message
  finalY += 4.5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.2);
  doc.setTextColor(120, 100, 90); // Muted warm coffee color
  doc.text(settings.receiptFooter, 40, finalY, { align: 'center', maxWidth: 70 });

  // Save
  const prefix = isCopy ? 'COPY_' : '';
  const cleanName = billObj.customerName.replace(/\s+/g, '_');
  doc.save(`${prefix}${billObj.billNumber}_${cleanName}.pdf`);
};
