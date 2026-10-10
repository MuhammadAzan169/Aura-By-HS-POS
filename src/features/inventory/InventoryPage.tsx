import { downloadExcel } from '@/utils/excel';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  History,
  PackageX,
  Settings2,
  TrendingUp,
} from 'lucide-react';
import type { InventoryMovement, MovementType, Product } from '@/types';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/money';
import { formatDateTime } from '@/utils/date';
import { matches } from '@/utils/text';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useAuthStore } from '@/store/authStore';
import { stockStatus, summarise } from '@/services/inventoryService';
import * as inventoryService from '@/services/inventoryService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, StockBadge } from '@/components/ui/Badge';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/States';
import { Download } from 'lucide-react';

type StockAction = 'add' | 'remove' | 'adjust';

const MOVEMENT_META: Record<MovementType, { label: string; tone: 'ok' | 'danger' | 'info' | 'warn' | 'brand' }> = {
  purchase: { label: 'Purchase', tone: 'ok' },
  sale: { label: 'Sale', tone: 'info' },
  adjustment: { label: 'Adjustment', tone: 'warn' },
  'service-use': { label: 'Used in service', tone: 'brand' },
  transfer: { label: 'Transfer', tone: 'info' },
  refund: { label: 'Refund', tone: 'ok' },
};

