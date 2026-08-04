import { applyFieldMappings } from './career-os-field-engine.mjs';
import { createCareerOsAtsFacade } from './career-os-ats-integration.mjs';
import {
  createProductionBlockedReport,
  createProductionDecisionQueueItem,
  reportablePolicyDetails,
  resolveProductionExecutionPolicy,
} from './career-os-production-controls.mjs';
import { buildGreenhouseQuestionMappings, buildWorkdayQuestionMappings } from './career-os-question-mappings.mjs';
import { runWorkdayProductionFlow } from './career-os-workday-production.mjs';

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(value) {
  return String(value || '').replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, '\\$1');
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

async function greenhouseFormVisible(context) {
  const signals = [
    'input[type="file"]',
    'input[name*="first_name" i]',
    'input[name*="last_name" i]',
    'input[name*="email" i]',
    'button[type="submit"]',
  ];
  for (const selector of signals) {
    if (await context.locator(selector).first().count()) return true;
  }
  return false;
}

async function maybeOpenGreenhouseHostedApplication(page) {
  const context = await resolveGreenhouseContext(page);
  if (context !== page) return false;
  if (await greenhouseFormVisible(page)) return false;
  if (await maybeOpenGreenhouseDirectEmbed(page)) return true;
  const trigger = page.locator('a, button, input[type="button"], input[type="submit"]').filter({
    hasText: /apply now|apply for this job|submit application|start application/i,
  }).first();
  if (!await trigger.count()) return false;
  await Promise.allSettled([
    page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
    trigger.click(),
  ]);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(500);
    const refreshedContext = await resolveGreenhouseContext(page);
    if (refreshedContext !== page) return true;
    if (await greenhouseFormVisible(page)) return true;
  }
  return true;
}

