'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './founder-dashboard.module.css';

export type EmployerAuthExceptionView = {
  applicationCount: number;
  applicationIds: string[];
  employer: string;
  exactAction: string;
  guidance?: { reason: string; suggestedActions: string[] };
  lastResetRequestedAt: string | null;
  lastSuccessfulLogin: string | null;
  rejectionClassification?: string | null;
  status: string;
  tenant: string;
};

type Props = {
  actionToken: string;
  exceptions: EmployerAuthExceptionView[];
  keychainWriteAvailable: boolean;
  ownerEmail: string;
  tokenExpiresAt: string;
};

type ActionResult = {
  error?: string;
  errors?: string[];
  ok?: boolean;
  reason?: string;
  resumed?: number;
  status?: string;
};

const STATUS_LABEL: Record<string, string> = {
  authenticated: 'Authenticated',
  auth_recovered: 'Authenticated',
  credential_invalid: 'Credential invalid',
  credential_update_required: 'Needs new credential',
  manual_auth_required: 'Manual recovery required',
  password_reset_pending: 'Password reset pending',
  verifying: 'Verifying…',
};

export function EmployerAuthControls({ actionToken, exceptions, keychainWriteAvailable, ownerEmail, tokenExpiresAt }: Props) {
  const router = useRouter();
  const [openEmployer, setOpenEmployer] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [accountEmail, setAccountEmail] = useState(ownerEmail);
  const [busyEmployer, setBusyEmployer] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  if (!exceptions.length) return null;

  async function callAction(body: Record<string, unknown>) {
    const response = await fetch('/api/career-os/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actionToken,
        actionTokenExpiresAt: tokenExpiresAt,
        ownerEmail,
        ...body,
      }),
    });
    return (await response.json().catch(() => ({}))) as ActionResult;
  }

  async function submitCredential(exception: EmployerAuthExceptionView) {
    if (!password) return;
    setBusyEmployer(exception.tenant);
    setMessages((current) => ({ ...current, [exception.tenant]: 'Storing credential in the Keychain and verifying against Workday…' }));
    const result = await callAction({
      action: 'update_employer_credential',
      accountEmail,
      employer: exception.employer,
      password,
      tenant: exception.tenant,
    });
    setPassword('');
    if (!result.ok) {
      setMessages((current) => ({ ...current, [exception.tenant]: result.reason || result.error || 'Credential update failed.' }));
    } else {
      setMessages((current) => ({
        ...current,
        [exception.tenant]: `Verified. Resumed ${result.resumed || 0} application${result.resumed === 1 ? '' : 's'} for ${exception.employer}.${result.errors?.length ? ` (${result.errors.length} could not resume automatically.)` : ''}`,
      }));
      setOpenEmployer(null);
      router.refresh();
    }
    setBusyEmployer(null);
  }

  async function verifyLogin(exception: EmployerAuthExceptionView) {
    setBusyEmployer(exception.tenant);
    setMessages((current) => ({ ...current, [exception.tenant]: 'Checking the stored credential against Workday…' }));
    const result = await callAction({
      action: 'verify_employer_login',
      accountEmail: ownerEmail,
      applicationId: exception.applicationIds[0],
    });
    setMessages((current) => ({ ...current, [exception.tenant]: result.reason || (result.ok ? 'Credential still works.' : 'Credential no longer works.') }));
    setBusyEmployer(null);
  }

  async function resumeApplications(exception: EmployerAuthExceptionView) {
    setBusyEmployer(exception.tenant);
    setMessages((current) => ({ ...current, [exception.tenant]: 'Resuming applications…' }));
    const result = await callAction({ action: 'resume_employer_applications', employer: exception.employer });
    setMessages((current) => ({ ...current, [exception.tenant]: `Resumed ${result.resumed || 0} application${result.resumed === 1 ? '' : 's'}.` }));
    router.refresh();
    setBusyEmployer(null);
  }

  return (
    <section className={styles.panel} aria-label="Employer authentication">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Waiting on Tomas</p>
          <h2>Employer authentication</h2>
          <p>One credential update per employer resumes every application waiting on it. No Terminal, no Supabase.</p>
        </div>
        <span className={styles.badge}>{exceptions.length} employer{exceptions.length === 1 ? '' : 's'}</span>
      </div>
      {!keychainWriteAvailable ? (
        <p><small>Credential updates only work when this dashboard is open on the Mac running Career OS locally (http://127.0.0.1:3210) — the Keychain isn&apos;t reachable from this deployment.</small></p>
      ) : null}
      <div className={styles.qualifiedRoleGrid}>
        {exceptions.map((exception) => {
          const busy = busyEmployer === exception.tenant;
          const isOpen = openEmployer === exception.tenant;
          return (
            <article className={styles.actionControl} key={exception.tenant}>
              <strong>{exception.employer}</strong>
              <small>{exception.tenant} · {exception.applicationCount} application{exception.applicationCount === 1 ? '' : 's'} waiting</small>
              <p><strong>{exception.guidance?.reason || STATUS_LABEL[exception.status] || exception.status}</strong></p>
              {exception.guidance?.suggestedActions.length ? (
                <p><small>Suggested: {exception.guidance.suggestedActions.join(' · ')}</small></p>
              ) : null}
              {exception.lastResetRequestedAt ? <p><small>Last reset requested: {exception.lastResetRequestedAt}</small></p> : null}
              {exception.lastSuccessfulLogin ? <p><small>Last successful login: {exception.lastSuccessfulLogin}</small></p> : null}
              <p><small>{exception.exactAction}</small></p>

              <div className={styles.ctaRow}>
                <button className={`${styles.button} ${styles.primary}`} disabled={!keychainWriteAvailable || busy} onClick={() => setOpenEmployer(isOpen ? null : exception.tenant)} type="button">
                  Update Credential
                </button>
                <button className={`${styles.button} ${styles.secondary}`} disabled={!keychainWriteAvailable || busy} onClick={() => void verifyLogin(exception)} type="button">
                  Verify Login
                </button>
                <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void resumeApplications(exception)} type="button">
                  Resume Applications
                </button>
              </div>

              {isOpen ? (
                <form
                  className={styles.ctaRow}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitCredential(exception);
                  }}
                >
                  <input
                    aria-label={`${exception.employer} account email`}
                    onChange={(event) => setAccountEmail(event.target.value)}
                    placeholder="Account email"
                    type="email"
                    value={accountEmail}
                  />
                  <input
                    aria-label={`${exception.employer} new password`}
                    autoComplete="new-password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="New Workday password"
                    type="password"
                    value={password}
                  />
                  <button className={`${styles.button} ${styles.primary}`} disabled={busy || !password} type="submit">
                    {busy ? 'Verifying…' : 'Save & Verify'}
                  </button>
                </form>
              ) : null}

              {messages[exception.tenant] ? <p><small>{messages[exception.tenant]}</small></p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