export function InventoryPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops } = useShopScope();
  const [params, setParams] = useSearchParams();

  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'in-stock' | 'low' | 'out'>('all');
  const [action, setAction] = useState<{ product: Product; kind: StockAction } | null>(null);
  const [historyFor, setHistoryFor] = useState<Product | null>(null);

  const debounced = useDebounce(search);

  // A low-stock notification links straight to the product.
  useEffect(() => {
    const productId = params.get('product');
    if (!productId) return;
    const product = db.products.find((p) => p.id === productId);
    if (product) {
      setSearch(product.name);
      setHistoryFor(product);
    }
    params.delete('product');
    setParams(params, { replace: true });
  }, [params, setParams, db.products]);

  const summary = useMemo(() => summarise(shopId), [shopId, db]);

  const products = useMemo(
    () =>
      db.products.filter((product) => {
        if (shopId !== null && product.shopId !== shopId) return false;
        if (!product.active) return false;
        if (status !== 'all' && stockStatus(product) !== status) return false;
        if (debounced && !matches(product.name, debounced) && !matches(product.brand, debounced)) {
          return false;
        }
        return true;
      }),
    [db.products, shopId, status, debounced],
  );

  const movements = useMemo(
    () =>
      db.inventoryMovements
        .filter((movement) => {
          if (shopId !== null && movement.shopId !== shopId) return false;
          if (!debounced) return true;
          const product = db.products.find((p) => p.id === movement.productId);
          return matches(product?.name, debounced) || matches(movement.reason, debounced);
        })
        .slice(0, 400),
    [db.inventoryMovements, db.products, shopId, debounced],
  );

  const stockTable = useTableState(products, {
    initialPageSize: 12,
    initialSortKey: 'stock',
    accessors: {
      name: (p) => p.name,
      stock: (p) => p.stock,
      value: (p) => p.costPrice * p.stock,
    },
  });

  const movementTable = useTableState(movements, {
    initialPageSize: 15,
    initialSortKey: 'createdAt',
    initialSortDir: 'desc',
    accessors: { createdAt: (m) => m.createdAt, quantity: (m) => m.quantity },
  });

  const exportStock = (): void => {
    void downloadExcel(
      stockTable.sortedRows,
      [
        { header: 'Product', value: (p) => p.name },
        { header: 'Brand', value: (p) => p.brand },
        { header: 'SKU', value: (p) => p.sku },
        { header: 'Branch', value: (p) => db.shops.find((s) => s.id === p.shopId)?.name ?? '' },
        { header: 'Stock', value: (p) => p.stock },
        { header: 'Minimum', value: (p) => p.minStock },
        { header: 'Status', value: (p) => stockStatus(p) },
        { header: 'Value at cost', value: (p) => p.costPrice * p.stock },
        { header: 'Value at retail', value: (p) => p.sellingPrice * p.stock },
      ],
      timestampedName('inventory'),
    );
  };

  const stockColumns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      mobilePrimary: true,
      render: (product) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{product.name}</p>
          <p className="truncate text-xs text-muted">
            {product.brand}
            {product.backBarOnly && ' · back bar'}
          </p>
        </div>
      ),
    },
    ...(isAllShops
      ? [
          {
            key: 'shop',
            header: 'Branch',
            hideBelowLg: true,
            render: (product: Product) => (
              <span className="text-sm text-muted">
                {db.shops.find((s) => s.id === product.shopId)?.name ?? '—'}
              </span>
            ),
          } satisfies Column<Product>,
        ]
      : []),
    {
      key: 'stock',
      header: 'In stock',
      sortable: true,
      align: 'right',
      render: (product) => (
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              product.stock === 0 ? 'text-danger' : 'text-ink',
            )}
          >
            {product.stock}
          </span>
          <span className="text-xs text-subtle">min {product.minStock}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => <StockBadge status={stockStatus(product)} />,
    },
    {
      key: 'value',
      header: 'Value at cost',
      sortable: true,
      align: 'right',
      hideBelowLg: true,
      render: (product) => (
        <span className="text-sm tabular-nums text-muted">
          {formatCurrency(product.costPrice * product.stock)}
        </span>
      ),
    },
  ];

  const movementColumns: Column<InventoryMovement>[] = [
    {
      key: 'createdAt',
      header: 'When',
      sortable: true,
      mobilePrimary: true,
      render: (movement) => (
        <div>
          <p className="text-sm text-ink">{formatDateTime(movement.createdAt)}</p>
          <p className="truncate text-xs text-muted">
            {db.products.find((p) => p.id === movement.productId)?.name ?? 'Removed product'}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (movement) => (
        <Badge tone={MOVEMENT_META[movement.type].tone}>{MOVEMENT_META[movement.type].label}</Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Change',
      sortable: true,
      align: 'right',
      render: (movement) => (
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            movement.quantity > 0 ? 'text-ok' : 'text-danger',
          )}
        >
          {movement.quantity > 0 ? '+' : ''}
          {movement.quantity}
        </span>
      ),
    },
    {
      key: 'after',
      header: 'Before → after',
      align: 'right',
      hideBelowLg: true,
      render: (movement) => (
        <span className="text-sm tabular-nums text-muted">
          {movement.stockBefore} → <span className="font-medium text-ink">{movement.stockAfter}</span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideBelowLg: true,
      render: (movement) => (
        <span className="line-clamp-1 max-w-[18rem] text-sm text-muted">{movement.reason}</span>
      ),
    },
    {
      key: 'user',
      header: 'By',
      hideBelowLg: true,
      render: (movement) => <span className="text-sm text-muted">{movement.userName}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Every change to a stock figure is recorded, with who made it and why."
        actions={
          <Button variant="outline" leftIcon={<Download />} onClick={exportStock}>
            Export
          </Button>
        }
      >
        <Tabs
          variant="pill"
          label="Inventory sections"
          value={tab}
          onChange={(next) => setTab(next as typeof tab)}
          items={[
            { value: 'stock', label: 'Stock levels', count: products.length },
            { value: 'movements', label: 'Movement log', count: movements.length },
          ]}
        />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Products" value={summary.totalItems} icon={<Boxes />} />
        <StatCard
          label="Low stock"
          value={summary.lowStock}
          tone={summary.lowStock > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Out of stock"
          value={summary.outOfStock}
          icon={<PackageX />}
          tone={summary.outOfStock > 0 ? 'danger' : 'default'}
        />
        <StatCard label="Value at cost" value={formatCurrency(summary.valueAtCost, { compact: true })} />
        <StatCard
          label="Value at retail"
          value={formatCurrency(summary.valueAtRetail, { compact: true })}
          icon={<TrendingUp />}
          hint={`${formatCurrency(summary.potentialMargin, { compact: true })} potential margin`}
        />
      </div>

      <Card className="mb-4">
        <FilterBar
          activeCount={(status !== 'all' ? 1 : 0) + (debounced ? 1 : 0)}
          onClear={() => {
            setSearch('');
            setStatus('all');
          }}
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search products…"
            className="w-full sm:w-72"
            label="Search inventory"
          />

          {tab === 'stock' && (
            <FilterSelect
              label="Stock level"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'Any stock level' },
                { value: 'in-stock', label: 'In stock' },
                { value: 'low', label: 'Low stock' },
                { value: 'out', label: 'Out of stock' },
              ]}
            />
          )}
        </FilterBar>
      </Card>

      <TabPanel active={tab === 'stock'}>
        <DataTable
          columns={stockColumns}
          table={stockTable}
          rowKey={(product) => product.id}
          caption="Stock levels"
          empty={{ title: 'No products match', icon: <Boxes /> }}
          rowActions={(product) => (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowUpCircle />}
                onClick={() => setAction({ product, kind: 'add' })}
              >
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowDownCircle />}
                disabled={product.stock === 0}
                onClick={() => setAction({ product, kind: 'remove' })}
              >
                Remove
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Settings2 />}
                onClick={() => setAction({ product, kind: 'adjust' })}
              >
                Adjust
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<History />}
                onClick={() => setHistoryFor(product)}
              >
                History
              </Button>
            </div>
          )}
        />
      </TabPanel>

      <TabPanel active={tab === 'movements'}>
        <DataTable
          columns={movementColumns}
          table={movementTable}
          rowKey={(movement) => movement.id}
          caption="Stock movements"
          empty={{ title: 'No movements recorded', icon: <History /> }}
        />
      </TabPanel>

      <StockActionModal action={action} onClose={() => setAction(null)} />
      <HistoryModal product={historyFor} onClose={() => setHistoryFor(null)} />
    </>
  );
}

