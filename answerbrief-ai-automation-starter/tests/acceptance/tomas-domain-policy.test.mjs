import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideDomainRouting } from '../../scripts/lib/tomas-domain-policy.mjs';

test('tomasnieves.com allows the personal site and its own assets', () => {
  for (const path of ['/', '/tomas', '/tomas/opengraph-image', '/icon', '/robots.txt', '/sitemap.xml']) {
    assert.deepEqual(decideDomainRouting('tomasnieves.com', path), { action: 'next' }, path);
    assert.deepEqual(decideDomainRouting('www.tomasnieves.com', path), { action: 'next' }, path);
  }
});

test('tomasnieves.com allows the published resume and recruiter-brief downloads', () => {
  for (const path of [
    '/tomas/Tomas-Nieves-Resume.pdf',
    '/tomas/Tomas-Nieves-Resume.docx',
    '/tomas/Tomas-Nieves-Recruiter-Brief.pdf',
  ]) {
    assert.deepEqual(decideDomainRouting('tomasnieves.com', path), { action: 'next' });
  }
});

test('tomasnieves.com redirects every AnswerBrief page route to the personal homepage', () => {
  for (const path of ['/career-os', '/career-os/admin', '/admin', '/founder-dashboard', '/intake', '/success', '/sample-brief', '/refund', '/terms', '/privacy', '/fit-check']) {
    assert.deepEqual(decideDomainRouting('tomasnieves.com', path), { action: 'redirect', to: '/' }, path);
  }
});

test('tomasnieves.com returns not-found for AnswerBrief and CareerOS API routes -- no generic API host', () => {
  for (const path of [
    '/api/checkout',
    '/api/career-os/health',
    '/api/career-os/status',
    '/api/career-os/worker/claim',
    '/api/career-os/approve-role',
    '/api/mobile/me',
    '/api/admin/storage-diagnostics',
  ]) {
    assert.deepEqual(decideDomainRouting('tomasnieves.com', path), { action: 'not-found' }, path);
  }
});

test('tomasnieves.com still lets Vercel Cron and the Stripe webhook through -- the only /api exemption', () => {
  assert.deepEqual(decideDomainRouting('tomasnieves.com', '/api/career-os/daily-run'), { action: 'next' });
  assert.deepEqual(decideDomainRouting('www.tomasnieves.com', '/api/stripe/webhook'), { action: 'next' });
});

test('answer-brief.com redirects /tomas and its subpaths to the AnswerBrief homepage', () => {
  for (const path of ['/tomas', '/tomas/opengraph-image', '/tomas/Tomas-Nieves-Resume.pdf']) {
    assert.deepEqual(decideDomainRouting('answer-brief.com', path), { action: 'redirect', to: '/' }, path);
    assert.deepEqual(decideDomainRouting('www.answer-brief.com', path), { action: 'redirect', to: '/' }, path);
  }
});

test('answer-brief.com keeps serving every AnswerBrief route and API, including the infra-exempt paths', () => {
  for (const path of ['/', '/career-os', '/admin', '/api/checkout', '/api/career-os/daily-run', '/api/stripe/webhook', '/api/mobile/me']) {
    assert.deepEqual(decideDomainRouting('answer-brief.com', path), { action: 'next' }, path);
  }
});

test('unrecognized hosts (Vercel previews, localhost) stay fully unrestricted for internal review', () => {
  const hosts = ['answerbrief-ai-automation-git-feat-xyz.vercel.app', 'localhost:3000', 'localhost'];
  for (const host of hosts) {
    assert.deepEqual(decideDomainRouting(host, '/tomas'), { action: 'next' });
    assert.deepEqual(decideDomainRouting(host, '/career-os'), { action: 'next' });
    assert.deepEqual(decideDomainRouting(host, '/api/checkout'), { action: 'next' });
  }
});

test('host matching is case-insensitive and strips a port', () => {
  assert.deepEqual(decideDomainRouting('TomasNieves.com:443', '/admin'), { action: 'redirect', to: '/' });
  assert.deepEqual(decideDomainRouting('Answer-Brief.com', '/tomas'), { action: 'redirect', to: '/' });
});
