import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/uiStore';
import { homeFor } from './navigation';

/** Full-page spinner shown while the stored session is being checked. */
function BootScreen(): JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand"
          aria-hidden
        />
        <p className="text-sm text-muted">Loading your salon…</p>
      </div>
    </div>
  );
}

/** Blocks anonymous visitors and remembers where they were going. */
export function RequireAuth(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const initialising = useAuthStore((s) => s.initialising);
  const location = useLocation();

  if (initialising) return <BootScreen />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/**
 * Keeps each portal to its own role. A shop account that lands on an admin URL
 * is bounced to its own dashboard with an explanation, rather than being shown
 * an empty page or another branch's data.
 */
export function RequireRole({ role }: { role: Role }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const initialising = useAuthStore((s) => s.initialising);
  const denied = Boolean(user) && user?.role !== role;

  useEffect(() => {
    if (denied) {
      toast.error(
        'Access denied',
        'That area is only available to the business owner’s account.',
      );
    }
  }, [denied]);

  if (initialising) return <BootScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (denied) return <Navigate to={homeFor(user.role)} replace />;

  return <Outlet />;
}

/** Sends an already-signed-in user away from the login page. */
export function RedirectIfAuthenticated(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const initialising = useAuthStore((s) => s.initialising);
  const location = useLocation();
  // A password-reset link signs the person in; they still need the form to set it.
  const resetting = new URLSearchParams(location.search).has('reset');

  if (initialising) return <BootScreen />;
  if (user && !resetting) return <Navigate to={homeFor(user.role)} replace />;

  return <Outlet />;
}