function StockActionModal({
  action,
  onClose,
}: {
  action: { product: Product; kind: StockAction } | null;
  onClose: () => void;
}): JSX.Element | null {
  const actor = useAuthStore((s) => s.user);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!action) return;
    setQuantity(action.kind === 'adjust' ? String(action.product.stock) : '');
    setReason('');
  }, [action]);

  const run = useAsyncAction(
    async () => {
      if (!action || !actor) throw new Error('You must be signed in.');
      const amount = Number(quantity) || 0;

      if (action.kind === 'add') {
        return inventoryService.addStock(
          action.product.id,
          amount,
          reason || `Stock received from ${action.product.supplier}`,
          actor,
        );
      }
      if (action.kind === 'remove') {
        return inventoryService.removeStock(action.product.id, amount, reason, actor);
      }
      return inventoryService.adjustStock(action.product.id, amount, reason, actor);
    },
    { successMessage: 'Stock updated and the movement was logged.', onSuccess: onClose },
  );

  if (!action) return null;

  const { product, kind } = action;
  const amount = Number(quantity) || 0;
  const resulting =
    kind === 'add'
      ? product.stock + amount
      : kind === 'remove'
        ? product.stock - amount
        : amount;

  const titles: Record<StockAction, string> = {
    add: 'Add stock',
    remove: 'Remove stock',
    adjust: 'Adjust stock',
  };

  const reasonRequired = kind !== 'add';

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      dismissible={!run.pending}
      title={titles[kind]}
      description={`${product.brand} ${product.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={run.pending}>
            Cancel
          </Button>
          <Button
            loading={run.pending}
            disabled={amount <= 0 && kind !== 'adjust'}
            onClick={() => void run.run()}
          >
            {titles[kind]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-canvas px-3.5 py-3">
          <span className="text-[13px] text-muted">Current stock</span>
          <span className="text-sm font-semibold tabular-nums text-ink">
            {product.stock} {product.unit}
            {product.stock === 1 ? '' : 's'}
          </span>
        </div>

        <Input
          label={kind === 'adjust' ? 'Counted stock' : 'Quantity'}
          required
          type="number"
          min={0}
          autoFocus
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          hint={
            kind === 'adjust'
              ? 'Enter the figure you actually counted on the shelf.'
              : undefined
          }
          error={
            kind === 'remove' && amount > product.stock
              ? `Only ${product.stock} in stock.`
              : undefined
          }
        />

        <Textarea
          label="Reason"
          required={reasonRequired}
          rows={2}
          placeholder={
            kind === 'add'
              ? 'e.g. delivery received from supplier'
              : kind === 'remove'
                ? 'e.g. used for a colour service'
                : 'e.g. stock count correction after audit'
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={reasonRequired ? 'Required — this is what appears in the audit log.' : undefined}
        />

        <div
          className={cn(
            'flex items-center justify-between rounded-xl px-3.5 py-3',
            resulting <= product.minStock ? 'bg-warn-soft' : 'bg-ok-soft',
          )}
        >
          <span className="text-[13px] text-ink">Stock after this change</span>
          <span className="text-sm font-semibold tabular-nums text-ink">
            {Math.max(0, resulting)}
          </span>
        </div>

        {resulting <= product.minStock && resulting >= 0 && (
          <p className="text-xs text-warn">
            That is at or below the minimum of {product.minStock} — a low-stock alert will be raised.
          </p>
        )}
      </div>
    </Modal>
  );
}

function HistoryModal({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}): JSX.Element | null {
  const db = useDb();

  const movements = useMemo(
    () =>
      product
        ? db.inventoryMovements
            .filter((m) => m.productId === product.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [db.inventoryMovements, product],
  );

  if (!product) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Stock history"
      description={`${product.brand} ${product.name} · ${product.sku}`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {movements.length === 0 ? (
        <EmptyState title="No movements recorded yet" icon={<History />} />
      ) : (
        <ul className="divide-y divide-line">
          {movements.map((movement) => (
            <li key={movement.id} className="flex items-start gap-3 py-3">
              <Badge tone={MOVEMENT_META[movement.type].tone}>
                {MOVEMENT_META[movement.type].label}
              </Badge>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink">{movement.reason}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {formatDateTime(movement.createdAt)} · {movement.userName}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    movement.quantity > 0 ? 'text-ok' : 'text-danger',
                  )}
                >
                  {movement.quantity > 0 ? '+' : ''}
                  {movement.quantity}
                </p>
                <p className="text-xs tabular-nums text-subtle">
                  {movement.stockBefore} → {movement.stockAfter}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default InventoryPage;
