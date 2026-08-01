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
  const [message, setMessage] = useState('Idle. Ready to refresh jobs or run one eligible production application.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function execute(action: 'run_now' | 'refresh_discovery', actionToken: string) {
    startTransition(async () => {
      setState('loading');
      setMessage(action === 'run_now' ? 'Starting one eligible production application...' : 'Refreshing official job sources...');

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
        setMessage(`Discovery refreshed: reviewed ${result.dailyDiscovery.postingsReviewed}, persisted ${result.dailyDiscovery.postingsPersisted || 0}, qualified ${result.dailyDiscovery.postingsAccepted}.`);
      } else if (action === 'run_now' && result.queueResult) {
        const queue = result.queueResult;
        const role = [result.employer, result.position].filter(Boolean).join(' - ');
        setMessage(`Production run started${role ? ` for ${role}` : ''}: audited ${queue.applicationsAudited}, auto-queued ${queue.automaticallyQueued}, processed ${queue.processed}, waiting ${queue.waitingOnTomas}, technical ${queue.technical}.`);
      } else {
        setMessage('Career OS action completed.');
      }
      router.refresh();
    });
  }

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      <div className="cta-row">
        <button className="button primary" disabled={isPending} onClick={() => execute('run_now', runNowToken)} type="button">Run One Production Application</button>
        <button className="button secondary" disabled={isPending} onClick={() => execute('refresh_discovery', refreshDiscoveryToken)} type="button">Refresh Job Pool</button>
        <button className="button secondary" disabled={isPending} onClick={() => window.location.reload()} type="button">Refresh Status</button>
      </div>
      <small>{state}: {message}</small>
    </div>
  );
}
