import { unstable_cache } from 'next/cache';
import { getCareerOsStatus } from './career-os-status';

/**
 * The founder dashboard is an operational view, not the execution engine.
 * Reuse a recent verified snapshot so page loads do not repeat the complete
 * Supabase evidence audit on every navigation or hard refresh.
 */
export const getCachedCareerOsStatus = unstable_cache(
  async () => getCareerOsStatus(),
  ['career-os-founder-dashboard-status-v1'],
  {
    revalidate: 30,
    tags: ['career-os-status'],
  },
);
