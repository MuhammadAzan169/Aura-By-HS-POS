import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarCog,
  Download,
  Sparkles,
  KeyRound,
  Receipt,
  RotateCcw,
  Upload,
  UserCircle2,
} from 'lucide-react';
import type { NotificationType, Settings } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useCartStore } from '@/store/cartStore';
import * as settingsService from '@/services/settingsService';
import { changePassword } from '@/services/authService';
import { isCloud } from '@/services/cloud/client';
import { mutateDb } from '@/store/dataStore';
import { flush } from '@/services/cloud/sync';
import { downloadJson, timestampedName } from '@/utils/export';
import { memberships, serviceCategories, services, servicePackages } from '@/mock/catalog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Avatar } from '@/components/ui/Avatar';

const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  'appointment-created': 'A new appointment is booked',
  'appointment-reminder': 'An appointment starts within 30 minutes',
  'appointment-cancelled': 'An appointment is cancelled',
  'appointment-rescheduled': 'An appointment is moved',
  'appointment-no-show': 'A customer does not arrive',
  'payment-completed': 'A payment is taken',
  refund: 'A bill is refunded',
  'low-stock': 'A product drops below its minimum',
  'out-of-stock': 'A product runs out',
  'customer-created': 'A new customer is added',
  'membership-expiring': 'A membership is about to lapse',
};

type TabValue = 'business' | 'appointments' | 'billing' | 'notifications' | 'account' | 'data';

export function SettingsPage(): JSX.Element {
  const db = useDb();
  const settings = db.settings;

  const [tab, setTab] = useState<TabValue>('business');

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business-wide configuration. Changes take effect everywhere immediately."
      >
        <Tabs
          label="Settings sections"
          value={tab}
          onChange={(next) => setTab(next as TabValue)}
          items={[
            { value: 'business', label: 'Business', icon: <Building2 /> },
            { value: 'appointments', label: 'Appointments', icon: <CalendarCog /> },
            { value: 'billing', label: 'Billing', icon: <Receipt /> },
            { value: 'notifications', label: 'Notifications', icon: <Bell /> },
            { value: 'account', label: 'My account', icon: <UserCircle2 /> },
            { value: 'data', label: 'Data', icon: <RotateCcw /> },
          ]}
        />
      </PageHeader>

      <TabPanel active={tab === 'business'}>
        <BusinessSection settings={settings} />
      </TabPanel>
      <TabPanel active={tab === 'appointments'}>
        <AppointmentSection settings={settings} />
      </TabPanel>
      <TabPanel active={tab === 'billing'}>
        <BillingSection settings={settings} />
      </TabPanel>
      <TabPanel active={tab === 'notifications'}>
        <NotificationSection settings={settings} />
      </TabPanel>
      <TabPanel active={tab === 'account'}>
        <AccountSection />
      </TabPanel>
      <TabPanel active={tab === 'data'}>
        <DataSection />
      </TabPanel>
    </>
  );
}

// ------------------------------------------------------------------ business

function BusinessSection({ settings }: { settings: Settings }): JSX.Element {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(settings.business);

  useEffect(() => setForm(settings.business), [settings.business]);

  const save = useAsyncAction(async () => settingsService.updateBusiness(form), {
    successMessage: 'Business profile saved. Receipts and the header now use it.',
  });

  const pickLogo = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const dataUrl = await settingsService.readImageAsDataUrl(file);
      setForm((current) => ({ ...current, logoUrl: dataUrl }));
    } catch (error) {
      toast.fromError(error, 'That image could not be loaded.');
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Business profile"
        description="Appears in the header, on receipts and on exported reports."
      />

      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {form.logoUrl ? (
            <img src={form.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <Avatar name={form.name} size="lg" />
          )}

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void pickLogo(e.target.files?.[0])}
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Upload />}
                onClick={() => fileRef.current?.click()}
              >
                Upload logo
              </Button>

              {form.logoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((c) => ({ ...c, logoUrl: null }))}
                >
                  Remove
                </Button>
              )}
            </div>

            <p className="mt-1.5 text-xs text-subtle">
              PNG, JPG or SVG, under 500 KB. Stored in your browser for this demo.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Business name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Tagline"
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Input
            label="Head office address"
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
          />
          <Input
            label="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>

        <Button loading={save.pending} onClick={() => void save.run()}>
          Save business profile
        </Button>
      </div>
    </Card>
  );
}

// -------------------------------------------------------------- appointments

