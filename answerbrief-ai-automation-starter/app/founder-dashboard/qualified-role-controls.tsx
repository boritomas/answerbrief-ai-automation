'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type QualifiedRole = {
  id: string;
  company: string;
  title: string;
  location: string;
  fitScore: number;
  url?: string;
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
  const [message, setMessage] = useState(roles.length ? 'Step 2: review the best matches and approve the roles you want Career OS to process.' : 'No qualified roles are currently available. Use Find New Roles above.');
  const [activeRoleId, setActiveRoleId] = useState('');
  const [approvedRoleIds, setApprovedRoleIds] = useState<string[]>([]);
  const router = useRouter();

  async function approve(role: QualifiedRole) {
    if (activeRoleId || approvedRoleIds.includes(role.id)) return;

    setActiveRoleId(role.id);
    setMessage(`Adding ${role.company} - ${role.title} to your application queue...`);

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
      setApprovedRoleIds((current) => current.concat(role.id));
      setMessage(`${role.company} was added to your queue. Approve another role or use Process One Approved Role above.`);
      router.refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessage('The approval request timed out. The role was not added; retry this card.');
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
        <div className="career-os-role-grid">
          {roles.map((role, index) => {
            const approving = activeRoleId === role.id;
            const approved = approvedRoleIds.includes(role.id);
            return (
              <article className="career-os-action-control" key={role.id}>
                <small>Priority {index + 1} · {role.fitScore}% match</small>
                <h3>{role.title}</h3>
                <p><strong>{role.company}</strong><br />{role.location || 'Location not published'}</p>
                <div className="cta-row">
                  <button className="button primary" disabled={approving || approved} onClick={() => void approve(role)} type="button">
                    {approving ? 'Adding…' : approved ? 'Added to Queue' : 'Approve This Role'}
                  </button>
                  {role.url ? <a className="button secondary" href={role.url} rel="noreferrer" target="_blank">Open Job Posting</a> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      <p><small><strong>What to do:</strong> {message}</small></p>
    </div>
  );
}
