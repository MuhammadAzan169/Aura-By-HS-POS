import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import type { User } from '@/types';
import { formatDateTime } from '@/utils/date';
import { matches } from '@/utils/text';
import { useDb } from '@/hooks/useDb';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useConfirm } from '@/hooks/useConfirm';
import { useToast } from '@/hooks/useToast';
import * as logins from '@/services/loginService';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { Switch } from '@/components/ui/Switch';
import { EmptyState } from '@/components/ui/States';

/** Every person who can sign in, and the owner's controls over them. */
export function UsersPage(): JSX.Element {
  const db = useDb();
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', username: '', password: '', shopId: '', phone: '' });
  const [password, setPassword] = useState('');

  const rows = useMemo(
    () =>
      db.users
        .filter((u) => (!branch || u.shopId === branch) && (!search || matches(`${u.name} ${u.email}`, search)))
        .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1)),
    [db.users, search, branch],
  );
  const shopName = (id: string | null): string => (id ? (db.shops.find((s) => s.id === id)?.name ?? '—') : 'All branches');

  const create = useAsyncAction(async () => logins.createLogin(form), {
    successMessage: (u) => `Login "${logins.loginLabel(u.email)}" created. Give them the password in person.`,
    onSuccess: () => setCreating(false),
  });
  const saveEdit = useAsyncAction(
    async () => {
      if (!editing) throw new Error('Nothing to save.');
      return logins.updateLogin(editing.id, { name: form.name, phone: form.phone || null, shopId: editing.role === 'admin' ? null : form.shopId });
    },
    { successMessage: 'Login updated.', onSuccess: () => setEditing(null) },
  );
  const reset = useAsyncAction(
    async () => {
      if (!resetting) throw new Error('Pick a login.');
      await logins.setPassword(resetting.email, password);
    },
    { successMessage: 'Password changed.', onSuccess: () => setResetting(null) },
  );

  const toggle = async (u: User, active: boolean): Promise<void> => {
    if (!active) {
      const r = await confirm({
        title: `Switch off ${u.name}?`,
        description: 'They are signed out at their next action and cannot sign back in until you switch them on.',
        confirmLabel: 'Switch off',
        tone: 'danger',
      });
      if (!r.confirmed) return;
    }
    try {
      await logins.updateLogin(u.id, { active });
      toast.success(active ? `${u.name} can sign in again.` : `${u.name} can no longer sign in.`);
    } catch (error) {
      toast.fromError(error);
    }
  };

  const remove = async (u: User): Promise<void> => {
    const r = await confirm({
      title: `Delete the login "${logins.loginLabel(u.email)}"?`,
      description: 'The login is removed for good. Bills and bookings they made keep their name.',
      confirmLabel: 'Delete login',
      tone: 'danger',
      typeToConfirm: 'DELETE',
    });
    if (!r.confirmed) return;
    try {
      await logins.deleteLogin(u.id);
      toast.success('Login deleted.');
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <>
      <PageHeader
        title="Users & logins"
        description="Create a login for each person or till. Only you can set or change their passwords."
        actions={
          <Button
            leftIcon={<Plus />}
            disabled={db.shops.length === 0}
            onClick={() => {
              setForm({ name: '', username: '', password: '', shopId: db.shops[0]?.id ?? '', phone: '' });
              setCreating(true);
            }}
          >
            New login
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or username" />
        <Select
          aria-label="Branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          options={[{ value: '', label: 'All branches' }, ...db.shops.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </div>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={<UserCog />} title="No logins match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Username</th>
                  <th className="px-3 py-2.5 font-medium">Branch</th>
                  <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                  <th className="px-3 py-2.5 font-medium">Can sign in</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-2.5 text-ink">
                      {u.name}
                      {u.role === 'admin' && (
                        <Badge tone="brand" className="ml-2">
                          <ShieldCheck className="mr-1 inline h-3 w-3" aria-hidden />
                          Owner
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">{logins.loginLabel(u.email)}</td>
                    <td className="px-3 py-2.5 text-muted">{shopName(u.shopId)}</td>
                    <td className="px-3 py-2.5 text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                    <td className="px-3 py-2.5">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-subtle">Always</span>
                      ) : (
                        <Switch srLabel={`${u.name} can sign in`} checked={u.active} onChange={(v) => void toggle(u, v)} />
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil />}
                        onClick={() => {
                          setForm({ name: u.name, username: '', password: '', shopId: u.shopId ?? '', phone: u.phone ?? '' });
                          setEditing(u);
                        }}
                      >
                        Edit
                      </Button>
                      {u.role !== 'admin' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<KeyRound />}
                            onClick={() => {
                              setPassword('');
                              setResetting(u);
                            }}
                          >
                            Password
                          </Button>
                          <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={() => void remove(u)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New login"
        description="For a receptionist, manager or the branch till. They sign in with this username and password."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={create.pending} onClick={() => void create.run()}>
              Create login
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Username" placeholder="ayesha.gulberg" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label="Password" type="text" hint="At least 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="sm:col-span-2">
            <Select
              label="Branch"
              value={form.shopId}
              onChange={(e) => setForm({ ...form, shopId: e.target.value })}
              options={db.shops.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={saveEdit.pending} onClick={() => void saveEdit.run()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {editing?.role !== 'admin' && (
            <Select
              label="Branch"
              value={form.shopId}
              onChange={(e) => setForm({ ...form, shopId: e.target.value })}
              options={db.shops.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title={`New password for ${resetting?.name ?? ''}`}
        description="They use it from their next sign-in. Tell it to them in person, not by message."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button loading={reset.pending} disabled={password.length < 6} onClick={() => void reset.run()}>
              Save password
            </Button>
          </>
        }
      >
        <Input label="New password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 6 characters" />
      </Modal>
    </>
  );
}

export default UsersPage;
