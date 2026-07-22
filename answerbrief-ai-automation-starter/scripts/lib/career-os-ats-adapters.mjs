import { applyFieldMappings } from './career-os-field-engine.mjs';
import { buildWorkdayQuestionMappings } from './career-os-question-mappings.mjs';

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(value) {
  return value.replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, '\\$1');
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const CAPTCHA_TEXT_PATTERN = /verify you are human|i am human|complete the captcha|security challenge|bot verification|human verification|prove you are human/i;
const GREENHOUSE_CONFIRMATION_PATTERN = /thank you for applying|application has been received|we have received your application|application submitted|your application has been submitted/i;

function employmentDate(record, which) {
  if (!record) return '';
  const month = which === 'start' ? record.startMonth : record.endMonth;
  const year = which === 'start' ? record.startYear : record.endYear;
  return month && year ? `${month} ${year}` : '';
}

function exactOrEquivalentOption(options, value) {
  const target = normalized(value);
  if (!target) return '';
  const direct = options.find((option) => normalized(option) === target);
  if (direct) return direct;
  if (target === 'internet search') {
    const mapped = options.find((option) => normalized(option) === 'online search');
    if (mapped) return mapped;
  }
  const targetTokens = target.split(/\s+/).filter(Boolean);
  return options.find((option) => {
    const optionTokens = normalized(option).split(/\s+/).filter(Boolean);
    return targetTokens.length > 1
      && targetTokens.every((token) => optionTokens.includes(token));
  }) || '';
}

