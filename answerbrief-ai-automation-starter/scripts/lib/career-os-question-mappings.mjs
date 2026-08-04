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
  return month && year ? `${monthNumber(month)}/${year}` : '';
}

function currentTitle(task) {
  return clean(task?.candidate?.primaryEmployment?.title || task?.candidate?.currentTitle);
}

function monthNumber(value) {
  const month = clean(value).toLowerCase().slice(0, 3);
  const months = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  return months[month] || clean(value);
}

function primaryRoleDescription(task) {
  const explicit = clean(task?.candidate?.primaryEmployment?.description || task?.candidate?.roleDescription);
  if (explicit) return explicit;
  const resume = clean(task?.resume?.content || task?.rawRecord?.resume_content || task?.rawRecord?.exact_resume);
  const experience = resume.match(/EXPERIENCE\s+[\s\S]*?\n([^\n]+strategy[^\n]+journeys\.)/i);
  if (experience?.[1]) return clean(experience[1]);
  return 'Enterprise platform strategy and roadmap execution supporting complex customer and operational journeys.';
}

function educationText(task) {
  const education = task?.candidate?.educationHistory || task?.candidate?.education || [];
  if (Array.isArray(education)) return clean(education[0]);
  return clean(education);
}

function educationSchool(task) {
  const text = educationText(task);
  const parts = text.split(/\s+-\s+/).map(clean).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : clean(task?.candidate?.school || task?.candidate?.university);
}

function educationField(task) {
  const text = educationText(task);
  const beforeSchool = text.split(/\s+-\s+/)[0] || '';
  const commaParts = beforeSchool.split(',').map(clean).filter(Boolean);
  return commaParts.length > 1 ? commaParts[commaParts.length - 1] : clean(task?.candidate?.fieldOfStudy);
}

function educationDegree(task) {
  const text = educationText(task);
  if (/master|m\.s\.|ms\b/i.test(text)) return "Master's Degree";
  if (/bachelor|b\.s\.|ba\b|bs\b/i.test(text)) return "Bachelor's Degree";
  if (/associate/i.test(text)) return "Associate's Degree";
  return clean(task?.candidate?.degree);
}

function homeAddress(task) {
  return clean(task?.candidate?.fullAddress || task?.candidate?.streetAddress);
}

function yesNoCandidateAnswer(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const normalized = clean(value).toLowerCase();
  if (!normalized) return undefined;
  if (['yes', 'y', 'true'].includes(normalized)) return 'Yes';
  if (['no', 'n', 'false'].includes(normalized)) return 'No';
  return clean(value);
}

function candidateValueFrom(context, keys) {
  const candidate = context?.candidate || {};
  const containers = [
    candidate.employerSpecificAnswers,
    candidate.reusableApplicationAnswers,
    candidate.reusable_application_answers,
    context?.applicationAnswers,
    context?.rawRecord?.application_answers,
    context?.rawRecord?.verified_profile?.reusable_application_answers,
  ].filter((item) => item && typeof item === 'object');
  for (const container of containers) {
    for (const key of keys) {
      if (container[key] !== undefined && container[key] !== null && clean(container[key]) !== '') return container[key];
    }
  }
  for (const key of keys) {
    if (candidate[key] !== undefined && candidate[key] !== null && clean(candidate[key]) !== '') return candidate[key];
  }
  return undefined;
}

function candidateYesNoFrom(context, keys) {
  return yesNoCandidateAnswer(candidateValueFrom(context, keys));
}

function relevantExperienceYears(task) {
  const candidate = task?.candidate || {};
  const explicit = Number(candidate.relevantExperienceYears || candidate.totalExperienceYears || candidate.yearsOfExperience);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const records = [
    candidate.verifiedEmploymentTenure,
    candidate.primaryEmployment,
    ...(Array.isArray(candidate.employmentHistory) ? candidate.employmentHistory : []),
  ].filter(Boolean);
  const currentYear = new Date().getFullYear();
  for (const record of records) {
    const startYear = Number(record.startYear || record.start_year || record.tenure_start_year);
    const endYear = Number(record.endYear || record.end_year || record.tenure_end_year || currentYear);
    if (Number.isFinite(startYear) && Number.isFinite(endYear) && endYear >= startYear) {
      return Math.max(1, Math.floor(endYear - startYear));
    }
  }
  return undefined;
}

