'use client';

import { useState } from 'react';

type Props = {
  approvedCount: number;
  ownerEmail: string;
  runNowToken: string;
  refreshDiscoveryToken: string;
  tokenExpiresAt: string;
};

type ActionResult = {
  applicationId?: string;
  employer?: string;
  position?: string;
  error?: string;
  message?: string;
  ok?: boolean;
  status?: 'blocked' | 'error' | 'success';
};

export function FounderRunControls({ approvedCount, ownerEmail, runNowToken, tokenExpiresAt }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(approvedCount > 0
    ? `${approvedCount} approved application${approvedCount === 1 ? '' : 's'} ready to process.`
    : 'Approve qualified roles above to build your application queue.');

  async function processApprovedQueue() {
    if (busy || approvedCount < 1) return;
    setBusy(true);
    let started = 0;
    const results: string[] = [];

    for (let index = 0; index < approvedCount; index += 1) {
      setMessage(`Starting approved application ${index + 1} of ${approvedCount}…`);
      try {
        const response = await fetch('/api/career-os/run-one', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'run_now',
            actionToken: runNowToken,
            actionTokenExpiresAt: tokenExpiresAt,
            ownerEmail,
          }),
        });
        const result = await response.json().catch(() => ({})) as ActionResult;
        if (!response.ok || !result.ok) {
          if (response.status === 409) break;
          results.push(result.error || result.message || `HTTP ${response.status}`);
          continue;
        }
        started += 1;
      } catch (error) {
        results.push(error instanceof Error ? error.message : 'Queue request failed.');
      }
    }

    setMessage(results.length
      ? `Started ${started} application${started === 1 ? '' : 's'}. ${results.length} request${results.length === 1 ? '' : 's'} need attention: ${results.join('; ')}`
      : `Started ${started} approved application${started === 1 ? '' : 's'}. Career OS will continue until a human-only checkpoint is reached.`);
    setBusy(false);
  }

  return (
    <div className="career-os-action-control" aria-live="polite">
      <div className="cta-row">
        <button className="button primary" disabled={busy || approvedCount < 1} onClick={() => void processApprovedQueue()} type="button">
          {busy ? 'Starting Approved Queue…' : `Start All ${approvedCount} Approved Application${approvedCount === 1 ? '' : 's'}`}
        </button>
        <button className="button secondary" disabled={busy} onClick={() => window.location.reload()} type="button">Refresh Counts</button>
        <a className="button secondary" href="/career-os#applications">View Applications</a>
      </div>
      <p><small><strong>Status:</strong> {message}</small></p>
    </div>
  );
}
