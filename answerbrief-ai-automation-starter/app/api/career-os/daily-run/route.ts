import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Vercel Cron hits this route once daily. It used to run the full
// discovery/scoring/persistence cycle synchronously and routinely hit
// Vercel's 60-second serverless limit ("Vercel Runtime Timeout Error: Task
// timed out after 60 seconds", confirmed in production logs) because
// runDailyGreenhouseDiscovery's Workday branch makes a long, fully
// sequential per-tenant/per-search-term/per-posting-detail fetch chain.
//
// This route now does only two things: authenticate, then dispatch the
// existing self-hosted "Career OS Job Inbox" GitHub Actions workflow
// (career-os-job-inbox.yml, self-hosted Mac runner, 60-MINUTE timeout,
// already running LinkedIn discovery on its own schedule). The actual heavy
// work moved to ../execute/route.ts, invoked by that workflow over
// localhost against `next start` (no serverless duration cap applies
// there). No discovery/scoring/qualification logic changed -- only where it
// runs.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const GITHUB_REPO = 'boritomas/answerbrief-ai-automation';
const GITHUB_WORKFLOW_FILE = 'career-os-job-inbox.yml';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.CAREER_OS_CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Career OS daily cron invocation.' }, { status: 401 });
  }

  const dispatchToken = process.env.GITHUB_DISPATCH_TOKEN;
  if (!dispatchToken) {
    return NextResponse.json({
      ok: false,
      error: 'GITHUB_DISPATCH_TOKEN is not configured; cannot dispatch the discovery workflow.',
      status: 'dispatch_not_configured',
    }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${dispatchToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({
        ok: false,
        error: `GitHub workflow_dispatch failed: ${response.status} ${detail}`.slice(0, 2000),
        status: 'dispatch_failed',
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      dispatched: true,
      status: 'discovery_workflow_dispatched',
      workflow: GITHUB_WORKFLOW_FILE,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Career OS daily cron dispatch failed.',
      status: 'dispatch_error',
    }, { status: 500 });
  }
}
