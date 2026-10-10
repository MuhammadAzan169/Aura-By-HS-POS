import type { BaseRecord, ShopScoped } from './common';

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked-in'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'no-show';

export interface AppointmentService {
  serviceId: string;
  /** Price captured at booking time so later catalogue edits never rewrite history. */
  price: number;
  durationMin: number;
}

export interface AppointmentStatusHistory {
  status: AppointmentStatus;
  at: string;
  byUserId: string;
  byUserName: string;
  note: string | null;
}

export interface Appointment extends BaseRecord, ShopScoped {
  customerId: string;
  staffId: string;
  services: AppointmentService[];
  /** ISO datetime of the slot start. */
  startAt: string;
  /** Summed from services at write time so the calendar renders without lookups. */
  durationMin: number;
  status: AppointmentStatus;
  notes: string;
  cancelReason: string | null;
  history: AppointmentStatusHistory[];
  /** Set once a bill has been raised against this appointment. */
  saleId: string | null;
  source: 'walk-in' | 'phone' | 'online' | 'front-desk';
  /** Set when this diary entry is one event of a bridal booking. */
  bridalBookingId?: string | null;
}
