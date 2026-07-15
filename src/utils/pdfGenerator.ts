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
    img.onerror = () => resolve(null as any);
  });
};

/**
 * Helper to crop a rectangular source image into a perfect circle using an off-screen HTML5 Canvas.
 * Prevents invalid method errors on jsPDF instance.
 */
const getCroppedCircularLogo = (imgElement: HTMLImageElement): string => {
  const canvas = document.createElement('canvas');
  const size = Math.min(imgElement.width, imgElement.height);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imgElement.src;

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(imgElement, 0, 0, size, size);
  return canvas.toDataURL('image/png');
};

/**
 * Generates a clean A4 tax invoice matching the provided design structure.
 * Replaces all unicode Rupee symbols (₹) with "Rs." to prevent pdf font encoding errors.
 * Clips the logo image inside a clean circle.
 */
export const buildReceiptPDFDoc = async (
  billObj: Bill,
  settings: CafeSettings,
  isCopy: boolean = false
): Promise<jsPDF> => {
  // A4 format: 210mm x 297mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const leftMargin = 20;
  const rightMargin = 190;

  let currentY = 15;

  // 1. CIRCULAR LOGO & CAFE HEADER
  try {
    const logoImg = await loadImage(logo);
    if (logoImg) {
      const logoSize = 25;
      const logoX = (pageWidth - logoSize) / 2;
      const logoY = currentY;

      // Crop the logo element to a circular base64 image path
      const circularLogoUrl = getCroppedCircularLogo(logoImg);
      doc.addImage(circularLogoUrl, 'PNG', logoX, logoY, logoSize, logoSize);

      currentY += logoSize + 4;
    }
  } catch (err) {
    console.warn('Failed to load branding logo for circular clipping:', err);
    currentY += 10; // Fallback spacing
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39); // Slate 900
  doc.text(settings.name || 'CHAPTER ONE CAFE', pageWidth / 2, currentY, { align: 'center' });
  currentY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128); // Slate 500
  doc.text('Near Bajaj Showroom, Opposite Maya Hotel', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.5;
  doc.text('Baghpat, Uttar Pradesh', pageWidth / 2, currentY, { align: 'center' });
  currentY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39); // Slate 900
  doc.text(`+91 8191868626`, pageWidth / 2, currentY, { align: 'center' });
  currentY += 6;

  // Thin line below header
  doc.setDrawColor(229, 231, 235); // Gray 200
  doc.setLineWidth(0.3);
  doc.line(leftMargin, currentY, rightMargin, currentY);
  currentY += 6;

  // 2. TAX INVOICE TITLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(isCopy ? 'TAX INVOICE (COPY)' : 'TAX INVOICE', pageWidth / 2, currentY, { align: 'center' });
  currentY += 6;

  doc.line(leftMargin, currentY, rightMargin, currentY);
  currentY += 6;

  // 3. METADATA GRID (Two-Column Layout)
  const gridCol1 = leftMargin;
  const gridCol2 = leftMargin + 85;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(55, 65, 81); // Gray 700

  // Column 1 Labels
  doc.text('Invoice No :', gridCol1, currentY);
  doc.text('Order ID :', gridCol1, currentY + 5);
  doc.text('Transaction ID :', gridCol1, currentY + 10);
  doc.text('Date / Time :', gridCol1, currentY + 15);

  // Column 2 Labels
  doc.text('Customer :', gridCol2, currentY);
  doc.text('Phone :', gridCol2, currentY + 5);
  doc.text('Order Type :', gridCol2, currentY + 10);
  doc.text('Cashier :', gridCol2, currentY + 15);

  // Values (normal style)
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 24, 39);

  const formattedDate = new Date(billObj.exitTime).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  // Column 1 Values
  doc.text(billObj.billNumber, gridCol1 + 28, currentY);
  doc.text(`ORD-${billObj.billNumber.split('-')[1] || billObj.billNumber}`, gridCol1 + 28, currentY + 5);
  doc.text(`TXN-${settings.waPhoneNumberId || '8191868626'}`, gridCol1 + 28, currentY + 10);
  doc.text(formattedDate, gridCol1 + 28, currentY + 15);

  // Column 2 Values
  doc.text(billObj.customerName || 'Walk-in Guest', gridCol2 + 22, currentY);
  doc.text(billObj.customerPhone || 'N/A', gridCol2 + 22, currentY + 5);
  doc.text(billObj.location || 'Takeaway', gridCol2 + 22, currentY + 10);
  doc.text(billObj.cashierName || 'Administrator', gridCol2 + 22, currentY + 15);

  currentY += 22;

  // Thin line below metadata
  doc.line(leftMargin, currentY, rightMargin, currentY);
  currentY += 4;

  // 4. ITEMS TABLE
  const tableData: any[] = billObj.orderedItems.map(item => [
    item.name,
    item.quantity.toString(),
    `Rs. ${item.price.toFixed(0)}`,
    `Rs. ${(item.price * item.quantity).toFixed(0)}`
  ]);

  if (billObj.basementCharges > 0) {
    tableData.push([
      `Basement Seating Fee (${billObj.timeSpentMinutes} mins)`,
      '1',
      `Rs. ${billObj.basementCharges.toFixed(0)}`,
      `Rs. ${billObj.basementCharges.toFixed(0)}`
    ]);
  }

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: pageWidth - rightMargin },
    head: [['Item', 'Qty', 'Price', 'Amount']],
    body: tableData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
      textColor: [17, 24, 39],
      valign: 'middle'
    },
    headStyles: {
      textColor: [17, 24, 39],
      fontSize: 9.5,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left' },
      1: { cellWidth: 15, halign: 'right' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25, halign: 'right', fontStyle: 'bold' } // Amount column in bold
    },
    didParseCell: (data) => {
      if (data.row.section === 'body') {
        data.cell.styles.lineColor = [243, 244, 246]; // Very light borders
        data.cell.styles.lineWidth = 0.1;
      }
    }
  });

  let finalY = (doc as any).lastAutoTable.finalY + 6;

  // 5. BILLING TOTALS
  const summaryWidth = 65;
  const summaryX = rightMargin - summaryWidth;

  const drawTotalLine = (label: string, val: string, isBold: boolean = false, yPos: number) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 11 : 9.5);
    doc.setTextColor(17, 24, 39);
    doc.text(label, summaryX, yPos);
    doc.setFont('helvetica', 'bold'); // Always bold value totals
    doc.text(val, rightMargin, yPos, { align: 'right' });
  };

  let summaryY = finalY + 4;
  drawTotalLine('Subtotal', `Rs. ${billObj.subtotal.toFixed(2)}`, false, summaryY);
  
  summaryY += 5;
  drawTotalLine(`GST (${settings.gstPercentage || 0}%)`, `Rs. ${billObj.tax.toFixed(2)}`, false, summaryY);
  
  summaryY += 5;
  drawTotalLine('Discount', `Rs. ${billObj.discount.toFixed(2)}`, false, summaryY);

  summaryY += 7;
  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.4);
  doc.line(summaryX, summaryY - 4, rightMargin, summaryY - 4);
  doc.line(summaryX, summaryY - 3.2, rightMargin, summaryY - 3.2);

  drawTotalLine('GRAND TOTAL', `Rs. ${billObj.grandTotal.toFixed(2)}`, true, summaryY);
  doc.line(summaryX, summaryY + 1.8, rightMargin, summaryY + 1.8);

  // Status metrics below totals
  summaryY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128); // Gray 500
  doc.text('Payment Method :', summaryX, summaryY);
  doc.text('Status :', summaryX, summaryY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 24, 39);
  doc.text(billObj.paymentMethod || 'Cash', rightMargin, summaryY, { align: 'right' });

  const isPaid = billObj.status?.toLowerCase() === 'paid';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isPaid ? 22 : 220, isPaid ? 101 : 38, isPaid ? 52 : 38);
  doc.text(isPaid ? 'PAID' : 'UNPAID', rightMargin, summaryY + 5, { align: 'right' });

  // 6. THANK YOU NOTE & FOOTER BLOCK
  currentY = summaryY + 18;

  // Retrieve dynamic guest visit number count
  let visitCount = 1;
  try {
    const { getBills } = await import('./db');
    const allBills = await getBills();
    const customerBills = allBills.filter(b => b.customerPhone && b.customerPhone.trim() === billObj.customerPhone.trim());
    visitCount = customerBills.length;
    if (visitCount === 0) visitCount = 1;
  } catch (err) {
    console.warn('Failed to calculate dynamic visit count:', err);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(`Thank you, ${billObj.customerName || 'Guest'}!`, leftMargin, currentY);
  currentY += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99); // Gray 600
  doc.text(`This is your visit #${visitCount} at Chapter One Cafe.`, leftMargin, currentY);
  currentY += 4.5;
  doc.text('We truly appreciate your visit. We hope to serve you again soon.', leftMargin, currentY);

  // 7. GREEN PAPER SAVING BANNER
  currentY += 8;
  doc.setFillColor(240, 253, 244); // Light green fill (#f0fdf4)
  doc.setDrawColor(220, 252, 231); // Light green border (#dcfce7)
  doc.setLineWidth(0.25);
  doc.roundedRect(leftMargin, currentY, rightMargin - leftMargin, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(21, 128, 61); // Green 700 (#15803d)
  doc.text('Thank you for choosing a digital invoice.', leftMargin + 4, currentY + 4.5);
  
  doc.setFont('helvetica', 'normal');
  doc.text('We serve a digital menu to reduce paper waste and build a greener future.', leftMargin + 4, currentY + 8.5);

  return doc;
};

export const downloadReceiptPDF = async (
  billObj: Bill,
  settings: CafeSettings,
  isCopy: boolean = false
) => {
  const doc = await buildReceiptPDFDoc(billObj, settings, isCopy);
  const prefix = isCopy ? 'COPY_' : '';
  const cleanName = billObj.customerName.replace(/\s+/g, '_');
  doc.save(`${prefix}${billObj.billNumber}_${cleanName}.pdf`);
};

export const generateReceiptPDFBlob = async (
  billObj: Bill,
  settings: CafeSettings
): Promise<Blob> => {
  const doc = await buildReceiptPDFDoc(billObj, settings);
  return doc.output('blob');
};
