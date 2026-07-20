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

async function captureConfirmation(page, task, runtime, adapterId) {
  const text = await bodyText(page);
  if (!/thank you for applying|application has been received|we have received your application|application submitted|your application has been submitted/i.test(text)) {
    return false;
  }
  const screenshotPath = await runtime.takeShot(`${adapterId}-confirmed`);
  await runtime.report({
    status: 'confirmed',
    currentUrl: page.url(),
    evidenceUrl: page.url(),
    evidenceText: text.replace(/\s+/g, ' ').slice(0, 280).trim(),
    screenshotPath,
  });
  return true;
}

async function fillGreenhouseForm(page, task, runtime) {
  await runtime.fillByLabel(/first name/i, task.candidate.firstName);
  await runtime.fillByLabel(/last name/i, task.candidate.lastName);
  await runtime.fillByLabel(/^email/i, task.candidate.email);
  await runtime.fillByLabel(/^phone/i, task.candidate.phone);
  await runtime.fillByLabel(/preferred name/i, task.candidate.preferredName);
  await runtime.fillByLabel(/linkedin/i, task.candidate.linkedin);
  await runtime.fillByLabel(/current company/i, task.candidate.currentCompany);

  const resumePath = await runtime.ensureResumeFile();
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles(resumePath);
    await runtime.report({
      status: 'heartbeat',
      evidenceText: `Uploaded approved resume ${resumePath.split('/').pop()}.`,
    });
  } else {
    throw new Error('Greenhouse resume upload field was not found.');
  }

  await runtime.selectValue(/pronouns/i, task.candidate.pronouns);
  await runtime.selectValue(/require immigration sponsorship.*united states/i, task.candidate.sponsorshipNow);
  await runtime.selectValue(/require immigration sponsorship at any point in the future/i, task.candidate.sponsorshipFuture);
  await runtime.selectValue(/state or canadian province/i, task.candidate.stateOrProvince);
  await runtime.selectValue(/how did you first learn about/i, task.candidate.referralSourceAffirmFallback || task.candidate.referralSource);
  await runtime.selectValue(/previously been employed at affirm/i, task.candidate.previouslyWorkedAtEmployer);
  await runtime.selectValue(/visa \/ work permit/i, task.candidate.sponsorshipNow);
  await runtime.selectValue(/worked at nice/i, 'No');
  await runtime.selectValue(/first-degree relatives/i, 'No');
}

async function visibleRequiredFields(page) {
  return page.evaluate(() => {
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

    await fillGreenhouseForm(page, task, runtime);
    await runtime.takeShot('greenhouse-filled');

    if (await runtime.detectCommonHumanGate()) return true;

    const submit = page.locator('button[type="submit"], input[type="submit"]').filter({ hasText: /submit application|submit/i }).first();
    if (await submit.count()) {
      await runtime.assertSafeToSubmit();
      await runtime.report({ status: 'running', evidenceText: 'Submitting the employer application.' });
      await Promise.allSettled([
        page.waitForLoadState('domcontentloaded', { timeout: 20000 }),
        submit.click(),
      ]);
      await page.waitForTimeout(3000);
    }

    if (await captureConfirmation(page, task, runtime, 'greenhouse')) return true;

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

const adapters = [greenhouseAdapter, workdayAdapter];

export function getATSAdapter(task) {
  return adapters.find((adapter) => adapter.matches(task)) || null;
}