async function selectOptionByText(select, value) {
  const exact = await select.evaluate((node, answer) => {
    const options = Array.from(node.options || []).map((option) => ({
      label: String(option.label || '').trim(),
      value: String(option.value || '').trim(),
    }));
    const normalize = (input) => String(input || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const target = normalize(answer);
    const direct = options.find((option) => normalize(option.label) === target || normalize(option.value) === target);
    if (direct) return direct;
    const tokens = target.split(/\s+/).filter(Boolean);
    return options.find((option) => {
      const haystack = `${normalize(option.label)} ${normalize(option.value)}`.trim();
      return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
    }) || null;
  }, value);
  if (!exact) return false;
  if (exact.value) {
    await select.selectOption({ value: exact.value });
    return true;
  }
  if (exact.label) {
    await select.selectOption({ label: exact.label });
    return true;
  }
  return false;
}

async function clickButton(page, patterns, options = {}) {
  for (const pattern of patterns) {
    const button = page.locator('button, input[type="submit"], input[type="button"]').filter({ hasText: pattern }).first();
    if (await button.count()) {
      if (options.beforeClick) await options.beforeClick();
      await button.click();
      return true;
    }
    const input = page.locator('input[type="submit"], input[type="button"]').evaluateAll((nodes, source) => {
      const regex = new RegExp(source, 'i');
      const found = nodes.find((node) => regex.test(String(node.getAttribute('value') || '')));
      return found ? String(nodes.indexOf(found)) : '';
    }, pattern.source).catch(() => '');
    if (input) {
      const index = Number(input);
      if (Number.isFinite(index)) {
        if (options.beforeClick) await options.beforeClick();
        await page.locator('input[type="submit"], input[type="button"]').nth(index).click();
        return true;
      }
    }
  }
  return false;
}

async function bodyText(page) {
  return String(await page.textContent('body') || '');
}

async function resolveGreenhouseContext(page) {
  const embedded = page.frames().find((frame) => /job-boards\.greenhouse\.io\/embed\/job_app/i.test(frame.url()) || frame.name() === 'grnhse_iframe');
  return embedded || page;
}

function contextUrl(context, fallbackPage) {
  try {
    return typeof context?.url === 'function' ? clean(context.url()) : clean(fallbackPage?.url?.());
  } catch {
    return clean(fallbackPage?.url?.());
  }
}

export function detectVisibleCaptchaEvidence(snapshot = {}) {
  const candidates = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  for (const element of candidates) {
    const selector = clean(element.selector);
    const tagName = clean(element.tagName).toLowerCase();
    const title = clean(element.title);
    const src = clean(element.src);
    const className = clean(element.className);
    const text = clean(element.text);
    const visible = element.visible !== false;
    const haystack = `${selector} ${tagName} ${title} ${src} ${className} ${text}`.toLowerCase();
    if (!visible) continue;
    if (!/captcha|recaptcha|hcaptcha|turnstile|challenge|verify you are human|i am human|bot verification|security challenge/.test(haystack)) continue;
    const detectorType = src.includes('recaptcha') || className.includes('recaptcha') || title.toLowerCase().includes('recaptcha')
      ? 'visible_recaptcha'
      : src.includes('hcaptcha') || className.includes('hcaptcha') || title.toLowerCase().includes('hcaptcha')
        ? 'visible_hcaptcha'
        : src.includes('turnstile') || className.includes('turnstile') || title.toLowerCase().includes('turnstile')
          ? 'visible_turnstile'
          : /challenge|verify you are human|i am human|bot verification|security challenge/i.test(text || title)
            ? 'visible_challenge'
            : 'visible_captcha';
    return {
      detected: true,
      detectorType,
      matchedSelector: selector || tagName || 'unknown',
      visibleText: text,
      iframeSource: src,
      confidence: detectorType === 'visible_challenge' ? 0.82 : 0.98,
      detectedAt: clean(snapshot.detectedAt) || new Date().toISOString(),
    };
  }

  const visibleText = clean(snapshot.visibleText);
  if (CAPTCHA_TEXT_PATTERN.test(visibleText)) {
    return {
      detected: true,
      detectorType: 'visible_text',
      matchedSelector: 'body',
      visibleText,
      iframeSource: '',
      confidence: 0.74,
      detectedAt: clean(snapshot.detectedAt) || new Date().toISOString(),
    };
  }

  if (snapshot.employerReportedFailure === true) {
    return {
      detected: true,
      detectorType: 'employer_reported_failure',
      matchedSelector: '',
      visibleText,
      iframeSource: '',
      confidence: 0.9,
      detectedAt: clean(snapshot.detectedAt) || new Date().toISOString(),
    };
  }

  return {
    detected: false,
    detectorType: '',
    matchedSelector: '',
    visibleText,
    iframeSource: '',
    confidence: 0,
    detectedAt: clean(snapshot.detectedAt) || new Date().toISOString(),
  };
}

export function greenhouseConfirmationDetected({ currentUrl = '', pageText = '' } = {}) {
  const url = clean(currentUrl).toLowerCase();
  const text = clean(pageText);
  return url.endsWith('/confirmation')
    || GREENHOUSE_CONFIRMATION_PATTERN.test(text);
}

function greenhouseJobIdentity(url = '') {
  const value = clean(url);
  try {
    const parsed = new URL(value);
    return clean(parsed.searchParams.get('gh_jid') || parsed.searchParams.get('token'))
      || clean(parsed.pathname.match(/\/jobs\/(\d+)/i)?.[1])
      || clean(parsed.pathname.match(/\/roles\/(\d+)/i)?.[1]);
  } catch {
    return '';
  }
}

function greenhouseListingRedirected({ currentUrl = '', expectedUrl = '', pageText = '' } = {}) {
  const current = clean(currentUrl);
  const expectedId = greenhouseJobIdentity(expectedUrl);
  const currentId = greenhouseJobIdentity(currentUrl);
  const text = clean(pageText).toLowerCase();
  if (!current) return false;
  if (expectedId && currentId && expectedId === currentId) return false;
  if (expectedId && current.toLowerCase().includes(expectedId.toLowerCase())) return false;
  return /open positions|work at .*apply to open roles today|jobs at\b/.test(text)
    && !/submit application|resume|cover letter|application questions/i.test(text);
}

async function captureConfirmation(context, page, task, runtime, adapterId) {
  const text = await bodyText(context);
  const currentUrl = contextUrl(context, page);
  if (!greenhouseConfirmationDetected({ currentUrl, pageText: text })) {
    return false;
  }
  const screenshotPath = await runtime.takeShot(`${adapterId}-confirmed`);
  await runtime.report({
    status: 'confirmed',
    currentUrl,
    evidenceUrl: currentUrl,
    evidenceText: text.replace(/\s+/g, ' ').slice(0, 280).trim(),
    screenshotPath,
  });
  return true;
}

async function fillGreenhouseForm(page, task, runtime) {
  const context = await resolveGreenhouseContext(page);
  await fillInputFromLabel(context, /first name/i, task.candidate.firstName);
  await fillInputFromLabel(context, /last name/i, task.candidate.lastName);
  await fillInputFromLabel(context, /^email/i, task.candidate.email);
  await fillInputFromLabel(context, /^phone/i, task.candidate.phone);
  await fillInputFromLabel(context, /preferred name/i, task.candidate.preferredName);
  await fillInputFromLabel(context, /linkedin/i, task.candidate.linkedin);
  await fillInputFromLabel(context, /current company/i, task.candidate.currentCompany);

  const resumePath = await runtime.ensureResumeFile();
  const uploaded = await maybeUploadGreenhouseResume(context, resumePath, runtime);
  if (!uploaded) {
    throw new Error('Greenhouse resume upload field was not found.');
  }

  await selectFromLabel(context, /pronouns/i, task.candidate.pronouns);
  await selectFromLabel(context, /require immigration sponsorship.*united states/i, task.candidate.sponsorshipNow);
  await selectFromLabel(context, /require immigration sponsorship at any point in the future/i, task.candidate.sponsorshipFuture);
  await selectFromLabel(context, /state or canadian province/i, task.candidate.stateOrProvince);
  await selectFromLabel(context, /how did you first learn about/i, task.candidate.referralSourceAffirmFallback || task.candidate.referralSource);
  await selectFromLabel(context, /previously been employed at affirm/i, task.candidate.previouslyWorkedAtEmployer);
  await selectFromLabel(context, /visa \/ work permit/i, task.candidate.sponsorshipNow);
  await selectFromLabel(context, /worked at nice/i, 'No');
  await selectFromLabel(context, /first-degree relatives/i, 'No');
}

async function maybeUploadGreenhouseResume(context, resumePath, runtime) {
  const directSelectors = [
    'input[type="file"][name*="resume" i]',
    'input[type="file"][id*="resume" i]',
    'input[type="file"][aria-label*="resume" i]',
    'input[type="file"][name*="cv" i]',
    'input[type="file"][id*="cv" i]',
    '[data-qa*="resume" i] input[type="file"]',
    '[data-testid*="resume" i] input[type="file"]',
    '[class*="resume" i] input[type="file"]',
    'input[type="file"]',
  ];
  for (const selector of directSelectors) {
    const input = context.locator(selector).first();
    if (!await input.count()) continue;
    await input.setInputFiles(resumePath);
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Uploaded approved resume ${resumePath.split('/').pop()}.`,
    });
    return true;
  }

  const triggerPatterns = [
    /attach resume/i,
    /upload resume/i,
    /resume/i,
    /\bcv\b/i,
  ];
  for (const pattern of triggerPatterns) {
    const trigger = context.locator('label, button, a, div[role="button"], span').filter({ hasText: pattern }).first();
    if (!await trigger.count()) continue;
    await trigger.click().catch(() => null);
    await context.waitForTimeout(500);
    const candidate = await selectPreferredGreenhouseFileInput(context);
    if (!candidate) continue;
    await candidate.setInputFiles(resumePath);
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Uploaded approved resume ${resumePath.split('/').pop()}.`,
    });
    return true;
  }

  return false;
}

