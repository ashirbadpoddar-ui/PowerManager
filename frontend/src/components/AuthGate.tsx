"use client";

import { AlertCircle, Eye, EyeOff, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { AUTH_EXPIRED_EVENT, ApiError } from "@/services/apiClient";
import {
  bootstrapAdministrator,
  changePassword,
  getBootstrapStatus,
  getCurrentUser,
  login,
  logout,
} from "@/services/authApi";
import type { UserResponse } from "@/types/auth";

const LEGACY_PROFILE_KEY = "powermanage-profile-name";

export type AuthSession = {
  user: UserResponse;
  setUser: (user: UserResponse) => void;
  signOut: () => Promise<void>;
};

type GateMode = "loading" | "bootstrap" | "login" | "authenticated" | "error";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength = 1,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block text-sm font-semibold text-[var(--text-secondary)]">
      {label}
      <span className="relative mt-2 block">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          minLength={minLength}
          maxLength={128}
          required
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-xl border border-[var(--input-border)] bg-white px-4 pr-12 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[var(--text-muted)] hover:text-[var(--primary)]"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--text-primary)] lg:grid-cols-[minmax(320px,0.9fr)_minmax(440px,1.1fr)] lg:p-6">
      <section className="hidden overflow-hidden rounded-xl bg-[var(--panel-dark)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary)]"><Zap className="h-6 w-6" /></span>
          <div><p className="font-display text-xl font-bold">PowerManage</p><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--on-dark-muted)]">Electricity operations</p></div>
        </div>
        <div className="max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[var(--on-dark-muted)]">A secure workspace</p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-tight">Meter readings, tariffs and billing in one place.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/65">Account access is stored and managed by your PowerManage server.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/70"><ShieldCheck className="h-5 w-5 text-[var(--on-dark-muted)]" />Protected account sessions</div>
      </section>
      <section className="flex items-center justify-center py-6 lg:py-0">
        <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)] sm:p-9">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white"><Zap className="h-5 w-5" /></span>
            <p className="font-display text-lg font-bold">PowerManage</p>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">{eyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </main>
  );
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--error)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>;
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button disabled={busy} className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">{busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Submitting" /> : children}</button>;
}

function BootstrapForm({ defaultName, onSuccess }: { defaultName: string; onSuccess: (user: UserResponse) => void }) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const user = await bootstrapAdministrator({ setup_token: setupToken, name: name.trim(), email: email.trim(), password });
      window.localStorage.removeItem(LEGACY_PROFILE_KEY);
      onSuccess(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the administrator account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Initial setup" title="Create the first administrator" description="Use the bootstrap token configured on the server. This setup is available only once.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNotice message={error} />
        <label className="block text-sm font-semibold text-[var(--text-secondary)]">Full name<input required minLength={1} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[var(--input-border)] px-4 text-sm outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]" /></label>
        <label className="block text-sm font-semibold text-[var(--text-secondary)]">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[var(--input-border)] px-4 text-sm outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]" /></label>
        <PasswordField id="setup-token" label="Bootstrap token" value={setupToken} onChange={setSetupToken} autoComplete="off" />
        <PasswordField id="bootstrap-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} />
        <PasswordField id="bootstrap-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={12} />
        <p className="text-xs text-[var(--text-muted)]">Use 12–128 characters.</p>
        <SubmitButton busy={busy}>Create administrator</SubmitButton>
      </form>
    </AuthShell>
  );
}

function LoginForm({ notice, onSuccess }: { notice: string | null; onSuccess: (user: UserResponse) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login({ email: email.trim(), password });
      window.localStorage.removeItem(LEGACY_PROFILE_KEY);
      onSuccess(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Account access" title="Welcome back" description="Sign in with your PowerManage account to continue.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNotice message={notice} />
        <ErrorNotice message={error} />
        <label className="block text-sm font-semibold text-[var(--text-secondary)]">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[var(--input-border)] px-4 text-sm outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--active-bg)]" /></label>
        <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}

function ForcedPasswordChange({ user, onSuccess }: { user: UserResponse; onSuccess: (user: UserResponse) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) return setError("New passwords do not match.");
    if (currentPassword === newPassword) return setError("Choose a password different from your temporary password.");
    setBusy(true);
    try {
      onSuccess(await changePassword({ current_password: currentPassword, new_password: newPassword }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Security required" title="Choose a new password" description={`Hello ${user.name}. Replace the temporary password before using PowerManage.`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorNotice message={error} />
        <PasswordField id="forced-current" label="Temporary password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordField id="forced-new" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={12} />
        <PasswordField id="forced-confirm" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" minLength={12} />
        <p className="text-xs text-[var(--text-muted)]">Use 12–128 characters.</p>
        <SubmitButton busy={busy}>Save new password</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function AuthGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const [mode, setMode] = useState<GateMode>("loading");
  const [user, setUser] = useState<UserResponse | null>(null);
  const [defaultName, setDefaultName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMode("loading");
    setFatalError(null);
    try {
      const status = await getBootstrapStatus();
      if (status.setup_required) {
        setDefaultName(window.localStorage.getItem(LEGACY_PROFILE_KEY)?.trim() ?? "");
        setUser(null);
        setMode("bootstrap");
        return;
      }

      try {
        const currentUser = await getCurrentUser(false);
        setUser(currentUser);
        setMode("authenticated");
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          setUser(null);
          setMode("login");
          return;
        }
        throw caught;
      }
    } catch (caught) {
      setFatalError(caught instanceof Error ? caught.message : "Unable to load PowerManage.");
      setMode("error");
    }
  }, []);

  useEffect(() => {
    void load();
    const handleExpired = () => {
      setUser(null);
      setNotice("Your session has expired. Sign in again to continue.");
      setMode("login");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, [load]);

  const acceptUser = (nextUser: UserResponse) => {
    setNotice(null);
    setUser(nextUser);
    setMode("authenticated");
  };

  const signOut = async () => {
    try {
      await logout();
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 401)) throw caught;
    } finally {
      setUser(null);
      setNotice("You have signed out.");
      setMode("login");
    }
  };

  if (mode === "loading") {
    return <main className="grid min-h-screen place-items-center bg-[var(--background)] text-[var(--text-primary)]"><div className="text-center"><span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" /><p className="mt-4 text-sm font-semibold">Loading your workspace…</p></div></main>;
  }

  if (mode === "error") {
    return <AuthShell eyebrow="Connection problem" title="PowerManage is unavailable" description={fatalError ?? "The application could not be loaded."}><button onClick={() => void load()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-bold text-white hover:bg-[var(--primary-hover)]"><RefreshCw className="h-4 w-4" />Try again</button></AuthShell>;
  }

  if (mode === "bootstrap") return <BootstrapForm defaultName={defaultName} onSuccess={acceptUser} />;
  if (mode === "login") return <LoginForm notice={notice} onSuccess={acceptUser} />;
  if (!user) return null;
  if (user.must_change_password) return <ForcedPasswordChange user={user} onSuccess={acceptUser} />;

  return <>{children({ user, setUser: acceptUser, signOut })}</>;
}
