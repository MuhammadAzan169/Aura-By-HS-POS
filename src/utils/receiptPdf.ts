import { jsPDF } from 'jspdf';
import type { BillDesign, Customer, Sale, Settings, Shop, Staff } from '@/types';
import { designFor } from '@/services/billDesign';
import { formatDateTime } from './date';
import { amountInWords } from './numberWords';

/**
 * The bill as a real PDF, laid out by the owner's Bill design settings:
 * A4 or A5 for a printed invoice, or an 80 mm roll for a receipt printer.
 * The same file is downloaded, printed and previewed in Settings, so the
 * three can never disagree.
 *
 * jsPDF's built-in fonts are Latin-1 only, so the currency is written with
 * whichever of the symbol and the ISO code survives that (e.g. "Rs" or "PKR").
 */
export interface ReceiptPdfInput {
  sale: Sale;
  shop: Shop | undefined;
  staff: Staff | undefined;
  customer?: Customer | undefined;
  settings: Settings;
  /** Overrides the saved design, for the live preview. */
  design?: BillDesign;
  /** The logo already read into a data URL (see withLogo). */
  logoDataUrl?: string | null;
}

const logoCache = new Map<string, string | null>();

/** jsPDF can only embed image data, so a logo given as a file path is read first. */
async function withLogo(input: ReceiptPdfInput): Promise<ReceiptPdfInput> {
  const src = input.shop?.logoUrl ?? input.settings.business.logoUrl;
  if (!src) return { ...input, logoDataUrl: null };
  if (src.startsWith('data:')) return { ...input, logoDataUrl: src };
  if (!logoCache.has(src)) {
    try {
      const blob = await (await fetch(src)).blob();
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('unreadable'));
        r.readAsDataURL(blob);
      });
      logoCache.set(src, data);
    } catch {
      logoCache.set(src, null);
    }
  }
  return { ...input, logoDataUrl: logoCache.get(src) ?? null };
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  'bank-transfer': 'Bank transfer',
  other: 'Other',
  voucher: 'Gift voucher',
  points: 'Loyalty points',
  wallet: 'Advance',
};

