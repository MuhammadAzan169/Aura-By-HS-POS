import {
  BadgePercent,
  Bell,
  Boxes,
  CalendarDays,
  CreditCard,
  FileBarChart,
  Gift,
  KeyRound,
  History,
  LockKeyhole,
  Star,
  TicketPercent,
  UserCheck,
  LayoutDashboard,
  Package,
  Receipt,
  Scissors,
  Settings,
  Store,
  Users,
  UserSquare2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Matches child routes too, e.g. /customers/:id highlights "Customers". */
  match?: string;
  /** Shown on the mobile bottom bar (shop portal). */
  primary?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Admin sees everything, across every branch. */
export const ADMIN_NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/admin', icon: LayoutDashboard },
      { label: 'Shops', to: '/admin/shops', icon: Store, match: '/admin/shops' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Appointments', to: '/admin/appointments', icon: CalendarDays },
      { label: 'Customers', to: '/admin/customers', icon: Users, match: '/admin/customers' },
      { label: 'Staff', to: '/admin/staff', icon: UserSquare2, match: '/admin/staff' },
      { label: 'Attendance & Payroll', to: '/admin/team', icon: UserCheck },
      { label: 'Feedback', to: '/admin/feedback', icon: Star },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { label: 'Services', to: '/admin/services', icon: Scissors },
      { label: 'Packages', to: '/admin/packages', icon: Gift },
      { label: 'Memberships', to: '/admin/memberships', icon: BadgePercent },
      { label: 'Products', to: '/admin/products', icon: Package },
      { label: 'Inventory', to: '/admin/inventory', icon: Boxes },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Sales & Billing', to: '/admin/billing', icon: CreditCard, match: '/admin/billing' },
      { label: 'Day Close', to: '/admin/register', icon: LockKeyhole },
      { label: 'Vouchers & Coupons', to: '/admin/rewards', icon: TicketPercent },
      { label: 'Expenses', to: '/admin/expenses', icon: Wallet },
      { label: 'Reports', to: '/admin/reports', icon: FileBarChart },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Notifications', to: '/admin/notifications', icon: Bell },
      { label: 'Users & Logins', to: '/admin/users', icon: KeyRound },
      { label: 'Activity Log', to: '/admin/activity', icon: History },
      { label: 'Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];

/** A shop account sees only its own branch, and a narrower set of tools. */
export const SHOP_NAV: NavSection[] = [
  {
    label: 'Today',
    items: [
      { label: 'Dashboard', to: '/shop', icon: LayoutDashboard, primary: true },
      { label: 'Appointments', to: '/shop/appointments', icon: CalendarDays, primary: true },
    ],
  },
  {
    label: 'Front desk',
    items: [
      { label: 'Sales & Billing', to: '/shop/billing', icon: CreditCard, match: '/shop/billing', primary: true },
      { label: 'Customers', to: '/shop/customers', icon: Users, match: '/shop/customers', primary: true },
      { label: 'Day Close', to: '/shop/register', icon: LockKeyhole },
      { label: 'Gift Vouchers', to: '/shop/rewards', icon: Gift },
    ],
  },
  {
    label: 'Branch',
    items: [
      { label: 'Services', to: '/shop/services', icon: Scissors },
      { label: 'Staff Schedule', to: '/shop/schedule', icon: UserSquare2 },
      { label: 'Attendance', to: '/shop/team', icon: UserCheck },
      { label: 'Feedback', to: '/shop/feedback', icon: Star },
      { label: 'Inventory', to: '/shop/inventory', icon: Boxes },
      { label: 'Bills', to: '/shop/billing/bills', icon: Receipt },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Notifications', to: '/shop/notifications', icon: Bell },
      { label: 'Activity Log', to: '/shop/activity', icon: History },
      { label: 'Shop Profile', to: '/shop/profile', icon: Store },
    ],
  },
];

export function navFor(role: Role): NavSection[] {
  return role === 'admin' ? ADMIN_NAV : SHOP_NAV;
}

/** The landing route after login, per role. */
export function homeFor(role: Role): string {
  return role === 'admin' ? '/admin' : '/shop';
}

/** Items shown in the mobile bottom bar (shop portal only). */
export const SHOP_BOTTOM_NAV: NavItem[] = SHOP_NAV.flatMap((section) =>
  section.items.filter((item) => item.primary),
);
