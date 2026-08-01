'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type QualifiedRole = {
  id: string;
  company: string;
  title: string;
  location: string;
  fitScore: number;
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
  status?: string;
};

export function QualifiedRoleControls({ actionToken, ownerEmail, roles, tokenExpiresAt }: Props) {
  const [message, setMessage] = useState(roles.length ? 'Select one qualified role to approve and queue.' : 'No qualified roles are currently available for approval.');
  const [activeRoleId, setActiveRoleId] = useState('');
  const [approvedRoleId, setApprovedRoleId] = useState('');
  const router = useRouter();

  async function approve(role: QualifiedRole) {
    if (activeRoleId) return;

    setActiveRoleId(role.id);
    setApprovedRoleId('');
    setMessage(`Approving ${role.company} — ${role.title}...`);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

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
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as ActionResult;
      if (!response.ok || !result.ok) {
        setMessage(result.error || result.message || `Role approval failed with HTTP ${response.status}.`);
        return;
      }
      setApprovedRoleId(role.id);
      setMessage(result.message || 'Approved and queued. Click Run One Production Application to execute this role.');
      router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessage('Approval request timed out after 15 seconds. No role was queued. Review the Vercel function log for /api/career-os/approve-role, then retry.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Role approval failed before the server returned a response.');
      }
    } finally {
      window.clearTimeout(timeout);
      setActiveRoleId('');
    }
  }

  return (
    <div aria-live="polite">
      {roles.length > 0 ? (
        <div>
          {roles.map((role) => {
            const approving = activeRoleId === role.id;
            const approved = approvedRoleId === role.id;
            return (
              <article className="career-os-action-control" key={role.id}>
                <strong>{role.company} — {role.title}</strong>
                <p>{role.location || 'Location not published'} · Fit score {role.fitScore}</p>
                <button className="button primary" disabled={approving || approved} onClick={() => void approve(role)} type="button">
                  {approving ? 'Approving…' : approved ? 'Approved and queued' : 'Approve & Queue'}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
      <small>{message}</small>
    </div>
  );
}
