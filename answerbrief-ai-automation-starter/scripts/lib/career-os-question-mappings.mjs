function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function digitsOnly(value) {
  return clean(value).replace(/[^0-9]/g, '');
}

function employmentDate(task, which) {
  const record = task.candidate.primaryEmployment;
  if (!record) return '';
  const month = which === 'start' ? record.startMonth : record.endMonth;
  const year = which === 'start' ? record.startYear : record.endYear;
  return month && year ? `${month} ${year}` : '';
}

export function buildWorkdayQuestionMappings(task, overrides = {}) {
  return [
    {
      key: 'country_region',
      kind: 'select',
      matchers: [/country or region/i],
      value: 'United States of America',
    },
    {
      key: 'legal_first_name',
      kind: 'text',
      matchers: [/legal first name/i],
      valueFrom: 'candidate.firstName',
    },
    {
      key: 'legal_last_name',
      kind: 'text',
      matchers: [/legal last name/i],
      valueFrom: 'candidate.lastName',
    },
    {
      key: 'city',
      kind: 'text',
      matchers: [/^city/i],
      valueFrom: 'candidate.city',
    },
    {
      key: 'state',
      kind: 'select',
      matchers: [/^state/i],
      valueFrom: 'candidate.stateOrProvince',
    },
    {
      key: 'email',
      kind: 'text',
      matchers: [/email address/i, /^email/i],
      value: overrides.email || task.candidate.email,
    },
    {
      key: 'phone_device_type',
      kind: 'select',
      matchers: [/phone device type/i],
      value: 'Mobile',
    },
    {
      key: 'country_phone_code',
      kind: 'select',
      matchers: [/country phone code/i],
      value: '+1',
    },
    {
      key: 'phone_number',
      kind: 'text',
      matchers: [/phone number/i],
      value: digitsOnly(task.candidate.phone),
    },
    {
      key: 'referral_source',
      kind: 'select',
      matchers: [/how did you hear about us/i],
      strategy: overrides.referralStrategy || 'first_available',
      value: overrides.referralValue || task.candidate.referralSource,
    },
    {
      key: 'prior_cisco_identity',
      kind: 'radio',
      matchers: [/have you ever been issued a cisco employee id or cisco email address/i],
      value: 'No',
    },
    {
      key: 'postal_code',
      kind: 'text',
      matchers: [/postal code/i, /zip/i],
      valueFrom: 'candidate.postalCode',
    },
    {
      key: 'employment_company',
      kind: 'text',
      matchers: [/^company$/i, /^employer$/i, /^current employer$/i],
      valueFrom: 'candidate.primaryEmployment.employer',
    },
    {
      key: 'employment_job_title',
      kind: 'text',
      matchers: [/^job title$/i, /^position$/i, /^role$/i],
      valueFrom: 'candidate.primaryEmployment.title',
    },
    {
      key: 'employment_from',
      kind: 'text',
      matchers: [/^from$/i, /^start date$/i],
      value: employmentDate(task, 'start'),
    },
    {
      key: 'employment_to',
      kind: 'text',
      matchers: [/^to$/i, /^end date$/i],
      value: employmentDate(task, 'end'),
    },
  ];
}
