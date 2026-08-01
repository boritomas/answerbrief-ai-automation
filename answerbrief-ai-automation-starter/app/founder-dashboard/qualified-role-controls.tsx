'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function approve(role: QualifiedRole) {
    setActiveRoleId(role.id);
    setApprovedRoleId('');
    startTransition(async () => {
      setMessage(`Approving ${role.company} — ${role.title}...`);
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
          setMessage(result.error || result.message || `Role approval failed with HTTP ${response.status}.`);
          return;
        }
        setApprovedRoleId(role.id);
        setMessage(result.message || 'Approved and queued. Click Run One Production Application to execute this role.');
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Role approval failed before the server returned a response.');
      } finally {
        setActiveRoleId('');
      }
    });
  }

  return (
    <div aria-live="polite">
      {roles.length > 0 ? (
        <div>
          {roles.map((role) => {
            const approving = isPending && activeRoleId === role.id;
            const approved = approvedRoleId === role.id;
            return (
              <article className="career-os-action-control" key={role.id}>
                <strong>{role.company} — {role.title}</strong>
                <p>{role.location || 'Location not published'} · Fit score {role.fitScore}</p>
                <button className="button primary" disabled={isPending || approved} onClick={() => approve(role)} type="button">
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
