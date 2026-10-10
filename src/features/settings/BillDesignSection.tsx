import { useEffect, useMemo, useState } from 'react';
import type { BillDesign, Sale, Settings, Shop } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useDebounce } from '@/hooks/useDebounce';
import * as settingsService from '@/services/settingsService';
import * as shopService from '@/services/shopService';
import { DEFAULT_BILL_DESIGN } from '@/services/billDesign';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';

/** A bill to preview with when nothing has been sold yet. */
function sampleSale(shopId: string): Sale {
  const at = new Date().toISOString();
  return {
    id: 'preview',
    createdAt: at,
    updatedAt: at,
    shopId,
    receiptNo: 'AUR-2026-000123',
    customerId: null,
    customerName: 'Ayesha Khan',
    staffId: null,
    appointmentId: null,
    items: [
      { id: 'a', kind: 'service', refId: 'x', name: 'Party Make-up with Lashes', unitPrice: 8000, quantity: 1, discount: 500, staffId: null, lineTotal: 7500 },
      { id: 'b', kind: 'service', refId: 'y', name: 'Blow Dry & Styling', unitPrice: 1800, quantity: 1, discount: 0, staffId: null, lineTotal: 1800 },
      { id: 'c', kind: 'product', refId: 'z', name: 'Argan Hair Oil 100ml', unitPrice: 2400, quantity: 1, discount: 0, staffId: null, lineTotal: 2400 },
    ],
    subtotal: 11700,
    itemDiscountTotal: 500,
    billDiscount: 0,
    membershipDiscount: 585,
    taxRate: 5,
    taxAmount: 555.75,
    total: 11670.75,
    payments: [{ id: 'p', method: 'cash', amount: 11670.75, tendered: 12000, reference: null }],
    changeGiven: 329.25,
    status: 'completed',
    refundReason: null,
    refundedAt: null,
    soldAt: at,
    notes: '',
    pointsEarned: 116,
  };
}

