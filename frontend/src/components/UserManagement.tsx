"use client";

import { KeyRound, Pencil, Plus, RefreshCw, Shield, UserCheck, UserX, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { createUser, listUsers, resetUserPassword, updateUser } from "@/services/authApi";
import type { UserResponse, UserRole } from "@/types/auth";

const inputClass = "mt-2 h-11 w-full rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)] disabled:cursor-not-allowed disabled:bg-[var(--hover-bg)] disabled:text-[var(--text-muted)]";

function Dialog({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--panel-dark)]/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">User administration</p><h2 className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">{title}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p></div><button onClick={onClose} aria-label="Close dialog" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"><X className="h-5 w-5" /></button></div>
        {children}
      </section>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{message}</p> : null;
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (user: UserResponse) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 12 || password.length > 128) return setError("Use 12–128 characters for the temporary password.");
    setBusy(true);
    try {
      onCreated(await createUser({ name: name.trim(), email: email.trim(), role, password }));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Create user" description="Set an initial password. The user must replace it after signing in." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Name<input required minLength={1} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Role<select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className={inputClass}><option value="user">User</option><option value="administrator">Administrator</option></select></label>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Temporary password<input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} /></label>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Confirm temporary password<input required type="password" minLength={12} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" className={inputClass} /></label>
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button><button disabled={busy} className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60">{busy ? "Creating…" : "Create user"}</button></div>
      </form>
    </Dialog>
  );
}

function EditUserDialog({ currentUserId, user, onClose, onUpdated }: { currentUserId: number; user: UserResponse; onClose: () => void; onUpdated: (user: UserResponse) => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === currentUserId;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onUpdated(await updateUser(user.id, { name: name.trim(), email: email.trim(), role, is_active: isActive }));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Edit user" description="Update account details, access level and sign-in status." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Name<input required minLength={1} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Role<select disabled={isSelf} value={role} onChange={(event) => setRole(event.target.value as UserRole)} className={inputClass}><option value="user">User</option><option value="administrator">Administrator</option></select></label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Status<select disabled={isSelf} value={isActive ? "active" : "inactive"} onChange={(event) => setIsActive(event.target.value === "active")} className={inputClass}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        </div>
        {isSelf && <p className="text-xs leading-5 text-[var(--text-muted)]">You cannot change your own role or deactivate your own account.</p>}
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button><button disabled={busy} className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60">{busy ? "Saving…" : "Save changes"}</button></div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose, onReset }: { user: UserResponse; onClose: () => void; onReset: (id: number, password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 12 || password.length > 128) return setError("Use 12–128 characters for the temporary password.");
    setBusy(true);
    try {
      await onReset(user.id, password);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Reset password" description={`${user.name} will be signed out everywhere and must replace this temporary password.`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <label className="block text-sm font-medium text-[var(--text-secondary)]">New temporary password<input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} /></label>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">Confirm password<input required type="password" minLength={12} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" className={inputClass} /></label>
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">Cancel</button><button disabled={busy} className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60">{busy ? "Resetting…" : "Reset password"}</button></div>
      </form>
    </Dialog>
  );
}

export function UserManagement({ currentUser, searchQuery = "", onCurrentUserUpdated }: { currentUser: UserResponse; searchQuery?: string; onCurrentUserUpdated: (user: UserResponse) => void }) {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<UserResponse | null>(null);
  const [resetting, setResetting] = useState<UserResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function replaceUser(updated: UserResponse) {
    setUsers((current) => current.map((user) => user.id === updated.id ? updated : user));
    if (updated.id === currentUser.id) onCurrentUserUpdated(updated);
    setSuccess(`${updated.name}'s account was updated.`);
  }

  async function resetPassword(id: number, password: string) {
    await resetUserPassword(id, password);
    setUsers((current) => current.map((user) => user.id === id ? { ...user, must_change_password: true } : user));
    setSuccess("Temporary password set. The user must change it at next sign-in.");
  }

  const activeCount = users.filter((user) => user.is_active).length;
  const administratorCount = users.filter((user) => user.role === "administrator" && user.is_active).length;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredUsers = users.filter((user) => !normalizedQuery || [user.name, user.email, user.role, user.is_active ? "active" : "inactive"].some((value) => String(value).toLowerCase().includes(normalizedQuery)));

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Administration</p><h2 className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)]">Permissions & Roles</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Create accounts and control access to PowerManage.</p></div>
        <button onClick={() => { setSuccess(null); setShowCreate(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white hover:bg-[var(--primary-hover)]"><Plus className="h-4 w-4" />Create user</button>
      </div>

      <div className="my-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--success-bg)] p-4"><p className="text-xs text-[var(--text-secondary)]">Total accounts</p><p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{users.length}</p></div>
        <div className="rounded-xl bg-[var(--success-bg)] p-4"><p className="text-xs text-[var(--text-secondary)]">Active accounts</p><p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{activeCount}</p></div>
        <div className="rounded-xl bg-[var(--success-bg)] p-4"><p className="text-xs text-[var(--text-secondary)]">Administrators</p><p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{administratorCount}</p></div>
      </div>

      {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]"><span>{error}</span><button onClick={() => void load()} className="inline-flex items-center gap-1 font-bold"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>}
      {success && <p className="mb-4 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-3 text-sm text-[var(--success-text)]">{success}</p>}

      {loading ? (
        <div className="grid min-h-48 place-items-center text-sm text-[var(--text-muted)]">Loading users…</div>
      ) : users.length === 0 ? (
        <div className="grid min-h-48 place-items-center text-sm text-[var(--text-muted)]">No user accounts found.</div>
      ) : filteredUsers.length === 0 ? (
        <div className="grid min-h-48 place-items-center text-sm text-[var(--text-muted)]">No results found for &apos;{searchQuery}&apos;.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead><tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]"><th className="px-3 py-3">Account</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Password</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
            <tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-3 py-4"><p className="text-sm font-bold text-[var(--text-primary)]">{user.name}{user.id === currentUser.id && <span className="ml-2 rounded-full bg-[var(--hover-bg)] px-2 py-0.5 text-[9px] uppercase text-[var(--text-muted)]">You</span>}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{user.email}</p></td>
              <td className="px-3 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--subtle-teal)] px-2.5 py-1 text-[10px] font-bold capitalize text-[var(--primary)]"><Shield className="h-3 w-3" />{user.role}</span></td>
              <td className="px-3 py-4"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${user.is_active ? "text-[var(--success-text)]" : "text-[var(--text-muted)]"}`}>{user.is_active ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}{user.is_active ? "Active" : "Inactive"}</span></td>
              <td className="px-3 py-4"><span className={`text-xs ${user.must_change_password ? "font-semibold text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>{user.must_change_password ? "Change required" : "Set"}</span></td>
              <td className="px-3 py-4"><div className="flex justify-end gap-2"><button onClick={() => { setSuccess(null); setEditing(user); }} title="Edit user" aria-label={`Edit ${user.name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => { setSuccess(null); setResetting(user); }} title="Reset password" aria-label={`Reset ${user.name}'s password`} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"><KeyRound className="h-3.5 w-3.5" /></button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateUserDialog onClose={() => setShowCreate(false)} onCreated={(created) => { setUsers((current) => [...current, created]); setSuccess(`${created.name}'s account was created.`); }} />}
      {editing && <EditUserDialog currentUserId={currentUser.id} user={editing} onClose={() => setEditing(null)} onUpdated={replaceUser} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onReset={resetPassword} />}
    </section>
  );
}
