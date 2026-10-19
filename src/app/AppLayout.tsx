import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { exitDemo, isDemo } from '@/services/cloud/client';
import { navFor } from './navigation';
import { Sidebar } from '@/components/shared/Sidebar';
import { Topbar } from '@/components/shared/Topbar';
import { BottomNav } from '@/components/shared/BottomNav';
import { Skeleton } from '@/components/ui/States';

function RouteFallback(): JSX.Element {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

/** The shell both portals share: rail, top bar, and a scrolling content well. */
export function AppLayout(): JSX.Element {
  const role = useAuthStore((s) => s.user?.role ?? 'shop');
  const isShop = role === 'shop';

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar sections={navFor(role)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warn px-4 py-1.5 text-center text-[12px] font-medium text-white">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Demo mode — sample data in this browser. Nothing is saved to the salon.</span>
            <button type="button" onClick={exitDemo} className="font-semibold underline underline-offset-2">
              Leave demo
            </button>
          </div>
        )}

        <Topbar />

        <main
          id="main"
          className={
            // Extra bottom padding on the shop portal keeps content clear of the bottom bar.
            `min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 ${isShop ? 'pb-20 md:pb-6' : ''}`
          }
        >
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {isShop && <BottomNav />}
    </div>
  );
}
