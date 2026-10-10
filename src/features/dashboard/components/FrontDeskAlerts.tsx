import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Cake, Crown, Heart, Inbox, LockKeyhole, MessageCircle, Wallet } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { formatCurrency } from '@/utils/money';
import { openWhatsApp } from '@/utils/whatsapp';
import { useDb } from '@/hooks/useDb';
import { openSession } from '@/services/registerService';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/** Month-day of a stored date ("1994-03-14" or "03-14"). */
const monthDay = (d: string | null | undefined): string | null => (d ? d.slice(-5) : null);

/**
 * The things a front desk forgets: whose birthday is this week, who still
 * owes money, and whether the till was opened.
 */
export function FrontDeskAlerts({ shopId }: { shopId: string | null }): JSX.Element | null {
  const db = useDb();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/admin') ? '/admin' : '/shop';

  const { celebrations, dueTotal, dueCount } = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(), i), 'MM-dd'));
    const customers = db.customers.filter((c) => c.active && (shopId === null || c.shopId === shopId));
    const list: Array<{ id: string; name: string; phone: string; kind: 'birthday' | 'anniversary'; inDays: number }> = [];
    for (const c of customers) {
      const b = days.indexOf(monthDay(c.birthday) ?? '');
      if (b >= 0) list.push({ id: c.id, name: c.name, phone: c.phone, kind: 'birthday', inDays: b });
      const a = days.indexOf(monthDay(c.anniversary) ?? '');
      if (a >= 0) list.push({ id: c.id, name: c.name, phone: c.phone, kind: 'anniversary', inDays: a });
    }
    list.sort((x, y) => x.inDays - y.inDays);
    const unpaid = db.sales.filter(
      (s) => s.status === 'completed' && (s.balanceDue ?? 0) > 0 && (shopId === null || s.shopId === shopId),
    );
    return {
      celebrations: list,
      dueTotal: unpaid.reduce((s, x) => s + (x.balanceDue ?? 0), 0),
      dueCount: unpaid.length,
    };
  }, [db.customers, db.sales, shopId]);

  const tillOpen = shopId ? openSession(shopId, db) !== null : true;
  const newEnquiries = db.enquiries.filter((e) => e.status === 'new' && (shopId === null || e.shopId === shopId || e.shopId === null)).length;
  const week = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(), i), 'yyyy-MM-dd'));
  const bridalSoon = db.bridalBookings
    .filter((b) => (shopId === null || b.shopId === shopId) && (b.status === 'confirmed' || b.status === 'tentative'))
    .flatMap((b) => b.events.filter((e) => e.status === 'scheduled' && week.includes(e.date)).map((e) => ({ b, e })))
    .sort((x, y) => `${x.e.date}${x.e.readyBy}`.localeCompare(`${y.e.date}${y.e.readyBy}`));
  if (!celebrations.length && !dueCount && tillOpen && !newEnquiries && !bridalSoon.length) return null;

  const greet = (c: (typeof celebrations)[number]): void =>
    openWhatsApp(
      c.phone,
      c.kind === 'birthday'
        ? `Happy birthday, ${c.name}! 🎂 Wishing you a beautiful year from all of us at ${db.settings.business.name}. Enjoy a special treat on your next visit 💐`
        : `Happy anniversary, ${c.name}! 💕 Warm wishes from ${db.settings.business.name}. Treat yourself to a pamper session this week ✨`,
    );

  return (
    <Card className="mt-4">
      <CardHeader title="Front desk reminders" />
      <div className="mt-3 space-y-3">
        {!tillOpen && (
          <Link to={`${base}/register`} className="flex items-center gap-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-ink">
            <LockKeyhole className="h-4 w-4 text-warn" aria-hidden />
            The till has not been opened today — open it with the morning float.
          </Link>
        )}
        {newEnquiries > 0 && (
          <Link to={`${base}/enquiries`} className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[13px] text-ink">
            <Inbox className="h-4 w-4 text-brand" aria-hidden />
            {newEnquiries} new {newEnquiries === 1 ? 'enquiry' : 'enquiries'} waiting for a call back.
          </Link>
        )}
        {bridalSoon.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-accent/40">
            {bridalSoon.slice(0, 6).map(({ b, e }) => (
              <li key={e.id}>
                <Link to={`${base}/bridal/${b.id}`} className="flex items-center gap-3 px-3.5 py-2 text-[13px] hover:bg-canvas">
                  <Crown className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    <strong>{e.type}</strong> — {b.brideName} · {e.date === week[0] ? 'today' : e.date === week[1] ? 'tomorrow' : e.date} · ready by {e.readyBy}
                  </span>
                  {!e.artistId && <span className="text-xs text-danger">no artist</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {dueCount > 0 && (
          <Link to={`${base}/billing/bills?status=unpaid`} className="flex items-center gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-ink">
            <Wallet className="h-4 w-4 text-danger" aria-hidden />
            {dueCount} {dueCount === 1 ? 'bill has' : 'bills have'} {formatCurrency(dueTotal)} still to collect.
          </Link>
        )}
        {celebrations.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {celebrations.slice(0, 8).map((c) => (
              <li key={`${c.id}-${c.kind}`} className="flex items-center gap-3 px-3.5 py-2">
                {c.kind === 'birthday' ? (
                  <Cake className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                ) : (
                  <Heart className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  <Link to={`${base}/customers/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>{' '}
                  — {c.kind} {c.inDays === 0 ? 'today' : c.inDays === 1 ? 'tomorrow' : `in ${c.inDays} days`}
                </span>
                <Button variant="ghost" size="sm" leftIcon={<MessageCircle />} onClick={() => greet(c)}>
                  Wish
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
