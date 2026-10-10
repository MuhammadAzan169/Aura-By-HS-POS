import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { formatDateTime } from '@/utils/date';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { averageRating } from '@/services/feedbackService';
import { deleteFeedback } from '@/services/deleteService';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/States';

/** Ratings from customers after their visit, overall and per stylist. */
export function FeedbackPage(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const del = useDeleteAction();
  const rows = useMemo(
    () => db.feedback.filter((f) => shopId === null || f.shopId === shopId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.feedback, shopId],
  );
  const byStaff = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const f of rows) if (f.staffId) m.set(f.staffId, [...(m.get(f.staffId) ?? []), f.rating]);
    return [...m.entries()]
      .map(([id, r]) => ({ name: db.staff.find((s) => s.id === id)?.name ?? 'Former staff', avg: r.reduce((a, b) => a + b, 0) / r.length, n: r.length }))
      .sort((a, b) => b.avg - a.avg);
  }, [rows, db.staff]);
  const stars = (n: number): string => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

  return (
    <>
      <PageHeader title="Customer feedback" description="Ratings recorded after each visit, from the receipt screen." />
      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <StatCard label="Average rating" value={rows.length ? `${averageRating(rows).toFixed(1)} / 5` : '—'} icon={<Star />} />
        <StatCard label="Reviews" value={rows.length} />
        <StatCard label="Unhappy (1–2★)" value={rows.filter((r) => r.rating <= 2).length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card flush>
          {rows.length === 0 ? (
            <EmptyState icon={<Star />} title="No feedback yet" description='Use "Record feedback" on a receipt after the visit.' />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((f) => (
                <li key={f.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{f.customerName}</span>
                    <span className="text-accent">{stars(f.rating)}</span>
                  </div>
                  {f.comment && <p className="mt-1 text-sm text-ink">“{f.comment}”</p>}
                  <p className="mt-1 flex items-center gap-2 text-xs text-subtle">
                    {formatDateTime(f.createdAt)}
                    {f.staffId && ` · ${db.staff.find((s) => s.id === f.staffId)?.name ?? ''}`}
                    {isAdmin && (
                      <button
                        type="button"
                        className="ml-auto text-danger hover:underline"
                        onClick={() =>
                          void del({ title: 'Delete this feedback?', run: () => deleteFeedback(f.id), done: 'Feedback deleted.' })
                        }
                      >
                        Delete
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="By stylist" />
          <ul className="mt-4 space-y-2 text-sm">
            {byStaff.length === 0 && <li className="text-muted">No ratings yet.</li>}
            {byStaff.map((s) => (
              <li key={s.name} className="flex justify-between gap-2">
                <span className="text-ink">{s.name}</span>
                <span className="text-muted">
                  <span className="text-accent">{stars(s.avg)}</span> {s.avg.toFixed(1)} ({s.n})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

export default FeedbackPage;
