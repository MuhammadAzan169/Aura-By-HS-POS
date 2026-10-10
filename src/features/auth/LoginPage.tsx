import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Lock, Mail, Store, UserCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { DEMO_ACCOUNTS } from '@/mock/shops';
import { homeFor } from '@/app/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isCloud } from '@/services/cloud/client';
import {
  createPassword,
  loginWithGoogle,
  sendPasswordReset,
  setNewPassword,
} from '@/services/authService';

type Mode = 'signin' | 'create' | 'forgot';

function GoogleIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.3-4.7 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

/** Shown after a reset link brings the person back signed in. */
function SetNewPassword({ onDone }: { onDone: () => void }): JSX.Element {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setNewPassword(password)
          .then(onDone)
          .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save.'))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="font-display text-2xl font-semibold text-ink">Choose a new password</h2>
      {message && <p role="alert" className="text-[13px] text-danger">{message}</p>}
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        leftIcon={<Lock />}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 8 characters."
      />
      <Button type="submit" fullWidth size="lg" loading={busy}>
        Save password and continue
      </Button>
    </form>
  );
}

const schema = z.object({
  email: z.string().min(1, 'Enter your email address').email('That does not look like an email address'),
  password: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface LocationState {
  from?: string;
}

export function LoginPage(): JSX.Element {
  const login = useAuthStore((s) => s.login);
  const loggingIn = useAuthStore((s) => s.loggingIn);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;
  const signedIn = useAuthStore((s) => s.user);
  const resetting = new URLSearchParams(location.search).has('reset');
  const [mode, setMode] = useState<Mode>('signin');
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownError = localError ?? error;

  const google = (): void => {
    setLocalError(null);
    setBusy(true);
    loginWithGoogle().catch((err: unknown) => {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setBusy(false);
    });
  };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // Clear a stale failure the moment the form is touched again.
  useEffect(() => () => clearError(), [clearError]);

  const submit = async (values: FormValues): Promise<void> => {
    setLocalError(null);
    setNotice(null);
    if (mode !== 'signin') {
      setBusy(true);
      try {
        setNotice(
          mode === 'create'
            ? await createPassword(values.email, values.password)
            : await sendPasswordReset(values.email),
        );
        setMode('signin');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const user = await login(values.email, values.password).catch(() => null);
    if (!user) return;
    // Send them where they were heading, unless that belongs to the other portal.
    const home = homeFor(user.role);
    const target = from && from.startsWith(home) ? from : home;
    navigate(target, { replace: true });
  };

  const quickFill = (account: { email: string; password: string }): void => {
    setValue('email', account.email, { shouldValidate: true });
    setValue('password', account.password, { shouldValidate: true });
    void submit(account);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Brand panel ---------- */}
      {/*
        The poster carries its own wordmark and tagline baked in at a fixed
        position, so using it as a foreground image made the headline collide
        with that tagline at some window sizes. It is therefore ambience —
        blurred and scrimmed — while the identity is redrawn live from the ring
        mark plus real type, which stays sharp and reflows at any size.
      */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-panel p-10 text-white lg:flex xl:p-12">
        <img
          src="/aura-brand.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-[11px]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-brand-panel/55 via-brand-panel/70 to-brand-panel/90"
        />

        <div className="relative flex items-center gap-3">
          <img
            src="/aura-mark.jpg"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-2xl object-cover ring-1 ring-accent-bright/40"
          />
          <span>
            <span className="block font-display text-lg font-semibold leading-tight">Aura by HS</span>
            <span className="block text-[11px] uppercase tracking-[0.14em] text-accent-bright/80">
              Bridal · Salon · Photography
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-[2.5rem] font-semibold leading-[1.1]">
            Every chair, every till, every branch.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            Bookings that respect your stylists' rotas, a point of sale built for a busy Saturday,
            and numbers you can actually act on — across every salon.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-6">
            {[
              { value: 'POS', label: 'Bills & PDF' },
              { value: 'Book', label: 'Appointments' },
              { value: 'Stock', label: 'Inventory' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block font-display text-2xl font-semibold text-accent-bright">
                    {stat.value}
                  </span>
                  <span className="mt-0.5 block text-xs uppercase tracking-wide text-white/55">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-white/45">
          {isCloud
            ? 'Secured with Google sign-in and per-branch access rules.'
            : 'Demo build — all data is generated and stored in your browser.'}
        </p>
      </section>

      {/* ---------- Form panel ---------- */}
      <section className="flex items-center justify-center bg-canvas px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img
              src="/aura-mark.jpg"
              alt=""
              width={52}
              height={52}
              className="mb-4 h-[52px] w-[52px] rounded-2xl object-cover shadow-card ring-1 ring-accent/30"
            />
            <p className="font-display text-xl font-semibold text-ink">Aura by HS</p>
            <p className="mt-0.5 text-xs text-subtle">
              Bridal make-up · Saloon services · Photography studio
            </p>
          </div>

          {resetting && signedIn ? (
            <SetNewPassword onDone={() => navigate(homeFor(signedIn.role), { replace: true })} />
          ) : (
          <>
          <h2 className="font-display text-2xl font-semibold text-ink">
            {mode === 'create' ? 'Create your password' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === 'create'
              ? 'Use the email the owner added for your branch.'
              : mode === 'forgot'
                ? 'We will email you a link to choose a new one.'
                : 'Sign in to manage your salon.'}
          </p>

          {notice && (
            <p role="status" className="mt-5 rounded-xl border border-info/25 bg-info-soft px-3.5 py-3 text-[13px] text-ink">
              {notice}
            </p>
          )}

          {isCloud && mode === 'signin' && (
            <>
              <Button
                variant="outline"
                fullWidth
                size="lg"
                className="mt-6"
                leftIcon={<GoogleIcon />}
                loading={busy}
                onClick={google}
              >
                Continue with Google
              </Button>
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" aria-hidden />
                <span className="text-xs font-medium text-subtle">or with email</span>
                <span className="h-px flex-1 bg-line" aria-hidden />
              </div>
            </>
          )}

          {shownError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" aria-hidden />
              <p className="text-[13px] leading-snug text-danger">{shownError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4" noValidate>
            <Input
              label="Email address"
              type="email"
              autoComplete="username"
              placeholder="you@aurabyhs.pk"
              leftIcon={<Mail />}
              error={errors.email?.message}
              {...register('email')}
            />

            {mode !== 'forgot' && (
              <Input
                label={mode === 'create' ? 'New password' : 'Password'}
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                leftIcon={<Lock />}
                error={errors.password?.message}
                {...register('password')}
              />
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loggingIn || busy}
              rightIcon={<ArrowRight />}
            >
              {mode === 'create' ? 'Create password' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
            </Button>
          </form>

          {isCloud && (
            <div className="mt-4 flex flex-wrap justify-between gap-2 text-[13px]">
              {mode === 'signin' ? (
                <>
                  <button type="button" className="text-brand hover:underline" onClick={() => setMode('create')}>
                    First time? Create a password
                  </button>
                  <button type="button" className="text-muted hover:underline" onClick={() => setMode('forgot')}>
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" className="text-brand hover:underline" onClick={() => setMode('signin')}>
                  Back to sign in
                </button>
              )}
            </div>
          )}

          {!isCloud && (
          <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" aria-hidden />
            <span className="text-xs font-medium text-subtle">Or try a demo account</span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button
              variant="outline"
              leftIcon={<UserCircle2 />}
              disabled={loggingIn}
              onClick={() => quickFill(DEMO_ACCOUNTS.admin)}
            >
              Login as Admin
            </Button>
            <Button
              variant="outline"
              leftIcon={<Store />}
              disabled={loggingIn}
              onClick={() => quickFill(DEMO_ACCOUNTS.shop)}
            >
              Login as Shop
            </Button>
          </div>

          <dl className="mt-6 space-y-2 rounded-xl border border-line bg-surface p-4 text-xs">
            <p className="mb-2 font-semibold text-ink">Demo credentials</p>

            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Owners</dt>
              <dd className="text-right font-mono text-[11px] text-ink">
                {DEMO_ACCOUNTS.admin.email} / {DEMO_ACCOUNTS.admin.password}
              </dd>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Branch</dt>
              <dd className="text-right font-mono text-[11px] text-ink">
                {DEMO_ACCOUNTS.shop.email} / {DEMO_ACCOUNTS.shop.password}
              </dd>
            </div>

            <p className="pt-1 text-[11px] leading-snug text-subtle">
              The other branches sign in with <span className="font-mono">dha@</span> or{' '}
              <span className="font-mono">clifton@aurabyhs.pk</span>, same password.
            </p>
          </dl>
          </>
          )}
          </>
          )}
        </div>
      </section>
    </div>
  );
}
