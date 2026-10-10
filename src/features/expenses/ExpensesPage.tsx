import { downloadExcel } from '@/utils/excel';
import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { startOfMonth, subMonths } from 'date-fns';
import type { Expense, ExpenseCategory } from '@/types';
import { EXPENSE_CATEGORIES } from '@/types/expense';
import { formatCurrency } from '@/utils/money';
import { formatDate, toISODate } from '@/utils/date';
import { matches } from '@/utils/text';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import * as expenseService from '@/services/expenseService';
import { breakdownByCategory } from '@/services/expenseService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { DonutChart } from '@/components/ui/Chart';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { DatePicker } from '@/components/ui/DatePicker';

export function ExpensesPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops } = useShopScope();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState<'this-month' | 'last-month' | 'last-3' | 'all'>('this-month');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const debounced = useDebounce(search);

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'this-month') return { from: toISODate(startOfMonth(now)), to: toISODate(now) };
    if (period === 'last-month') {
      const start = startOfMonth(subMonths(now, 1));
      return { from: toISODate(start), to: toISODate(startOfMonth(now)) };
    }
    if (period === 'last-3') return { from: toISODate(startOfMonth(subMonths(now, 2))), to: toISODate(now) };
    return null;
  }, [period]);

  const rows = useMemo(
    () =>
      db.expenses.filter((expense) => {
        if (shopId !== null && expense.shopId !== shopId) return false;
        if (category !== 'all' && expense.category !== category) return false;
        if (range && (expense.spentOn < range.from || expense.spentOn > range.to)) return false;
        if (
          debounced &&
          !matches(expense.title, debounced) &&
          !matches(expense.description, debounced) &&
          !matches(expense.paidBy, debounced)
        ) {
          return false;
        }
        return true;
      }),
    [db.expenses, shopId, category, range, debounced],
  );

  const table = useTableState(rows, {
    initialPageSize: 12,
    initialSortKey: 'spentOn',
    initialSortDir: 'desc',
    accessors: {
      spentOn: (e) => e.spentOn,
      title: (e) => e.title,
      category: (e) => e.category,
      amount: (e) => e.amount,
    },
  });

  const breakdown = useMemo(() => breakdownByCategory(rows), [rows]);
  const total = rows.reduce((sum, e) => sum + e.amount, 0);

  const remove = useAsyncAction(async (id: string) => expenseService.remove(id), {
    successMessage: 'Expense deleted.',
  });

  const onDelete = async (expense: Expense): Promise<void> => {
    const result = await confirm({
      title: `Delete "${expense.title}"?`,
      description: `${formatCurrency(expense.amount)} recorded on ${formatDate(expense.spentOn)} will be removed from the accounts. This cannot be undone.`,
      confirmLabel: 'Delete expense',
      tone: 'danger',
    });
    if (!result.confirmed) return;
    await remove.run(expense.id);
  };

  const exportCsv = (): void => {
    void downloadExcel(
      table.sortedRows,
      [
        { header: 'Date', value: (e) => e.spentOn },
        { header: 'Title', value: (e) => e.title },
        { header: 'Category', value: (e) => e.category },
        { header: 'Branch', value: (e) => db.shops.find((s) => s.id === e.shopId)?.name ?? '' },
        { header: 'Amount', value: (e) => e.amount },
        { header: 'Paid by', value: (e) => e.paidBy },
        { header: 'Description', value: (e) => e.description },
      ],
      timestampedName('expenses'),
    );
  };

  const columns: Column<Expense>[] = [
    {
      key: 'title',
      header: 'Expense',
      sortable: true,
      mobilePrimary: true,
      render: (expense) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{expense.title}</p>
          <p className="truncate text-xs text-muted">{expense.description || '—'}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (expense) => <Badge tone="brand">{expense.category}</Badge>,
    },
    ...(isAllShops
      ? [
          {
            key: 'shop',
            header: 'Branch',
            hideBelowLg: true,
            render: (expense: Expense) => (
              <span className="text-sm text-muted">
                {db.shops.find((s) => s.id === expense.shopId)?.name ?? '—'}
              </span>
            ),
          } satisfies Column<Expense>,
        ]
      : []),
    {
      key: 'spentOn',
      header: 'Date',
      sortable: true,
      render: (expense) => <span className="text-sm text-muted">{formatDate(expense.spentOn)}</span>,
    },
    {
      key: 'paidBy',
      header: 'Paid by',
      hideBelowLg: true,
      render: (expense) => <span className="text-sm text-muted">{expense.paidBy}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (expense) => (
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatCurrency(expense.amount)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="What the business spends, by branch and category."
        actions={
          <>
            <Button variant="outline" leftIcon={<Download />} onClick={exportCsv}>
              Export
            </Button>
            <Button
              leftIcon={<Plus />}
              disabled={shopId === null}
              title={shopId === null ? 'Pick a branch to record an expense against' : undefined}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Record expense
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total in period" value={formatCurrency(total, { compact: true })} icon={<Wallet />} />
        <StatCard label="Entries" value={rows.length} />
        <StatCard
          label="Largest category"
          value={breakdown[0]?.category ?? '—'}
          hint={breakdown[0] ? formatCurrency(breakdown[0].amount, { compact: true }) : undefined}
        />
        <StatCard
          label="Average entry"
          value={formatCurrency(rows.length > 0 ? total / rows.length : 0, { compact: true })}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="order-2 lg:order-1">
          <FilterBar
            activeCount={(category !== 'all' ? 1 : 0) + (period !== 'this-month' ? 1 : 0) + (debounced ? 1 : 0)}
            onClear={() => {
              setSearch('');
              setCategory('all');
              setPeriod('this-month');
            }}
          >
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search expenses…"
              className="w-full sm:w-64"
              label="Search expenses"
            />

            <FilterSelect
              label="Category"
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: 'All categories' },
                ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
            />

            <FilterSelect
              label="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'this-month', label: 'This month' },
                { value: 'last-month', label: 'Last month' },
                { value: 'last-3', label: 'Last 3 months' },
                { value: 'all', label: 'All time' },
              ]}
            />
          </FilterBar>
        </Card>

        <Card className="order-1 lg:order-2">
          <CardHeader title="By category" description="Share of spend in this period" />
          <DonutChart
            height={200}
            data={breakdown.map((row) => ({ name: row.category, value: row.amount }))}
          />
        </Card>
      </div>

      <DataTable
        columns={columns}
        table={table}
        rowKey={(expense) => expense.id}
        onRowClick={(expense) => {
          setEditing(expense);
          setFormOpen(true);
        }}
        caption="Expenses"
        empty={{
          title: 'No expenses in this period',
          description: 'Try a wider period, or record the first one.',
          icon: <Wallet />,
        }}
        rowActions={(expense) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Pencil />}
              onClick={() => {
                setEditing(expense);
                setFormOpen(true);
              }}
            >
              Edit
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={() => void onDelete(expense)}>
              Delete
            </Button>
          </div>
        )}
      />

      {shopId && (
        <ExpenseFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          shopId={editing?.shopId ?? shopId}
          expense={editing}
        />
      )}
    </>
  );
}

