import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from './guards';
import { homeFor } from './navigation';
import { useAuthStore } from '@/store/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { NotFoundPage } from '@/features/misc/NotFoundPage';

/**
 * Routes are split per page so the initial load stays small — the billing
 * screen's charts and the reports' Recharts bundle are not paid for by someone
 * who only opens the diary.
 */

// -- Dashboards
const AdminDashboard = lazy(() => import('@/features/dashboard/AdminDashboard'));
const ShopDashboard = lazy(() => import('@/features/dashboard/ShopDashboard'));

// -- Shops
const ShopsPage = lazy(() => import('@/features/shops/ShopsPage'));
const ShopDetailPage = lazy(() => import('@/features/shops/ShopDetailPage'));

// -- Appointments
const AppointmentsPage = lazy(() => import('@/features/appointments/AppointmentsPage'));

// -- Customers
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'));
const CustomerDetailPage = lazy(() => import('@/features/customers/CustomerDetailPage'));

// -- Staff
const StaffPage = lazy(() => import('@/features/staff/StaffPage'));
const StaffDetailPage = lazy(() => import('@/features/staff/StaffDetailPage'));
const StaffSchedulePage = lazy(() => import('@/features/staff/StaffSchedulePage'));

// -- Catalogue
const ServicesPage = lazy(() => import('@/features/services/ServicesPage'));
const PackagesPage = lazy(() => import('@/features/packages/PackagesPage'));
const MembershipsPage = lazy(() => import('@/features/memberships/MembershipsPage'));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'));
const InventoryPage = lazy(() => import('@/features/inventory/InventoryPage'));

// -- Money
const BillingPage = lazy(() => import('@/features/billing/BillingPage'));
const BillsPage = lazy(() => import('@/features/billing/BillsPage'));
const ReceiptPage = lazy(() => import('@/features/billing/ReceiptPage'));
const ExpensesPage = lazy(() => import('@/features/expenses/ExpensesPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));

// -- System
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const ShopProfilePage = lazy(() => import('@/features/settings/ShopProfilePage'));

// -- Front desk extras
const RegisterPage = lazy(() => import('@/features/register/RegisterPage'));
const RewardsPage = lazy(() => import('@/features/rewards/RewardsPage'));
const TeamPage = lazy(() => import('@/features/team/TeamPage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const FeedbackPage = lazy(() => import('@/features/activity/FeedbackPage'));

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },

  {
    element: <RequireAuth />,
    children: [
      // Landing: send people to whichever portal they belong to.
      { path: '/', element: <RoleHome /> },

      // ------------------------------- Admin portal -------------------------------
      {
        element: <RequireRole role="admin" />,
        children: [
          {
            path: '/admin',
            element: <AppLayout />,
            children: [
              { index: true, element: <AdminDashboard /> },

              { path: 'shops', element: <ShopsPage /> },
              { path: 'shops/:shopId', element: <ShopDetailPage /> },

              { path: 'appointments', element: <AppointmentsPage /> },

              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/:customerId', element: <CustomerDetailPage /> },

              { path: 'staff', element: <StaffPage /> },
              { path: 'staff/:staffId', element: <StaffDetailPage /> },

              { path: 'services', element: <ServicesPage /> },
              { path: 'packages', element: <PackagesPage /> },
              { path: 'memberships', element: <MembershipsPage /> },
              { path: 'products', element: <ProductsPage /> },
              { path: 'inventory', element: <InventoryPage /> },

              { path: 'billing', element: <BillingPage /> },
              { path: 'billing/bills', element: <BillsPage /> },
              { path: 'billing/bills/:saleId', element: <ReceiptPage /> },

              { path: 'expenses', element: <ExpensesPage /> },
              { path: 'reports', element: <ReportsPage /> },

              { path: 'register', element: <RegisterPage /> },
              { path: 'rewards', element: <RewardsPage /> },
              { path: 'team', element: <TeamPage /> },
              { path: 'activity', element: <ActivityPage /> },
              { path: 'feedback', element: <FeedbackPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },

      // ------------------------------- Shop portal --------------------------------
      {
        element: <RequireRole role="shop" />,
        children: [
          {
            path: '/shop',
            element: <AppLayout />,
            children: [
              { index: true, element: <ShopDashboard /> },

              { path: 'appointments', element: <AppointmentsPage /> },

              { path: 'customers', element: <CustomersPage /> },
              { path: 'customers/:customerId', element: <CustomerDetailPage /> },

              { path: 'billing', element: <BillingPage /> },
              { path: 'billing/bills', element: <BillsPage /> },
              { path: 'billing/bills/:saleId', element: <ReceiptPage /> },

              { path: 'services', element: <ServicesPage /> },
              { path: 'schedule', element: <StaffSchedulePage /> },
              { path: 'inventory', element: <InventoryPage /> },

              { path: 'register', element: <RegisterPage /> },
              { path: 'rewards', element: <RewardsPage /> },
              { path: 'team', element: <TeamPage /> },
              { path: 'activity', element: <ActivityPage /> },
              { path: 'feedback', element: <FeedbackPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'profile', element: <ShopProfilePage /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);

/**
 * Bounces "/" to the right portal. It sits behind RequireAuth, so by the time
 * it renders there is always a user.
 */
function RoleHome(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}