function AppointmentSection({ settings }: { settings: Settings }): JSX.Element {
  const [form, setForm] = useState(settings.appointments);
  useEffect(() => setForm(settings.appointments), [settings.appointments]);

  const save = useAsyncAction(async () => settingsService.updateAppointmentRules(form), {
    successMessage: 'Booking rules saved. The slot grid updates immediately.',
  });

  const set = (key: keyof typeof form, value: string): void =>
    setForm({ ...form, [key]: Number(value) || 0 });

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Booking rules"
        description="These constrain every slot the availability engine offers."
      />

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Default duration (minutes)"
            type="number"
            min={5}
            step={5}
            value={form.defaultDurationMin}
            onChange={(e) => set('defaultDurationMin', e.target.value)}
            hint="Used when no service has been chosen yet"
          />

          <Input
            label="Slot interval (minutes)"
            type="number"
            min={5}
            step={5}
            value={form.slotIntervalMin}
            onChange={(e) => set('slotIntervalMin', e.target.value)}
            hint="How finely the day is divided — 15 gives :00, :15, :30, :45"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Minimum notice (minutes)"
            type="number"
            min={0}
            step={15}
            value={form.minAdvanceBookingMin}
            onChange={(e) => set('minAdvanceBookingMin', e.target.value)}
            hint="Nothing can be booked closer than this to now"
          />

          <Input
            label="Cancellation window (hours)"
            type="number"
            min={0}
            value={form.cancellationWindowHours}
            onChange={(e) => set('cancellationWindowHours', e.target.value)}
            hint="Guidance shown to staff when cancelling late"
          />
        </div>

        <Input
          label="Buffer between appointments (minutes)"
          type="number"
          min={0}
          step={5}
          value={form.bufferMin}
          onChange={(e) => set('bufferMin', e.target.value)}
          hint="Turnaround time kept clear after each booking for the same stylist"
          className="sm:max-w-[16rem]"
        />

        <Button loading={save.pending} onClick={() => void save.run()}>
          Save booking rules
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------- billing

function BillingSection({ settings }: { settings: Settings }): JSX.Element {
  const [form, setForm] = useState(settings.billing);
  useEffect(() => setForm(settings.billing), [settings.billing]);

  const save = useAsyncAction(async () => settingsService.updateBilling(form), {
    successMessage: 'Billing settings saved.',
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Billing" description="Currency, tax and what appears on a receipt." />

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Currency symbol"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          />
          <Input
            label="Currency code"
            value={form.currencyCode}
            onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })}
            hint="ISO code, e.g. PKR"
          />
          <Input
            label="Locale"
            value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
            hint="e.g. en-PK"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tax rate (%)"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.taxRatePct}
            onChange={(e) => setForm({ ...form, taxRatePct: Number(e.target.value) || 0 })}
            hint="Applied after all discounts"
          />

          <Input
            label="Max discount for shop users (%)"
            type="number"
            min={0}
            max={100}
            value={form.maxShopDiscountPct}
            onChange={(e) => setForm({ ...form, maxShopDiscountPct: Number(e.target.value) || 0 })}
            hint="Branch accounts cannot exceed this at the till"
          />
        </div>

        <Input
          label="Receipt header"
          value={form.receiptHeader}
          onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })}
          hint="Used when a branch has no name of its own"
        />

        <Textarea
          label="Receipt footer"
          rows={2}
          value={form.receiptFooter}
          onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
          hint="Small print at the bottom of every receipt"
        />

        <Button loading={save.pending} onClick={() => void save.run()}>
          Save billing settings
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- notifications

