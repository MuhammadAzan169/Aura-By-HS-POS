import type { MoneyMethod } from './sale';
import type { BaseRecord, ShopScoped } from './common';

export type BridalEventType =
  | 'Trial'
  | 'Engagement'
  | 'Dholki'
  | 'Mayun'
  | 'Mehndi'
  | 'Nikah'
  | 'Barat'
  | 'Walima'
  | 'Photoshoot'
  | 'Other';

export const BRIDAL_EVENT_TYPES: BridalEventType[] = [
  'Trial', 'Engagement', 'Dholki', 'Mayun', 'Mehndi', 'Nikah', 'Barat', 'Walima', 'Photoshoot', 'Other',
];

/** One day of the wedding the salon is booked for. */
export interface BridalEvent {
  id: string;
  type: BridalEventType;
  /** yyyy-MM-dd */
  date: string;
  /** When the bride must be ready by ("HH:mm"); the artist starts `durationMin` earlier. */
  readyBy: string;
  durationMin: number;
  artistId: string | null;
  location: 'salon' | 'on-location';
  /** Venue or home address when on location. */
  venue: string;
  /** Outfit colour, jewellery, look references. */
  lookNotes: string;
  /** The diary entry blocking the artist's time. */
  appointmentId: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
}

export interface BridalPayment {
  id: string;
  at: string;
  amount: number;
  method: MoneyMethod;
  kind: 'advance' | 'instalment' | 'final' | 'refund';
  note: string;
  byUserName: string;
}

export interface BridalExtra {
  id: string;
  name: string;
  price: number;
}

export type BridalStatus = 'tentative' | 'confirmed' | 'completed' | 'cancelled';

/** A wedding booked with the salon: the package, every event, and the money. */
export interface BridalBooking extends BaseRecord, ShopScoped {
  bookingNo: string;
  customerId: string;
  brideName: string;
  phone: string;
  packageId: string | null;
  packageName: string;
  packagePrice: number;
  extras: BridalExtra[];
  travelCharge: number;
  discount: number;
  total: number;
  events: BridalEvent[];
  payments: BridalPayment[];
  status: BridalStatus;
  /** Advance needed to hold the dates. */
  advanceRequired: number;
  notes: string;
  cancelReason: string | null;
  /** Bill raised when the booking was completed. */
  saleId: string | null;
}

export type EnquiryStatus = 'new' | 'contacted' | 'booked' | 'lost';
export type EnquirySource = 'website' | 'instagram' | 'facebook' | 'whatsapp' | 'phone' | 'walk-in' | 'referral';

/** A request from someone who has not booked yet — from the website or the front desk. */
export interface Enquiry extends BaseRecord {
  /** Null until a branch takes it. */
  shopId: string | null;
  name: string;
  phone: string;
  email: string;
  /** Service or package they asked about. */
  interest: string;
  /** yyyy-MM-dd, when they want it. */
  preferredDate: string | null;
  message: string;
  source: EnquirySource;
  status: EnquiryStatus;
  /** Follow-up log. */
  notes: string;
  followUpOn: string | null;
  customerId: string | null;
  bookingId: string | null;
}
