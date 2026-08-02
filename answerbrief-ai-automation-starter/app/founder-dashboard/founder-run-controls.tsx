'use client';

import { useState } from 'react';

type Props = {
  approvedCount: number;
  ownerEmail: string;
  runNowToken: string;
  tokenExpiresAt: string;
};

type ActionResult = {
  accepted?: boolean;
  applicationsAudited?: number;
  automaticallyQueued?: number;
  confirmed?: number;
  error?: string;
  errors?: string[];
  message?: string;
  ok?: boolean;
  processed?: number;
  runId?: string;
  runnerDispatch?: {
    dispatched?: boolean;
    error?: string;
    workflow?: string;
  };
  status?: string;
  submitted?: number;
  technical?: number;
  waitingOnTomas?: number;
};

export function FounderRunControls({ approvedCount, ownerEmail, runNowToken, tokenExpiresAt }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    approvedCount > 0
      ? `${approvedCount} approved application${approvedCount === 1 ? '' : 's'} ready for autonomous processing.`
      : 'Approve qualified roles above to build your application queue.',
  );

  async function processApprovedQueue() {
    if (busy || approvedCount < 1) return;
    setBusy(true);
    setMessage(`Starting autonomous processing for ${approvedCount} approved application${approvedCount === 1 ? '' : 's'}...`);

    try {
      const response = await fetch('/api/career-os/run-approved-queue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actionToken: runNowToken,
          actionTokenExpiresAt: tokenExpiresAt,
          ownerEmail,
        }),
      });
      const result = await response.json().catch(() => ({})) as ActionResult;

      if (!response.ok) {
        const detail = result.error || result.errors?.join('; ') || `HTTP ${response.status}`;
        setMessage(`The approved queue request failed: ${detail}`);
        return;
      }

      if (result.accepted && result.status === 'queued_without_runner') {
        const dispatchError = result.runnerDispatch?.error || result.message || 'The Mac runner could not be started.';
        setMessage(
          `Applications were queued successfully, but automatic runner startup failed. ${dispatchError} `
          + `Run ${result.runId || 'created'} remains queued and no applications have been submitted yet.`,
        );
        return;
      }

      if (!result.ok) {
        const detail = result.error || result.message || result.errors?.join('; ') || 'Unknown queue error.';
        setMessage(`The approved queue could not start: ${detail}`);
        return;
      }

      setMessage(
        `Autonomous queue started. Audited ${result.applicationsAudited || 0}, queued ${result.automaticallyQueued || 0}, `
        + `processed ${result.processed || 0}. Human checkpoints: ${result.waitingOnTomas || 0}; technical blockers: ${result.technical || 0}. `
        + `Run ${result.runId || 'created'}. Career OS will continue through the paired Mac browser worker.`,
      );
    } catch (error) {
      setMessage(`The approved queue request failed: ${error instanceof Error ? error.message : 'request failed'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="career-os-action-control" aria-live="polite">
      <div className="cta-row">
        <button className="button primary" disabled={busy || approvedCount < 1} onClick={() => void processApprovedQueue()} type="button">
          {busy ? 'Starting Autonomous Queue...' : `Autonomously Process ${approvedCount} Approved Application${approvedCount === 1 ? '' : 's'}`}
        </button>
        <button className="button secondary" disabled={busy} onClick={() => window.location.reload()} type="button">Refresh Counts</button>
        <a className="button secondary" href="/career-os#applications">View Applications</a>
      </div>
      <p><small><strong>Status:</strong> {message}</small></p>
    </div>
  );
}
