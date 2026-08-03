'use client';

import { useMemo, useState } from 'react';
import styles from './founder-dashboard.module.css';

type QualifiedRole = {
  id: string;
  company: string;
  title: string;
  location: string;
  fitScore: number;
  applicationUrl: string;
};

type Props = {
  actionToken: string;
  ownerEmail: string;
  roles: QualifiedRole[];
  tokenExpiresAt: string;
};

type ActionResult = {
  error?: string;
  message?: string;
  ok?: boolean;
};

export function QualifiedRoleControls({ actionToken, ownerEmail, roles, tokenExpiresAt }: Props) {
  const [selected, setSelected] = useState<string[]>(roles.map((role) => role.id));
  const [approved, setApproved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(roles.length ? `${roles.length} qualified roles selected.` : 'No qualified roles are currently available.');

  const selectedRoles = useMemo(() => roles.filter((role) => selected.includes(role.id)), [roles, selected]);

  function toggle(roleId: string) {
    setSelected((current) => current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]);
  }

  async function approveSelected() {
    if (busy || selectedRoles.length === 0) return;
    setBusy(true);
    let succeeded = 0;
    const failures: string[] = [];

    for (const role of selectedRoles) {
      if (approved.includes(role.id)) continue;
      setMessage(`Approving ${succeeded + 1} of ${selectedRoles.length}: ${role.company} — ${role.title}`);
      try {
        const response = await fetch('/api/career-os/approve-role', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            actionToken,
            actionTokenExpiresAt: tokenExpiresAt,
            employer: role.company,
            opportunityId: role.id,
            ownerEmail,
          }),
        });
        const result = await response.json().catch(() => ({})) as ActionResult;
        if (!response.ok || !result.ok) {
          failures.push(`${role.company}: ${result.error || result.message || `HTTP ${response.status}`}`);
          continue;
        }
        succeeded += 1;
        setApproved((current) => current.includes(role.id) ? current : [...current, role.id]);
      } catch (error) {
        failures.push(`${role.company}: ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }

    setMessage(failures.length
      ? `Approved ${succeeded}. ${failures.length} need attention: ${failures.join('; ')}`
      : `Approved ${succeeded} role${succeeded === 1 ? '' : 's'}. They are now in your application queue.`);
    setBusy(false);
  }

  const secondaryButton = `${styles.button} ${styles.secondary}`;
  const primaryButton = `${styles.button} ${styles.primary}`;

  return (
    <div aria-live="polite">
      <div className={styles.ctaRow}>
        <button className={secondaryButton} disabled={busy || roles.length === 0} onClick={() => setSelected(roles.map((role) => role.id))} type="button">Select All</button>
        <button className={secondaryButton} disabled={busy || selected.length === 0} onClick={() => setSelected([])} type="button">Clear Selection</button>
        <button className={primaryButton} disabled={busy || selectedRoles.length === 0} onClick={() => void approveSelected()} type="button">
          {busy ? 'Approving Selected Roles…' : `Approve ${selectedRoles.length} Selected Role${selectedRoles.length === 1 ? '' : 's'}`}
        </button>
      </div>

      <div className={styles.qualifiedRoleGrid}>
        {roles.map((role) => {
          const checked = selected.includes(role.id);
          const isApproved = approved.includes(role.id);
          return (
            <article className={`${styles.actionControl} ${checked ? styles.selected : ''}`} key={role.id}>
              <label className={styles.roleSelector}>
                <input checked={checked} disabled={busy || isApproved} onChange={() => toggle(role.id)} type="checkbox" />
                <span>
                  <strong>{role.company} — {role.title}</strong>
                  <small>{role.location} · {role.fitScore}% match</small>
                </span>
              </label>
              <div className={styles.ctaRow}>
                {role.applicationUrl ? <a className={secondaryButton} href={role.applicationUrl} rel="noreferrer" target="_blank">Open Application</a> : null}
                <span className={styles.roleStatus}>{isApproved ? 'Approved and queued' : checked ? 'Selected' : 'Not selected'}</span>
              </div>
            </article>
          );
        })}
      </div>
      <p><small>{message}</small></p>
    </div>
  );
}
