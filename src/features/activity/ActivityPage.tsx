import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { formatDateTime } from '@/utils/date';
import { matches } from '@/utils/text';
import { downloadExcel } from '@/utils/excel';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';

const PAGE = 200;

/** The audit trail: every create, edit and delete, with who did it. */
export function ActivityPage(): JSX.Element {
  const db = useDb();
  const { shopId } = useShopScope();
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [user, setUser] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const debounced = useDebounce(search);

  const scoped = useMemo(
    () =>
      db.activity
        .filter((a) => shopId === null || a.shopId === shopId)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [db.activity, shopId],
  );
  const entities = [...new Set(scoped.map((a) => a.entity))].sort();
  const users = [...new Set(scoped.map((a) => a.userName))].sort();
  const rows = scoped.filter(
    (a) =>
      (!entity || a.entity === entity) &&
      (!user || a.userName === user) &&
      (!debounced || matches(`${a.label} ${a.entity} ${a.userName}`, debounced)),
  );

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Who changed what, and when — every bill, booking, price and stock change is recorded automatically."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              void downloadExcel(
                rows,
                [
                  { header: 'When', value: (a) => formatDateTime(a.at) },
                  { header: 'Who', value: (a) => a.userName },
                  { header: 'Action', value: (a) => a.action },
                  { header: 'What', value: (a) => a.entity },
                  { header: 'Detail', value: (a) => a.label },
                  { header: 'Branch', value: (a) => db.shops.find((s) => s.id === a.shopId)?.name ?? 'Owner' },
                ],
                timestampedName('activity-log'),
              )
            }
          >
            Export
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search the log" />
        <Select aria-label="Type" value={entity} onChange={(e) => setEntity(e.target.value)} options={[{ value: '', label: 'Everything' }, ...entities.map((e) => ({ value: e, label: e }))]} />
        <Select aria-label="Person" value={user} onChange={(e) => setUser(e.target.value)} options={[{ value: '', label: 'Everyone' }, ...users.map((u) => ({ value: u, label: u }))]} />
      </div>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={<History />} title="Nothing recorded yet" description="Changes appear here as soon as anyone makes them." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.slice(0, limit).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                <span className="w-36 shrink-0 text-xs tabular-nums text-subtle">{formatDateTime(a.at)}</span>
                <Badge tone={a.action === 'created' ? 'ok' : a.action === 'deleted' ? 'danger' : 'info'}>{a.action}</Badge>
                <span className="font-medium text-ink">{a.entity}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{a.label}</span>
                <span className="text-xs text-subtle">by {a.userName}</span>
              </li>
            ))}
          </ul>
        )}
        {rows.length > limit && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(limit + PAGE)}>
              Show more ({rows.length - limit} older)
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

export default ActivityPage;
