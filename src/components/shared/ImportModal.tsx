import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { downloadTemplate, readSpreadsheet, type ImportedRow } from '@/utils/excel';

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  example: string;
}

export interface ImportResult {
  created: number;
  errors: string[];
}

export interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  columns: ImportColumn[];
  templateName: string;
  onImport: (rows: ImportedRow[]) => Promise<ImportResult>;
}

/**
 * Bulk import from Excel or CSV: download the template, fill it in, upload.
 * Every row is validated by the same service the form uses, and rows that
 * fail are listed with the reason instead of stopping the whole import.
 */
export function ImportModal({
  open,
  onClose,
  title,
  description,
  columns,
  templateName,
  onImport,
}: ImportModalProps): JSX.Element | null {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setRows(null);
    setFileName('');
    setResult(null);
    setError(null);
    if (input.current) input.current.value = '';
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const pick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    reset();
    setFileName(file.name);
    try {
      const parsed = await readSpreadsheet(
        file,
        columns.flatMap((c) => [c.key, c.label]),
      );
      // Labels and keys both map onto the key.
      const mapped = parsed.map((r) => {
        const out: ImportedRow = {};
        for (const c of columns) out[c.key] = r[c.key] ?? r[c.label] ?? '';
        return out;
      });
      if (!mapped.length) throw new Error('No rows found. Keep the header row from the template.');
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read.');
    }
  };

  const run = async (): Promise<void> => {
    if (!rows) return;
    setBusy(true);
    try {
      setResult(await onImport(rows));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="md"
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button leftIcon={<Upload />} disabled={!rows} loading={busy} onClick={() => void run()}>
              Import {rows ? `${rows.length} rows` : ''}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
          <li>
            <button
              type="button"
              className="font-medium text-brand hover:underline"
              onClick={() =>
                void downloadTemplate(
                  columns.map((c) => c.label),
                  columns.map((c) => c.example),
                  templateName,
                )
              }
            >
              Download the Excel template
            </button>{' '}
            and fill in one row per record (delete the example row).
          </li>
          <li>Upload it below — .xlsx or .csv.</li>
        </ol>

        <p className="text-xs text-subtle">
          Columns:{' '}
          {columns.map((c, i) => (
            <span key={c.key}>
              {i > 0 && ', '}
              <span className={c.required ? 'font-medium text-ink' : undefined}>
                {c.label}
                {c.required ? '*' : ''}
              </span>
            </span>
          ))}
        </p>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-center hover:border-brand">
          <FileSpreadsheet className="h-7 w-7 text-brand" aria-hidden />
          <span className="text-[13px] font-medium text-ink">{fileName || 'Choose an Excel or CSV file'}</span>
          {rows && <span className="text-xs text-muted">{rows.length} rows ready to import</span>}
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        )}

        {result && (
          <div role="status" className="space-y-2 rounded-xl border border-line p-3.5 text-[13px]">
            <p className="font-medium text-ink">
              {result.created} imported{result.errors.length ? `, ${result.errors.length} skipped` : ''}.
            </p>
            {result.errors.length > 0 && (
              <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-danger">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
