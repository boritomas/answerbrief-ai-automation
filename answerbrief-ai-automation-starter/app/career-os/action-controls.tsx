'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

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

type AnswerField = {
  key: string;
  label: string;
  type: 'boolean' | 'currency' | 'month' | 'number' | 'select' | 'text' | 'year';
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  value?: string;
};

type StructuredPayload =
  | {
      employer?: string;
      jobTitle?: string;
      type: 'employment_details';
      values: Record<string, string>;
    }
  | {
      label?: string;
      question?: string;
      type: 'missing_fact';
      values: Record<string, string>;
    }
  | {
      approved: true;
      fingerprint: string;
      sourceUrl?: string;
      text: string;
      title?: string;
      type: 'legal_approval';
    };

type ApplicationActionControlProps = {
  actionToken: string;
  actionTokenExpiresAt: string;
  actionKind: string;
  applicationId: string;
  disabledReason?: string;
  fields?: AnswerField[];
  href: string;
  intro?: string;
  label: string;
  legalApprovalFingerprint?: string;
  legalApprovalSourceUrl?: string;
  legalApprovalText?: string;
  legalApprovalTitle?: string;
  statusLabel?: string;
  variant?: 'account' | 'captcha' | 'employment' | 'legal' | 'missing_fact' | 'technical' | 'terminal';
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
  fields = [],
  href,
  intro,
  label,
  legalApprovalFingerprint,
  legalApprovalSourceUrl,
  legalApprovalText,
  legalApprovalTitle,
  variant = 'account',
  whatTomasMustDo,
}: ApplicationActionControlProps) {
  const [message, setMessage] = useState(disabledReason || intro || whatTomasMustDo || 'Ready.');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'blocked' | 'error'>('idle');
  const [checkpointOpened, setCheckpointOpened] = useState(!href);
  const [approved, setApproved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const router = useRouter();

  useEffect(() => {
    setFormValues((current) => {
      const next = { ...current };
      for (const field of fields) {
        if (!(field.key in next)) next[field.key] = field.value || '';
      }
      return next;
    });
  }, [fields]);

  const primaryLabel = useMemo(() => {
    if (variant === 'employment') return 'Save Employment Details and Resume';
    if (variant === 'legal') return 'Approve and Resume';
    if (variant === 'missing_fact') return 'Save Answer and Resume';
    if (variant === 'captcha') return checkpointOpened ? 'Check Again' : 'Open Verification Checkpoint';
    if (variant === 'technical') return 'View Technical Details';
    if (variant === 'terminal') return 'View Confirmation';
    return checkpointOpened ? 'Check Again' : label;
  }, [checkpointOpened, label, variant]);

  const primaryDisabled = useMemo(() => {
    if (isPending) return true;
    if (variant === 'legal') return !approved;
    if (variant === 'employment' || variant === 'missing_fact') {
      return fields.some((field) => field.required && !String(formValues[field.key] || '').trim());
    }
    return false;
  }, [approved, fields, formValues, isPending, variant]);

  function setFieldValue(key: string, value: string) {
    setFormValues((current) => ({ ...current, [key]: value }));
  }

  async function openCheckpoint() {
    const checkpointWindow = href && /^https?:\/\//.test(href)
      ? window.open('about:blank', '_blank')
      : null;
    const result = await postCareerAction({ action: 'inspect_application', actionToken, actionTokenExpiresAt, applicationId });
    if (!result.ok) {
      checkpointWindow?.close();
      setState(result.status === 'blocked' ? 'blocked' : 'error');
      setMessage(result.error || result.message || 'Action failed.');
      return false;
    }
    setCheckpointOpened(true);
    setState('success');
    setMessage(result.message || 'Checkpoint opened. Complete the required step, then return and check again.');
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
    } else {
      checkpointWindow?.close();
    }
    router.refresh();
    return true;
  }

  async function saveStructuredAnswer(payload: StructuredPayload) {
    const result = await postCareerAction({
      action: 'save_answer',
      actionToken,
      actionTokenExpiresAt,
      answer: JSON.stringify(payload),
      applicationId,
    });
    if (!result.ok) {
      setState(result.status === 'blocked' ? 'blocked' : 'error');
      setMessage(result.error || result.message || 'Answer was not saved.');
      return;
    }
    setState('success');
    setMessage(result.message || 'Saved. Career OS resumed the application.');
    router.refresh();
  }

  async function resume() {
    const result = await postCareerAction({ action: 'resume_application', actionToken, actionTokenExpiresAt, applicationId });
    if (!result.ok) {
      setState(result.status === 'blocked' ? 'blocked' : 'error');
      setMessage(result.error || result.message || 'Resume blocked.');
      return;
    }
    setState('success');
    setMessage(result.message || 'Career OS resumed the application.');
    router.refresh();
  }

  function submit() {
    startTransition(async () => {
      setState('loading');
      if (variant === 'employment') {
        await saveStructuredAnswer({
          employer: formValues.employer,
          jobTitle: formValues.jobTitle,
          type: 'employment_details',
          values: formValues,
        });
        return;
      }
      if (variant === 'missing_fact') {
        await saveStructuredAnswer({
          label,
          question: whatTomasMustDo,
          type: 'missing_fact',
          values: formValues,
        });
        return;
      }
      if (variant === 'legal') {
        await saveStructuredAnswer({
          approved: true,
          fingerprint: legalApprovalFingerprint || legalApprovalText || label,
          sourceUrl: legalApprovalSourceUrl,
          text: legalApprovalText || whatTomasMustDo,
          title: legalApprovalTitle || label,
          type: 'legal_approval',
        });
        return;
      }
      if (variant === 'technical' || variant === 'terminal') {
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        setState('success');
        setMessage(intro || whatTomasMustDo);
        return;
      }
      if (!checkpointOpened && href) {
        await openCheckpoint();
        return;
      }
      await resume();
    });
  }

  return (
    <div className={`career-os-action-control ${state}`} aria-live="polite">
      {variant === 'employment' ? (
        <StructuredFields fields={fields} onChange={setFieldValue} values={formValues} />
      ) : null}
      {variant === 'missing_fact' ? (
        <StructuredFields fields={fields} onChange={setFieldValue} values={formValues} />
      ) : null}
      {variant === 'legal' ? (
        <div className="career-os-approval-box">
          <label className="career-os-checkbox">
            <input checked={approved} onChange={(event) => setApproved(event.target.checked)} type="checkbox" />
            <span>I have reviewed and approve this exact text.</span>
          </label>
        </div>
      ) : null}
      <button className={variant === 'technical' || variant === 'terminal' ? 'button secondary' : 'button primary'} disabled={primaryDisabled} onClick={submit} type="button">
        {primaryLabel}
      </button>
      <small>{state}: {message}</small>
    </div>
  );
}

