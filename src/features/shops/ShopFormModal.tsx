import { useEffect, useState } from 'react';
import type { BusinessHours, Shop } from '@/types';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import * as shopService from '@/services/shopService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { areHoursValid, BusinessHoursEditor, defaultBusinessHours } from './BusinessHoursEditor';

export interface ShopFormModalProps {
  open: boolean;
  onClose: () => void;
  shop?: Shop | null;
}

export function ShopFormModal({ open, onClose, shop }: ShopFormModalProps): JSX.Element {
  const isEdit = Boolean(shop);

  const [tab, setTab] = useState<'details' | 'hours' | 'account'>('details');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [hours, setHours] = useState<BusinessHours>(defaultBusinessHours());

  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('details');
    setName(shop?.name ?? '');
    setCode(shop?.code ?? '');
    setAddressLine(shop?.addressLine ?? '');
    setCity(shop?.city ?? '');
    setPhone(shop?.phone ?? '');
    setEmail(shop?.email ?? '');
    setManagerName(shop?.managerName ?? '');
    setReceiptFooter(shop?.receiptFooter ?? 'Thank you for visiting. We hope to see you again soon.');
    setHours(shop?.businessHours ?? defaultBusinessHours());
    setAccountName('');
    setAccountEmail('');
    setAccountPassword('');
    setError(null);
  }, [open, shop]);

  const save = useAsyncAction(
    async () => {
      const base = {
        name,
        code,
        addressLine,
        city,
        phone,
        email,
        managerName,
        businessHours: hours,
        receiptFooter,
        logoUrl: shop?.logoUrl ?? null,
      };

      if (shop) return shopService.update(shop.id, base);

      return shopService.create({
        ...base,
        accountName: accountName || managerName,
        accountEmail,
        accountPassword,
      });
    },
    {
      successMessage: (saved) =>
        isEdit ? `${saved.name} was updated.` : `${saved.name} was opened, with its own login.`,
      onSuccess: onClose,
    },
  );

  const submit = (): void => {
    setError(null);

    if (name.trim().length < 2) {
      setError('Give the branch a name.');
      setTab('details');
      return;
    }
    if (code.trim().length < 2) {
      setError('A short code is needed — it prefixes every receipt number.');
      setTab('details');
      return;
    }
    if (!areHoursValid(hours)) {
      setError('Fix the opening hours: closing time must be after opening time.');
      setTab('hours');
      return;
    }
    if (!isEdit && (!accountEmail.trim() || accountPassword.length < 6)) {
      setError('The branch needs a login username and a password of at least 6 characters.');
      setTab('account');
      return;
    }

    void save.run();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!save.pending}
      size="lg"
      title={isEdit ? `Edit ${shop?.name}` : 'Open a new branch'}
      description={
        isEdit
          ? 'Changes appear on receipts and in the header immediately.'
          : 'A branch gets its own login, receipt sequence, staff and stock.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button loading={save.pending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Create branch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        <Tabs
          value={tab}
          onChange={(next) => setTab(next as typeof tab)}
          label="Branch sections"
          items={[
            { value: 'details', label: 'Details' },
            { value: 'hours', label: 'Opening hours' },
            ...(isEdit ? [] : [{ value: 'account' as const, label: 'Login account' }]),
          ]}
        />

        <TabPanel active={tab === 'details'}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Input
                label="Branch name"
                required
                placeholder="Aura Gulberg"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Input
                label="Receipt code"
                required
                placeholder="LMG"
                maxLength={5}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                hint="Prefixes receipts, e.g. LMG-2026-000123"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Input
                label="Address"
                required
                placeholder="14-C, MM Alam Road, Gulberg III"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />

              <Input
                label="City"
                required
                placeholder="Lahore"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                type="tel"
                placeholder="042 3577 1420"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <Input
                label="Branch email"
                type="email"
                placeholder="gulberg@aurabyhs.pk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Input
              label="Manager"
              placeholder="Sana Tariq"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />

            <Textarea
              label="Receipt footer"
              rows={2}
              placeholder="Thank you for visiting…"
              hint="Printed at the bottom of every receipt from this branch."
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
            />
          </div>
        </TabPanel>

        <TabPanel active={tab === 'hours'}>
          <p className="mb-3 text-xs text-muted">
            No appointment can be booked outside these hours, whatever a stylist's rota says.
          </p>
          <BusinessHoursEditor hours={hours} onChange={setHours} />
        </TabPanel>

        {!isEdit && (
          <TabPanel active={tab === 'account'}>
            <div className="space-y-4">
              <p className="rounded-xl bg-info-soft px-3.5 py-3 text-[13px] text-ink">
                This creates the login the branch will use. They will only ever see their own
                customers, bookings, stock and takings.
              </p>

              <Input
                label="Account holder"
                placeholder="Sana Tariq"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                hint="Defaults to the manager's name."
              />

              <Input
                label="Login username"
                required
                placeholder="gulberg"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                hint="What the branch types to sign in. Letters and numbers, no spaces."
              />

              <Input
                label="Password"
                required
                type="text"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                hint="At least 6 characters. Only you (the owner) can change it later, from Users & logins."
              />
            </div>
          </TabPanel>
        )}
      </div>
    </Modal>
  );
}
