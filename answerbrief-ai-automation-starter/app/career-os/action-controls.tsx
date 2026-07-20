'use client';

import { useState, useTransition } from 'react';

type ActionResult = {
  error?: string;
  message?: string;
  ok?: boolean;
  openUrl?: string;
  queueResult?: {
    applicationsAudited: number;
    automaticallyQueued: number;
    processed: number;
    technical: number;
    waitingOnTomas: number;
  };
  status?: 'blocked' | 'error' | 'success';
  whatCareerOsCompleted?: string;
};

type ApplicationActionControlProps = {
  actionKind: string;
  applicationId: string;
  disabledReason?: string;
  href: string;
  label: string;
  whatTomasMustDo: string;
};

export function RunNowControl({ ownerEmail }: { ownerEmail: string }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('Idle. Ready to process all eligible queued applications.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  function authorize() {
    startTransition(async () => {
      setState('loading');
      const result = await postCareerAction({ action: 'authorize', adminPassword: password });
      if (!result.ok) {
        setState('error');
        setMessage(result.error || 'Authorization failed.');
        return;
      }
      setState('success');
      setMessage('Authorized. Run Now can invoke the secure queue processor.');
      setPassword('');
    });
  }

  function runNow() {
    startTransition(async () => {
      setState('loading');
      setMessage('Running eligible applications now...');
      const result = await postCareerAction({ action: 'run_now', ownerEmail });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Run Now failed.');
        return;
      }
      setState('success');
      const queue = result.queueResult;
      setMessage(queue
        ? `Complete: audited ${queue.applicationsAudited}, auto-queued ${queue.automaticallyQueued}, processed ${queue.processed}, waiting ${queue.waitingOnTomas}, technical ${queue.technical}.`
        : 'Queue processor completed.');
    });
  }

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      <div className="cta-row">
        <button className="button primary" disabled={isPending} onClick={runNow} type="button">Run Eligible Applications Now</button>
        <button className="button secondary" disabled={isPending} onClick={() => window.location.reload()} type="button">Refresh Status</button>
      </div>
      <div className="career-os-inline-auth">
        <input
          aria-label="Career OS admin password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Admin password"
          type="password"
          value={password}
        />
        <button className="button secondary" disabled={isPending || !password} onClick={authorize} type="button">Authorize Actions</button>
      </div>
      <small>{state}: {message}</small>
    </div>
  );
}

export function ApplicationActionControl({
  actionKind,
  applicationId,
  disabledReason,
  href,
  label,
  whatTomasMustDo,
}: ApplicationActionControlProps) {
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState(disabledReason || whatTomasMustDo || 'Ready.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();
  const needsAnswer = ['enter_compensation', 'review_legal', 'answer_question'].includes(actionKind);

  function inspect() {
    startTransition(async () => {
      setState('loading');
      const result = await postCareerAction({ action: 'inspect_application', applicationId });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Action failed.');
        return;
      }
      setState('success');
      setMessage(result.message || 'Checkpoint opened and audit event recorded.');
      if (result.openUrl && /^https?:\/\//.test(result.openUrl)) window.open(result.openUrl, '_blank', 'noopener,noreferrer');
    });
  }

  function saveAnswer() {
    startTransition(async () => {
      setState('loading');
      const result = await postCareerAction({ action: 'save_answer', answer, applicationId });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Answer was not saved.');
        return;
      }
      setState('success');
      setAnswer('');
      setMessage(result.message || 'Answer saved; automation resumed.');
    });
  }

  function resume() {
    startTransition(async () => {
      setState('loading');
      const result = await postCareerAction({ action: 'resume_application', applicationId });
      if (!result.ok) {
        setState(result.status === 'blocked' ? 'blocked' : 'error');
        setMessage(result.error || result.message || 'Resume blocked.');
        return;
      }
      setState('success');
      setMessage(result.message || 'Automation resumed.');
    });
  }

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      <div className="cta-row">
        <button className="button secondary" disabled={isPending} onClick={inspect} type="button">{label}</button>
        {href ? <a className="text-link" href={href}>Open checkpoint</a> : null}
      </div>
      {needsAnswer ? (
        <div className="career-os-inline-auth">
          <input
            aria-label={`${label} answer`}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Enter Tomas answer or approval"
            type="text"
            value={answer}
          />
          <button className="button secondary" disabled={isPending || !answer.trim()} onClick={saveAnswer} type="button">Save and Resume Automation</button>
        </div>
      ) : (
        <button className="button secondary" disabled={isPending} onClick={resume} type="button">Done - Resume Automation</button>
      )}
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