function StructuredFields({
  fields,
  onChange,
  values,
}: {
  fields: AnswerField[];
  onChange: (key: string, value: string) => void;
  values: Record<string, string>;
}) {
  return (
    <div className="career-os-structured-fields">
      {fields.map((field) => (
        <label className="career-os-structured-field" key={field.key}>
          <span>{field.label}{field.required ? ' *' : ''}</span>
          {renderField(field, values[field.key] ?? field.value ?? '', (value) => onChange(field.key, value))}
        </label>
      ))}
    </div>
  );
}

function renderField(field: AnswerField, value: string, onChange: (value: string) => void) {
  if (field.type === 'select' || field.type === 'month' || field.type === 'boolean') {
    const options = field.type === 'month'
      ? monthOptions
      : field.type === 'boolean'
        ? yesNoOptions
        : field.options || [];
    return (
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      inputMode={field.type === 'currency' || field.type === 'number' || field.type === 'year' ? 'numeric' : undefined}
      onChange={(event) => onChange(event.target.value)}
      type={field.type === 'number' || field.type === 'year' ? 'number' : 'text'}
      value={value}
    />
  );
}

const monthOptions = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((month) => ({ label: month, value: month }));

const yesNoOptions = [
  { label: 'Yes', value: 'Yes' },
  { label: 'No', value: 'No' },
];

async function postCareerAction(payload: Record<string, unknown>): Promise<ActionResult> {
  const response = await fetch('/api/career-os/actions', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const result = await response.json().catch(() => ({}));
  return { ...result, ok: response.ok && result.ok !== false };
}
