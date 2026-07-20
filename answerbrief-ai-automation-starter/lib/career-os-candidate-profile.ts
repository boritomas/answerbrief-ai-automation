type JsonRecord = Record<string, unknown>;

export type CandidateEmploymentRecord = {
  currentEmployer: boolean;
  datePrecision: 'month' | 'month_year' | 'year' | 'unknown';
  employer?: string;
  endMonth?: string;
  endYear?: number;
  location?: string;
  missingVerifiedFields: string[];
  source: string;
  startMonth?: string;
  startYear?: number;
  title?: string;
  verificationState: string;
};

export type CandidateProfile = {
  city?: string;
  countryRegion?: string;
  currentCompany?: string;
  email?: string;
  employmentHistory: CandidateEmploymentRecord[];
  firstName?: string;
  lastName?: string;
  linkedin?: string;
  phone?: string;
  postalCode?: string;
  preferredName?: string;
  primaryEmployment?: CandidateEmploymentRecord;
  pronouns?: string;
  referralSource?: string;
  sponsorshipFuture?: string;
  sponsorshipNow?: string;
  stateOrProvince?: string;
  usWorkAuthorization?: boolean;
};

export function buildCandidateProfile(verifiedProfileInput: unknown, profileInput: unknown, applicationAnswersInput: unknown): CandidateProfile {
  const verifiedProfile = asRecord(verifiedProfileInput);
  const profile = asRecord(profileInput);
  const applicationAnswers = asRecord(applicationAnswersInput);
  const contact = asRecord(verifiedProfile.contact);
  const reusableAnswers = asRecord(verifiedProfile.reusable_application_answers);
  const sponsorship = asRecord(verifiedProfile.sponsorship_requirement);
  const pronouns = asRecord(verifiedProfile.pronouns);
  const referralSource = asRecord(verifiedProfile.referral_source);
  const displayName = stringValue(profile.display_name) || 'Tomas Nieves';
  const [firstName = 'Tomas', ...rest] = displayName.split(/\s+/);
  const lastName = rest.length ? rest[rest.length - 1] : 'Nieves';
  const knownLocation = [stringValue(contact.city || reusableAnswers.city), stringValue(contact.state || contact.state_or_province || reusableAnswers.state_or_province || verifiedProfile.state_or_province)]
    .filter(Boolean)
    .join(', ');
  const currentCompany = stringValue(
    verifiedProfile.current_company
    || reusableAnswers.current_company
    || asRecord(verifiedProfile.employment).current_company,
  );
  const employmentHistory = arrayRecords(verifiedProfile.employment_history)
    .map((row, index) => canonicalEmploymentRecord(row, index, currentCompany, knownLocation))
    .filter((record) => record.employer || record.title);
  const verifiedTenure = asRecord(applicationAnswers.verified_employment_tenure);
  const primaryEmployment = choosePrimaryEmployment(employmentHistory, verifiedTenure);

  return {
    city: stringValue(contact.city || reusableAnswers.city),
    countryRegion: 'United States of America',
    currentCompany: currentCompany || primaryEmployment?.employer,
    email: stringValue(contact.email),
    employmentHistory,
    firstName,
    lastName,
    linkedin: stringValue(contact.linkedin || verifiedProfile.linkedin),
    phone: stringValue(contact.phone),
    postalCode: stringValue(contact.postal_code || reusableAnswers.postal_code),
    preferredName: firstName,
    primaryEmployment,
    pronouns: stringValue(pronouns.answer),
    referralSource: stringValue(referralSource.value),
    sponsorshipFuture: stringValue(sponsorship.answer_label),
    sponsorshipNow: stringValue(sponsorship.answer_label),
    stateOrProvince: stringValue(reusableAnswers.state_or_province || contact.state || contact.state_or_province),
    usWorkAuthorization: reusableAnswers.us_work_authorization === true,
  };
}

export function formatEmploymentDate(record: CandidateEmploymentRecord | undefined, which: 'start' | 'end') {
  if (!record) return '';
  const month = which === 'start' ? record.startMonth : record.endMonth;
  const year = which === 'start' ? record.startYear : record.endYear;
  if (!month || !year) return '';
  return `${month} ${year}`;
}

export function employmentDateValidation(record: CandidateEmploymentRecord | undefined) {
  if (!record) {
    return {
      canAutofillWorkday: false,
      missingVerifiedFields: ['Employment History'],
    };
  }

  const missing = [
    !record.title ? 'Job Title' : '',
    !record.employer ? 'Company' : '',
    !record.startMonth ? 'From Month' : '',
    !record.startYear ? 'From Year' : '',
    !record.endMonth && !record.currentEmployer ? 'To Month' : '',
    !record.endYear && !record.currentEmployer ? 'To Year' : '',
  ].filter(Boolean);

  return {
    canAutofillWorkday: missing.length === 0,
    missingVerifiedFields: missing,
  };
}

