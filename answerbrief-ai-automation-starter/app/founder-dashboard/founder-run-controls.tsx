'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = {
  ownerEmail: string;
  runNowToken: string;
  refreshDiscoveryToken: string;
  tokenExpiresAt: string;
};

type ActionResult = {
  applicationId?: string;
  employer?: string;
  position?: string;
  dailyDiscovery?: {
    errors: string[];
    postingsAccepted: number;
    postingsPersisted?: number;
    postingsReviewed: number;
  };
  error?: string;
  message?: string;
  ok?: boolean;
  queueResult?: {
    applicationsAudited: number;
    automaticallyQueued: number;
    errors?: string[];
    processed: number;
    technical: number;
    waitingOnTomas: number;
  };
  status?: 'blocked' | 'error' | 'success';
};

export function FounderRunControls({
  ownerEmail,
  runNowToken,
  refreshDiscoveryToken,
  tokenExpiresAt,
}: Props) {
  const [message, setMessage] = useState('Choose Step 1 to find roles, approve a role below, then choose Step 3 to process one application.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function execute(action: 'run_now' | 'refresh_discovery', actionToken: string) {
    startTransition(async () => {
      setState('loading');
      setMessage(action === 'run_now' ? 'Starting one approved application...' : 'Requesting a fresh job-pool update...');

      const endpoint = action === 'run_now'
        ? '/api/career-os/run-one'
        : '/api/career-os/actions';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          actionToken,
          actionTokenExpiresAt: tokenExpiresAt,
          ownerEmail,
        }),
      });
      const result = await response.json().catch(() => ({})) as ActionResult;

      if (!response.ok || !result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || `${action} failed.`);
        return;
      }

      setState('success');
      if (action === 'refresh_discovery' && result.dailyDiscovery) {
        setMessage(`Job pool updated: ${result.dailyDiscovery.postingsAccepted} qualified roles found. Review the role cards below.`);
      } else if (action === 'run_now' && result.queueResult) {
        const role = [result.employer, result.position].filter(Boolean).join(' - ');
        setMessage(`Application processing started${role ? ` for ${role}` : ''}. Refresh status in a few minutes to see progress.`);
      } else {
        setMessage('Request accepted. Refresh status in a few minutes.');
      }
      router.refresh();
    });
  }

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      <div className="cta-row">
        <button className="button secondary" disabled={isPending} onClick={() => execute('refresh_discovery', refreshDiscoveryToken)} type="button">
          1. Find New Roles
        </button>
        <button className="button primary" disabled={isPending} onClick={() => execute('run_now', runNowToken)} type="button">
          3. Process One Approved Role
        </button>
        <button className="button secondary" disabled={isPending} onClick={() => window.location.reload()} type="button">
          Check Progress
        </button>
      </div>
      <small><strong>{state === 'idle' ? 'Next step' : state}:</strong> {message}</small>
    </div>
  );
}
