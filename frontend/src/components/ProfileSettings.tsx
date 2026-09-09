"use client";

import { CheckCircle2, KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { changePassword, updateCurrentUser } from "@/services/authApi";
import type { UserResponse } from "@/types/auth";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

const fieldClass = "mt-2 h-11 w-full rounded-xl border border-[var(--input-border)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)] disabled:bg-[var(--hover-bg)]";

export function ProfileSettings({ user, onUserUpdated }: { user: UserResponse; onUserUpdated: (user: UserResponse) => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
  }, [user]);

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    if (!name.trim()) return setProfileError("Name is required.");
    if (emailChanged && !currentPassword) return setProfileError("Enter your current password to change the email address.");

    setSavingProfile(true);
    try {
      const updated = await updateCurrentUser({
        name: name.trim(),
        email: email.trim(),
        ...(emailChanged ? { current_password: currentPassword } : {}),
      });
      setCurrentPassword("");
      setProfileSuccess("Profile saved.");
      onUserUpdated(updated);
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "Unable to save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (passwordNew !== passwordConfirm) return setPasswordError("New passwords do not match.");
    if (passwordCurrent === passwordNew) return setPasswordError("Choose a password different from your current password.");
    if (passwordNew.length < 12 || passwordNew.length > 128) return setPasswordError("Use 12–128 characters for the new password.");

    setSavingPassword(true);
    try {
      const updated = await changePassword({ current_password: passwordCurrent, new_password: passwordNew });
      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
      setPasswordSuccess("Password changed. Other signed-in sessions were revoked.");
      onUserUpdated(updated);
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : "Unable to change your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
      <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="mb-6 flex items-center gap-4 border-b border-[var(--border)] pb-6">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--active-bg)] text-[var(--primary)]" aria-label={`${user.role === "administrator" ? "Administrator" : "User"} avatar`} title={initials(user.name)}>
            {user.role === "administrator" ? <ShieldCheck className="h-8 w-8" /> : <UserRound className="h-8 w-8" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Account</p>
            <h2 className="mt-1 truncate font-display text-2xl font-bold text-[var(--text-primary)]">{user.name}</h2>
            <p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{user.role}</p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4" noValidate>
          <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[var(--primary)]" /><h3 className="font-bold text-[var(--text-primary)]">Profile information</h3></div>
          {profileError && <p role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{profileError}</p>}
          {profileSuccess && <p className="flex items-center gap-2 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-3 text-sm text-[var(--success-text)]"><CheckCircle2 className="h-4 w-4" />{profileSuccess}</p>}
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Name<input required minLength={1} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={fieldClass} /></label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={fieldClass} /></label>
          {emailChanged && <label className="block text-sm font-medium text-[var(--text-secondary)]">Current password <span className="font-normal text-[var(--text-muted)]">(required for email changes)</span><input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" className={fieldClass} /></label>}
          <button disabled={savingProfile} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"><Save className="h-4 w-4" />{savingProfile ? "Saving…" : "Save profile"}</button>
        </form>
      </section>

      <section className="h-fit rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-7">
        <div className="mb-5 flex items-center gap-2"><KeyRound className="h-4 w-4 text-[var(--primary)]" /><div><h3 className="font-bold text-[var(--text-primary)]">Change password</h3><p className="mt-1 text-xs text-[var(--text-muted)]">This revokes your other sessions.</p></div></div>
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          {passwordError && <p role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]">{passwordError}</p>}
          {passwordSuccess && <p className="rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-3 text-sm text-[var(--success-text)]">{passwordSuccess}</p>}
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Current password<input required type="password" value={passwordCurrent} onChange={(event) => setPasswordCurrent(event.target.value)} autoComplete="current-password" className={fieldClass} /></label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">New password<input required type="password" minLength={12} maxLength={128} value={passwordNew} onChange={(event) => setPasswordNew(event.target.value)} autoComplete="new-password" className={fieldClass} /></label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Confirm new password<input required type="password" minLength={12} maxLength={128} value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" className={fieldClass} /></label>
          <button disabled={savingPassword} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--primary)] px-5 text-sm font-bold text-[var(--primary)] hover:bg-[var(--subtle-teal)] disabled:opacity-60">{savingPassword ? "Changing…" : "Change password"}</button>
        </form>
      </section>
    </div>
  );
}
