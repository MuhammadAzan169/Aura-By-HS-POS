import type { BaseRecord, ClockTime, ShopScoped, Weekday } from './common';

export type StaffRole =
  | 'Senior Stylist'
  | 'Stylist'
  | 'Colour Specialist'
  | 'Beauty Therapist'
  | 'Nail Technician'
  | 'Makeup Artist'
  | 'Salon Manager'
  | 'Receptionist';

export interface StaffShift {
  weekday: Weekday;
  /** A recurring day off is simply `working: false`. */
  working: boolean;
  start: ClockTime;
  end: ClockTime;
  breakStart: ClockTime | null;
  breakEnd: ClockTime | null;
}

export interface Staff extends BaseRecord, ShopScoped {
  name: string;
  role: StaffRole;
  phone: string;
  email: string;
  photoUrl: string | null;
  /** serviceIds this member is qualified to perform. */
  specializations: string[];
  schedule: StaffShift[];
  /** One-off away days, each "yyyy-MM-dd" (leave, holiday, training). */
  timeOff: string[];
  /** Share of service revenue paid as commission, 0-1. */
  commissionRate: number;
  /** Fixed monthly salary before commission, in currency units. */
  monthlySalary?: number;
  active: boolean;
  joinedOn: string;
}