export function BillDesignSection({ settings }: { settings: Settings }): JSX.Element {
  const db = useDb();
  const [design, setDesign] = useState<BillDesign>({ ...DEFAULT_BILL_DESIGN, ...(settings.billDesign ?? {}) });
  const [previewShopId, setPreviewShopId] = useState(db.shops[0]?.id ?? '');
  const [url, setUrl] = useState<string | null>(null);
  const debounced = useDebounce(design, 300);

  const shop: Shop | undefined = db.shops.find((s) => s.id === previewShopId);
  const sale = useMemo(() => {
    const real = db.sales.find((s) => s.shopId === previewShopId && s.status === 'completed');
    return real ?? sampleSale(previewShopId);
  }, [db.sales, previewShopId]);

  // Branch overrides layered over the design being edited.
  const effective = useMemo<BillDesign>(() => {
    const o = shop?.billOverride;
    return {
      ...debounced,
      title: o?.title || debounced.title,
      terms: o?.terms || debounced.terms,
      footerNote: o?.footerNote || debounced.footerNote,
      taxNumber: o?.taxNumber || debounced.taxNumber,
    };
  }, [debounced, shop]);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    void import('@/utils/receiptPdf').then(async ({ previewReceiptPdf }) => {
      if (cancelled) return;
      made = await previewReceiptPdf({
        sale,
        shop,
        staff: db.staff.find((s) => s.id === sale.staffId),
        customer: db.customers.find((c) => c.id === sale.customerId),
        settings,
        design: effective,
      });
      if (cancelled) {
        URL.revokeObjectURL(made);
        return;
      }
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [effective, sale, shop, settings, db.staff, db.customers]);

  const save = useAsyncAction(async () => settingsService.updateBillDesign(design), {
    successMessage: 'Bill design saved. Every new print and download uses it.',
  });

  const [override, setOverride] = useState({ title: '', terms: '', footerNote: '', taxNumber: '' });
  useEffect(() => {
    setOverride({
      title: shop?.billOverride?.title ?? '',
      terms: shop?.billOverride?.terms ?? '',
      footerNote: shop?.billOverride?.footerNote ?? '',
      taxNumber: shop?.billOverride?.taxNumber ?? '',
    });
  }, [shop]);
  const saveOverride = useAsyncAction(
    async () => {
      if (!shop) throw new Error('Pick a branch.');
      return shopService.update(shop.id, { billOverride: override });
    },
    { successMessage: 'Branch bill settings saved.' },
  );

  const toggle = (key: keyof BillDesign, label: string): JSX.Element => (
    <Switch label={label} checked={Boolean(design[key])} onChange={(v) => setDesign({ ...design, [key]: v })} />
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Bill design" description="How every bill looks — printed, downloaded and sent on WhatsApp." />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Select
              label="Paper"
              value={design.paperSize}
              onChange={(e) => setDesign({ ...design, paperSize: e.target.value as BillDesign['paperSize'] })}
              options={[
                { value: 'A5', label: 'A5 (half page)' },
                { value: 'A4', label: 'A4 (full page)' },
                { value: '80mm', label: '80 mm receipt printer roll' },
              ]}
            />
            <Select
              label="Text size"
              value={design.fontScale}
              onChange={(e) => setDesign({ ...design, fontScale: e.target.value as BillDesign['fontScale'] })}
              options={[
                { value: 'sm', label: 'Small' },
                { value: 'md', label: 'Normal' },
                { value: 'lg', label: 'Large' },
              ]}
            />
            <Input label="Title" value={design.title} onChange={(e) => setDesign({ ...design, title: e.target.value })} />
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink">Colour</span>
              <input
                type="color"
                value={design.accentColor}
                onChange={(e) => setDesign({ ...design, accentColor: e.target.value })}
                className="h-10 w-full cursor-pointer rounded-xl border border-line bg-surface"
                aria-label="Bill colour"
              />
            </label>
            <Input label="NTN / tax number" value={design.taxNumber} onChange={(e) => setDesign({ ...design, taxNumber: e.target.value })} />
            <Input label="Signature label" value={design.signatureLabel} onChange={(e) => setDesign({ ...design, signatureLabel: e.target.value })} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {toggle('showLogo', 'Logo')}
            {toggle('showBusinessName', 'Business name')}
            {toggle('showBranchAddress', 'Branch address')}
            {toggle('showBranchPhone', 'Branch phone')}
            {toggle('showTaxNumber', 'Tax number')}
            {toggle('showCustomerPhone', 'Customer phone')}
            {toggle('showServedBy', 'Served by (stylist)')}
            {toggle('showLineDiscounts', 'Line discounts')}
            {toggle('showTax', 'Tax line')}
            {toggle('showPayments', 'Payment methods')}
            {toggle('showAmountInWords', 'Amount in words')}
            {toggle('showLoyaltyPoints', 'Loyalty points earned')}
            {toggle('showSignature', 'Signature line')}
            {toggle('showTerms', 'Terms & conditions')}
          </div>
          <div className="mt-5 space-y-4">
            <Textarea label="Terms & conditions" rows={3} value={design.terms} onChange={(e) => setDesign({ ...design, terms: e.target.value })} />
            <Input label="Footer line" placeholder="Follow us on Instagram @aurabyhs" value={design.footerNote} onChange={(e) => setDesign({ ...design, footerNote: e.target.value })} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button loading={save.pending} onClick={() => void save.run()}>
              Save bill design
            </Button>
            <Button variant="outline" onClick={() => setDesign({ ...DEFAULT_BILL_DESIGN })}>
              Reset to default
            </Button>
          </div>
        </Card>

        {db.shops.length > 0 && (
          <Card>
            <CardHeader
              title="Per-branch differences"
              description="Leave a field empty to use the business design. The branch logo is set on the branch's own profile."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Select
                label="Branch"
                value={previewShopId}
                onChange={(e) => setPreviewShopId(e.target.value)}
                options={db.shops.map((s) => ({ value: s.id, label: s.name }))}
              />
              <Input label="Title for this branch" value={override.title} onChange={(e) => setOverride({ ...override, title: e.target.value })} />
              <Input label="NTN for this branch" value={override.taxNumber} onChange={(e) => setOverride({ ...override, taxNumber: e.target.value })} />
              <Input label="Footer for this branch" value={override.footerNote} onChange={(e) => setOverride({ ...override, footerNote: e.target.value })} />
              <div className="sm:col-span-2">
                <Textarea label="Terms for this branch" rows={2} value={override.terms} onChange={(e) => setOverride({ ...override, terms: e.target.value })} />
              </div>
            </div>
            <Button className="mt-4" variant="outline" loading={saveOverride.pending} onClick={() => void saveOverride.run()}>
              Save for {shop?.name ?? 'branch'}
            </Button>
          </Card>
        )}
      </div>

      <Card className="xl:sticky xl:top-4 xl:self-start">
        <CardHeader
          title="Live preview"
          description={sale.id === 'preview' ? 'A sample bill — your real bills look exactly like this.' : `Your latest bill at ${shop?.name ?? 'this branch'}.`}
        />
        {url ? (
          <iframe title="Bill preview" src={`${url}#toolbar=0&view=FitH`} className="mt-4 h-[640px] w-full rounded-xl border border-line bg-white" />
        ) : (
          <p className="mt-4 text-sm text-muted">Preparing preview…</p>
        )}
      </Card>
    </div>
  );
}
