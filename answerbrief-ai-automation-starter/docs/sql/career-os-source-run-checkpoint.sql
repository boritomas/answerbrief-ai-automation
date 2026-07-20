-- Career OS source-run checkpoint support.
-- Required by the daily discovery engine to persist complete-result-set progress.

alter table public.career_os_source_runs
add column if not exists processing_checkpoint jsonb not null default '{}'::jsonb;