function choosePrimaryEmployment(records: CandidateEmploymentRecord[], verifiedTenure: JsonRecord) {
  const verifiedEmployer = compactKey(verifiedTenure.employer);
  const current = records.find((record) => record.currentEmployer);
  const verifiedMatch = verifiedEmployer ? records.find((record) => compactKey(record.employer) === verifiedEmployer) : undefined;
  return verifiedMatch || current || records[0];
}

function canonicalEmploymentRecord(raw: JsonRecord, index: number, currentCompany: string, knownLocation: string): CandidateEmploymentRecord {
  const employer = stringValue(raw.employer || raw.company);
  const title = stringValue(raw.title || raw.job_title || raw.position || raw.role);
  const parsed = parseEmploymentPeriod(raw);
  const currentEmployer = booleanValue(raw.current_employer ?? raw.currentEmployer)
    || Boolean(index === 0 && currentCompany && compactKey(employer) === compactKey(currentCompany));
  const missingVerifiedFields = [
    !employer ? 'Employer' : '',
    !title ? 'Job Title' : '',
    !parsed.startMonth ? 'Start Month' : '',
    !parsed.startYear ? 'Start Year' : '',
    !currentEmployer && !parsed.endMonth ? 'End Month' : '',
    !currentEmployer && !parsed.endYear ? 'End Year' : '',
  ].filter(Boolean);

  return {
    currentEmployer,
    datePrecision: parsed.datePrecision,
    employer: employer || undefined,
    endMonth: parsed.endMonth,
    endYear: parsed.endYear,
    location: stringValue(raw.location) || knownLocation || undefined,
    missingVerifiedFields,
    source: stringValue(raw.source) || 'verified_profile.employment_history',
    startMonth: parsed.startMonth,
    startYear: parsed.startYear,
    title: title || undefined,
    verificationState: stringValue(raw.verification_state || raw.verificationState) || 'requires_verification',
  };
}

function parseEmploymentPeriod(raw: JsonRecord) {
  const period = stringValue(raw.period || raw.date_range || raw.dates);
  const explicitStartMonth = monthName(raw.start_month || raw.startMonth);
  const explicitEndMonth = monthName(raw.end_month || raw.endMonth);
  const explicitStartYear = yearValue(raw.start_year || raw.startYear);
  const explicitEndYear = yearValue(raw.end_year || raw.endYear);
  const periodDates = Array.from(period.matchAll(/(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?((?:19|20)\d{2})/gi))
    .map((match) => ({ month: monthName(match[1]), year: yearValue(match[2]) }))
    .filter((date) => date.year);
  const first = periodDates[0];
  const last = periodDates.length > 1 ? periodDates[periodDates.length - 1] : undefined;
  const startMonth = explicitStartMonth || first?.month;
  const startYear = explicitStartYear || first?.year;
  const endMonth = explicitEndMonth || last?.month;
  const endYear = explicitEndYear || last?.year;

  return {
    datePrecision: determineDatePrecision(startMonth, startYear, endMonth, endYear),
    endMonth,
    endYear,
    startMonth,
    startYear,
  };
}

function determineDatePrecision(
  startMonth?: string,
  startYear?: number,
  endMonth?: string,
  endYear?: number,
): CandidateEmploymentRecord['datePrecision'] {
  if ((startMonth && startYear) || (endMonth && endYear)) return 'month_year';
  if (startYear || endYear) return 'year';
  if (startMonth || endMonth) return 'month';
  return 'unknown';
}

function monthName(value: unknown) {
  const text = stringValue(value).toLowerCase();
  if (!text) return undefined;
  const month = text.slice(0, 3);
  const names: Record<string, string> = {
    apr: 'April',
    aug: 'August',
    dec: 'December',
    feb: 'February',
    jan: 'January',
    jul: 'July',
    jun: 'June',
    mar: 'March',
    may: 'May',
    nov: 'November',
    oct: 'October',
    sep: 'September',
  };
  return names[month];
}

function yearValue(value: unknown) {
  const text = stringValue(value);
  if (!/^(19|20)\d{2}$/.test(text)) return undefined;
  return Number(text);
}

function compactKey(value: unknown) {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function arrayRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function booleanValue(value: unknown) {
  return value === true || value === 'true';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
