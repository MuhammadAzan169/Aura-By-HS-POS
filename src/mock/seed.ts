import type {
  Appointment,
  AppNotification,
  Credential,
  Customer,
  CustomerMembership,
  Expense,
  InventoryMovement,
  Membership,
  Product,
  Sale,
  Service,
  ServiceCategory,
  ServicePackage,
  Settings,
  Shop,
  Staff,
  User,
  Voucher,
  Coupon,
  CustomerCredit,
  RegisterSession,
  Attendance,
  Feedback,
  PayrollRun,
  ActivityEntry,
  BridalBooking,
  Enquiry,
  OnlinePayment,
  ChatMessage,
  Announcement,
} from '@/types';
import { memberships, servicePackages, serviceCategories, services } from './catalog';
import { credentials, shops, users } from './shops';
import { staff } from './staff';
import { buildCustomerMemberships, buildCustomers } from './customers';
import { buildProducts } from './products';
import { buildAppointments } from './appointments';
import { buildSales } from './sales';
import { buildInventoryMovements } from './inventory';
import { buildExpenses } from './expenses';
import { buildNotifications } from './notifications';
import { defaultSettings } from './settings';
import { buildOnlineDemo } from './online';

/** The shape the whole app reads from. One table per entity, exactly as a database would. */
export interface Database {
  users: User[];
  credentials: Credential[];
  shops: Shop[];
  staff: Staff[];
  customers: Customer[];
  serviceCategories: ServiceCategory[];
  services: Service[];
  packages: ServicePackage[];
  memberships: Membership[];
  customerMemberships: CustomerMembership[];
  products: Product[];
  inventoryMovements: InventoryMovement[];
  appointments: Appointment[];
  sales: Sale[];
  expenses: Expense[];
  notifications: AppNotification[];
  vouchers: Voucher[];
  coupons: Coupon[];
  customerCredits: CustomerCredit[];
  registerSessions: RegisterSession[];
  attendance: Attendance[];
  feedback: Feedback[];
  payrollRuns: PayrollRun[];
  activity: ActivityEntry[];
  bridalBookings: BridalBooking[];
  enquiries: Enquiry[];
  onlinePayments: OnlinePayment[];
  messages: ChatMessage[];
  announcements: Announcement[];
  settings: Settings;
  /** Bumped whenever the seed shape changes, so stale saves are discarded. */
  schemaVersion: number;
}

export const SCHEMA_VERSION = 6;

/**
 * Builds the full demo dataset. Everything is derived from `today` so the demo
 * always has appointments this morning and bookings later in the week, however
 * long after it was written someone opens it.
 */
export function createSeedDatabase(today: Date = new Date()): Database {
  const customers = buildCustomers(today);
  const customerMemberships = buildCustomerMemberships(customers, today);
  const products = buildProducts();
  const appointments = buildAppointments(today, customers);

  const { sales, links } = buildSales(appointments, customers, customerMemberships, products);

  // Link each billed appointment back to its sale.
  for (const appointment of appointments) {
    const saleId = links.get(appointment.id);
    if (saleId) appointment.saleId = saleId;
  }

  const inventoryMovements = buildInventoryMovements(products, sales, today);
  const expenses = buildExpenses(today);
  const notifications = buildNotifications(
    today,
    appointments,
    sales,
    products,
    customers,
    customerMemberships,
  );

  return {
    users: users.map((u) => ({ ...u })),
    credentials: credentials.map((c) => ({ ...c })),
    shops: shops.map((s) => ({ ...s })),
    staff: staff.map((s) => ({ ...s })),
    customers,
    serviceCategories: serviceCategories.map((c) => ({ ...c })),
    services: services.map((s) => ({ ...s })),
    packages: servicePackages.map((p) => ({ ...p })),
    memberships: memberships.map((m) => ({ ...m })),
    customerMemberships,
    products,
    inventoryMovements,
    appointments,
    sales,
    expenses,
    notifications,
    vouchers: [],
    coupons: [],
    registerSessions: [],
    attendance: [],
    feedback: [],
    payrollRuns: [],
    activity: [],
    bridalBookings: [],
    enquiries: [],
    ...buildOnlineDemo(today, shops, customers, appointments, services),
    settings: { ...defaultSettings },
    schemaVersion: SCHEMA_VERSION,
  };
}

export { DEMO_ACCOUNTS } from './shops';
