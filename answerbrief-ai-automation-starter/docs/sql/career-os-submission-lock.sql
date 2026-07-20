-- Career OS duplicate-submission lock.
-- Apply in Supabase SQL Editor after confirming existing submitted applications are locked.
-- The app also runs runtime pre-submit checks; these indexes are the database-level backstop.

create unique index if not exists career_os_applications_unique_employer_requisition
on public.career_os_applications (
  owner_email,
  lower(regexp_replace(coalesce(employer, ''), '[^a-z0-9]+', ' ', 'g')),
  lower(regexp_replace(coalesce(
    raw_record->>'external_requisition_id',
    raw_record->>'requisition_id',
    raw_record->>'ats_job_id',
    raw_record->>'job_id',
    opportunity_id,
    ''
  ), '[^a-z0-9]+', '', 'g'))
)
where nullif(lower(regexp_replace(coalesce(
  raw_record->>'external_requisition_id',
  raw_record->>'requisition_id',
  raw_record->>'ats_job_id',
  raw_record->>'job_id',
  opportunity_id,
  ''
), '[^a-z0-9]+', '', 'g')), '') is not null;

create unique index if not exists career_os_applications_unique_employer_title_url
on public.career_os_applications (
  owner_email,
  lower(regexp_replace(coalesce(employer, ''), '[^a-z0-9]+', ' ', 'g')),
  lower(regexp_replace(coalesce(position, ''), '[^a-z0-9]+', ' ', 'g')),
  lower(trim(trailing '/' from coalesce(
    raw_record->>'canonical_url',
    raw_record->>'application_url',
    raw_record->>'job_url',
    raw_record->>'posting_url',
    ''
  )))
)
where nullif(lower(trim(trailing '/' from coalesce(
  raw_record->>'canonical_url',
  raw_record->>'application_url',
  raw_record->>'job_url',
  raw_record->>'posting_url',
  ''
))), '') is not null;