async function maybeOpenGreenhouseDirectEmbed(page) {
  const boardScript = page.locator('script[src*="boards.greenhouse.io/embed/job_board/js"]').first();
  if (!await boardScript.count()) return false;
  const boardSlug = clean(await boardScript.getAttribute('src')).match(/[?&]for=([^&]+)/i)?.[1] || '';
  const token = greenhouseJobIdentity(page.url());
  if (!boardSlug || !token) return false;
  const directUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(boardSlug)}&token=${encodeURIComponent(token)}`;
  if (clean(page.url()) !== directUrl) {
    await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(500);
    const refreshedContext = await resolveGreenhouseContext(page);
    if (refreshedContext !== page) return true;
    if (await greenhouseFormVisible(page)) return true;
  }
  return false;
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
    const width = Number(element.width || 0);
    const height = Number(element.height || 0);
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
    const passiveRecaptchaBadge = detectorType === 'visible_recaptcha'
      && (
        selector.includes('grecaptcha-badge')
        || className.includes('grecaptcha-badge')
        || (
          width > 0
          && width <= 260
          && height > 0
          && height <= 80
          && !/verify you are human|i am human|challenge|checkbox|select all images|robot/i.test(`${text} ${title}`.toLowerCase())
        )
      );
    if (passiveRecaptchaBadge) continue;
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

async function detectGreenhouseVerificationCodeGate(context, page, runtime) {
  const text = await bodyText(context);
  if (!/verification code|security code|confirm you(?:'re| are) a human|8-character code/i.test(text)) {
    return false;
  }
  await runtime.report({
    status: 'waiting_for_email_code',
    currentUrl: contextUrl(context, page),
    evidenceText: 'Greenhouse accepted the completed application form and then required an 8-character human verification/security code before final submission.',
    screenshotPath: await runtime.safeShot('greenhouse-verification-code-gate'),
    details: {
      classification: 'human_verification_code_required',
      codeRecorded: false,
      outcomeStatus: 'waiting_for_email_code',
      protectedGate: true,
    },
  });
  return true;
}

async function fillGreenhouseForm(page, task, runtime) {
  const context = await resolveGreenhouseContext(page);
  const locationText = [task.candidate.city, task.candidate.stateOrProvince].filter(Boolean).join(', ');
  await fillInputBySelectors(context, [
    'input[id*="legal_first_name" i]',
    'input[placeholder="Legal First Name" i]',
  ], task.candidate.firstName);
  await fillInputBySelectors(context, [
    'input[id*="legal_last_name" i]',
    'input[placeholder="Legal Last Name" i]',
  ], task.candidate.lastName);
  await fillInputBySelectors(context, [
    'input[type="email"]',
    'input[name*="[email_value]" i]',
  ], task.candidate.email);
  await fillInputBySelectors(context, [
    'input[type="tel"]',
    'input[name*="[phone_value]" i]',
  ], task.candidate.phone);
  await fillInputBySelectors(context, [
    'input[placeholder="City, State" i]',
  ], locationText);
  await fillInputFromLabel(context, /first name/i, task.candidate.firstName);
  await fillInputFromLabel(context, /last name/i, task.candidate.lastName);
  await fillInputFromLabel(context, /preferred first name|preferred name/i, task.candidate.preferredName);
  await fillInputFromLabel(context, /preferred last name/i, task.candidate.lastName);
  await fillInputFromLabel(context, /^email/i, task.candidate.email);
  await fillInputFromLabel(context, /^phone/i, task.candidate.phone);
  await fillInputFromLabel(context, /linkedin/i, task.candidate.linkedin);
  await fillInputFromLabel(context, /current company/i, task.candidate.currentCompany);
  await fillInputFromLabel(context, /location\s*\(city\)|location city|^city\b/i, task.candidate.city);
  await fillInputFromLabel(context, /current or most recent employer|most recent employer|current employer|current company/i, greenhouseCurrentEmployer(task));
  await fillInputFromLabel(context, /current or most recent job title|most recent job title|current job title|current title|job title/i, greenhouseCurrentTitle(task));
  await fillInputFromLabel(context, /zip|postal code/i, task.candidate.postalCode);

  const resumePath = await runtime.ensureResumeFile();
  const uploaded = await maybeUploadGreenhouseResume(context, resumePath, runtime);
  if (!uploaded) {
    throw new Error('Greenhouse resume upload field was not found.');
  }
  await maybeUploadGreenhouseCoverLetter(context, task, runtime);

  await selectFromLabel(context, /pronouns/i, task.candidate.pronouns);
  await selectFromLabel(context, /require immigration sponsorship.*united states/i, task.candidate.sponsorshipNow);
  await selectFromLabel(context, /require immigration sponsorship at any point in the future/i, task.candidate.sponsorshipFuture);
  await selectFromLabel(context, /state or canadian province/i, task.candidate.stateOrProvince);
  await selectFromLabel(context, /how did you first learn about/i, task.candidate.referralSourceAffirmFallback || task.candidate.referralSource);
  await selectFromLabel(context, /previously been employed at affirm/i, task.candidate.previouslyWorkedAtEmployer);
  await selectFromLabel(context, /visa \/ work permit/i, task.candidate.sponsorshipNow);
  await selectFromLabel(context, /working in person.*london office/i, 'No');
  await selectFromLabel(context, /bound by any agreements|restrict your ability to work|non.?compete|non.?solicit/i, 'No');
  await selectFromLabel(context, /worked at nice/i, 'No');
  await selectFromLabel(context, /first-degree relatives/i, 'No');
  const mappingResults = await applyFieldMappings(
    context,
    buildGreenhouseQuestionMappings(task, {
      email: task.candidate.email,
    }),
    task,
  );
  const referralApplied = await ensureGreenhouseReferralSource(context, task);
  const acknowledged = await acceptGreenhouseOrdinaryAcknowledgements(context);
  if (acknowledged > 0 || referralApplied) {
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Applied Greenhouse standing-authorized fallbacks: referral=${referralApplied ? 'filled' : 'not_needed'}, acknowledgements=${acknowledged}.`,
      details: {
        acknowledgedOrdinaryGreenhouseCheckboxes: acknowledged,
        greenhouseMappingResults: mappingResults.map((result) => ({
          applied: result.applied,
          field: result.field,
          key: result.key,
          matched: result.matched,
          reason: result.reason,
          value: result.value,
        })),
        referralFallbackApplied: referralApplied,
      },
    });
  }
}