async function selectPreferredGreenhouseFileInput(context) {
  const index = await context.locator('input[type="file"]').evaluateAll((nodes) => {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const score = (node) => {
      const attrs = [
        node.getAttribute('name'),
        node.getAttribute('id'),
        node.getAttribute('aria-label'),
        node.getAttribute('data-qa'),
        node.getAttribute('data-testid'),
        node.className,
        node.parentElement?.textContent,
        node.closest('section, fieldset, div, label')?.textContent,
      ].map(normalize).join(' ');
      if (/cover letter/.test(attrs)) return -100;
      let points = 0;
      if (/resume/.test(attrs)) points += 5;
      if (/\bcv\b/.test(attrs)) points += 3;
      if (/attach|upload/.test(attrs)) points += 1;
      return points;
    };
    let bestIndex = -1;
    let bestScore = -101;
    nodes.forEach((node, currentIndex) => {
      if (!(node instanceof HTMLInputElement) || node.type !== 'file') return;
      const points = score(node);
      if (points > bestScore) {
        bestIndex = currentIndex;
        bestScore = points;
      }
    });
    return bestIndex;
  });
  if (!Number.isInteger(index) || index < 0) return null;
  return context.locator('input[type="file"]').nth(index);
}

async function detectUnresolvedGreenhouseFields(context, page, task, runtime) {
  const missing = await visibleRequiredFields(context);
  if (!missing.length) return false;
  const unresolved = missing.join('; ');
  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: contextUrl(context, page),
    evidenceText: `Greenhouse requires additional verified answers before continuing: ${unresolved}.`,
    screenshotPath: await runtime.safeShot('greenhouse-missing-required'),
    details: {
      classification: 'missing_required_field',
      missingRequiredFields: missing,
    },
  });
  return true;
}

