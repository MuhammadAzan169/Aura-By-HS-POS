import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as deleteService from '@/services/deleteService';
import { downloadExcel } from '@/utils/excel';
import { ImportModal } from '@/components/shared/ImportModal';
import * as importService from '@/services/importService';
import { useAuthStore } from '@/store/authStore';
import { FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, TrendingUp } from 'lucide-react';
import type { Product } from '@/types';
import { PRODUCT_CATEGORIES } from '@/types/product';
import { formatCurrency, formatPercent } from '@/utils/money';
import { matches } from '@/utils/text';
import { timestampedName } from '@/utils/export';
import { useDb } from '@/hooks/useDb';
import { useShopScope } from '@/hooks/useShopScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useTableState } from '@/hooks/useTableState';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { stockStatus } from '@/services/inventoryService';
import { productMargin } from '@/services/pricing';
import * as productService from '@/services/productService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterBar, FilterSelect } from '@/components/ui/FilterBar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, StockBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Switch } from '@/components/ui/Switch';
import { Download } from 'lucide-react';
import { ProductFormModal } from './ProductFormModal';

export function ProductsPage(): JSX.Element {
  const db = useDb();
  const { shopId, isAllShops } = useShopScope();
  const actor = useAuthStore((s) => s.user);
  const del = useDeleteAction();
  const [importOpen, setImportOpen] = useState(false);
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [stock, setStock] = useState<'all' | 'in-stock' | 'low' | 'out'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const debounced = useDebounce(search);

  const rows = useMemo(
    () =>
      db.products.filter((product) => {
        if (shopId !== null && product.shopId !== shopId) return false;
        if (!showInactive && !product.active) return false;
        if (category !== 'all' && product.category !== category) return false;
        if (stock !== 'all' && stockStatus(product) !== stock) return false;
        if (
          debounced &&
          !matches(product.name, debounced) &&
          !matches(product.brand, debounced) &&
          !matches(product.sku, debounced)
        ) {
          return false;
        }
        return true;
      }),
    [db.products, shopId, showInactive, category, stock, debounced],
  );

  const table = useTableState(rows, {
    initialPageSize: 12,
    initialSortKey: 'name',
    accessors: {
      name: (p) => p.name,
      brand: (p) => p.brand,
      category: (p) => p.category,
      cost: (p) => p.costPrice,
      price: (p) => p.sellingPrice,
      margin: (p) => productMargin(p.costPrice, p.sellingPrice).percent,
      stock: (p) => p.stock,
    },
  });

  const summary = useMemo(() => {
    const active = rows.filter((p) => p.active);
    return {
      total: active.length,
      retail: active.filter((p) => !p.backBarOnly).length,
      valueAtCost: active.reduce((sum, p) => sum + p.costPrice * p.stock, 0),
      valueAtRetail: active.reduce((sum, p) => sum + p.sellingPrice * p.stock, 0),
    };
  }, [rows]);

  const toggle = useAsyncAction(
    async (product: Product) => productService.setActive(product.id, !product.active),
    {
      successMessage: (updated) =>
        updated.active ? `${updated.name} is back on sale.` : `${updated.name} was discontinued.`,
    },
  );

  const onToggle = async (product: Product): Promise<void> => {
    if (product.active) {
      const result = await confirm({
        title: `Discontinue ${product.name}?`,
        description: 'It will disappear from the till. Stock figures and history are kept.',
        confirmLabel: 'Discontinue',
        tone: 'warning',
      });
      if (!result.confirmed) return;
    }
    await toggle.run(product);
  };

  const exportCsv = (): void => {
    void downloadExcel(
      table.sortedRows,
      [
        { header: 'Name', value: (p) => p.name },
        { header: 'Brand', value: (p) => p.brand },
        { header: 'SKU', value: (p) => p.sku },
        { header: 'Category', value: (p) => p.category },
        { header: 'Branch', value: (p) => db.shops.find((s) => s.id === p.shopId)?.name ?? '' },
        { header: 'Cost price', value: (p) => p.costPrice },
        { header: 'Selling price', value: (p) => p.sellingPrice },
        { header: 'Margin', value: (p) => productMargin(p.costPrice, p.sellingPrice).amount },
        { header: 'Stock', value: (p) => p.stock },
        { header: 'Minimum', value: (p) => p.minStock },
        { header: 'Supplier', value: (p) => p.supplier },
      ],
      timestampedName('products'),
    );
  };

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      mobilePrimary: true,
      render: (product) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
            {product.name}
            {!product.active && <Badge tone="neutral">Discontinued</Badge>}
            {product.backBarOnly && <Badge tone="info">Back bar</Badge>}
          </p>
          <p className="truncate text-xs text-muted">
            {product.brand} · {product.sku}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      hideBelowLg: true,
      render: (product) => <Badge tone="brand">{product.category}</Badge>,
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
      key: 'cost',
      header: 'Cost',
      sortable: true,
      align: 'right',
      hideBelowLg: true,
      render: (product) => (
        <span className="text-sm tabular-nums text-muted">{formatCurrency(product.costPrice)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Sells for',
      sortable: true,
      align: 'right',
      render: (product) => (
        <span className="text-sm font-medium tabular-nums text-ink">
          {formatCurrency(product.sellingPrice)}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      sortable: true,
      align: 'right',
      render: (product) => {
        const margin = productMargin(product.costPrice, product.sellingPrice);
        return (
          <div>
            <p className="text-sm font-medium tabular-nums text-ok">
              {formatCurrency(margin.amount)}
            </p>
            <p className="text-xs tabular-nums text-subtle">{formatPercent(margin.percent)}</p>
          </div>
        );
      },
    },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      align: 'right',
      render: (product) => (
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-medium tabular-nums text-ink">
            {product.stock} {product.unit}
            {product.stock === 1 ? '' : 's'}
          </span>
          <StockBadge status={stockStatus(product)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Retail stock and back-bar supplies, priced per branch."
        actions={
          <>
            <Button variant="outline" leftIcon={<Download />} onClick={exportCsv}>
              Export
            </Button>
            <Button
              variant="outline"
              leftIcon={<FileUp />}
              disabled={shopId === null}
              title={shopId === null ? 'Pick a single branch first' : undefined}
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
            <Button
              leftIcon={<Plus />}
              disabled={shopId === null}
              title={shopId === null ? 'Pick a single branch first' : undefined}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New product
            </Button>
          </>
        }
      />

      {shopId && actor && (
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          title="Import products"
          description="Load your product list and opening stock from Excel. Duplicate SKUs are skipped."
          columns={importService.PRODUCT_COLUMNS}
          templateName="products-import-template"
          onImport={(rows) => importService.importProducts(rows, shopId, actor)}
        />
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Products" value={summary.total} icon={<Package />} hint={`${summary.retail} sold at the till`} />
        <StatCard label="Stock at cost" value={formatCurrency(summary.valueAtCost, { compact: true })} />
        <StatCard label="Stock at retail" value={formatCurrency(summary.valueAtRetail, { compact: true })} />
        <StatCard
          label="Potential margin"
          value={formatCurrency(summary.valueAtRetail - summary.valueAtCost, { compact: true })}
          icon={<TrendingUp />}
          tone="ok"
        />
      </div>

      <Card className="mb-4">
        <FilterBar
          activeCount={
            (category !== 'all' ? 1 : 0) + (stock !== 'all' ? 1 : 0) + (debounced ? 1 : 0)
          }
          onClear={() => {
            setSearch('');
            setCategory('all');
            setStock('all');
          }}
          trailing={
            <Switch
              checked={showInactive}
              onChange={setShowInactive}
              label="Show discontinued"
              srLabel="Show discontinued products"
            />
          }
        >
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search name, brand or SKU…"
            className="w-full sm:w-72"
            label="Search products"
          />

          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'All categories' },
              ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />

          <FilterSelect
            label="Stock level"
            value={stock}
            onChange={setStock}
            options={[
              { value: 'all', label: 'Any stock level' },
              { value: 'in-stock', label: 'In stock' },
              { value: 'low', label: 'Low stock' },
              { value: 'out', label: 'Out of stock' },
            ]}
          />
        </FilterBar>
      </Card>

      <DataTable
        columns={columns}
        table={table}
        rowKey={(product) => product.id}
        onRowClick={(product) => {
          setEditing(product);
          setFormOpen(true);
        }}
        caption="Products"
        empty={{
          title: 'No products match',
          description: 'Try clearing the filters, or add a product to this branch.',
          icon: <Package />,
        }}
        rowActions={(product) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Pencil />}
              onClick={() => {
                setEditing(product);
                setFormOpen(true);
              }}
            >
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void onToggle(product)}>
              {product.active ? 'Discontinue' : 'Restore'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void del({
                  title: `Delete ${product.name}?`,
                  description: 'Only products that were never sold can be deleted. Its stock history goes too.',
                  run: () => deleteService.deleteProduct(product.id),
                  done: `${product.name} deleted.`,
                })
              }
            >
              Delete
            </Button>
          </div>
        )}
      />

      {shopId && (
        <ProductFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          shopId={editing?.shopId ?? shopId}
          product={editing}
        />
      )}
    </>
  );
}

export default ProductsPage;