function greenhouseCurrentEmployer(task) {
  return clean(task?.candidate?.currentCompany || task?.candidate?.primaryEmployment?.employer);
}

function greenhouseCurrentTitle(task) {
  return clean(task?.candidate?.primaryEmployment?.title || task?.candidate?.currentTitle);
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

async function maybeUploadGreenhouseCoverLetter(context, task, runtime) {
  if (typeof runtime.ensureCoverLetterFile !== 'function' || !task.coverLetter) return false;
  const coverLetterPath = await runtime.ensureCoverLetterFile();
  if (!coverLetterPath) return false;
  const directSelectors = [
    'input[type="file"][name*="cover" i]',
    'input[type="file"][id*="cover" i]',
    'input[type="file"][aria-label*="cover" i]',
    '[data-qa*="cover" i] input[type="file"]',
    '[data-testid*="cover" i] input[type="file"]',
    '[class*="cover" i] input[type="file"]',
  ];
  for (const selector of directSelectors) {
    const input = context.locator(selector).first();
    if (!await input.count()) continue;
    await input.setInputFiles(coverLetterPath);
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Uploaded approved cover letter ${coverLetterPath.split('/').pop()}.`,
      details: {
        coverLetterFileName: coverLetterPath.split('/').pop(),
        coverLetterSupported: true,
        coverLetterUploaded: true,
      },
    });
    return true;
  }

  const triggerPatterns = [
    /attach cover letter/i,
    /upload cover letter/i,
    /cover letter/i,
  ];
  for (const pattern of triggerPatterns) {
    const trigger = context.locator('label, button, a, div[role="button"], span').filter({ hasText: pattern }).first();
    if (!await trigger.count()) continue;
    await trigger.click().catch(() => null);
    await context.waitForTimeout(500);
    const candidate = await selectPreferredGreenhouseCoverLetterInput(context);
    if (!candidate) continue;
    await candidate.setInputFiles(coverLetterPath);
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Uploaded approved cover letter ${coverLetterPath.split('/').pop()}.`,
      details: {
        coverLetterFileName: coverLetterPath.split('/').pop(),
        coverLetterSupported: true,
        coverLetterUploaded: true,
      },
    });
    return true;
  }

  await runtime.report({
    status: 'heartbeat',
    evidenceText: 'No supported Greenhouse cover letter upload control was visible.',
    details: {
      coverLetterSupported: false,
      coverLetterUploaded: false,
    },
  });
  return false;
}

async function selectPreferredGreenhouseCoverLetterInput(context) {
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
      if (/resume|\bcv\b/.test(attrs)) return -100;
      let points = 0;
      if (/cover letter/.test(attrs)) points += 8;
      if (/cover/.test(attrs)) points += 5;
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
    return bestScore > 0 ? bestIndex : -1;
  }).catch(() => -1);
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

async function acceptGreenhouseOrdinaryAcknowledgements(context) {
  const controls = context.locator('input[type="checkbox"]');
  const count = await controls.count();
  let accepted = 0;
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const candidate = await control.evaluate((element) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      if (!(element instanceof HTMLInputElement) || !visible(element) || element.checked) {
        return { eligible: false };
      }
      const label = element.closest('label') || (element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null);
      const labelText = normalize(label?.textContent);
      const containerText = normalize(element.closest('fieldset, section, div')?.textContent || labelText);
      const required = element.required || element.getAttribute('aria-required') === 'true' || /\*/.test(labelText);
      const ordinary = /^i agree\.?$/i.test(labelText)
        || /applicant privacy|candidate privacy|privacy policy|privacy statement|cookie|personal data|data processing/i.test(containerText);
      const excluded = /arbitration|class action|jury|background check|criminal|conviction|consumer report|credit report|certif(?:y|ication).*accur|electronic signature|non-compete|noncompete/i.test(containerText);
      return {
        eligible: Boolean(required && ordinary && !excluded),
        labelText,
      };
    }).catch(() => ({ eligible: false }));
    if (!candidate.eligible) continue;
    await control.check({ force: true }).catch(() => null);
    if (await control.isChecked().catch(() => false)) accepted += 1;
  }
  return accepted;
}