async function visibleRequiredFields(context) {
  return context.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelTextFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('[data-automation-id], [role="group"], fieldset, .css-1, .css-0, div');
      const nearby = field?.querySelector?.('label, legend');
      return normalize(nearby?.textContent);
    };
    const empty = (element) => {
      if (element instanceof HTMLSelectElement) {
        return element.selectedIndex <= 0 || !normalize(element.value);
      }
      if (element instanceof HTMLInputElement) {
        if (element.type === 'radio' || element.type === 'checkbox') return false;
        return !normalize(element.value);
      }
      if (element instanceof HTMLTextAreaElement) return !normalize(element.value);
      return false;
    };

    const fields = [];
    for (const element of Array.from(document.querySelectorAll('input, select, textarea'))) {
      if (!(element instanceof HTMLElement) || !visible(element) || element.hasAttribute('disabled')) continue;
      const type = element instanceof HTMLInputElement ? element.type : '';
      if (['hidden', 'file', 'submit', 'button'].includes(type)) continue;
      const label = labelTextFor(element) || normalize(element.getAttribute('aria-label')) || normalize(element.getAttribute('placeholder'));
      const required = element.hasAttribute('required')
        || element.getAttribute('aria-required') === 'true'
        || /\*/.test(label);
      if (!required || !empty(element)) continue;
      fields.push(label || normalize(element.getAttribute('name')) || normalize(element.id) || type || element.tagName.toLowerCase());
    }

    const radioGroups = new Map();
    for (const element of Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))) {
      if (!(element instanceof HTMLInputElement) || !visible(element) || element.checked) continue;
      const key = element.name || element.id;
      const label = labelTextFor(element) || normalize(element.getAttribute('aria-label'));
      const required = element.hasAttribute('required')
        || element.getAttribute('aria-required') === 'true'
        || /\*/.test(label);
      if (!required || !key) continue;
      if (!radioGroups.has(key)) radioGroups.set(key, label || key);
    }

    return Array.from(new Set([...fields, ...radioGroups.values()])).filter(Boolean).slice(0, 12);
  });
}

async function maybeUploadWorkdayResume(page, task, runtime) {
  const resumePath = await runtime.ensureResumeFile();
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(resumePath);
    await page.waitForTimeout(1500);
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Uploaded approved resume ${resumePath.split('/').pop()}.`,
    });
    return true;
  }

  const uploadButton = page.locator('button').filter({ hasText: /upload from pc|upload resume|upload cv|attach resume|attach cv/i }).first();
  if (await uploadButton.count()) {
    await uploadButton.click();
    await page.waitForTimeout(750);
    const followUpInput = page.locator('input[type="file"]').first();
    if (await followUpInput.count()) {
      await followUpInput.setInputFiles(resumePath);
      await page.waitForTimeout(1500);
      await runtime.report({
        status: 'heartbeat',
        evidenceText: `Uploaded approved resume ${resumePath.split('/').pop()}.`,
      });
      return true;
    }
  }
  return false;
}

async function fillInputFromLabel(page, labelPattern, value) {
  if (!value) return false;
  const label = page.locator('label').filter({ hasText: labelPattern }).first();
  if (!await label.count()) return false;
  const forId = await label.getAttribute('for');
  if (forId) {
    const input = page.locator(`#${cssEscape(forId)}`).first();
    if (await input.count()) {
      await input.fill(String(value));
      return true;
    }
  }
  const input = label.locator('input, textarea').first();
  if (await input.count()) {
    await input.fill(String(value));
    return true;
  }
  return false;
}

async function fillInputBySelectors(page, selectors, value) {
  if (!value) return false;
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if (await input.count()) {
      await input.fill(String(value));
      return true;
    }
  }
  return false;
}

async function selectFromLabel(page, labelPattern, value) {
  if (!value) return false;
  const label = page.locator('label').filter({ hasText: labelPattern }).first();
  if (!await label.count()) return false;
  const forId = await label.getAttribute('for');
  if (forId) {
    const select = page.locator(`#${cssEscape(forId)}`).first();
    if (await select.count()) {
      return selectOptionByText(select, value);
    }
  }
  const select = label.locator('select').first();
  if (await select.count()) {
    return selectOptionByText(select, value);
  }
  return false;
}

async function selectBySelectors(page, selectors, value) {
  if (!value) return false;
  for (const selector of selectors) {
    const select = page.locator(selector).first();
    if (await select.count()) {
      const matched = await selectOptionByText(select, value);
      if (matched) return true;
    }
  }
  return false;
}