type RGB = [number, number, number];
const INK: RGB = [30, 26, 23];
const MUTED: RGB = [110, 100, 95];

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return [122, 24, 28];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function money(value: number, settings: Settings): string {
  const symbol = /^[\x20-\x7E]+$/.test(settings.billing.currency)
    ? settings.billing.currency
    : settings.billing.currencyCode;
  const amount = value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : ''}${symbol} ${amount.replace('-', '')}`;
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return null;
}

/** Draws the whole bill on `doc` and returns where the content ended. */
function draw(doc: jsPDF, input: ReceiptPdfInput, d: BillDesign): number {
  const { sale, shop, staff, customer, settings } = input;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const roll = d.paperSize === '80mm';
  const M = roll ? 4 : d.paperSize === 'A4' ? 16 : 12;
  const k = (d.fontScale === 'sm' ? 0.9 : d.fontScale === 'lg' ? 1.12 : 1) * (d.paperSize === 'A4' ? 1.1 : roll ? 0.92 : 1);
  const fs = (n: number): void => {
    doc.setFontSize(n * k);
  };
  const lh = (n: number): number => n * k;
  const ACCENT = hexToRgb(d.accentColor);
  const bottomLimit = roll ? Number.POSITIVE_INFINITY : H - 30;
  let y: number;

  const newPageIfNeeded = (needed: number): void => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 16;
    }
  };

  // ---- Header
  const logo = input.logoDataUrl ?? null;
  const fmt = logo && d.showLogo ? imageFormat(logo) : null;
  const address = [d.showBranchAddress ? [shop?.addressLine, shop?.city].filter(Boolean).join(', ') : '', d.showBranchPhone ? shop?.phone : '']
    .filter(Boolean)
    .join(' · ');

  if (roll) {
    y = 6;
    if (logo && fmt) {
      try {
        doc.addImage(logo, fmt, W / 2 - 8, y, 16, 16);
        y += 18;
      } catch {
        /* an unreadable logo never blocks the bill */
      }
    }
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    fs(12);
    if (d.showBusinessName) {
      doc.text(settings.business.name || 'Aura by HS', W / 2, y + 3, { align: 'center' });
      y += lh(5);
    }
    doc.setFont('helvetica', 'normal');
    fs(8);
    if (shop?.name) {
      doc.text(shop.name, W / 2, y + 2, { align: 'center' });
      y += lh(4);
    }
    if (address) {
      const lines = doc.splitTextToSize(address, W - 2 * M) as string[];
      doc.text(lines, W / 2, y + 2, { align: 'center' });
      y += lh(3.6) * lines.length;
    }
    if (d.showTaxNumber && d.taxNumber) {
      doc.text(`NTN: ${d.taxNumber}`, W / 2, y + 2, { align: 'center' });
      y += lh(4);
    }
    y += 3;
    doc.setFont('helvetica', 'bold');
    fs(10);
    doc.text(sale.status === 'refunded' ? `${d.title} — REFUNDED` : d.title, W / 2, y + 2, { align: 'center' });
    y += lh(6);
  } else {
    const band = d.paperSize === 'A4' ? 34 : 30;
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, W, band, 'F');
    let textX = M;
    if (logo && fmt) {
      try {
        doc.addImage(logo, fmt, M, 6, band - 12, band - 12);
        textX = M + band - 8;
      } catch {
        /* an unreadable logo never blocks the bill */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    fs(15);
    if (d.showBusinessName) doc.text(settings.business.name || 'Aura by HS', textX, 13);
    doc.setFont('helvetica', 'normal');
    fs(8.5);
    doc.text(shop?.name ?? settings.billing.receiptHeader, textX, 18.5);
    if (address) doc.text(address, textX, 23, { maxWidth: W - textX - M });
    if (d.showTaxNumber && d.taxNumber) doc.text(`NTN: ${d.taxNumber}`, textX, 27);

    y = band + 10;
    doc.setTextColor(...ACCENT);
    doc.setFont('helvetica', 'bold');
    fs(12);
    doc.text(sale.status === 'refunded' ? `${d.title} — REFUNDED` : d.title, M, y);
    fs(9);
    doc.setTextColor(...INK);
    doc.text(sale.receiptNo, W - M, y, { align: 'right' });
    y += lh(7);
  }

  // ---- Meta
  doc.setFont('helvetica', 'normal');
  fs(8.5);
  const meta: Array<[string, string]> = [];
  if (roll) meta.push(['Bill no.', sale.receiptNo]);
  meta.push(['Date', formatDateTime(sale.soldAt)]);
  meta.push(['Customer', sale.customerName || 'Walk-in']);
  if (d.showCustomerPhone && customer?.phone) meta.push(['Phone', customer.phone]);
  if (d.showServedBy && staff) meta.push(['Served by', staff.name]);
  for (const [label, value] of meta) {
    doc.setTextColor(...MUTED);
    doc.text(label, M, y);
    doc.setTextColor(...INK);
    doc.text(value, roll ? W - M : M + 24, y, roll ? { align: 'right' } : undefined);
    y += lh(4.8);
  }

  // ---- Lines
  y += 3;
  const cols = roll
    ? { item: M, qty: W - M - 30, price: W - M - 15, total: W - M }
    : { item: M, qty: W - M - 52, price: W - M - 26, total: W - M };
  if (!roll) {
    doc.setFillColor(251, 247, 242);
    doc.rect(M - 2, y - 4.5, W - 2 * M + 4, 7, 'F');
  } else {
    doc.setDrawColor(...MUTED);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(M, y - 4, W - M, y - 4);
  }
  doc.setFont('helvetica', 'bold');
  fs(roll ? 7.5 : 8);
  doc.setTextColor(...MUTED);
  doc.text('ITEM', cols.item, y);
  doc.text('QTY', cols.qty, y, { align: 'center' });
  if (!roll) doc.text('PRICE', cols.price, y, { align: 'right' });
  doc.text('TOTAL', cols.total, y, { align: 'right' });
  y += lh(6);

  doc.setFont('helvetica', 'normal');
  fs(8.5);
  for (const item of sale.items) {
    newPageIfNeeded(12);
    doc.setTextColor(...INK);
    const width = (roll ? cols.qty - 4 : cols.qty - 6) - cols.item;
    const name = doc.splitTextToSize(item.name, width) as string[];
    doc.text(name, cols.item, y);
    doc.text(String(item.quantity), cols.qty, y, { align: 'center' });
    if (!roll) doc.text(money(item.unitPrice, settings), cols.price, y, { align: 'right' });
    doc.text(money(item.lineTotal, settings), cols.total, y, { align: 'right' });
    y += lh(4.3) * name.length;
    if (d.showLineDiscounts && item.discount > 0) {
      doc.setTextColor(46, 125, 50);
      fs(7.5);
      doc.text(`less ${money(item.discount, settings)}`, cols.item, y - 0.5);
      fs(8.5);
      y += lh(3.5);
    }
    y += 1.2;
  }

  // ---- Totals
  newPageIfNeeded(50);
  doc.setDrawColor(...(roll ? MUTED : hexToRgb('#C9A45C')));
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  doc.setLineDashPattern([], 0);
  y += lh(5.5);
  const labelX = roll ? M : W - M - 60;
  const totals: Array<[string, string]> = [['Subtotal', money(sale.subtotal, settings)]];
  if (sale.membershipDiscount > 0) totals.push(['Membership discount', money(-sale.membershipDiscount, settings)]);
  if (sale.billDiscount > 0) {
    totals.push([sale.couponCode ? `Coupon ${sale.couponCode}` : 'Bill discount', money(-sale.billDiscount, settings)]);
  }
  if (d.showTax) totals.push([`Tax (${sale.taxRate}%)`, money(sale.taxAmount, settings)]);
  for (const [label, value] of totals) {
    doc.setTextColor(...MUTED);
    doc.text(label, labelX, y);
    doc.setTextColor(...INK);
    doc.text(value, W - M, y, { align: 'right' });
    y += lh(4.8);
  }
  y += 1;
  if (roll) {
    doc.setFont('helvetica', 'bold');
    fs(11);
    doc.text('TOTAL', M, y + 1);
    doc.text(money(sale.total, settings), W - M, y + 1, { align: 'right' });
    y += lh(7);
  } else {
    doc.setFillColor(...ACCENT);
    doc.rect(W - M - 64, y - 5, 66, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    fs(10.5);
    doc.text('TOTAL', W - M - 60, y + 1);
    doc.text(money(sale.total, settings), W - M, y + 1, { align: 'right' });
    y += 10;
  }

  doc.setFont('helvetica', 'normal');
  fs(8.5);
  doc.setTextColor(...INK);
  if (d.showAmountInWords) {
    fs(7.5);
    doc.setTextColor(...MUTED);
    const words = doc.splitTextToSize(amountInWords(sale.total), W - 2 * M) as string[];
    doc.text(words, M, y);
    y += lh(3.6) * words.length + 2;
    fs(8.5);
  }

  // ---- Payments
  const line = (label: string, value: string, color: RGB = INK, bold = false): void => {
    newPageIfNeeded(6);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(bold ? color : MUTED));
    doc.text(label, M, y);
    doc.setTextColor(...color);
    doc.text(value, W - M, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += lh(4.8);
  };
  if ((sale.tip ?? 0) > 0) line('Tip', money(sale.tip ?? 0, settings));
  if (d.showPayments) {
    for (const p of sale.payments) {
      const ref = p.method === 'voucher' && p.reference ? ` (${p.reference})` : p.method === 'points' && p.reference ? ` (${p.reference} pts)` : '';
      line(`Paid by ${METHOD_LABELS[p.method] ?? p.method}${ref}`, money(p.tendered ?? p.amount, settings));
    }
    if (sale.changeGiven > 0) line('Change given', money(sale.changeGiven, settings));
  }
  if ((sale.balanceDue ?? 0) > 0) line('Balance due', money(sale.balanceDue ?? 0, settings), [180, 30, 40], true);
  if (d.showLoyaltyPoints && (sale.pointsEarned ?? 0) > 0) line('Loyalty points earned', `+${sale.pointsEarned}`);
  if (sale.status === 'refunded' && sale.refundReason) {
    doc.setTextColor(180, 30, 40);
    const r = doc.splitTextToSize(`Refunded: ${sale.refundReason}`, W - 2 * M) as string[];
    doc.text(r, M, y);
    y += lh(4) * r.length;
  }

  // ---- Signature, terms, footer
  if (d.showSignature) {
    y += roll ? 10 : 14;
    newPageIfNeeded(12);
    doc.setDrawColor(...MUTED);
    const sx = roll ? M : W - M - 55;
    doc.line(sx, y, sx + (roll ? W - 2 * M : 55), y);
    fs(7.5);
    doc.setTextColor(...MUTED);
    doc.text(d.signatureLabel, roll ? W / 2 : sx + 27.5, y + 4, { align: 'center' });
    y += 8;
  }

  const footer = [d.showTerms ? d.terms : '', shop?.receiptFooter ?? '', d.footerNote].filter((t) => t && t.trim()).join('\n');
  fs(7.5);
  doc.setTextColor(...MUTED);
  if (footer) {
    const lines = doc.splitTextToSize(footer, W - 2 * M) as string[];
    if (roll) {
      y += 5;
      doc.text(lines, W / 2, y, { align: 'center' });
      y += lh(3.4) * lines.length;
    } else {
      doc.setDrawColor(...hexToRgb('#C9A45C'));
      doc.line(M, H - 22, W - M, H - 22);
      doc.text(lines, W / 2, H - 16, { align: 'center' });
    }
  }
  return y + 6;
}

export function buildReceiptPdf(input: ReceiptPdfInput): jsPDF {
  const design = input.design ?? designFor(input.settings, input.shop);
  if (design.paperSize === '80mm') {
    // Draw once on a long strip to measure, then again on a roll cut to length.
    const measured = draw(new jsPDF({ unit: 'mm', format: [80, 2000] }), input, design);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(90, measured)] });
    draw(doc, input, design);
    return doc;
  }
  const doc = new jsPDF({ unit: 'mm', format: design.paperSize === 'A4' ? 'a4' : 'a5' });
  draw(doc, input, design);
  return doc;
}

export async function downloadReceiptPdf(input: ReceiptPdfInput): Promise<void> {
  buildReceiptPdf(await withLogo(input)).save(`${input.sale.receiptNo}.pdf`);
}

/** Opens the PDF in a new tab with the print dialog, so Print and Download match exactly. */
export async function printReceiptPdf(input: ReceiptPdfInput): Promise<void> {
  const doc = buildReceiptPdf(await withLogo(input));
  doc.autoPrint();
  const url = doc.output('bloburl');
  const win = window.open(String(url), '_blank');
  // Pop-up blocked: fall back to downloading, which is never blocked.
  if (!win) doc.save(`${input.sale.receiptNo}.pdf`);
}

export async function previewReceiptPdf(input: ReceiptPdfInput): Promise<string> {
  return String(buildReceiptPdf(await withLogo(input)).output('bloburl'));
}