async function ensureGreenhouseReferralSource(context, task) {
  const id = await context.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelTextFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('.select, .select__container, [role="group"], fieldset, div');
      return normalize(field?.querySelector?.('label, legend')?.textContent);
    };
    const input = Array.from(document.querySelectorAll('input[role="combobox"]'))
      .find((element) => element instanceof HTMLInputElement
        && visible(element)
        && /how did you (?:hear|learn).*about|where .*learned about/i.test(labelTextFor(element)));
    return input?.id || '';
  }).catch(() => '');
  if (!id) return false;
  const current = await greenhouseComboboxCommittedValue(context, id);
  if (current) return false;

  const values = [
    task.candidate?.referralSourceAffirmFallback,
    task.candidate?.referralSource,
    task.employer ? `${task.employer} Careers Page` : '',
    'Careers Page',
  ].map(clean).filter(Boolean);

  for (const value of Array.from(new Set(values))) {
    if (await selectGreenhouseComboboxOption(context, id, value)) return true;
  }
  return false;
}

async function selectGreenhouseComboboxOption(context, id, value) {
  const input = context.locator(`#${cssEscape(id)}`).first();
  if (!await input.count()) return false;
  await input.scrollIntoViewIfNeeded().catch(() => null);
  await input.click({ force: true }).catch(() => null);
  await input.fill('').catch(() => null);
  await input.type(value, { delay: 20 }).catch(() => null);
  await context.waitForTimeout(350);
  let option = context.locator('[role="option"], .select__option').filter({ hasText: new RegExp(escapeRegExp(value), 'i') }).first();
  if (!await option.count() && /careers?\s+page/i.test(value)) {
    option = context.locator('[role="option"], .select__option').filter({ hasText: /careers?\s+page/i }).first();
  }
  if (!await option.count()) {
    await input.press('Escape').catch(() => null);
    return false;
  }
  await option.click({ force: true }).catch(() => null);
  await input.press('Tab').catch(() => null);
  await context.waitForTimeout(350);
  const committed = await greenhouseComboboxCommittedValue(context, id);
  return Boolean(committed);
}

