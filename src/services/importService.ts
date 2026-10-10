import type { ImportedRow } from '@/utils/excel';
import type { ProductCategory, User } from '@/types';
import { PRODUCT_CATEGORIES } from '@/types/product';
import * as customerService from './customerService';
import * as productService from './productService';
import * as catalogService from './catalogService';
import { read } from './db';

/**
 * Bulk imports. Each row goes through the very same service call the form
 * uses, so an import can never create a record the form would have refused.
 */

export interface ImportOutcome {
  created: number;
  errors: string[];
}

const num = (v: string | undefined, fallback = 0): number => {
  if (v == null || v.trim() === '') return fallback;
  const n = Number(v.replace(/[,\s]|rs\.?|pkr/gi, ''));
  return Number.isFinite(n) ? n : NaN;
};

async function each(
  rows: ImportedRow[],
  label: (row: ImportedRow) => string,
  task: (row: ImportedRow) => Promise<unknown>,
): Promise<ImportOutcome> {
  const out: ImportOutcome = { created: 0, errors: [] };
  for (const [i, row] of rows.entries()) {
    try {
      await task(row);
      out.created += 1;
    } catch (error) {
      out.errors.push(
        `Row ${i + 2} (${label(row) || 'blank'}): ${error instanceof Error ? error.message : 'could not be imported'}`,
      );
    }
  }
  return out;
}

export const CUSTOMER_COLUMNS = [
  { key: 'name', label: 'Name', required: true, example: 'Ayesha Khan' },
  { key: 'phone', label: 'Phone', required: true, example: '03001234567' },
  { key: 'email', label: 'Email', example: 'ayesha@gmail.com' },
  { key: 'gender', label: 'Gender', example: 'female' },
  { key: 'sensitivities', label: 'Allergies', example: '' },
  { key: 'notes', label: 'Notes', example: 'Prefers evening slots' },
];

export function importCustomers(rows: ImportedRow[], shopId: string): Promise<ImportOutcome> {
  return each(rows, (r) => r.name ?? '', async (r) => {
    if (!r.name) throw new Error('Name is required.');
    if (!r.phone) throw new Error('Phone is required.');
    const g = (r.gender ?? '').toLowerCase();
    const gender = g.startsWith('f') ? 'female' : g.startsWith('m') ? 'male' : g ? 'other' : 'unspecified';
    await customerService.create({
      shopId,
      name: r.name,
      phone: r.phone,
      email: r.email || null,
      gender,
      preferredStaffId: null,
      preferredServiceIds: [],
      sensitivities: r.sensitivities ?? '',
      notes: r.notes ?? '',
    });
  });
}

export const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Name', required: true, example: "L'Oreal Shampoo 500ml" },
  { key: 'brand', label: 'Brand', example: "L'Oreal" },
  { key: 'category', label: 'Category', example: 'Hair Care' },
  { key: 'sku', label: 'SKU', required: true, example: 'LOR-SH-500' },
  { key: 'costPrice', label: 'Cost price', required: true, example: '1800' },
  { key: 'sellingPrice', label: 'Selling price', required: true, example: '2500' },
  { key: 'stock', label: 'Opening stock', example: '12' },
  { key: 'minStock', label: 'Minimum stock', example: '3' },
  { key: 'unit', label: 'Unit', example: 'bottle' },
  { key: 'supplier', label: 'Supplier', example: 'Hair Pro Traders' },
  { key: 'backBarOnly', label: 'Salon use only', example: 'no' },
];

export function importProducts(rows: ImportedRow[], shopId: string, actor: User): Promise<ImportOutcome> {
  return each(rows, (r) => r.name ?? '', async (r) => {
    const cost = num(r.costPrice);
    const sell = num(r.sellingPrice);
    const stock = num(r.stock);
    const min = num(r.minStock);
    if ([cost, sell, stock, min].some(Number.isNaN)) throw new Error('Prices and stock must be numbers.');
    const category =
      PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === (r.category ?? '').toLowerCase()) ??
      ('Consumables' as ProductCategory);
    await productService.create(
      {
        shopId,
        name: r.name ?? '',
        brand: r.brand ?? '',
        category,
        sku: r.sku ?? '',
        costPrice: cost,
        sellingPrice: sell,
        stock,
        minStock: min,
        unit: r.unit || 'piece',
        supplier: r.supplier ?? '',
        backBarOnly: /^(y|yes|true|1)$/i.test(r.backBarOnly ?? ''),
        imageUrl: null,
      },
      actor,
    );
  });
}

export const SERVICE_COLUMNS = [
  { key: 'name', label: 'Name', required: true, example: 'Party Make-up' },
  { key: 'category', label: 'Category', required: true, example: 'Make-up' },
  { key: 'price', label: 'Price', required: true, example: '8000' },
  { key: 'durationMin', label: 'Duration (minutes)', required: true, example: '90' },
  { key: 'discountPct', label: 'Discount %', example: '0' },
  { key: 'description', label: 'Description', example: 'Full glam with lashes' },
];

/** Categories that do not exist yet are created on the way. */
export function importServices(rows: ImportedRow[]): Promise<ImportOutcome> {
  return each(rows, (r) => r.name ?? '', async (r) => {
    if (!r.name) throw new Error('Name is required.');
    const price = num(r.price, NaN);
    const duration = num(r.durationMin, NaN);
    const discount = num(r.discountPct);
    if (!(price >= 0)) throw new Error('Price must be a number.');
    if (!(duration > 0)) throw new Error('Duration must be a number of minutes.');
    if (!(discount >= 0 && discount <= 100)) throw new Error('Discount must be between 0 and 100.');
    const catName = (r.category ?? '').trim();
    if (!catName) throw new Error('Category is required.');
    let category = read().serviceCategories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (!category) {
      category = await catalogService.createCategory({ name: catName, description: '', icon: 'sparkles' });
    }
    await catalogService.createService({
      name: r.name,
      categoryId: category.id,
      description: r.description ?? '',
      durationMin: Math.round(duration),
      price,
      discountPct: discount,
      imageUrl: null,
    });
  });
}
