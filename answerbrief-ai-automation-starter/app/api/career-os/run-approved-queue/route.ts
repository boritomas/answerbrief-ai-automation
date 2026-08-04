import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { processCareerOsQueue, verifyCareerOsActionToken } from '@/lib/career-os-queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const runtime = 'nodejs';

type ActionBody = {
  actionToken?: string;
  actionTokenExpiresAt?: string;
  ownerEmail?: string;
};

type DispatchResult = {
  dispatched: boolean;
  error?: string;
  workflow?: string;
};

type DispatchConfig =
  | {
    ok: true;
    owner: string;
    repo: string;
    token: string;
    workflow: string;
  }
  | {
    ok: false;
    error: string;
  };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as ActionBody;
  const ownerEmail = body.ownerEmail || process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
  const authorized = verifyCareerOsActionToken({
    action: 'run_now',
    expiresAt: clean(body.actionTokenExpiresAt),
    ownerEmail,
    token: clean(body.actionToken),
  });

  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Career OS action.' }, { status: 401 });
  }

  const dispatchConfig = resolveApprovedQueueDispatchConfig();
  if (!dispatchConfig.ok) {
    return NextResponse.json({
      ok: false,
      accepted: false,
      status: 'blocked',
      error: `Mac runner dispatch is not configured: ${dispatchConfig.error}`,
    }, { status: 503 });
  }

  try {
    const queueResult = await processCareerOsQueue({
      ownerEmail,
      trigger: 'run_now',
    });

    const eligibleCount = Math.max(
      1,
      Math.min(
        200,
        queueResult.automaticallyQueued
          || queueResult.processed
          || queueResult.applicationsAudited,
      ),
    );
    const dispatch = await dispatchApprovedQueueWorkflow(dispatchConfig, ownerEmail, eligibleCount);

    return NextResponse.json({
      ok: queueResult.errors.length === 0 && dispatch.dispatched,
      accepted: true,
      status: dispatch.dispatched ? 'running' : 'queued_without_runner',
      runId: queueResult.runId,
      applicationsAudited: queueResult.applicationsAudited,
      automaticallyQueued: queueResult.automaticallyQueued,
      processed: queueResult.processed,
      waitingOnTomas: queueResult.waitingOnTomas,
      technical: queueResult.technical,
      submitted: queueResult.submitted,
      confirmed: queueResult.confirmed,
      errors: queueResult.errors,
      runnerDispatch: dispatch,
      message: dispatch.dispatched
        ? `Approved queue was sent to the Mac production runner with a limit of ${eligibleCount} applications.`
        : `Applications were queued, but the Mac runner dispatch failed: ${dispatch.error || 'unknown error'}`,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      accepted: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Approved queue execution failed.',
    }, { status: 502 });
  }
}

function resolveApprovedQueueDispatchConfig(): DispatchConfig {
  const token = clean(
    process.env.CAREER_OS_GITHUB_TOKEN
      || process.env.GITHUB_PAT
      || process.env.GH_TOKEN,
  );
  if (!token) {
    return {
      ok: false,
      error: 'Missing CAREER_OS_GITHUB_TOKEN, GITHUB_PAT, or GH_TOKEN in the production environment.',
    };
  }

  const repository = clean(process.env.CAREER_OS_GITHUB_REPOSITORY || 'boritomas/answerbrief-ai-automation');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    return { ok: false, error: 'Invalid CAREER_OS_GITHUB_REPOSITORY value.' };
  }

  const workflow = 'career-os-approved-queue.yml';
  return {
    ok: true,
    owner,
    repo,
    token,
    workflow,
  };
}

async function dispatchApprovedQueueWorkflow(
  config: Extract<DispatchConfig, { ok: true }>,
  ownerEmail: string,
  applicationLimit: number,
): Promise<DispatchResult> {
  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          application_limit: String(applicationLimit),
          owner_email: ownerEmail,
        },
      }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    return {
      dispatched: false,
      workflow: config.workflow,
      error: `GitHub workflow dispatch failed with HTTP ${response.status}${details ? `: ${details.slice(0, 300)}` : ''}`,
    };
  }

  return { dispatched: true, workflow: config.workflow };
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^\"|\"$/g, '');
}
