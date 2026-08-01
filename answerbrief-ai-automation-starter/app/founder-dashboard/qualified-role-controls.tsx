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
};

export function QualifiedRoleControls({ actionToken, ownerEmail, roles, tokenExpiresAt }: Props) {
  const [message, setMessage] = useState(roles.length ? 'Select one qualified role to approve and queue.' : 'No qualified roles are currently available for approval.');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function approve(role: QualifiedRole) {
    startTransition(async () => {
      setMessage(`Approving ${role.company} — ${role.title}...`);
      const response = await fetch('/api/career-os/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'review_opportunity',
          actionToken,
          actionTokenExpiresAt: tokenExpiresAt,
          employer: role.company,
          opportunityId: role.id,
          ownerEmail,
          reviewAction: 'approve',
        }),
      });
      const result = await response.json().catch(() => ({})) as ActionResult;
      if (!response.ok || !result.ok) {
        setMessage(result.error || result.message || 'Role approval failed.');
        return;
      }
      setMessage(result.message || 'Role approved and queued.');
      router.refresh();
    });
  }

  return (
    <div aria-live="polite">
      {roles.length > 0 ? (
        <div>
          {roles.map((role) => (
            <article className="career-os-action-control" key={role.id}>
              <strong>{role.company} — {role.title}</strong>
              <p>{role.location || 'Location not published'} · Fit score {role.fitScore}</p>
              <button className="button primary" disabled={isPending} onClick={() => approve(role)} type="button">
                Approve & Queue
              </button>
            </article>
          ))}
        </div>
      ) : null}
      <small>{message}</small>
    </div>
  );
}
