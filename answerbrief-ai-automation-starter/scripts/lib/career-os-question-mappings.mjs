function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function isBooleanLikeAnswer(value) {
  return /^(yes|no|true|false)$/i.test(clean(value));
}

function exactQuestionAnswer(question) {
  const answer = question?.verifiedMappedAnswer || {};
  const preferred = answer.answer_label ?? answer.value ?? answer.answer;
  if (typeof preferred === 'boolean') return preferred ? 'Yes' : 'No';
  const cleaned = clean(preferred);
  if (/^true$/i.test(cleaned)) return 'Yes';
  if (/^false$/i.test(cleaned)) return 'No';
  return cleaned;
}

function isChoiceLikeQuestion(questionText) {
  return /(select all that apply|which of the following|how did you hear|are you |will you |do you |have you |did you )/i.test(clean(questionText));
}

function buildCatalogDrivenGreenhouseMappings(task) {
  const catalog = Array.isArray(task?.questionCatalog) ? task.questionCatalog : [];
  return catalog
    .map((question, index) => {
      const exactWording = clean(question?.exactWording);
      const answer = exactQuestionAnswer(question);
      if (!exactWording || !answer || exactWording.toLowerCase() === 'text') return null;

      const allowedOptions = Array.isArray(question?.allowedOptions)
        ? question.allowedOptions.map((option) => clean(option)).filter(Boolean)
        : [];
      const kind = allowedOptions.length > 0 || isBooleanLikeAnswer(answer) || isChoiceLikeQuestion(exactWording)
        ? 'select'
        : 'text';

      return {
        key: `catalog_${index}`,
        kind,
        matchers: [exactWording],
        value: answer,
      };
    })
    .filter(Boolean);
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

export function buildGreenhouseQuestionMappings(task, overrides = {}) {
  return [
    {
      key: 'country_region',
      kind: 'select',
      matchers: [/^country\b/i, /country or region/i],
      resolve: ({ context, field }) => {
        const label = clean(field?.label).toLowerCase();
        if (label.includes('country')) return 'United States +1';
        return context.candidate.countryRegion || 'United States +1';
      },
    },
    {
      key: 'preferred_first_name',
      kind: 'text',
      matchers: [/preferred first name/i, /^preferred name$/i],
      valueFrom: 'candidate.preferredName',
    },
    {
      key: 'preferred_last_name',
      kind: 'text',
      matchers: [/preferred last name/i],
      valueFrom: 'candidate.lastName',
    },
    {
      key: 'city',
      kind: 'text',
      matchers: [/^city$/i, /^location\s*\(city\)/i, /^location city$/i],
      valueFrom: 'candidate.city',
    },
    {
      key: 'location',
      kind: 'text',
      matchers: [/^location$/i, /^location\b/i],
      resolve: ({ context, field }) => {
        const label = clean(field?.label).toLowerCase();
        if (label.includes('city')) return context.candidate.city || '';
        return [context.candidate.city, context.candidate.stateOrProvince].filter(Boolean).join(', ');
      },
    },
    {
      key: 'state',
      kind: 'select',
      matchers: [/^state$/i, /state or canadian province/i],
      valueFrom: 'candidate.stateOrProvince',
    },
    {
      key: 'postal_code',
      kind: 'text',
      matchers: [/postal code/i, /\bzip\b/i],
      valueFrom: 'candidate.postalCode',
    },
    {
      key: 'email',
      kind: 'text',
      matchers: [/email address/i, /^email$/i],
      value: overrides.email || task.candidate.email,
    },
    {
      key: 'phone_number',
      kind: 'text',
      matchers: [/phone number/i, /^phone$/i],
      value: digitsOnly(task.candidate.phone),
    },
    {
      key: 'current_employer',
      kind: 'text',
      matchers: [/current employer/i, /^company$/i, /^employer$/i],
      valueFrom: 'candidate.currentCompany',
    },
    {
      key: 'referral_source',
      kind: 'select',
      matchers: [/how did you hear about/i, /how did you first learn about/i, /where have you learned about/i],
      strategy: overrides.referralStrategy || '',
      value: overrides.referralValue || task.candidate.referralSourceAffirmFallback || task.candidate.referralSource,
    },
    {
      key: 'us_work_authorization',
      kind: 'select',
      matchers: [/right to work in the us/i, /authorized to work/i, /visa \/ work permit/i],
      resolve: ({ context }) => context.candidate.usWorkAuthorization ? 'Yes' : 'No',
    },
    {
      key: 'sponsorship_now',
      kind: 'select',
      matchers: [
        /require immigration sponsorship.*united states/i,
        /require .*sponsorship/i,
        /employment sponsorship/i,
        /sponsor.*immigration/i,
      ],
      valueFrom: 'candidate.sponsorshipNow',
    },
    {
      key: 'sponsorship_future',
      kind: 'select',
      matchers: [
        /require immigration sponsorship at any point in the future/i,
        /will you now or in the future require .*sponsorship/i,
      ],
      valueFrom: 'candidate.sponsorshipFuture',
    },
    {
      key: 'toast_privacy_acknowledgement',
      kind: 'radio',
      matchers: [
        /toast'?s applicant privacy statement/i,
        /information i have provided as part of this job application will be processed in accordance with toast/i,
      ],
      value: 'I agree',
    },
    {
      key: 'previously_worked_at_employer',
      kind: 'select',
      matchers: [/have you previously worked at samsara/i, /previously been employed at affirm/i, /worked at nice/i],
      resolve: ({ context }) => context.candidate.employerSpecificAnswers?.previouslyWorkedAtEmployer || context.candidate.previouslyWorkedAtEmployer,
    },
    ...buildCatalogDrivenGreenhouseMappings(task),
  ];
}
