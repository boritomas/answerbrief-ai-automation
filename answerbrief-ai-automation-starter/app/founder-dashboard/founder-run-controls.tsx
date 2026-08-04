'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = {
  approvedCount?: number;
  ownerEmail: string;
  runNowToken: string;
  refreshDiscoveryToken: string;
  tokenExpiresAt: string;
};

type ActionResult = {
  accepted?: boolean;
  applicationId?: string;
  applicationsAudited?: number;
  automaticallyQueued?: number;
  confirmed?: number;
  dailyDiscovery?: {
    errors: string[];
    postingsAccepted: number;
    postingsPersisted?: number;
    postingsReviewed: number;
  };
  employer?: string;
  error?: string;
  errors?: string[];
  message?: string;
  ok?: boolean;
  position?: string;
  processed?: number;
  queueResult?: {
    applicationsAudited: number;
    automaticallyQueued: number;
    errors?: string[];
    processed: number;
    technical: number;
    waitingOnTomas: number;
  };
  runId?: string;
  runnerDispatch?: {
    applicationLimit?: number;
    dispatched?: boolean;
    error?: string;
    workflow?: string;
  };
  status?: 'blocked' | 'error' | 'queued_without_runner' | 'running' | 'success';
  submitted?: number;
  technical?: number;
  waitingOnTomas?: number;
};

type ControlAction = 'run_now' | 'refresh_discovery' | 'run_approved_queue';

export function FounderRunControls({
  approvedCount = 0,
  ownerEmail,
  runNowToken,
  refreshDiscoveryToken,
  tokenExpiresAt,
}: Props) {
  const [message, setMessage] = useState(
    approvedCount > 0
      ? `${approvedCount} approved application${approvedCount === 1 ? '' : 's'} ready for autonomous processing.`
      : 'Idle. Ready to refresh jobs or run one eligible production application.',
  );
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function execute(action: ControlAction, actionToken: string) {
    if (action === 'run_approved_queue' && approvedCount < 1) return;

    startTransition(async () => {
      setState('loading');
      setMessage(loadingMessage(action, approvedCount));

      const endpoint = action === 'refresh_discovery'
        ? '/api/career-os/actions'
        : action === 'run_approved_queue'
          ? '/api/career-os/run-approved-queue'
          : '/api/career-os/run-one';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: action === 'run_approved_queue' ? 'run_now' : action,
          actionToken,
          actionTokenExpiresAt: tokenExpiresAt,
          ownerEmail,
        }),
      });
      const result = await response.json().catch(() => ({})) as ActionResult;

      if (!response.ok || !result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || result.errors?.join('; ') || `${action} failed.`);
        return;
      }

      setState('success');
      if (action === 'refresh_discovery' && result.dailyDiscovery) {
        setMessage(`Discovery refreshed: reviewed ${result.dailyDiscovery.postingsReviewed}, persisted ${result.dailyDiscovery.postingsPersisted || 0}, qualified ${result.dailyDiscovery.postingsAccepted}.`);
      } else if (action === 'run_approved_queue') {
        const dispatchError = result.runnerDispatch?.error;
        const applicationLimit = result.runnerDispatch?.applicationLimit;
        setMessage(
          result.status === 'queued_without_runner'
            ? `Applications were queued, but automatic runner startup failed. ${dispatchError || result.message || 'Runner dispatch failed.'}`
            : `Approved queue run started${applicationLimit ? ` for up to ${applicationLimit}` : ''}. Audited ${result.applicationsAudited || 0}, queued ${result.automaticallyQueued || 0}, processed ${result.processed || 0}, waiting ${result.waitingOnTomas || 0}, technical ${result.technical || 0}. Run ${result.runId || 'created'}.`,
        );
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
        <button className="button primary" disabled={isPending || approvedCount < 1} onClick={() => execute('run_approved_queue', runNowToken)} type="button">
          {approvedCount > 0 ? `Start Approved Queue Run (${approvedCount})` : 'Start Approved Queue Run'}
        </button>
        <button className="button secondary" disabled={isPending} onClick={() => execute('run_now', runNowToken)} type="button">Run Next Eligible Application</button>
        <button className="button secondary" disabled={isPending} onClick={() => execute('refresh_discovery', refreshDiscoveryToken)} type="button">Refresh Job Pool</button>
        <button className="button secondary" disabled={isPending} onClick={() => window.location.reload()} type="button">Refresh Status</button>
      </div>
      <small>{state}: {message}</small>
    </div>
  );
}

function loadingMessage(action: ControlAction, approvedCount: number) {
  if (action === 'refresh_discovery') return 'Refreshing official job sources...';
  if (action === 'run_approved_queue') {
    return `Starting approved queue run for up to ${approvedCount} approved application${approvedCount === 1 ? '' : 's'}...`;
  }
  return 'Starting one eligible production application...';
}
