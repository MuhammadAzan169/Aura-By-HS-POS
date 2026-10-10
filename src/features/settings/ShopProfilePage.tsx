import { useEffect, useRef, useState } from 'react';
import { KeyRound, Store, Upload } from 'lucide-react';
import type { BusinessHours } from '@/types';
import { useShopScope } from '@/hooks/useShopScope';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import * as shopService from '@/services/shopService';
import { readImageAsDataUrl } from '@/services/settingsService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/States';
import { areHoursValid, BusinessHoursEditor } from '@/features/shops/BusinessHoursEditor';

/**
 * What a branch account can change about itself. Deliberately narrower than the
 * owner's Settings: a shop can fix its own phone number and opening hours, but
 * not the price list, the tax rate or another branch's anything.
 */
export function ShopProfilePage(): JSX.Element {
  const { shop } = useShopScope();
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'details' | 'hours' | 'account'>('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hours, setHours] = useState<BusinessHours>([]);

  useEffect(() => {
    if (!shop) return;
    setName(shop.name);
    setPhone(shop.phone);
    setAddressLine(shop.addressLine);
    setCity(shop.city);
    setEmail(shop.email);
    setManagerName(shop.managerName);
    setReceiptFooter(shop.receiptFooter);
    setLogoUrl(shop.logoUrl);
    setHours(shop.businessHours);
  }, [shop]);

  const save = useAsyncAction(
    async () => {
      if (!shop) throw new Error('No branch is loaded.');
      if (!areHoursValid(hours)) {
        throw new Error('Closing time must be after opening time on every open day.');
      }
      return shopService.update(shop.id, {
        name,
        phone,
        addressLine,
        city,
        email,
        managerName,
        receiptFooter,
        logoUrl,
        businessHours: hours,
      });
    },
    { successMessage: 'Saved. Your receipts and the header now use these details.' },
  );

  const pickLogo = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      setLogoUrl(await readImageAsDataUrl(file));
    } catch (error) {
      toast.fromError(error, 'That image could not be loaded.');
    }
  };


  if (!shop) {
    return (
      <Card>
        <ErrorState
          title="No branch loaded"
          message="Your account is not linked to a shop. Ask the owner to check your login."
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Shop profile"
        description="Your branch's details, opening hours and receipt footer."
        actions={
          <Button loading={save.pending} onClick={() => void save.run()}>
            Save changes
          </Button>
        }
      >
        <Tabs
          label="Shop profile sections"
          value={tab}
          onChange={(next) => setTab(next as typeof tab)}
          items={[
            { value: 'details', label: 'Details' },
            { value: 'hours', label: 'Opening hours' },
            { value: 'account', label: 'Login' },
          ]}
        />
      </PageHeader>

      <TabPanel active={tab === 'details'}>
        <Card className="max-w-2xl">
          <CardHeader title="Branch details" description="Shown on every receipt you print." />

          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <Avatar name={name || 'Shop'} size="lg" />
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
                  {logoUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                      Remove
                    </Button>
                  )}
                </div>

                <p className="mt-1.5 text-xs text-subtle">PNG, JPG or SVG, under 500 KB.</p>
              </div>
            </div>

            <Input
              label="Branch name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Input
                label="Address"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Input
              label="Manager"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />

            <Textarea
              label="Receipt footer"
              rows={2}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              hint="The thank-you line printed at the bottom of your receipts."
            />

            <div className="rounded-xl bg-canvas px-3.5 py-2.5">
              <p className="text-[13px] text-muted">
                Receipt code:{' '}
                <span className="font-mono font-medium text-ink">{shop.code}</span> — set by the
                owner, because it forms part of every receipt number.
              </p>
            </div>

            <Button loading={save.pending} onClick={() => void save.run()}>
              Save changes
            </Button>
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={tab === 'hours'}>
        <Card className="max-w-2xl">
          <CardHeader
            title="Opening hours"
            description="No appointment can be booked outside these hours."
          />

          <div className="mt-5">
            <BusinessHoursEditor hours={hours} onChange={setHours} />

            <Button className="mt-5" loading={save.pending} onClick={() => void save.run()}>
              Save opening hours
            </Button>
          </div>
        </Card>
      </TabPanel>

      <TabPanel active={tab === 'account'}>
        <Card className="max-w-2xl">
          <CardHeader title="Your login" description="The account this branch signs in with." />

          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={user?.name ?? 'Shop'} size="lg" />
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-ink">{user?.name}</p>
                <p className="text-sm text-muted">{user?.email}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
                  <Store className="h-3.5 w-3.5" aria-hidden />
                  Branch account — {shop.name} only
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-line p-4">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas text-muted"
                aria-hidden
              >
                <KeyRound className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">Password</p>
                <p className="mt-0.5 text-xs text-muted">
                  Your login is managed by the owner. To change the password, ask the owner — they can
                  set a new one for you in a minute.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </TabPanel>
    </>
  );
}

export default ShopProfilePage;
