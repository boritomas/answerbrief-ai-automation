'use client';

import { useState } from 'react';

type Props = {
  ownerEmail: string;
  refreshDiscoveryToken: string;
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

export function FounderRunControls({ ownerEmail, refreshDiscoveryToken, runNowToken, tokenExpiresAt }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready to run Career OS browser worker.');

  async function runNow() {
    if (busy) return;
    setBusy(true);
    setMessage('Starting Career OS browser worker run...');

    try {
      const response = await fetch('/api/career-os/run-one', {
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
        setMessage(`Run failed: ${detail}`);
        return;
      }

      if (!result.ok) {
        const detail = result.error || result.message || result.errors?.join('; ') || 'Unknown error.';
        setMessage(`Run could not start: ${detail}`);
        return;
      }

      setMessage(
        `Run started. Processed ${result.processed || 0}; submitted ${result.submitted || 0}. `
        + `Human checkpoints: ${result.waitingOnTomas || 0}; technical blockers: ${result.technical || 0}. `
        + `Run ${result.runId || 'created'}.`,
      );
    } catch (error) {
      setMessage(`Run request failed: ${error instanceof Error ? error.message : 'request failed'}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshDiscovery() {
    if (busy) return;
    setBusy(true);
    setMessage('Refreshing discovery sources...');

    try {
      const response = await fetch('/api/career-os/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh_discovery',
          actionToken: refreshDiscoveryToken,
          actionTokenExpiresAt: tokenExpiresAt,
          ownerEmail,
        }),
      });
      const result = await response.json().catch(() => ({})) as ActionResult;

      if (!response.ok) {
        const detail = result.error || result.errors?.join('; ') || `HTTP ${response.status}`;
        setMessage(`Discovery refresh failed: ${detail}`);
        return;
      }

      setMessage(result.message || 'Discovery refresh queued.');
    } catch (error) {
      setMessage(`Discovery refresh failed: ${error instanceof Error ? error.message : 'request failed'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="career-os-action-control" aria-live="polite">
      <div className="cta-row">
        <button className="button primary" disabled={busy} onClick={() => void runNow()} type="button">
          {busy ? 'Running...' : 'Run Career OS'}
        </button>
        <button className="button secondary" disabled={busy} onClick={() => void refreshDiscovery()} type="button">
          Refresh Discovery
        </button>
        <button className="button secondary" disabled={busy} onClick={() => window.location.reload()} type="button">Refresh Counts</button>
      </div>
      <p><small><strong>Status:</strong> {message}</small></p>
    </div>
  );
}