export function buildWorkdayQuestionMappings(task, overrides = {}) {
  const referralValue = clean(overrides.referralValue || task.candidate.referralSource);
  const referralStrategy = clean(overrides.referralStrategy)
    || (referralValue ? 'match_value' : 'first_available');
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
      key: 'address_line_1',
      kind: 'text',
      matchers: [/address line 1/i, /^address 1$/i, /street address/i],
      value: homeAddress(task),
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
      value: 'United States of America (+1)',
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
      strategy: referralStrategy,
      value: referralValue || undefined,
    },
    {
      key: 'prior_cisco_identity',
      kind: 'radio',
      matchers: [/have you ever been issued a cisco employee id or cisco email address/i],
      value: 'No',
    },
    {
      key: 'work_authorization_posted_location',
      kind: 'select',
      matchers: [
        /legally authorized to work.*posted location/i,
        /legally authorized to work.*posted locations/i,
        /legally authorized to work.*requisition/i,
        /eligible to work in the country.*position is located/i,
      ],
      resolve: ({ context }) => context.candidate.usWorkAuthorization ? 'Yes' : 'No',
    },
    {
      key: 'sponsorship_employment_visa_posted_locations',
      kind: 'select',
      matchers: [
        /require sponsorship.*employment visa.*posted location/i,
        /require sponsorship.*employment visa.*posted locations/i,
        /future require sponsorship.*employment visa/i,
        /immigration related support or sponsorship.*maintain.*work authorization/i,
      ],
      resolve: ({ context }) => {
        const value = candidateValueFrom(context, [
          'sponsorshipFuture',
          'sponsorshipNow',
          'requires_sponsorship_now_or_future',
          'requires_future_sponsorship',
          'requires_current_sponsorship',
        ]);
        return yesNoCandidateAnswer(value);
      },
    },
    {
      key: 'relevant_work_experience_years',
      kind: 'select',
      matchers: [/how many years of relevant work experience/i, /years of relevant work experience related to this position/i],
      strategy: 'max_years_at_most',
      value: relevantExperienceYears(task),
    },
    {
      key: 'basic_qualifications_met',
      kind: 'select',
      matchers: [/meet all .*basic qualifications/i, /meet .*minimum qualifications/i],
      value: 'Yes',
    },
    {
      key: 'preferred_qualifications_met',
      kind: 'select',
      matchers: [/meet .*preferred qualifications/i],
      value: 'Yes',
    },
    {
      key: 'age_18_or_over',
      kind: 'select',
      matchers: [/age 18 or over/i, /at least 18 years old/i],
      value: 'Yes',
    },
    {
      key: 'essential_functions_with_or_without_accommodation',
      kind: 'select',
      matchers: [/perform the essential functions.*with or without reasonable accommodations/i],
      value: 'Yes',
    },
    {
      key: 'background_check_willingness',
      kind: 'select',
      matchers: [/willing to submit .*background check/i, /submit .*background check.*hiring process/i],
      value: 'Yes',
    },
    {
      key: 'employer_relative_employed',
      kind: 'select',
      matchers: [/relatives? employed by/i, /family members?.*employed by/i],
      value: 'No',
    },
    {
      key: 'employer_close_personal_relationship',
      kind: 'select',
      matchers: [/close .*personal relationship.*employed by/i, /personal relationships?.*shared financial interests.*employed by/i],
      value: 'No',
    },
    {
      key: 'senior_government_official_referral',
      kind: 'select',
      matchers: [/referred.*senior government official/i],
      value: 'No',
    },
    {
      key: 'senior_government_official_relationship',
      kind: 'select',
      matchers: [/related to a senior government official/i],
      value: 'No',
    },
    {
      key: 'second_job_or_outside_business',
      kind: 'select',
      matchers: [/second job.*outside business/i, /other employment.*continue.*while employed/i],
      value: 'No',
    },
    {
      key: 'noncompete_non_solicit_restriction',
      kind: 'select',
      matchers: [/non-compete|non-solicitation|restrict you from recruiting|soliciting/i],
      value: 'No',
    },
    {
      key: 'military_service',
      kind: 'select',
      matchers: [/currently serving.*armed forces/i, /served in the armed forces/i, /u\.s\. military/i],
      value: 'No',
    },
    {
      key: 'military_spouse_or_partner',
      kind: 'select',
      matchers: [/spouse or partner.*armed forces/i, /spouse.*served.*military/i],
      value: 'No',
    },
    {
      key: 'outside_business_ethics_acknowledgement',
      kind: 'select',
      matchers: [/acknowledge.*understanding.*ethics office/i, /responding.*yes.*ethics office/i],
      value: 'Yes',
    },
    {
      key: 'independent_accounting_firm_ey',
      kind: 'select',
      matchers: [/independent accounting firm.*ernst.*young/i, /ernst\s*&\s*young/i],
      value: 'No',
    },
    {
      key: 'government_official_status',
      kind: 'select',
      matchers: [
        /currently or previously appointed as.*government official/i,
        /employed by.*government.*entity/i,
        /current.*former.*government official/i,
      ],
      resolve: ({ context }) => candidateYesNoFrom(context, [
        'currentOrFormerGovernmentOfficial',
        'current_or_former_government_official',
        'governmentOfficialEmployment',
        'government_official_employment',
        'employedByGovernmentEntity',
        'employed_by_government_entity',
      ]),
    },
    {
      key: 'government_official_family_contact',
      kind: 'select',
      matchers: [
        /family relationship.*government official/i,
        /close personal contact.*government official/i,
        /family relationship.*foreign government official/i,
      ],
      resolve: ({ context }) => candidateYesNoFrom(context, [
        'governmentOfficialFamilyOrCloseContact',
        'government_official_family_or_close_contact',
        'familyOrCloseContactGovernmentOfficial',
        'family_or_close_contact_government_official',
      ]),
    },
    {
      key: 'prior_employer_employment',
      kind: 'select',
      matchers: [
        /have you previously worked at/i,
        /have you ever worked for/i,
        /worked for .* predecessor/i,
        /previous .*employee.*acquired/i,
        /employed by a company acquired/i,
        /worked at .*company acquired/i,
        /worked at .*employee.*contractor.*consultant.*temp/i,
        /previously worked at/i,
        /previously employed by/i,
        /prior employment/i,
      ],
      resolve: ({ context }) => {
        return clean(context?.candidate?.employerSpecificAnswers?.previouslyWorkedAtEmployer)
          || clean(context?.candidate?.employerSpecificAnswers?.previously_worked_at_employer)
          || clean(context?.candidate?.previouslyWorkedAtEmployer)
          || clean(context?.candidate?.previously_worked_at_employer)
          || clean(context?.rawRecord?.previously_worked_at_employer)
          || clean(context?.rawRecord?.application_answers?.previously_worked_at_employer)
          || 'No';
      },
    },
    {
      key: 'prior_employer_supervisor_name',
      kind: 'text',
      matchers: [
        /supervisor/i,
        /manager name/i,
        /former manager/i,
        /who was your supervisor/i,
        /name of supervisor/i,
      ],
      resolve: ({ context }) => clean(context?.candidate?.employerSpecificAnswers?.priorEmployerSupervisorName),
    },
    {
      key: 'prior_employer_work_location',
      kind: 'text',
      matchers: [/primary work location/i, /work location/i],
      resolve: ({ context }) => clean(context?.candidate?.employerSpecificAnswers?.priorEmployerWorkLocation),
    },
    {
      key: 'prior_employer_work_email',
      kind: 'text',
      matchers: [/work email/i, /company email/i, /business email/i],
      resolve: ({ context }) => clean(context?.candidate?.employerSpecificAnswers?.priorEmployerWorkEmail),
    },
    {
      key: 'prior_employer_employee_id',
      kind: 'text',
      matchers: [/employee id/i, /enterprise id/i],
      resolve: ({ context }) => clean(context?.candidate?.employerSpecificAnswers?.priorEmployerEmployeeId),
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
      matchers: [/\bcompany\b/i, /\bemployer\b/i, /^current employer$/i],
      valueFrom: 'candidate.primaryEmployment.employer',
    },
    {
      key: 'employment_job_title',
      kind: 'text',
      matchers: [/\bjob title\b/i, /^position$/i, /^role$/i],
      valueFrom: 'candidate.primaryEmployment.title',
    },
    {
      key: 'employment_current_employer',
      kind: 'radio',
      matchers: [/currently work here/i, /current employer/i],
      strategy: 'first_available',
      resolve: ({ context }) => context?.candidate?.primaryEmployment?.currentEmployer ? '__first_available__' : '',
    },
    {
      key: 'employment_from',
      kind: 'text',
      matchers: [/\bfrom\b/i, /^start date$/i],
      value: employmentDate(task, 'start'),
    },
    {
      key: 'employment_to',
      kind: 'text',
      matchers: [/\bto\b/i, /^end date$/i],
      value: employmentDate(task, 'end'),
    },
    {
      key: 'employment_role_description',
      kind: 'text',
      matchers: [/role description/i, /responsibilities/i, /description/i],
      value: primaryRoleDescription(task),
    },
    {
      key: 'education_school',
      kind: 'text',
      matchers: [/school or university/i, /^school$/i, /^university$/i],
      value: educationSchool(task),
    },
    {
      key: 'education_degree',
      kind: 'select',
      matchers: [/^degree$/i, /\bdegree\b/i],
      value: educationDegree(task),
    },
    {
      key: 'education_field_of_study',
      kind: 'select',
      matchers: [/field of study/i, /major/i],
      value: educationField(task),
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
      matchers: [/current or most recent employer/i, /most recent employer/i, /current employer/i, /^company$/i, /^employer$/i],
      resolve: ({ context }) => clean(context?.candidate?.currentCompany || context?.candidate?.primaryEmployment?.employer),
    },
    {
      key: 'current_title',
      kind: 'text',
      matchers: [/current or most recent job title/i, /most recent job title/i, /current title/i, /current job title/i, /current role/i],
      value: currentTitle(task),
    },
    {
      key: 'home_address',
      kind: 'text',
      matchers: [/home address/i, /street address/i, /address line 1/i, /^address$/i],
      value: homeAddress(task),
    },
    {
      key: 'referral_source',
      kind: 'select',
      matchers: [/how did you hear about/i, /how did you learn about/i, /how did you first learn about/i, /where have you learned about/i],
      strategy: overrides.referralStrategy || 'first_available',
      value: overrides.referralValue || task.candidate.referralSourceAffirmFallback || task.candidate.referralSource || 'Careers Page',
    },
    {
      key: 'us_work_authorization',
      kind: 'select',
      matchers: [/right to work in the us/i, /legal right to work/i, /authorized to work/i, /visa \/ work permit/i],
      resolve: ({ context }) => context.candidate.usWorkAuthorization ? 'Yes' : 'No',
    },
    {
      key: 'sponsorship_now',
      kind: 'select',
      matchers: [
        /require immigration sponsorship.*united states/i,
        /work permit.*visa.*support/i,
        /visa.*additional right to work support/i,
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
      matchers: [
        /have you previously worked at samsara/i,
        /previously been employed at affirm/i,
        /currently work for.*previously worked for/i,
        /previously worked for/i,
        /worked at nice/i,
        /worked for/i,
      ],
      resolve: ({ context }) => context.candidate.employerSpecificAnswers?.previouslyWorkedAtEmployer || context.candidate.previouslyWorkedAtEmployer || 'No',
    },
    {
      key: 'london_office_in_person',
      kind: 'select',
      matchers: [/working in person.*london office/i, /london office.*2-3 times a week/i],
      value: 'No',
    },
    {
      key: 'current_former_employer_restriction',
      kind: 'select',
      matchers: [/bound by any agreements/i, /restrict your ability to work/i, /non.?compete/i, /non.?solicit/i],
      value: 'No',
    },
    {
      key: 'government_procurement_conflict',
      kind: 'select',
      matchers: [/government employee/i, /government official/i, /procurement or contract award/i, /contract award activities/i],
      value: 'No',
    },
    {
      key: 'ordinary_acknowledgement',
      kind: 'radio',
      matchers: [/^i agree\.?$/i, /\bi agree\b/i, /applicant privacy/i, /candidate privacy/i, /processing of personal data/i, /consent/i],
      value: 'I Agree',
    },
    {
      key: 'gender_decline',
      kind: 'select',
      matchers: [/^gender/i, /voluntary self-identification of gender/i, /how do you identify/i],
      strategy: 'decline',
    },
    {
      key: 'race_ethnicity_decline',
      kind: 'select',
      matchers: [/race\/ethnicity/i, /race.*ethnicity/i, /ethnicity/i, /hispanic/i, /latino/i],
      strategy: 'decline',
    },
    {
      key: 'veteran_decline',
      kind: 'select',
      matchers: [/veteran status/i, /protected veteran/i],
      strategy: 'decline',
    },
    {
      key: 'disability_decline',
      kind: 'select',
      matchers: [/disability status/i, /self-identification of disability/i, /do you have a disability/i],
      strategy: 'decline',
    },
    ...buildCatalogDrivenGreenhouseMappings(task),
  ];
}
