import { create } from 'zustand';
import type { User } from '@/types';
import * as authService from '@/services/authService';
import { setActivityActor } from '@/services/activityLog';

interface AuthState {
  user: User | null;
  /** True until the stored session has been checked on first load. */
  initialising: boolean;
  loggingIn: boolean;
  error: string | null;

  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** Re-reads the user from the database after a profile edit. */
  refresh: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  initialising: true,
  loggingIn: false,
  error: null,

  restore: async () => {
    try {
      const user = await authService.restoreSession();
      setActivityActor(user);
      set({ user, initialising: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not restore your session.';
      set({ user: null, initialising: false, error: message });
    }
  },

  login: async (email, password) => {
    set({ loggingIn: true, error: null });
    try {
      const session = await authService.login({ email, password });
      setActivityActor(session.user);
      set({ user: session.user, loggingIn: false });
      return session.user;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      set({ error: message, loggingIn: false });
      throw error;
    }
  },

  logout: async () => {
    await authService.logout();
    setActivityActor(null);
    set({ user: null, error: null });
  },

  clearError: () => set({ error: null }),

  refresh: () => set({ user: authService.getCurrentUser() ?? null }),
}));

/** Convenience selectors used across the app. */
export const selectIsAdmin = (state: AuthState): boolean => state.user?.role === 'admin';

/** The shop a user is locked to — null means "all shops" (admin only). */
export const selectHomeShopId = (state: AuthState): string | null => state.user?.shopId ?? null;
