import type { BaseRecord, ShopScoped } from './common';

export interface Customer extends BaseRecord, ShopScoped {
  name: string;
  phone: string;
  email: string | null;
  gender: 'female' | 'male' | 'other' | 'unspecified';
  preferredStaffId: string | null;
  preferredServiceIds: string[];
  /** Allergies and sensitivities the therapist must read before treatment. */
  sensitivities: string;
  notes: string;
  active: boolean;
  /** yyyy-MM-dd, or null until the first completed visit. */
  firstVisitOn: string | null;
  /** MM-dd or yyyy-MM-dd; used for birthday greetings. */
  birthday?: string | null;
  anniversary?: string | null;
}

/** Always derived from appointments and sales, never stored. */
export interface CustomerStats {
  totalVisits: number;
  totalSpent: number;
  lastVisitAt: string | null;
  upcomingAppointmentAt: string | null;
  membershipLabel: string | null;
}
