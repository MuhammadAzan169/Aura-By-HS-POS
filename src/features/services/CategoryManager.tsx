import { useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/hooks/useToast';
import { useDeleteAction } from '@/hooks/useDeleteAction';
import * as catalogService from '@/services/catalogService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';

/** Add, rename, switch off and delete the service menu's categories. */
export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const db = useDb();
  const toast = useToast();
  const del = useDeleteAction();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const cats = [...db.serviceCategories].sort((a, b) => a.sortOrder - b.sortOrder);

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<void> => {
    try {
      await fn();
      toast.success(ok);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Service categories" description="Group the menu — Hair, Make-up, Bridal, Nails…" size="md"
      footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void run(() => catalogService.createCategory({ name, description: '', icon: 'sparkles' }), `${name} added.`).then(() => setName(''));
          }}
        >
          <Input label="New category" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridal" />
          <Button type="submit" leftIcon={<Plus />} disabled={!name.trim()}>
            Add
          </Button>
        </form>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {cats.map((c) => {
            const count = db.services.filter((s) => s.categoryId === c.id).length;
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editing === c.id ? (
                  <>
                    <Input aria-label="Category name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Button
                      size="sm"
                      leftIcon={<Check />}
                      onClick={() =>
                        void run(() => catalogService.updateCategory(c.id, { name: editName, description: c.description, icon: c.icon }), 'Renamed.').then(() => setEditing(null))
                      }
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-ink">
                      {c.name} <span className="text-xs text-subtle">· {count} services</span>
                    </span>
                    <Switch srLabel={`${c.name} shown`} checked={c.active} onChange={(v) => void run(() => catalogService.setCategoryActive(c.id, v), v ? 'Shown.' : 'Hidden.')} />
                    <Button variant="ghost" size="sm" leftIcon={<Pencil />} onClick={() => { setEditing(c.id); setEditName(c.name); }}>
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 />}
                      onClick={() => void del({ title: `Delete ${c.name}?`, run: () => catalogService.deleteCategory(c.id), done: `${c.name} deleted.` })}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </li>
            );
          })}
          {cats.length === 0 && <li className="px-3 py-4 text-sm text-muted">No categories yet.</li>}
        </ul>
      </div>
    </Modal>
  );
}
