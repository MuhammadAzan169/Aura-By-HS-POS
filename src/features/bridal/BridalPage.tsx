import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarHeart, Crown, Plus, Wallet } from 'lucide-react';
import type { BridalStatus } from '@/types';
import { formatCurrency } from '@/utils/money';
import { formatDate } from '@/utils/date';
import { matches } from '@/utils/text';
import { downloadExcel } from '@/utils/excel';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { balanceOf, paidOf } from '@/services/bridalService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';
import { BridalFormModal } from './BridalFormModal';

export const STATUS_TONE: Record<BridalStatus, 'warn' | 'ok' | 'info' | 'danger'> = {
  tentative: 'warn',
  confirmed: 'ok',
  completed: 'info',
  cancelled: 'danger',
};

export function BridalPage(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const { pathname } = useLocation();
  const base = pathname.startsWith('/admin') ? '/admin' : '/shop';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | BridalStatus | 'owing'>('');
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(search);
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const firstDate = (b: (typeof db.bridalBookings)[number]): string =>
      [...b.events].map((e) => e.date).filter(Boolean).sort()[0] ?? '';
    const lastDate = (b: (typeof db.bridalBookings)[number]): string =>
      [...b.events].map((e) => e.date).filter(Boolean).sort().slice(-1)[0] ?? '';
    return db.bridalBookings
      .filter((b) => shopId === null || b.shopId === shopId)
      .filter((b) => (status === 'owing' ? balanceOf(b) > 0 && b.status !== 'cancelled' : !status || b.status === status))
      .filter((b) => (when === 'upcoming' ? lastDate(b) >= today || !lastDate(b) : when === 'past' ? lastDate(b) < today : true))
      .filter((b) => !debounced || matches(`${b.bookingNo} ${b.brideName} ${b.phone} ${b.packageName}`, debounced))
      .map((b) => ({ b, first: firstDate(b) }))
      .sort((x, y) => (when === 'past' ? y.first.localeCompare(x.first) : x.first.localeCompare(y.first)));
  }, [db.bridalBookings, shopId, status, when, debounced, today]);

  const active = db.bridalBookings.filter((b) => (shopId === null || b.shopId === shopId) && b.status !== 'cancelled');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthEvents = active.flatMap((b) => b.events).filter((e) => e.date.startsWith(thisMonth) && e.status !== 'cancelled').length;
  const owed = active.filter((b) => b.status !== 'completed').reduce((s, b) => s + balanceOf(b), 0);
  const booked = active.filter((b) => b.createdAt.startsWith(thisMonth)).reduce((s, b) => s + b.total, 0);

  return (
    <>
      <PageHeader
        title="Bridal bookings"
        description="Every wedding: package, events, artists, advances and balances."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                void downloadExcel(
                  rows.map((r) => r.b),
                  [
                    { header: 'Booking', value: (b) => b.bookingNo },
                    { header: 'Bride', value: (b) => b.brideName },
                    { header: 'Phone', value: (b) => b.phone },
                    { header: 'Package', value: (b) => b.packageName },
                    { header: 'Events', value: (b) => b.events.map((e) => `${e.type} ${e.date}`).join(', ') },
                    { header: 'Total', value: (b) => b.total },
                    { header: 'Paid', value: (b) => paidOf(b) },
                    { header: 'Balance', value: (b) => balanceOf(b) },
                    { header: 'Status', value: (b) => b.status },
                  ],
                  timestampedName('bridal-bookings'),
                )
              }
            >
              Export
            </Button>
            <Button leftIcon={<Plus />} disabled={!shopId} title={!shopId ? 'Pick a single branch first' : undefined} onClick={() => setOpen(true)}>
              New bridal booking
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <StatCard label="Events this month" value={monthEvents} icon={<CalendarHeart />} />
        <StatCard label="Booked this month" value={formatCurrency(booked)} icon={<Crown />} />
        <StatCard label="Still to collect" value={formatCurrency(owed)} icon={<Wallet />} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search bride, phone or booking no." />
        <Select aria-label="When" value={when} onChange={(e) => setWhen(e.target.value as typeof when)} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All dates' }]} />
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          options={[
            { value: '', label: 'Any status' },
            { value: 'tentative', label: 'Tentative' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'owing', label: 'Balance owing' },
          ]}
        />
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={<Crown />} title="No bridal bookings here" description="Create one when a bride books a package." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ b, first }) => (
              <li key={b.id}>
                <Link to={`${base}/bridal/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-canvas">
                  <span className="w-28 shrink-0 text-sm font-medium text-ink">{first ? formatDate(first) : 'Date TBC'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{b.brideName}</span>
                    <span className="block truncate text-xs text-muted">
                      {b.bookingNo} · {b.packageName} · {b.events.map((e) => e.type).join(', ')}
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="block text-ink">{formatCurrency(b.total)}</span>
                    {balanceOf(b) > 0 && b.status !== 'cancelled' && <span className="block text-xs text-danger">{formatCurrency(balanceOf(b))} due</span>}
                  </span>
                  <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {shopId && <BridalFormModal open={open} onClose={() => setOpen(false)} shopId={shopId} />}
    </>
  );
}

export default BridalPage;