function ExpenseFormModal({
  open,
  onClose,
  shopId,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  expense: Expense | null;
}): JSX.Element {
  const db = useDb();
  const isEdit = Boolean(expense);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Other');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(toISODate(new Date()));
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState('');

  // Reload the form each time it opens for a different record.
  useEffect(() => {
    if (!open) return;
    setTitle(expense?.title ?? '');
    setCategory(expense?.category ?? 'Other');
    setAmount(String(expense?.amount ?? ''));
    setSpentOn(expense?.spentOn ?? toISODate(new Date()));
    setDescription(expense?.description ?? '');
    setPaidBy(expense?.paidBy ?? '');
  }, [open, expense]);

  const save = useAsyncAction(
    async () => {
      const payload = {
        shopId,
        title,
        category,
        amount: Number(amount) || 0,
        spentOn,
        description,
        paidBy,
      };
      return expense ? expenseService.update(expense.id, payload) : expenseService.create(payload);
    },
    {
      successMessage: (saved) => (isEdit ? `${saved.title} was updated.` : `${saved.title} was recorded.`),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!save.pending}
      title={isEdit ? 'Edit expense' : 'Record an expense'}
      description="Expenses feed straight into the profit figure in Reports."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button
            loading={save.pending}
            disabled={!title.trim() || !Number(amount)}
            onClick={() => void save.run()}
          >
            {isEdit ? 'Save changes' : 'Record expense'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Title"
          required
          placeholder="e.g. Monthly rent"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />

          <Input
            label="Amount"
            required
            type="number"
            min={0}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label="Date"
            required
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
          />

          <Input
            label="Paid by"
            placeholder="Who settled it"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
          />
        </div>

        <Textarea
          label="Description"
          rows={2}
          placeholder="Any detail worth keeping"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[13px] text-muted">
          Branch:{' '}
          <span className="font-medium text-ink">
            {db.shops.find((s) => s.id === shopId)?.name ?? '—'}
          </span>
        </p>
      </div>
    </Modal>
  );
}

export default ExpensesPage;
