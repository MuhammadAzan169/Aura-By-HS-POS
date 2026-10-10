import { useEffect, useMemo, useState } from 'react';
import type { Staff, StaffRole, StaffShift } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import * as staffService from '@/services/staffService';
import { STAFF_ROLES } from '@/services/staffService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { defaultSchedule, isScheduleValid, ScheduleEditor } from './ScheduleEditor';

export interface StaffFormModalProps {
  open: boolean;
  onClose: () => void;
  shopId: string;
  member?: Staff | null;
}

export function StaffFormModal({
  open,
  onClose,
  shopId,
  member,
}: StaffFormModalProps): JSX.Element {
  const db = useDb();
  const isEdit = Boolean(member);

  const [tab, setTab] = useState<'details' | 'schedule' | 'skills'>('details');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('Stylist');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [commission, setCommission] = useState('12');
  const [salary, setSalary] = useState('0');
  const [schedule, setSchedule] = useState<StaffShift[]>(defaultSchedule());
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('details');
    setName(member?.name ?? '');
    setRole(member?.role ?? 'Stylist');
    setPhone(member?.phone ?? '');
    setEmail(member?.email ?? '');
    setCommission(String(Math.round((member?.commissionRate ?? 0.12) * 100)));
    setSalary(String(member?.monthlySalary ?? 0));
    setSchedule(member?.schedule ?? defaultSchedule());
    setSpecializations(member?.specializations ?? []);
    setError(null);
  }, [open, member]);

  const categories = useMemo(
    () =>
      db.serviceCategories
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((category) => ({
          category,
          services: db.services.filter((s) => s.categoryId === category.id && s.active),
        }))
        .filter((group) => group.services.length > 0),
    [db.serviceCategories, db.services],
  );

  const save = useAsyncAction(
    async () => {
      const payload = {
        shopId,
        name,
        role,
        phone,
        email,
        specializations,
        schedule,
        timeOff: member?.timeOff ?? [],
        commissionRate: (Number(commission) || 0) / 100,
        monthlySalary: Math.max(0, Number(salary) || 0),
        photoUrl: member?.photoUrl ?? null,
      };
      return member ? staffService.update(member.id, payload) : staffService.create(payload);
    },
    {
      successMessage: (saved) =>
        isEdit ? `${saved.name}'s details were updated.` : `${saved.name} joined the team.`,
      onSuccess: onClose,
    },
  );

  const submit = (): void => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Enter the team member’s name.');
      setTab('details');
      return;
    }
    if (!isScheduleValid(schedule)) {
      setError('Fix the highlighted problems in the weekly rota.');
      setTab('schedule');
      return;
    }
    void save.run();
  };

  const toggleCategory = (serviceIds: string[], allSelected: boolean): void => {
    setSpecializations((current) =>
      allSelected
        ? current.filter((id) => !serviceIds.includes(id))
        : [...new Set([...current, ...serviceIds])],
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!save.pending}
      size="lg"
      title={isEdit ? `Edit ${member?.name}` : 'Add a team member'}
      description="Their rota and skills decide which slots the booking engine offers."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button loading={save.pending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Add to team'}
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
          label="Team member sections"
          items={[
            { value: 'details', label: 'Details' },
            { value: 'schedule', label: 'Weekly rota' },
            { value: 'skills', label: 'Skills', count: specializations.length },
          ]}
        />

        <TabPanel active={tab === 'details'}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                required
                placeholder="Mehreen Akhtar"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Select
                label="Role"
                required
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                options={STAFF_ROLES.map((r) => ({ value: r, label: r }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                type="tel"
                placeholder="0300 1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <Input
                label="Email"
                type="email"
                placeholder="name@aurabyhs.pk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Input
              label="Commission %"
              type="number"
              min={0}
              max={50}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              hint="Share of the revenue they generate, used in reports and payroll."
              className="sm:max-w-[12rem]"
            />

            <Input
              label="Monthly salary"
              type="number"
              min={0}
              step={1000}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              hint="Fixed pay before commission and tips. Used on the payroll sheet."
              className="sm:max-w-[12rem]"
            />

            <div className="rounded-xl bg-canvas px-3.5 py-3">
              <p className="text-[13px] text-muted">
                Branch:{' '}
                <span className="font-medium text-ink">
                  {db.shops.find((s) => s.id === shopId)?.name ?? '—'}
                </span>
              </p>
            </div>
          </div>
        </TabPanel>

        <TabPanel active={tab === 'schedule'}>
          <p className="mb-3 text-xs text-muted">
            Turn a day off to remove it from the diary entirely. Breaks block out slots in the
            middle of a shift.
          </p>
          <ScheduleEditor schedule={schedule} onChange={setSchedule} />
        </TabPanel>

        <TabPanel active={tab === 'skills'}>
          <p className="mb-3 text-xs text-muted">
            A stylist is only offered for services ticked here. Leave everything unticked for a
            non-bookable role such as a receptionist.
          </p>

          <div className="space-y-4">
            {categories.map(({ category, services }) => {
              const ids = services.map((s) => s.id);
              const allSelected = ids.every((id) => specializations.includes(id));

              return (
                <div key={category.id} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] font-medium text-ink">{category.name}</p>
                    <button
                      type="button"
                      onClick={() => toggleCategory(ids, allSelected)}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {services.map((service) => (
                      <Checkbox
                        key={service.id}
                        label={service.name}
                        checked={specializations.includes(service.id)}
                        onChange={() =>
                          setSpecializations((current) =>
                            current.includes(service.id)
                              ? current.filter((id) => id !== service.id)
                              : [...current, service.id],
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabPanel>
      </div>
    </Modal>
  );
}
