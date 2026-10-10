import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { applyCurrency } from '@/services/settingsService';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { Toaster } from '@/components/ui/Toaster';

export function App(): JSX.Element {
  const restore = useAuthStore((s) => s.restore);
  const settings = useDataStore((s) => s.db.settings);

  // Check for a stored session once, before the guards run.
  useEffect(() => {
    void restore();
  }, [restore]);

  // Keep money formatting in step with whatever currency the owner set.
  useEffect(() => {
    applyCurrency(settings);
  }, [settings]);

  return (
    <ConfirmProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-brand-ink"
      >
        Skip to content
      </a>

      <RouterProvider router={router} />
      <Toaster />
    </ConfirmProvider>
  );
}