async function greenhouseComboboxCommittedValue(context, id) {
  return clean(await context.evaluate((fieldId) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const input = document.getElementById(fieldId);
    let current = input?.parentElement;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const selectedText = Array.from(
        current.querySelectorAll('.select__single-value, [class*="singleValue"], [class*="single-value"], [class*="multiValue__label"], [class*="multi-value__label"]'),
      )
        .map((node) => normalize(node.textContent))
        .find(Boolean);
      if (selectedText) return selectedText;
      const hiddenValue = Array.from(current.querySelectorAll('input[type="hidden"], input[aria-hidden="true"]'))
        .map((node) => normalize(node.getAttribute('value') || node.value))
        .find(Boolean);
      if (hiddenValue) return hiddenValue;
    }
    return '';
  }, id).catch(() => ''));
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
    const committedComboboxValue = (element) => {
      let current = element.parentElement;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const selectedText = Array.from(
          current.querySelectorAll('.select__single-value, [class*="singleValue"], [class*="single-value"], [class*="multiValue__label"], [class*="multi-value__label"]'),
        )
          .map((node) => normalize(node.textContent))
          .find(Boolean);
        if (selectedText) return selectedText;
        const hiddenValue = Array.from(current.querySelectorAll('input[type="hidden"], input[aria-hidden="true"]'))
          .map((node) => normalize(node.getAttribute('value') || node.value))
          .find(Boolean);
        if (hiddenValue) return hiddenValue;
      }
      return '';
    };
    const empty = (element) => {
      if (element instanceof HTMLSelectElement) {
        return element.selectedIndex <= 0 || !normalize(element.value);
      }
      if (element instanceof HTMLInputElement) {
        if (element.type === 'radio' || element.type === 'checkbox') return false;
        if (element.getAttribute('role') === 'combobox' || /\bselect__input\b/i.test(element.className)) {
          if (committedComboboxValue(element)) return false;
        }
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
      const helperOnlyRequiredMirror = element instanceof HTMLInputElement
        && type === 'text'
        && /\brequiredinput\b/i.test(String(element.className || ''))
        && !label
        && !normalize(element.getAttribute('name'))
        && !normalize(element.id);
      if (helperOnlyRequiredMirror) continue;
      if (
        element instanceof HTMLInputElement
        && (element.getAttribute('role') === 'combobox' || /\bselect__input\b/i.test(element.className))
        && (!label || label.toLowerCase() === 'text')
      ) continue;
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

// CAREER_OS_WORKDAY_ENTRY_FLOW_V2
async function workdayApplicationFormVisible(page) {
  const text = await bodyText(page);
  if (/you are applying for|my information|my experience|application questions|voluntary disclosures|review your application/i.test(text)) return true;
  const signals = [
    'input[type="file"]',
    '[data-automation-id="legalNameSection"]',
    '[data-automation-id="contactInformationSection"]',
    '[data-automation-id="workExperienceSection"]',
    '[data-automation-id="educationSection"]',
  ];
  for (const selector of signals) {
    if (await page.locator(selector).first().count().catch(() => 0)) return true;
  }
  return false;
}

async function workdayProgressFingerprint(page) {
  const text = (await bodyText(page)).replace(/\s+/g, ' ').trim().slice(0, 1200);
  return JSON.stringify({ url: page.url(), text });
}

async function clickExactWorkdayEntryChoice(page, pattern) {
  const candidates = [
    page.getByRole('button', { name: pattern, exact: true }).first(),
    page.getByRole('link', { name: pattern, exact: true }).first(),
    page.locator('[data-automation-id="applyManually"], [data-automation-id="autofillWithResume"]').filter({ hasText: pattern }).first(),
    page.locator('button, a, [role="button"]').filter({ hasText: pattern }).first(),
  ];
  for (const locator of candidates) {
    if (!await locator.count().catch(() => 0)) continue;
    if (!await locator.isVisible().catch(() => false)) continue;
    if (!await locator.isEnabled().catch(() => false)) continue;
    const label = (await locator.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() || String(pattern);
    await locator.click({ timeout: 10000 }).catch(() => null);
    return { clicked: true, selectorType: 'workday_exact_accessible', selectorValue: label };
  }
  return { clicked: false, reason: 'No exact Workday entry choice was clickable.' };
}

async function waitForWorkdayEntryProgress(page, beforeFingerprint, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(500);
    if (await workdayApplicationFormVisible(page)) return true;
    const current = await workdayProgressFingerprint(page);
    if (current !== beforeFingerprint && /my information|my experience|application questions|upload.*resume|you are applying for/i.test(current)) return true;
  }
  return false;
}

async function maybeOpenWorkdayApplication(page, task, runtime) {
  if (await workdayApplicationFormVisible(page)) return true;

  const choices = [
    { pattern: /^apply manually$/i, label: 'Apply Manually' },
    { pattern: /autofill with resume/i, label: 'Autofill with Resume' },
    { pattern: /^start application$/i, label: 'Start Application' },
    { pattern: /^apply now$/i, label: 'Apply Now' },
    { pattern: /^apply$/i, label: 'Apply' },
  ];

  for (const choice of choices) {
    const beforeFingerprint = await workdayProgressFingerprint(page);
    let result = await clickExactWorkdayEntryChoice(page, choice.pattern);
    if (!result.clicked) result = await clickSubmitControl(page, [choice.pattern]);
    if (!result.clicked) continue;

    await runtime.report({
      status: 'heartbeat',
      currentUrl: page.url(),
      evidenceText: `Advanced Workday entry flow using ${result.selectorType}: ${result.selectorValue}.`,
      details: {
        classification: 'workday_entry_transition',
        preferredChoice: choice.label,
        selectorType: result.selectorType,
        selectorValue: result.selectorValue,
      },
    });

    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);
    if (await waitForWorkdayEntryProgress(page, beforeFingerprint)) return true;

    await runtime.report({
      status: 'heartbeat',
      currentUrl: page.url(),
      evidenceText: `Workday entry choice ${choice.label} was clicked but no recognized application progress followed.`,
      screenshotPath: await runtime.safeShot(`workday-entry-no-progress-${choice.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
      details: { classification: 'workday_entry_no_progress', attemptedChoice: choice.label },
    });
  }

  return workdayApplicationFormVisible(page);
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

async function maybeUploadWorkdayCoverLetter(page, task, runtime) {
  if (typeof runtime.ensureCoverLetterFile !== 'function' || !task.coverLetter) return false;
  const coverLetterPath = await runtime.ensureCoverLetterFile();
  if (!coverLetterPath) return false;
  const fileInput = await selectWorkdayCoverLetterFileInput(page);
  if (!fileInput) {
    const text = await bodyText(page);
    if (/cover letter/i.test(text)) {
      await runtime.report({
        status: 'heartbeat',
        evidenceText: 'Workday showed cover-letter text, but no supported cover letter upload control was visible.',
        details: {
          coverLetterSupported: false,
          coverLetterUploaded: false,
        },
      });
    }
    return false;
  }
  await fileInput.setInputFiles(coverLetterPath);
  await page.waitForTimeout(1500);
  await runtime.report({
    status: 'heartbeat',
    evidenceText: `Uploaded approved Workday cover letter ${coverLetterPath.split('/').pop()}.`,
    details: {
      coverLetterFileName: coverLetterPath.split('/').pop(),
      coverLetterSupported: true,
      coverLetterUploaded: true,
    },
  });
  return true;
}

async function selectWorkdayCoverLetterFileInput(page) {
  if (!page?.locator) return null;
  const index = await page.locator('input[type="file"]').evaluateAll((nodes) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const score = (node) => {
      const attrs = [
        node.getAttribute('name'),
        node.getAttribute('id'),
        node.getAttribute('aria-label'),
        node.getAttribute('data-automation-id'),
        node.getAttribute('data-testid'),
        node.className,
        node.parentElement?.textContent,
        node.closest('[data-automation-id], section, fieldset, div, label')?.textContent,
      ].map(normalize).join(' ');
      if (/resume|\bcv\b/.test(attrs)) return -100;
      let points = 0;
      if (/cover letter/.test(attrs)) points += 8;
      if (/\bcover\b/.test(attrs)) points += 5;
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
    return bestScore > 0 ? bestIndex : -1;
  }).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return null;
  return page.locator('input[type="file"]').nth(index);
}

async function fillInputFromLabel(page, labelPattern, value) {
  if (!value) return false;
  const label = page.locator('label').filter({ hasText: labelPattern }).first();
  if (!await label.count()) return false;
  const forId = await label.getAttribute('for');
  if (forId) {
    const input = page.locator(`#${cssEscape(forId)}`).first();
    if (await input.count() && await isTextFillableControl(input)) {
      await input.fill(String(value));
      return true;
    }
  }
  const input = label.locator('input, textarea').first();
  if (await input.count() && await isTextFillableControl(input)) {
    await input.fill(String(value));
    return true;
  }
  return false;
}

async function fillInputBySelectors(page, selectors, value) {
  if (!value) return false;
  for (const selector of selectors) {
    const input = page.locator(selector).first();
    if (await input.count() && await isTextFillableControl(input)) {
      await input.fill(String(value));
      return true;
    }
  }
  return false;
}

async function isTextFillableControl(locator) {
  return locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element instanceof HTMLTextAreaElement) return true;
    if (!(element instanceof HTMLInputElement)) return element.isContentEditable;
    const type = String(element.type || 'text').toLowerCase();
    return [
      'text',
      'email',
      'tel',
      'url',
      'search',
      'number',
      'password',
    ].includes(type);
  }).catch(() => false);
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
  if (/you are applying for|my information|my experience|application questions/i.test(text)) return false;

  const checkpoint = /reset your password|password reset|forgot password/i.test(text)
    ? 'password_reset'
    : /verification code|verify your email|email verification|check your email/i.test(text)
      ? 'email_verification'
      : /multi-factor|two-factor|authentication code|security code/i.test(text)
        ? 'mfa'
        : /create account|create an account/i.test(text)
          ? 'account_creation'
          : /sign in|login/i.test(text)
            ? 'sign_in'
            : '';
  if (!checkpoint) return false;

  const messages = {
    password_reset: 'Employer requires completion of a Workday password reset before automation can resume.',
    email_verification: 'Employer requires Workday email verification before automation can resume.',
    mfa: 'Employer requires Workday multi-factor authentication before automation can resume.',
    account_creation: 'Employer requires a Workday account to be created before automation can resume.',
    sign_in: 'Employer presented a Workday sign-in gate.',
  };
  await runtime.report({
    status: 'waiting_on_tomas',
    currentUrl: page.url(),
    evidenceText: messages[checkpoint],
    screenshotPath: await runtime.safeShot(`workday-${checkpoint.replace(/_/g, '-')}`),
    details: { classification: checkpoint, employer: task?.company || task?.employer || '' },
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

async function executeWorkdayControlledInspection(page, task, runtime, policy) {
  await runtime.report({
    status: 'running',
    evidenceText: `Opening ${task.applicationUrl} in Workday ${policy.mode} mode.`,
  });
  await page.goto(task.applicationUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  await runtime.takeShot('workday-controlled-opened');

  if (await runtime.detectCommonHumanGate()) return true;
  if (await detectWorkdayAccountGate(page, task, runtime)) return true;

  const inspection = await inspectVisibleWorkdaySurface(page);
  const fieldLabels = inspection.fields.map((field) => field.label).filter(Boolean).slice(0, 25);
  const actionLabels = inspection.actions.map((action) => action.label).filter(Boolean).slice(0, 12);
  const submitControls = inspection.actions.filter((action) => /submit/i.test(action.label));
  const currentUrl = page.url();
  await runtime.report({
    status: 'inspected_assisted',
    currentUrl,
    evidenceText: `Workday inspected in ${policy.mode}; no submit was attempted. Detected ${fieldLabels.length} field(s) and ${actionLabels.length} action control(s).`,
    screenshotPath: await runtime.safeShot('workday-controlled-inspection'),
    details: {
      actionLabels,
      classification: 'workday_controlled_inspection',
      executionMode: policy.mode,
      fieldLabels,
      inspectionErrors: inspection.errors,
      outcomeStatus: 'inspected_assisted',
      submitBlocked: true,
      submitControlsDetected: submitControls.map((control) => control.label),
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category: submitControls.length ? 'unknown' : 'low_confidence',
          confidence: fieldLabels.length || actionLabels.length ? 0.78 : 0.52,
          fieldLabel: submitControls.length ? 'Workday submit control' : 'Workday application surface',
          reason: submitControls.length
            ? 'Workday presented a submit control, and production policy requires Tomas to complete or approve this step manually.'
            : 'Workday live inspection completed without a production-proven submit path.',
          requiredAction: 'Review the Workday application manually; Career OS will not submit Workday applications in controlled launch.',
          resumePoint: 'After Tomas completes the Workday step, mark the application resumed or completed in Career OS.',
          routing: policy.details?.routing,
          sensitivity: 'operational',
          task,
          tenant: policy.details?.routing?.tenant,
          url: currentUrl,
        }),
      ],
    },
  });
  return true;
}

async function inspectVisibleWorkdaySurface(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('[data-automation-id], [role="group"], fieldset, div');
      const nearby = field?.querySelector?.('label, legend, [data-automation-id*="label" i]');
      return normalize(nearby?.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || element.id);
    };
    const fields = Array.from(document.querySelectorAll('input, select, textarea, [role="combobox"]'))
      .filter((element) => visible(element))
      .map((element) => ({
        label: labelFor(element),
        required: element.getAttribute('aria-required') === 'true' || element.hasAttribute('required'),
        tagName: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || element.getAttribute('role') || '',
      }))
      .filter((field) => field.label)
      .slice(0, 50);
    const actions = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]'))
      .filter((element) => visible(element))
      .map((element) => ({
        enabled: !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
        label: normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label')),
        tagName: element.tagName.toLowerCase(),
      }))
      .filter((action) => action.label)
      .slice(0, 30);
    return { actions, errors: [], fields };
  }).catch((error) => ({
    actions: [],
    errors: [error instanceof Error ? error.message : String(error)],
    fields: [],
  }));
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
    await maybeOpenGreenhouseHostedApplication(page);
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
    if (await detectGreenhouseVerificationCodeGate(confirmedContext, page, runtime)) return true;

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

    const workdayEntryOpened = await maybeOpenWorkdayApplication(page, task, runtime);
    if (await runtime.detectCommonHumanGate()) return true;
    if (await detectWorkdayAccountGate(page, task, runtime)) return true;
    if (!workdayEntryOpened) {
      await runtime.report({
        status: 'blocked_technical',
        currentUrl: page.url(),
        evidenceText: 'Workday adapter could not advance from the public job or start-application screen into the application form.',
        screenshotPath: await runtime.safeShot('workday-entry-not-opened'),
        details: { classification: 'workday_entry_transition' },
      });
      return true;
    }

    await runtime.takeShot('workday-application-opened');

    for (let step = 1; step <= 12; step += 1) {
      await maybeUploadWorkdayResume(page, task, runtime);
      await maybeUploadWorkdayCoverLetter(page, task, runtime);
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

const adapters = [greenhouseAdapter, workdayAdapter];
const routedAtsFacade = createCareerOsAtsFacade({
  legacyAdapters: {
    greenhouse: greenhouseAdapter,
    workday: workdayAdapter,
  },
});

export function getATSAdapter(task, options = {}) {
  return createProductionControlledAdapter(routedAtsFacade.getRoutedAtsAdapter(task), {
    env: options.env || process.env,
  });
}

function createProductionControlledAdapter(adapter, options = {}) {
  return {
    ...adapter,
    matches(task) {
      return adapter.matches(task);
    },
    async execute(page, task, runtime) {
      const policy = resolveProductionExecutionPolicy({
        adapterId: adapter.id,
        env: options.env || process.env,
        routingMetadata: adapter.routingMetadata,
        task,
      });
      const controlledRuntime = createProductionControlledRuntime(runtime, policy, adapter.id);
      if (!policy.allowed) {
        await controlledRuntime.report(createProductionBlockedReport(policy, task));
        return true;
      }
      if (adapter.id === 'workday') {
        return runWorkdayProductionFlow(page, task, controlledRuntime, policy, { env: options.env || process.env });
      }
      return adapter.execute(page, task, controlledRuntime);
    },
  };
}

function createProductionControlledRuntime(runtime, policy, adapterId) {
  return {
    ...runtime,
    async assertSafeToSubmit() {
      if (!policy.submitAllowed) {
        throw new Error(`submit_blocked_by_production_policy:${policy.adapterId}:${policy.mode || 'missing_mode'}`);
      }
      if (typeof runtime.assertSafeToSubmit !== 'function') {
        throw new Error('submit_blocked_by_production_policy:missing_runtime_submit_safety');
      }
      return runtime.assertSafeToSubmit();
    },
    async report(payload) {
      const details = payload.details || {};
      const outcomeStatus = details.outcomeStatus || (adapterId === 'greenhouse' && payload.status === 'confirmed' ? 'submitted_confirmed' : undefined);
      return runtime.report({
        ...payload,
        details: {
          ...details,
          outcomeStatus,
          production: {
            ...reportablePolicyDetails(policy),
            outcomeStatus: outcomeStatus || policy.outcomeStatus,
          },
        },
      });
    },
  };
}
