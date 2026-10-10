import type { BillDesign, Settings, Shop } from '@/types';

export const DEFAULT_BILL_DESIGN: BillDesign = {
  paperSize: 'A5',
  title: 'INVOICE',
  accentColor: '#7A181C',
  fontScale: 'md',
  showLogo: true,
  showBusinessName: true,
  showBranchAddress: true,
  showBranchPhone: true,
  showTaxNumber: false,
  taxNumber: '',
  showCustomerPhone: true,
  showServedBy: true,
  showLineDiscounts: true,
  showTax: true,
  showPayments: true,
  showAmountInWords: true,
  showLoyaltyPoints: true,
  showSignature: false,
  signatureLabel: 'Authorised signature',
  showTerms: true,
  terms: 'Prices include all applicable taxes. No refunds on completed services.',
  footerNote: 'Thank you for visiting us!',
};

/**
 * The design one branch's bills print with: the business design, with any
 * fields that branch overrides. Merged field by field so a later change to
 * the business design still reaches every branch that did not override it.
 */
export function designFor(settings: Settings, shop: Shop | undefined): BillDesign {
  const base = { ...DEFAULT_BILL_DESIGN, ...(settings.billDesign ?? {}) };
  const o = shop?.billOverride;
  return {
    ...base,
    title: o?.title || base.title,
    terms: o?.terms || base.terms,
    footerNote: o?.footerNote || base.footerNote,
    taxNumber: o?.taxNumber || base.taxNumber,
  };
}
