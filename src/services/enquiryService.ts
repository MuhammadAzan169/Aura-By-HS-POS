import type { Enquiry, EnquirySource, EnquiryStatus } from '@/types';
import { uid } from '@/utils/id';
import { toISODate } from '@/utils/date';
import { commit, nowISO, read, requireRow, ServiceError, stamped } from './db';
import * as customerService from './customerService';

/**
 * Leads: people who asked but have not booked. The website's form posts
 * straight into this table; the front desk adds phone, Instagram and walk-in
 * ones. Each is followed up until it becomes a customer and a booking, or is
 * marked lost with the reason.
 */

export interface EnquiryInput {
  shopId: string | null;
  name: string;
  phone: string;
  email: string;
  interest: string;
  preferredDate: string | null;
  message: string;
  source: EnquirySource;
  followUpOn: string | null;
}

export async function create(input: EnquiryInput): Promise<Enquiry> {
  if (!input.name.trim()) throw new ServiceError('Enter their name.', 'validation');
  if (input.phone.replace(/\D/g, '').length < 10) throw new ServiceError('Enter a complete phone number.', 'validation');
  const row: Enquiry = stamped({
    id: uid('enq'),
    ...input,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    interest: input.interest.trim(),
    message: input.message.trim(),
    status: 'new' as EnquiryStatus,
    notes: '',
    customerId: null,
    bookingId: null,
  });
  return commit((db) => {
    db.enquiries = [row, ...db.enquiries];
    return row;
  });
}

export async function update(id: string, patch: Partial<Pick<Enquiry, 'status' | 'notes' | 'followUpOn' | 'shopId' | 'customerId' | 'bookingId'>>): Promise<Enquiry> {
  const e = requireRow(read().enquiries.find((x) => x.id === id), 'That enquiry');
  return commit((db) => {
    const next = { ...e, ...patch, updatedAt: nowISO() };
    db.enquiries = db.enquiries.map((x) => (x.id === id ? next : x));
    return next;
  });
}

/** Adds a dated line to the follow-up log. */
export async function addNote(id: string, text: string, by: string): Promise<Enquiry> {
  const e = requireRow(read().enquiries.find((x) => x.id === id), 'That enquiry');
  if (!text.trim()) throw new ServiceError('Write what was said.', 'validation');
  const line = `${toISODate(new Date())} ${by}: ${text.trim()}`;
  return update(id, { notes: e.notes ? `${line}\n${e.notes}` : line, status: e.status === 'new' ? 'contacted' : e.status });
}

/** Finds the customer by phone at the branch, or creates them. */
export async function toCustomer(id: string, shopId: string): Promise<string> {
  const e = requireRow(read().enquiries.find((x) => x.id === id), 'That enquiry');
  const digits = e.phone.replace(/\D/g, '').slice(-10);
  const existing = read().customers.find((c) => c.shopId === shopId && c.phone.replace(/\D/g, '').slice(-10) === digits);
  const customerId = existing
    ? existing.id
    : (
        await customerService.create({
          shopId,
          name: e.name,
          phone: e.phone,
          email: e.email || null,
          gender: 'female',
          preferredStaffId: null,
          preferredServiceIds: [],
          sensitivities: '',
          notes: `From ${e.source} enquiry: ${e.interest}${e.message ? ` — ${e.message}` : ''}`.slice(0, 500),
        })
      ).id;
  await update(id, { customerId, shopId });
  return customerId;
}

export async function remove(id: string): Promise<void> {
  await commit((db) => {
    db.enquiries = db.enquiries.filter((x) => x.id !== id);
  });
}
