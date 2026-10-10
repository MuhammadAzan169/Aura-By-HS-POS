import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Customer } from '@/types';
import { digitsOnly } from '@/utils/text';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import * as customerService from '@/services/customerService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the customer’s name'),
  phone: z
    .string()
    .trim()
    .min(1, 'A phone number is required')
    .refine((value) => digitsOnly(value).length >= 10, 'Enter a complete phone number'),
  email: z
    .string()
    .trim()
    .email('That does not look like an email address')
    .or(z.literal(''))
    .optional(),
  gender: z.enum(['female', 'male', 'other', 'unspecified']),
  preferredStaffId: z.string().nullable(),
  sensitivities: z.string().max(300, 'Keep this under 300 characters'),
  notes: z.string().max(500, 'Keep this under 500 characters'),
  birthday: z.string(),
  anniversary: z.string(),
});

type FormValues = z.infer<typeof schema>;

export interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Branch the customer belongs to. */
  shopId: string;
  /** Pass a customer to edit; omit to create. */
  customer?: Customer | null;
  /** Prefill the name, e.g. from what was typed in a searchable select. */
  initialName?: string;
  onSaved?: (customer: Customer) => void;
}

export function CustomerFormModal({
  open,
  onClose,
  shopId,
  customer,
  initialName,
  onSaved,
}: CustomerFormModalProps): JSX.Element {
  const db = useDb();
  const isEdit = Boolean(customer);

  const staffOptions = useMemo(
    () =>
      db.staff
        .filter((s) => s.shopId === shopId && s.active && s.specializations.length > 0)
        .map((s) => ({ value: s.id, label: s.name, description: s.role })),
    [db.staff, shopId],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      gender: 'unspecified',
      preferredStaffId: null,
      sensitivities: '',
      notes: '',
      birthday: '',
      anniversary: '',
    },
  });

  // Reload the form whenever it is opened for a different record.
  useEffect(() => {
    if (!open) return;
    reset({
      name: customer?.name ?? initialName ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
      gender: customer?.gender ?? 'unspecified',
      preferredStaffId: customer?.preferredStaffId ?? null,
      sensitivities: customer?.sensitivities ?? '',
      notes: customer?.notes ?? '',
      birthday: customer?.birthday ?? '',
      anniversary: customer?.anniversary ?? '',
    });
  }, [open, customer, initialName, reset]);

  const save = useAsyncAction(
    async (values: FormValues) => {
      const payload = {
        shopId,
        name: values.name,
        phone: values.phone,
        email: values.email || null,
        gender: values.gender,
        preferredStaffId: values.preferredStaffId,
        preferredServiceIds: customer?.preferredServiceIds ?? [],
        sensitivities: values.sensitivities,
        notes: values.notes,
        birthday: values.birthday || null,
        anniversary: values.anniversary || null,
      };
      return customer
        ? customerService.update(customer.id, payload)
        : customerService.create(payload);
    },
    {
      successMessage: (saved) =>
        isEdit ? `${saved.name}'s details were updated.` : `${saved.name} was added.`,
      onSuccess: (saved) => {
        onSaved?.(saved);
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!save.pending}
      title={isEdit ? 'Edit customer' : 'New customer'}
      description={
        isEdit
          ? 'Update the details on file for this customer.'
          : 'Add someone to this branch’s customer book.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button loading={save.pending} onClick={handleSubmit((v) => void save.run(v))}>
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((v) => void save.run(v))}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            required
            autoComplete="name"
            placeholder="Ayesha Khan"
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="Phone number"
            required
            type="tel"
            autoComplete="tel"
            placeholder="0300 1234567"
            hint="Used to find them at the front desk — must be unique in this branch."
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email (optional)"
            type="email"
            autoComplete="email"
            placeholder="ayesha@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <Select
            label="Gender"
            options={[
              { value: 'unspecified', label: 'Prefer not to say' },
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
              { value: 'other', label: 'Other' },
            ]}
            error={errors.gender?.message}
            {...register('gender')}
          />
        </div>

        <SearchableSelect
          label="Preferred stylist (optional)"
          placeholder="No preference"
          options={staffOptions}
          value={watch('preferredStaffId')}
          onChange={(value) => setValue('preferredStaffId', value)}
          clearable
        />

        <Textarea
          label="Allergies & sensitivities"
          placeholder="e.g. reacts to ammonia-based colour — use ammonia-free only"
          hint="Shown to the therapist before every treatment."
          rows={2}
          error={errors.sensitivities?.message}
          {...register('sensitivities')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Birthday (optional)" type="date" hint="For birthday wishes and offers." {...register('birthday')} />
          <Input label="Wedding anniversary (optional)" type="date" {...register('anniversary')} />
        </div>

        <Textarea
          label="Notes"
          placeholder="Anything worth remembering for next time"
          rows={2}
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Modal>
  );
}