async function chooseRadioNearText(page, questionPattern, answer) {
  if (!answer) return false;
  const group = page.locator('fieldset, [role="group"], div').filter({ hasText: questionPattern }).first();
  if (!await group.count()) return false;
  const option = group.locator('label').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(answer)}\\s*$`, 'i') }).first();
  if (await option.count()) {
    const control = option.locator('input[type="radio"], input[type="checkbox"]').first();
    if (await control.count()) {
      await control.check();
      return true;
    }
  }
  return false;
}

async function detectWorkdayAccountGate(page, task, runtime) {
  const text = await bodyText(page);
  if (!/sign in|login|create account|create an account|forgot password/i.test(text)) return false;
  if (/you are applying for|my information|my experience|application questions/i.test(text)) return false;
  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: page.url(),
    evidenceText: 'Employer presented a Workday account or sign-in gate.',
    screenshotPath: await runtime.safeShot('workday-account-gate'),
  });
  return true;
}

async function detectSensitiveLegalGate(page, task, runtime) {
  const candidates = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
      .filter((element) => element instanceof HTMLInputElement && visible(element) && !element.checked)
      .map((element) => {
        const label = element.closest('label');
        const text = String(label?.textContent || element.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          required: element.required || element.getAttribute('aria-required') === 'true',
          text,
        };
      })
      .filter((item) => item.required && item.text);
  });
  const approved = (task.legal?.approvedAcknowledgements || []).map((item) => normalized(item));
  const gated = candidates.find((item) => /certify|electronic signature|terms|acknowledge|consent/i.test(item.text)
    && !approved.includes(normalized(item.text)));
  if (!gated) return false;
  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: page.url(),
    evidenceText: `Workday presented a required legal acknowledgement that is not yet verified for autonomous acceptance: ${gated.text}.`,
    screenshotPath: await runtime.safeShot('workday-legal-gate'),
  });
  return true;
}

async function fillWorkdayPage(page, task, runtime) {
  const mappingResults = await applyFieldMappings(
    page,
    buildWorkdayQuestionMappings(task, {
      email: 'tomas@nieves.com',
      referralStrategy: 'first_available',
    }),
    task,
  );
  const actions = mappingResults.filter((result) => result.applied).length;

  const tenure = task.candidate.verifiedEmploymentTenure;
  const primaryEmployment = task.candidate.primaryEmployment;
  if (tenure?.startYear) {
    await fillInputFromLabel(page, /start year/i, String(tenure.startYear));
  }
  if (tenure?.endYear) {
    await fillInputFromLabel(page, /end year/i, String(tenure.endYear));
  }
  if (primaryEmployment?.title) {
    await fillInputFromLabel(page, /^job title$/i, primaryEmployment.title);
  }
  if (primaryEmployment?.employer) {
    await fillInputFromLabel(page, /^company$|^employer$|^current employer$/i, primaryEmployment.employer);
  }
  const startDate = employmentDate(primaryEmployment, 'start');
  if (startDate) {
    await fillInputFromLabel(page, /^from$|^start date$/i, startDate);
  }
  const endDate = employmentDate(primaryEmployment, 'end');
  if (endDate) {
    await fillInputFromLabel(page, /^to$|^end date$/i, endDate);
  }

  await chooseRadioNearText(page, /preferred name/i, 'No');
  await chooseRadioNearText(page, /authorized to work in the united states|legally authorized to work in the united states|us work authorization/i, task.candidate.usWorkAuthorization ? 'Yes' : 'No');
  await chooseRadioNearText(page, /require.*sponsorship/i, task.candidate.sponsorshipNow);

  const unresolved = mappingResults.filter((result) => result.matched && !result.applied);
  if (unresolved.length) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: page.url(),
      evidenceText: `Workday field resolver left ${unresolved.length} mapped field(s) unresolved.`,
      details: { unresolvedFieldMappings: unresolved },
    });
  }

  return actions;
}

async function detectUnanswerableWorkdayFields(page, task, runtime) {
  const missing = await visibleRequiredFields(page);
  if (!missing.length) return false;
  const normalizedMissing = missing.map((label) => normalized(label));
  const employmentFieldVisible = normalizedMissing.some((label) => ['job title', 'company', 'employer', 'from', 'to', 'start date', 'end date'].includes(label));
  const missingEmploymentFacts = Array.isArray(task.candidate.primaryEmploymentMissingVerifiedFields)
    ? task.candidate.primaryEmploymentMissingVerifiedFields.filter(Boolean)
    : [];
  if (employmentFieldVisible && missingEmploymentFacts.length) {
    await runtime.report({
      status: 'waiting_on_tomas',
      currentUrl: page.url(),
      evidenceText: `Workday requires verified employment history facts before continuing: ${missingEmploymentFacts.join(', ')}.`,
      screenshotPath: await runtime.safeShot('workday-missing-verified-employment'),
      details: {
        missingEmploymentFacts,
        missingRequiredFields: missing,
        primaryEmployment: task.candidate.primaryEmployment || null,
      },
    });
    return true;
  }
  const safeToContinue = missing.every((label) => {
    const normalizedLabel = normalized(label);
    if (/phone device type/.test(normalizedLabel)) return false;
    if (/cisco employee id|cisco email/.test(normalizedLabel)) return false;
    if (/start month|end month|current role start/.test(normalizedLabel)) return false;
    return false;
  });
  if (safeToContinue) return false;
  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: page.url(),
    evidenceText: `Workday requires additional verified answers before continuing: ${missing.join('; ')}.`,
    screenshotPath: await runtime.safeShot('workday-missing-required'),
    details: { missingRequiredFields: missing },
  });
  return true;
}

async function clickOracleApplyNow(page) {
  const directSelectors = [
    'button.apply-now-button',
    '.job-details__section-apply-button button',
    'button:has-text("Apply Now")',
  ];
  for (const selector of directSelectors) {
    const button = page.locator(selector).first();
    if (!await button.count()) continue;
    await button.click().catch(() => null);
    await page.waitForTimeout(2500);
    if (/\/apply\//i.test(page.url())) return true;
  }

  const clicked = await clickButton(page, [/apply now/i]);
  if (clicked) {
    await page.waitForTimeout(2500);
    if (/\/apply\//i.test(page.url())) return true;
  }

  const evaluatedClick = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    const target = candidates.find((element) => /apply now/i.test(String(element.textContent || '')));
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }).catch(() => false);
  if (evaluatedClick) {
    await page.waitForTimeout(2500);
    if (/\/apply\//i.test(page.url())) return true;
  }

  return false;
}

async function fillOracleAuthenticationStep(page, task, runtime) {
  const email = task.candidate.email || 'tomas@nieves.com';
  const emailFilled = await fillInputBySelectors(page, [
    '#primary-email-0',
    'input[name="primary-email"]',
    'input[type="email"]',
  ], email);

  const consent = page.locator('#legal-disclaimer-checkbox').first();
  if (await consent.count()) {
    await consent.evaluate((element) => {
      if (!(element instanceof HTMLInputElement)) return;
      element.checked = true;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('click', { bubbles: true }));
    });
  }

  await runtime.report({
    status: 'heartbeat',
    currentUrl: page.url(),
    evidenceText: 'Filled Oracle Recruiting email-authentication step with Tomas’s verified career-search email and acknowledged the employer terms.',
  });

  return emailFilled;
}

async function detectOracleVerificationGate(page, task, runtime) {
  const gate = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const hasHCaptcha = Boolean(
      document.querySelector('#hCaptchaContainer')
      || document.querySelector('textarea[name="h-captcha-response"]')
      || document.querySelector('textarea[name="g-recaptcha-response"]')
      || document.querySelector('[data-hcaptcha-widget-id]')
      || Array.from(document.querySelectorAll('iframe')).some((frame) => /hcaptcha|recaptcha|captcha|challenge/i.test(String(frame.getAttribute('src') || frame.getAttribute('title') || ''))),
    );
    const visibleCaptcha = Array.from(document.querySelectorAll('iframe, [data-hcaptcha-widget-id], #hCaptchaContainer, .h-captcha, .g-recaptcha'))
      .some((element) => element instanceof HTMLElement && visible(element));
    return {
      hasHCaptcha,
      text,
      visibleCaptcha,
    };
  });

  if (!gate.hasHCaptcha) return false;

  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: page.url(),
    evidenceText: gate.visibleCaptcha
      ? 'Oracle Recruiting presented CAPTCHA or bot verification at the email-authentication step.'
      : 'Oracle Recruiting requires employer-controlled hCaptcha verification at the email-authentication step before automation can continue.',
    screenshotPath: await runtime.safeShot('oracle-auth-captcha'),
    details: {
      classification: 'captcha',
      provider: 'hcaptcha',
      step: 'email_authentication',
      visibleCaptcha: gate.visibleCaptcha,
    },
  });
  return true;
}

async function detectOracleAccountGate(page, task, runtime) {
  const text = await bodyText(page);
  if (!/sign in|create account|create an account|already have a profile|authentication screen/i.test(text)) return false;
  if (/email address|this is how we'll communicate with you/i.test(text)) return false;
  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: page.url(),
    evidenceText: 'Oracle Recruiting presented an account or sign-in gate before the application can continue.',
    screenshotPath: await runtime.safeShot('oracle-account-gate'),
    details: {
      classification: 'account',
      step: 'authentication',
    },
  });
  return true;
}

const greenhouseAdapter = {
  id: 'greenhouse',
  matches(task) {
    return /greenhouse/i.test(`${task.platform || ''} ${task.applicationUrl || ''}`);
  },
  async execute(page, task, runtime) {
    await runtime.report({ status: 'running', evidenceText: `Opening ${task.applicationUrl}` });
    await page.goto(task.applicationUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1500);
    await runtime.takeShot('greenhouse-opened');

    if (await runtime.detectCommonHumanGate()) return true;
    const context = await resolveGreenhouseContext(page);
    const openedText = await bodyText(context);
    if (greenhouseListingRedirected({ currentUrl: contextUrl(context, page), expectedUrl: task.applicationUrl, pageText: openedText })) {
      await runtime.report({
        status: 'failed',
        currentUrl: contextUrl(context, page),
        evidenceText: 'Greenhouse posting is no longer available; employer redirected to a generic careers listing.',
        screenshotPath: await runtime.safeShot('greenhouse-unavailable-redirect'),
      });
      return true;
    }

    await fillGreenhouseForm(page, task, runtime);
    await runtime.takeShot('greenhouse-filled');

    if (await runtime.detectCommonHumanGate()) return true;
    const refreshedContext = await resolveGreenhouseContext(page);
    if (await detectUnresolvedGreenhouseFields(refreshedContext, page, task, runtime)) return true;

    const submit = refreshedContext.locator('button[type="submit"], input[type="submit"]').filter({ hasText: /submit application|submit/i }).first();
    if (await submit.count()) {
      await runtime.assertSafeToSubmit();
      await runtime.report({ status: 'running', evidenceText: 'Submitting the employer application.' });
      await Promise.allSettled([
        page.waitForLoadState('domcontentloaded', { timeout: 20000 }),
        submit.click(),
      ]);
      await page.waitForTimeout(3000);
    }

    const confirmedContext = await resolveGreenhouseContext(page);
    if (await captureConfirmation(confirmedContext, page, task, runtime, 'greenhouse')) return true;

    await runtime.report({
      status: 'waiting_on_tomas',
      currentUrl: page.url(),
      evidenceText: 'Submission click completed, but no confirmation evidence was detected. Tomas should review the live employer page.',
      screenshotPath: await runtime.takeShot('greenhouse-after-submit'),
    });
    return true;
  },
};

const workdayAdapter = {
  id: 'workday',
  matches(task) {
    return /workday|myworkdayjobs|workday_via_phenom|phenom|careers\.cisco\.com\/.*\/apply/i.test(`${task.platform || ''} ${task.applicationUrl || ''}`);
  },
  async execute(page, task, runtime) {
    await runtime.report({ status: 'running', evidenceText: `Opening ${task.applicationUrl}` });
    await page.goto(task.applicationUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    await runtime.takeShot('workday-opened');

    if (await runtime.detectCommonHumanGate()) return true;
    if (await detectWorkdayAccountGate(page, task, runtime)) return true;

    for (let step = 1; step <= 8; step += 1) {
      await maybeUploadWorkdayResume(page, task, runtime);
      await fillWorkdayPage(page, task, runtime);
      await page.waitForTimeout(1000);
      await runtime.takeShot(`workday-step-${step}`);

      if (await captureConfirmation(page, task, runtime, 'workday')) return true;
      if (await runtime.detectCommonHumanGate()) return true;
      if (await detectWorkdayAccountGate(page, task, runtime)) return true;
      if (await detectSensitiveLegalGate(page, task, runtime)) return true;
      if (await detectUnanswerableWorkdayFields(page, task, runtime)) return true;

      const submitClicked = await clickButton(page, [/^submit$/i, /submit application/i], {
        beforeClick: () => runtime.assertSafeToSubmit(),
      });
      if (submitClicked) {
        await runtime.report({
          status: 'running',
          currentUrl: page.url(),
          evidenceText: `Submitting Workday application step ${step}.`,
        });
        await page.waitForTimeout(4000);
        if (await captureConfirmation(page, task, runtime, 'workday')) return true;
        continue;
      }

      const reviewClicked = await clickButton(page, [/^review$/i]);
      if (reviewClicked) {
        await runtime.report({
          status: 'heartbeat',
          currentUrl: page.url(),
          evidenceText: `Advanced Workday workflow to review step ${step}.`,
        });
        await page.waitForTimeout(2500);
        continue;
      }

      const nextClicked = await clickButton(page, [/^next$/i, /^continue$/i, /^save and continue$/i, /^review$/i]);
      if (nextClicked) {
        await runtime.report({
          status: 'heartbeat',
          currentUrl: page.url(),
          evidenceText: `Advanced Workday workflow to step ${step + 1}.`,
        });
        await page.waitForTimeout(2500);
        continue;
      }

      await runtime.report({
        status: 'blocked_technical',
        currentUrl: page.url(),
        evidenceText: 'Workday adapter could not find the next workflow action after populating the current page.',
        screenshotPath: await runtime.safeShot(`workday-no-next-${step}`),
      });
      return true;
    }

    await runtime.report({
      status: 'blocked_technical',
      currentUrl: page.url(),
      evidenceText: 'Workday adapter exceeded the guarded step budget without reaching confirmation.',
      screenshotPath: await runtime.safeShot('workday-step-budget-exhausted'),
    });
    return true;
  },
};

const oracleAdapter = {
  id: 'oracle',
  matches(task) {
    return /oracle/i.test(`${task.platform || ''}`) || /oraclecloud|candidateexperience/i.test(`${task.applicationUrl || ''}`);
  },
  async execute(page, task, runtime) {
    await runtime.report({ status: 'running', evidenceText: `Opening ${task.applicationUrl}` });
    await page.goto(task.applicationUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    await runtime.takeShot('oracle-opened');

    if (await runtime.detectCommonHumanGate()) return true;

    if (/\/job\//i.test(page.url()) && !/\/apply\//i.test(page.url())) {
      const openedText = await bodyText(page);
      if (!/apply now/i.test(openedText)) {
        await runtime.report({
          status: 'failed',
          currentUrl: page.url(),
          evidenceText: 'Oracle job posting is no longer presenting an Apply Now path.',
          screenshotPath: await runtime.safeShot('oracle-no-apply-now'),
        });
        return true;
      }
      const clicked = await clickOracleApplyNow(page);
      if (!clicked) {
        await runtime.report({
          status: 'blocked_technical',
          currentUrl: page.url(),
          evidenceText: 'Oracle adapter could not open the employer apply flow from the public job page.',
          screenshotPath: await runtime.safeShot('oracle-apply-button-missing'),
        });
        return true;
      }
    }

    await runtime.takeShot('oracle-apply-opened');

    if (await runtime.detectCommonHumanGate()) return true;
    if (await detectOracleAccountGate(page, task, runtime)) return true;

    const onEmailStep = /\/apply\/email/i.test(page.url()) || /enter your email address/i.test(await bodyText(page));
    if (!onEmailStep) {
      await runtime.report({
        status: 'blocked_technical',
        currentUrl: page.url(),
        evidenceText: 'Oracle adapter reached an unrecognized application step before email verification.',
        screenshotPath: await runtime.safeShot('oracle-unrecognized-step'),
      });
      return true;
    }

    await fillOracleAuthenticationStep(page, task, runtime);
    await runtime.takeShot('oracle-email-filled');

    if (await detectOracleVerificationGate(page, task, runtime)) return true;
    if (await runtime.detectCommonHumanGate()) return true;

    const next = page.locator('button[type="submit"]').filter({ hasText: /next/i }).first();
    if (await next.count()) {
      await next.click().catch(() => null);
      await page.waitForTimeout(4000);
      if (await runtime.detectCommonHumanGate()) return true;
      if (await detectOracleAccountGate(page, task, runtime)) return true;
      if (await detectOracleVerificationGate(page, task, runtime)) return true;
    }

    await runtime.report({
      status: 'blocked_technical',
      currentUrl: page.url(),
      evidenceText: 'Oracle adapter completed the email-authentication step but could not verify the next application transition safely.',
      screenshotPath: await runtime.safeShot('oracle-after-email-step'),
    });
    return true;
  },
};

const adapters = [greenhouseAdapter, workdayAdapter, oracleAdapter];

export function getATSAdapter(task) {
  return adapters.find((adapter) => adapter.matches(task)) || null;
}
