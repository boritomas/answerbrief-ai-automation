'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type ActionResult = {
  dailyDiscovery?: {
    errors: string[];
    postingsAccepted: number;
    postingsPersisted?: number;
    postingsReviewed: number;
  };
  error?: string;
  message?: string;
  ok?: boolean;
  openUrl?: string;
  queueResult?: {
    applicationsAudited: number;
    automaticallyQueued: number;
    errors?: string[];
    processed: number;
    technical: number;
    waitingOnTomas: number;
  };
  status?: 'blocked' | 'error' | 'success';
  whatCareerOsCompleted?: string;
};

type ApplicationActionControlProps = {
  actionToken: string;
  actionTokenExpiresAt: string;
  actionKind: string;
  applicationId: string;
  disabledReason?: string;
  href: string;
  label: string;
  whatTomasMustDo: string;
};

export function RunNowControl({
  actionToken,
  actionTokenExpiresAt,
  ownerEmail,
}: {
  actionToken: string;
  actionTokenExpiresAt: string;
  ownerEmail: string;
}) {
  const [message, setMessage] = useState('Idle. Ready to queue all eligible applications for secure autonomous execution.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function runNow() {
    startTransition(async () => {
      setState('loading');
      setMessage('Queueing eligible applications for autonomous execution...');
      const result = await postCareerAction({ action: 'run_now', actionToken, actionTokenExpiresAt, ownerEmail });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Run Now failed.');
        return;
      }
      setState('success');
      const queue = result.queueResult;
      const paused = queue?.errors?.includes('career_os_queue_paused');
      setMessage(queue
        ? paused
          ? 'Queue is intentionally paused. Discovery can still refresh the job pool; no employer submissions were attempted.'
          : queue.automaticallyQueued === 0 && queue.processed === 0
            ? `No eligible applications are ready to run. Audited ${queue.applicationsAudited}; waiting ${queue.waitingOnTomas}; technical ${queue.technical}.`
            : `Complete: audited ${queue.applicationsAudited}, auto-queued ${queue.automaticallyQueued}, processed ${queue.processed}, waiting ${queue.waitingOnTomas}, technical ${queue.technical}.`
        : 'Queue processor completed.');
      router.refresh();
    });
  }

  function refreshDiscovery() {
    startTransition(async () => {
      setState('loading');
      setMessage('Refreshing the official-source job pool without running employer submissions...');
      const result = await postCareerAction({ action: 'refresh_discovery', actionToken, actionTokenExpiresAt, ownerEmail });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Discovery refresh failed.');
        return;
      }
      setState('success');
      const discovery = result.dailyDiscovery;
      setMessage(discovery
        ? `Discovery refreshed: reviewed ${discovery.postingsReviewed}, persisted ${discovery.postingsPersisted || 0}, qualified ${discovery.postingsAccepted}.`
        : 'Discovery refreshed.');
      router.refresh();
    });
  }

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      <div className="cta-row">
        <button className="button primary" disabled={isPending} onClick={runNow} type="button">Run Eligible Applications Now</button>
        <button className="button secondary" disabled={isPending} onClick={refreshDiscovery} type="button">Refresh Job Pool</button>
        <button className="button secondary" disabled={isPending} onClick={() => window.location.reload()} type="button">Refresh Status</button>
      </div>
      <small>{state}: {message}</small>
    </div>
  );
}

export function ApplicationActionControl({
  actionToken,
  actionTokenExpiresAt,
  actionKind,
  applicationId,
  disabledReason,
  href,
  label,
  whatTomasMustDo,
}: ApplicationActionControlProps) {
  const [answer, setAnswer] = useState('');
  const [checkpointOpened, setCheckpointOpened] = useState(!href);
  const [message, setMessage] = useState(disabledReason || whatTomasMustDo || 'Ready.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const needsAnswer = ['enter_compensation', 'review_legal', 'answer_question'].includes(actionKind);

  function openCheckpoint() {
    startTransition(async () => {
      setState('loading');
      const checkpointWindow = href && /^https?:\/\//.test(href)
        ? window.open('about:blank', '_blank')
        : null;
      const result = await postCareerAction({ action: 'inspect_application', actionToken, actionTokenExpiresAt, applicationId });
      if (!result.ok) {
        checkpointWindow?.close();
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Action failed.');
        return;
      }
      setState('success');
      setCheckpointOpened(true);
      setMessage(result.message || 'Checkpoint opened. Complete the required step, then resume automation.');
      if (result.openUrl && /^https?:\/\//.test(result.openUrl)) {
        if (checkpointWindow) {
          checkpointWindow.opener = null;
          checkpointWindow.location.href = result.openUrl;
        } else {
          window.open(result.openUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (href && !/^https?:\/\//.test(href)) {
        checkpointWindow?.close();
        window.location.href = href;
        setMessage(result.message || 'Opened the related Career OS section. Complete the required step shown there, then resume automation.');
      } else {
        checkpointWindow?.close();
      }
      router.refresh();
    });
  }

  function saveAnswer() {
    startTransition(async () => {
      setState('loading');
      const result = await postCareerAction({ action: 'save_answer', actionToken, actionTokenExpiresAt, answer, applicationId });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Answer was not saved.');
        return;
      }
      setState('success');
      setAnswer('');
      setMessage(result.message || 'Answer saved; automation resumed.');
      router.refresh();
    });
  }

  function resume() {
    startTransition(async () => {
      setState('loading');
      const result = await postCareerAction({ action: 'resume_application', actionToken, actionTokenExpiresAt, applicationId });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Resume blocked.');
        return;
      }
      setState('success');
      setMessage(result.message || 'Automation resumed.');
      router.refresh();
    });
  }

  function primaryAction() {
    if (needsAnswer) {
      saveAnswer();
      return;
    }
    if (!checkpointOpened && href) {
      openCheckpoint();
      return;
    }
    resume();
  }

  const primaryLabel = needsAnswer
    ? 'Save and Resume Automation'
    : checkpointOpened
      ? 'Done - Resume Automation'
      : actionKind === 'upload_resume'
        ? 'Open Resume Package'
      : label;
  const primaryDisabled = isPending || (needsAnswer && !answer.trim());

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      {needsAnswer ? (
        <div className="career-os-inline-auth">
          <input
            aria-label={`${label} answer`}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Enter Tomas answer or approval"
            type="text"
            value={answer}
          />
        </div>
      ) : null}
      <button className="button secondary" disabled={primaryDisabled} onClick={primaryAction} type="button">{primaryLabel}</button>
      <small>{state}: {message}</small>
    </div>
  );
}

async function postCareerAction(payload: Record<string, unknown>): Promise<ActionResult> {
  const response = await fetch('/api/career-os/actions', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const result = await response.json().catch(() => ({}));
  return { ...result, ok: response.ok && result.ok !== false };
}