function NotificationSection({ settings }: { settings: Settings }): JSX.Element {
  const [prefs, setPrefs] = useState(settings.notifications);
  useEffect(() => setPrefs(settings.notifications), [settings.notifications]);

  const save = useAsyncAction(async () => settingsService.updateNotificationPrefs(prefs), {
    successMessage: 'Notification preferences saved.',
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Notification preferences"
        description="Turning one off stops it being raised at all — it will not appear in the bell or the list."
      />

      <div className="mt-5 divide-y divide-line">
        {(Object.keys(NOTIFICATION_LABELS) as NotificationType[]).map((type) => (
          <div key={type} className="py-3">
            <Switch
              label={NOTIFICATION_LABELS[type]}
              checked={prefs[type]}
              onChange={(checked) => setPrefs({ ...prefs, [type]: checked })}
            />
          </div>
        ))}
      </div>

      <Button className="mt-5" loading={save.pending} onClick={() => void save.run()}>
        Save preferences
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------------- account

function AccountSection(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const toast = useToast();

  const attemptPasswordChange = async (): Promise<void> => {
    try {
      toast.success(await changePassword());
    } catch (error) {
      toast.fromError(error);
    }
  };

  if (!user) return <Card>Not signed in.</Card>;

  return (
    <Card className="max-w-2xl">
      <CardHeader title="My account" description="Your own sign-in details." />

      <div className="mt-5 flex items-center gap-4">
        <Avatar name={user.name} src={user.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-ink">{user.name}</p>
          <p className="text-sm text-muted">{user.email}</p>
          <p className="mt-0.5 text-xs text-subtle">
            {user.role === 'admin' ? 'Business owner — access to every branch' : 'Branch account'}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" defaultValue={user.name} readOnly />
          <Input label="Email" defaultValue={user.email} readOnly />
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="flex items-start gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn"
              aria-hidden
            >
              <KeyRound className="h-[18px] w-[18px]" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">Change password</p>
              <p className="mt-0.5 text-xs text-muted">
                We email you a secure link to choose a new password. Google sign-in users can
                ignore this.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void attemptPasswordChange()}
          >
            Change password
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------- data

function DataSection(): JSX.Element {
  return isCloud ? <CloudDataSection /> : <DemoDataSection />;
}

/** Online: backups and first-run setup. The database itself lives in Supabase. */
function CloudDataSection(): JSX.Element {
  const db = useDb();
  const toast = useToast();
  const confirm = useConfirm();

  const exportBackup = (): void => {
    const { credentials: _unused, ...tables } = db;
    downloadJson({ exportedAt: new Date().toISOString(), ...tables }, timestampedName('aura-backup'));
    toast.success('Backup downloaded.', 'Keep the file somewhere safe, e.g. Google Drive.');
  };

  const loadStarter = useAsyncAction(
    async () => {
      const ids = new Set(db.services.map((s) => s.id));
      mutateDb((next) => {
        next.serviceCategories = [
          ...next.serviceCategories,
          ...serviceCategories.filter((c) => !next.serviceCategories.some((x) => x.id === c.id)),
        ];
        next.services = [...next.services, ...services.filter((s) => !ids.has(s.id))];
        next.packages = [
          ...next.packages,
          ...servicePackages.filter((p) => !next.packages.some((x) => x.id === p.id)),
        ];
        next.memberships = [
          ...next.memberships,
          ...memberships.filter((m) => !next.memberships.some((x) => x.id === m.id)),
        ];
      });
      await flush();
    },
    { successMessage: 'Starter menu added. Edit prices and names under Services.' },
  );

  const onStarter = async (): Promise<void> => {
    const result = await confirm({
      title: 'Add the starter service menu?',
      description:
        'Adds sample categories, services, packages and memberships you can then edit or switch off. Nothing existing is changed.',
      confirmLabel: 'Add starter menu',
    });
    if (result.confirmed) await loadStarter.run();
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Data & backups"
        description="Everything is stored in your Supabase database and shared live by every branch."
      />
      <div className="mt-5 space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
          <p className="text-[13px] leading-relaxed text-ink">
            A full copy of the database is also saved automatically every night by the GitHub
            backup job (see the setup guide). Use the button below for an extra copy whenever
            you like.
          </p>
        </div>

        <div className="rounded-xl border border-line p-4">
          <p className="text-[13px] font-medium text-ink">Download a backup</p>
          <p className="mt-0.5 text-xs text-muted">
            Every branch, customer, appointment, bill and stock record as one file.
          </p>
          <Button variant="outline" size="sm" className="mt-3" leftIcon={<Download />} onClick={exportBackup}>
            Download backup (.json)
          </Button>
        </div>

        <div className="rounded-xl border border-line p-4">
          <p className="text-[13px] font-medium text-ink">Starter service menu</p>
          <p className="mt-0.5 text-xs text-muted">
            A ready-made salon menu (hair, skin, nails, make-up, bridal packages, memberships) to
            save typing on day one. {db.services.length} services in the menu now.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            leftIcon={<Sparkles />}
            loading={loadStarter.pending}
            onClick={() => void onStarter()}
          >
            Add starter menu
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DemoDataSection(): JSX.Element {
  const confirm = useConfirm();
  const toast = useToast();
  const resetDemoData = useDataStore((s) => s.resetDemoData);
  const clearCart = useCartStore((s) => s.clear);

  const onReset = async (): Promise<void> => {
    const result = await confirm({
      title: 'Reset the demo data?',
      description:
        'Every appointment, sale, customer and stock change you have made is discarded and the original demo dataset is rebuilt. This cannot be undone.',
      confirmLabel: 'Reset everything',
      tone: 'danger',
      typeToConfirm: 'RESET',
    });
    if (!result.confirmed) return;

    clearCart();
    resetDemoData();
    toast.success('Demo data reset.', 'Everything is back to how it started.');
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Demo data"
        description="This build keeps everything in your browser — nothing is sent anywhere."
      />

      <div className="mt-5 space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
          <div className="text-[13px] leading-relaxed text-ink">
            <p className="font-medium">Where your data lives</p>
            <p className="mt-0.5 text-muted">
              All records are held in this browser's local storage, which is why they survive a
              refresh. Clearing your site data, or using a private window, starts you fresh.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-danger/25 p-4">
          <p className="text-[13px] font-medium text-ink">Reset demo data</p>
          <p className="mt-0.5 text-xs text-muted">
            Rebuilds the original three branches, staff, customers, appointments and sales. Useful
            after exploring, or before a demonstration.
          </p>

          <Button variant="danger" size="sm" className="mt-3" leftIcon={<RotateCcw />} onClick={() => void onReset()}>
            Reset demo data
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default SettingsPage;
