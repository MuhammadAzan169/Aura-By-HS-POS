import { useState } from 'react';
import type { CustomerAppSettings, OnlineMethod, Settings } from '@/types';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import * as settingsService from '@/services/settingsService';
import { METHOD_LABEL, onlineSettings } from '@/services/onlinePaymentService';
import { useDb } from '@/hooks/useDb';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';

/** Owner settings for the customer app and online payments. */
export function OnlineSection({ settings }: { settings: Settings }): JSX.Element {
  const db = useDb();
  const [form, setForm] = useState(onlineSettings(db));
  const [app, setApp] = useState<CustomerAppSettings>(
    settings.customerApp ?? { playStoreUrl: '', appStoreUrl: '', websiteUrl: '', whatsapp: '' },
  );
  const save = useAsyncAction(async () => settingsService.updateOnlinePayments(form), { successMessage: 'Online payment settings saved.' });
  const saveApp = useAsyncAction(async () => settingsService.updateCustomerApp(app), { successMessage: 'App links saved.' });
  const bank = (k: keyof typeof form.bank, v: string): void => setForm({ ...form, bank: { ...form.bank, [k]: v } });

  return (
    <div className="mt-4 grid max-w-3xl gap-4">
      <Card>
        <CardHeader
          title="Online payments"
          description="How customers pay from the app, the website and the payment links you send. JazzCash and Easypaisa keys are set on the payments server, never here."
        />
        <div className="mt-5 space-y-4">
          <Switch label="Accept online payments" checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Advance for services (%)" type="number" min={0} max={100} value={form.advancePct} onChange={(e) => setForm({ ...form, advancePct: Number(e.target.value) })} />
            <Input label="Advance for bridal (%)" type="number" min={0} max={100} value={form.bridalAdvancePct} onChange={(e) => setForm({ ...form, bridalAdvancePct: Number(e.target.value) })} />
            <Input label="Smallest part payment" type="number" min={0} value={form.minPartial} onChange={(e) => setForm({ ...form, minPartial: Number(e.target.value) })} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Methods customers may choose</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(METHOD_LABEL) as OnlineMethod[]).map((m) => (
                <Switch key={m} label={METHOD_LABEL[m]} checked={form.methods[m]} onChange={(on) => setForm({ ...form, methods: { ...form.methods, [m]: on } })} />
              ))}
            </div>
          </div>
          <Input
            label="Payments server address"
            placeholder="https://aura-api.onrender.com"
            value={form.apiUrl}
            onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
            hint="Where payment links point. Shown on Render after deploying the API (aura-app/backend)."
          />
          <p className="pt-2 text-sm font-medium text-ink">Bank account shown for transfers</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Bank" placeholder="Meezan Bank" value={form.bank.bankName} onChange={(e) => bank('bankName', e.target.value)} />
            <Input label="Account title" value={form.bank.accountTitle} onChange={(e) => bank('accountTitle', e.target.value)} />
            <Input label="Account number" value={form.bank.accountNumber} onChange={(e) => bank('accountNumber', e.target.value)} />
            <Input label="IBAN" value={form.bank.iban} onChange={(e) => bank('iban', e.target.value)} />
            <Input label="Raast ID (optional)" value={form.bank.raastId} onChange={(e) => bank('raastId', e.target.value)} />
          </div>
          <p className="pt-2 text-sm font-medium text-ink">Shop wallet numbers (for paying at the counter by phone)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="JazzCash number" placeholder="0300 1234567" value={form.jazzcashWallet ?? ''} onChange={(e) => setForm({ ...form, jazzcashWallet: e.target.value })} />
            <Input label="Easypaisa number" placeholder="0345 1234567" value={form.easypaisaWallet ?? ''} onChange={(e) => setForm({ ...form, easypaisaWallet: e.target.value })} />
          </div>
          <Button loading={save.pending} onClick={() => void save.run()}>
            Save online payments
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Customer app & website" description="Shown in the app, on the website and in WhatsApp messages to customers." />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input label="Google Play link" placeholder="https://play.google.com/store/apps/details?id=pk.aurabyhs.aura_by_hs" value={app.playStoreUrl} onChange={(e) => setApp({ ...app, playStoreUrl: e.target.value })} />
          <Input label="App Store link" placeholder="https://apps.apple.com/app/…" value={app.appStoreUrl} onChange={(e) => setApp({ ...app, appStoreUrl: e.target.value })} />
          <Input label="Website" placeholder="https://aurabyhs.pk" value={app.websiteUrl} onChange={(e) => setApp({ ...app, websiteUrl: e.target.value })} />
          <Input label="WhatsApp number" placeholder="0300 1234567" value={app.whatsapp} onChange={(e) => setApp({ ...app, whatsapp: e.target.value })} />
        </div>
        <Button className="mt-4" loading={saveApp.pending} onClick={() => void saveApp.run()}>
          Save app links
        </Button>
      </Card>
    </div>
  );
}
