import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Browser, type BrowserContext, type Page, type Request, type Route } from 'playwright';

import { createEvidenceItem, type AtsEvidenceItem, type JsonRecord, type NormalizedAtsContext, type UserGate } from './contracts';
import { detectAts } from './detector';
import {
  inferSensitivityFromLabel,
  type CanonicalFieldMappingResult,
  type CanonicalFieldSensitivity,
} from './field-mapping';
import {
  WORKDAY_FIXTURE_INSPECTOR_VERSION,
  WORKDAY_PAGE_STATES,
  WorkdayFixtureError,
  loadWorkdayFixture,
  mapWorkdayFixtureFields,
  type WorkdayFailureCode,
  type WorkdayFieldMappingSummary,
  type WorkdayFixture,
  type WorkdayInspectedField,
  type WorkdayInspectionSnapshot,
  type WorkdayPageState,
  type WorkdayResumeUploadControl,
  type WorkdaySubmitControl,
} from './workday-fixture-inspector';

export const WORKDAY_LOCAL_BROWSER_RUNNER_VERSION = 'career-os-workday-local-browser-dry-run-2026-07-24-phase-4';
export const DEFAULT_WORKDAY_FIXTURE_DIR = path.resolve(process.cwd(), 'tests/fixtures/workday');

export type WorkdayBrowserBlockedRequest = {
  url: string;
  method: string;
  resourceType: string;
  reason: string;
  isNavigationRequest: boolean;
  blockedAt: string;
};

export type WorkdaySubmitGuardAttempt = {
  method: string;
  selector?: string;
  action?: string;
  key?: string;
  blockedAt: string;
};

export type WorkdaySimulatedFill = {
  fieldId: string;
  label: string;
  selector: string;
  valuePreview: string;
  sensitivity: CanonicalFieldSensitivity;
  simulated: boolean;
};

export type WorkdayBrowserValidationClassification =
  | 'valid_for_inspection'
  | 'incomplete'
  | 'blocked_by_user_gate'
  | 'blocked_by_account_gate'
  | 'validation_error'
  | 'unsupported_page_state';

export type WorkdayBrowserValidationResult = {
  inspectionValid: boolean;
  classification: WorkdayBrowserValidationClassification;
  emptyRequiredFields: string[];
  unresolvedFields: string[];
  validationMessages: string[];
  userGates: UserGate[];
  note: string;
};

export type WorkdayLocalBrowserDryRunResult = {
  executionMode: 'local_browser_dry_run';
  localFixture: true;
  browserMode: 'headless';
  fixture: {
    name: string;
    scenario: string;
    path: string;
    metadataPath: string;
    fixtureUrl: string;
  };
  normalizedContext: NormalizedAtsContext;
  pageState: WorkdayPageState;
  confirmationClassificationOnly: boolean;
  matchedSignals: string[];
  confidence: number;
  conflictingSignals: string[];
  fields: WorkdayInspectedField[];
  resumeUploadControl?: WorkdayResumeUploadControl;
  mapping: WorkdayFieldMappingSummary;
  simulatedFills: WorkdaySimulatedFill[];
  validation: WorkdayBrowserValidationResult;
  submitControl?: WorkdaySubmitControl;
  evidence: AtsEvidenceItem[];
  screenshotPath?: string;
  screenshotCaptured: boolean;
  artifactCleanup: {
    completed: boolean;
    directory: string;
  };
  externalRequestsBlocked: WorkdayBrowserBlockedRequest[];
  submitGuardAttempts: WorkdaySubmitGuardAttempt[];
  liveNavigationAttempted: false;
  submitClickAttempted: false;
  productionWriteAttempted: false;
  browserClosed: boolean;
  runnerVersion: string;
};

export type WorkdayLocalBrowserRunnerInput = {
  fixtureName?: string;
  fixturePath?: string;
  approvedFixtureDir?: string;
  candidateProfile?: JsonRecord;
  simulateSafeFill?: boolean;
  artifactDir?: string;
  preserveArtifacts?: boolean;
};

export type WorkdayLocalBrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  approvedFixtureDir: string;
  artifactDir: string;
  safety: {
    blockedRequests: WorkdayBrowserBlockedRequest[];
    submitAttempts: WorkdaySubmitGuardAttempt[];
    popupAttempts: WorkdaySubmitGuardAttempt[];
    downloadAttempts: WorkdaySubmitGuardAttempt[];
  };
  renderFixture: (fixture: WorkdayFixture) => Promise<void>;
  renderHtml: (html: string) => Promise<void>;
  captureScreenshot: (fixtureName: string) => Promise<string>;
  getSubmitAttempts: () => Promise<WorkdaySubmitGuardAttempt[]>;
  close: () => Promise<void>;
};

type BrowserPageSignals = {
  htmlState: string;
  text: string;
  mfaRequired: boolean;
  captchaRequired: boolean;
};

const SUBMIT_GUARD_SOURCE = `
(() => {
  window.__careerOsSubmitAttempts = window.__careerOsSubmitAttempts || [];
  const now = () => new Date().toISOString();
  const selectorFor = (element) => {
    if (!element) return '';
    if (element.id) return '#' + element.id;
    const name = element.getAttribute && element.getAttribute('name');
    if (name) return '[name="' + name.replace(/"/g, '\\\\"') + '"]';
    if (element.getAttribute && element.getAttribute('data-submit-control')) return '[data-submit-control="true"]';
    return String(element.tagName || '').toLowerCase();
  };
  const formAction = (element) => {
    const form = element && element.form ? element.form : element && element.tagName === 'FORM' ? element : null;
    return form ? String(form.getAttribute('action') || '') : '';
  };
  const isSubmitCapable = (element) => {
    if (!element || !element.matches) return false;
    return element.matches('button[type="submit"], input[type="submit"], button:not([type]), [data-submit-control="true"]');
  };
  const record = (method, element, extra = {}) => {
    const attempt = Object.assign({
      method,
      selector: selectorFor(element),
      action: formAction(element),
      blockedAt: now()
    }, extra);
    window.__careerOsSubmitAttempts.push(attempt);
    return attempt;
  };
  const blocked = (method, element, extra = {}) => {
    record(method, element, extra);
    throw new Error('Career OS local browser submit guard blocked ' + method);
  };
  if (!window.__careerOsSubmitGuardInstalled) {
    window.__careerOsSubmitGuardInstalled = true;
    const originalOpen = window.open;
    window.open = function guardedOpen(url) {
      record('window.open', null, { action: String(url || '') });
      throw new Error('Career OS local browser guard blocked popup');
    };
    window.__careerOsOriginalOpen = originalOpen;
    const originalSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function guardedSubmit() {
      return blocked('form.submit', this);
    };
    HTMLFormElement.prototype.__careerOsOriginalSubmit = originalSubmit;
    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = function guardedRequestSubmit(submitter) {
      return blocked('form.requestSubmit', submitter || this);
    };
    HTMLFormElement.prototype.__careerOsOriginalRequestSubmit = originalRequestSubmit;
    const originalClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function guardedClick() {
      if (isSubmitCapable(this)) return blocked('element.click', this);
      return originalClick.apply(this, arguments);
    };
    HTMLElement.prototype.__careerOsOriginalClick = originalClick;
  }
  document.__careerOsSubmitGuardDocumentInstalled = true;
  document.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('button, input, [data-submit-control="true"]') : event.target;
    if (isSubmitCapable(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      record('trusted.click', target);
    }
  }, true);
  document.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    record('submit.event', event.target);
  }, true);
  const blockEnter = (event, method) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (target && target.closest && target.closest('form')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      record(method, target, { key: 'Enter' });
    }
  };
  document.addEventListener('keydown', (event) => blockEnter(event, 'keyboard.enter'), true);
  document.addEventListener('keypress', (event) => blockEnter(event, 'keyboard.enter'), true);
  document.addEventListener('keyup', (event) => blockEnter(event, 'keyboard.enter'), true);
  for (const form of Array.from(document.querySelectorAll('form'))) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      record('form.submit.event', form);
    }, true);
    form.addEventListener('keydown', (event) => blockEnter(event, 'keyboard.enter'), true);
    form.addEventListener('keypress', (event) => blockEnter(event, 'keyboard.enter'), true);
  }
})()
`;

export async function runWorkdayLocalBrowserDryRun(
  input: WorkdayLocalBrowserRunnerInput,
): Promise<WorkdayLocalBrowserDryRunResult> {
  const approvedFixtureDir = approvedDirectory(input.approvedFixtureDir);
  const fixturePath = resolveFixturePath(input, approvedFixtureDir);
  const fixture = loadWorkdayFixture({
    fixturePath,
    fixtureName: input.fixtureName,
    mode: 'fixture_inspection',
  });
  assertFixtureIsApproved(fixture.absolutePath, approvedFixtureDir);

  const artifactDir = input.artifactDir || fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-workday-dry-run-'));
  const session = await createWorkdayLocalBrowserSession({
    approvedFixtureDir,
    artifactDir,
  });

  let result: Omit<WorkdayLocalBrowserDryRunResult, 'artifactCleanup' | 'browserClosed'> | undefined;
  try {
    await session.renderFixture(fixture);
    const domAdapter = new WorkdayBrowserDomAdapter(session.page);
    const initialSnapshot = await domAdapter.inspectFixture(fixture);
    const mapping = mapWorkdayFixtureFields(initialSnapshot, input.candidateProfile);
    const simulatedFills = input.simulateSafeFill
      ? await domAdapter.simulateSafeInput(initialSnapshot, mapping)
      : [];
    const snapshot = simulatedFills.length ? await domAdapter.inspectFixture(fixture) : initialSnapshot;
    const validation = classifyBrowserValidation(snapshot, mapping);
    const screenshotPath = await session.captureScreenshot(fixture.name);
    const submitAttempts = await session.getSubmitAttempts();
    const evidence = browserEvidence({
      fixture,
      snapshot,
      mapping,
      validation,
      simulatedFills,
      blockedRequests: session.safety.blockedRequests,
      submitAttempts,
      screenshotPath,
    });

    result = {
      executionMode: 'local_browser_dry_run',
      localFixture: true,
      browserMode: 'headless',
      fixture: fixtureIdentity(fixture),
      normalizedContext: normalizedContextFromSnapshot(snapshot, fixture),
      pageState: snapshot.pageState,
      confirmationClassificationOnly: snapshot.pageState === 'CONFIRMATION',
      matchedSignals: snapshot.matchedSignals,
      confidence: confidenceForSnapshot(snapshot),
      conflictingSignals: snapshot.conflictingSignals,
      fields: snapshot.fields,
      resumeUploadControl: snapshot.resumeUploadControl,
      mapping,
      simulatedFills,
      validation,
      submitControl: snapshot.submitControl,
      evidence,
      screenshotPath,
      screenshotCaptured: true,
      externalRequestsBlocked: session.safety.blockedRequests.slice(),
      submitGuardAttempts: submitAttempts,
      liveNavigationAttempted: false,
      submitClickAttempted: false,
      productionWriteAttempted: false,
      runnerVersion: WORKDAY_LOCAL_BROWSER_RUNNER_VERSION,
    };
  } finally {
    await session.close();
  }

  const cleanup = cleanupArtifacts(artifactDir, input.preserveArtifacts === true);
  return {
    ...result,
    artifactCleanup: cleanup,
    browserClosed: true,
  };
}

export async function createWorkdayLocalBrowserSession(input: {
  approvedFixtureDir?: string;
  artifactDir?: string;
} = {}): Promise<WorkdayLocalBrowserSession> {
  const approvedFixtureDir = approvedDirectory(input.approvedFixtureDir);
  const artifactDir = input.artifactDir || fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-workday-dry-run-'));
  fs.mkdirSync(artifactDir, { recursive: true });

  const safety: WorkdayLocalBrowserSession['safety'] = {
    blockedRequests: [],
    submitAttempts: [],
    popupAttempts: [],
    downloadAttempts: [],
  };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: false,
    javaScriptEnabled: true,
  });
  await context.route('**/*', (route) => guardRoute(route, approvedFixtureDir, safety.blockedRequests));
  const page = await context.newPage();
  guardPageGoto(page, approvedFixtureDir, safety.blockedRequests);
  await installSubmitGuard(page);

  context.on('page', async (popup) => {
    if (popup === page) return;
    safety.popupAttempts.push({
      method: 'popup',
      action: safePageUrl(popup),
      blockedAt: new Date().toISOString(),
    });
    try {
      await popup.close();
    } catch {
      // Popup is already closed; evidence has been recorded.
    }
  });

  page.on('download', async (download) => {
    safety.downloadAttempts.push({
      method: 'download',
      action: download.url(),
      blockedAt: new Date().toISOString(),
    });
    try {
      await download.cancel();
    } catch {
      // Download cancellation can fail after the browser has already blocked it.
    }
  });

  return {
    browser,
    context,
    page,
    approvedFixtureDir,
    artifactDir,
    safety,
    async renderFixture(fixture: WorkdayFixture) {
      assertFixtureIsApproved(fixture.absolutePath, approvedFixtureDir);
      await page.setContent(fixture.html, {
        waitUntil: 'domcontentloaded',
      });
      await installSubmitGuard(page);
      await page.waitForTimeout(125);
    },
    async renderHtml(html: string) {
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
      });
      await installSubmitGuard(page);
      await page.waitForTimeout(125);
    },
    async captureScreenshot(fixtureName: string) {
      const screenshotPath = path.join(artifactDir, `${safeFileName(fixtureName)}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
      return screenshotPath;
    },
    async getSubmitAttempts() {
      const browserAttempts = await readSubmitGuardAttempts(page);
      return browserAttempts
        .concat(safety.submitAttempts)
        .concat(safety.popupAttempts)
        .concat(safety.downloadAttempts);
    },
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

export class WorkdayBrowserDomAdapter {
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async inspectFixture(fixture: WorkdayFixture): Promise<WorkdayInspectionSnapshot> {
    const signals = await this.classifyPageSignals();
    const pageClassification = classifyBrowserPage(signals, fixture);
    const detection = detectAts({
      sourceUrl: fixture.fixtureUrl,
      platformHint: 'workday',
      rawJobRecord: {
        ats_platform: 'workday',
        job_url: fixture.fixtureUrl,
      },
      pageSignals: {
        platform: 'workday',
        workdayPageState: pageClassification.pageState,
        fixtureScenario: fixture.scenario,
        browserDom: true,
      },
    });
    const fields = await this.queryFields();
    const resumeUploadControl = await this.queryUploadControl(fields);
    const submitControl = await this.querySubmitControl();
    const domValidationMessages = await this.queryValidationMessages();
    const requiredFields = fields
      .filter((field) => field.required && field.visible && field.enabled)
      .map((field) => field.label);
    const unresolvedRequiredFields = fields
      .filter((field) => field.required && field.visible && field.enabled && !field.currentValuePresent)
      .map((field) => field.label);
    const fieldValidationMessages = fields
      .map((field) => field.validationMessage || '')
      .filter(Boolean);
    const validationMessages = unique(fieldValidationMessages.concat(domValidationMessages));
    const unknowns = detection.unknowns.slice();
    if (!fixture.metadata.tenant && !detection.tenant) unknowns.push('workday_tenant');
    if (!fixture.metadata.jobId && !detection.jobId) unknowns.push('workday_job_id');

    return {
      fixture,
      pageState: pageClassification.pageState,
      normalizedUrl: detection.normalized.normalizedUrl || fixture.fixtureUrl,
      tenant: clean(fixture.metadata.tenant || detection.tenant) || undefined,
      jobId: clean(fixture.metadata.jobId || detection.jobId) || undefined,
      matchedSignals: unique(pageClassification.matchedSignals.concat(detection.matchedSignals)),
      conflictingSignals: unique(pageClassification.conflictingSignals.concat(detection.conflictingSignals)),
      unknowns: unique(unknowns),
      fields,
      resumeUploadControl,
      submitControl,
      validation: {
        requiredFields,
        unresolvedRequiredFields,
        validationMessages,
      },
      userGates: pageClassification.userGates,
      failureCode: pageClassification.failureCode
        || (validationMessages.length ? 'VALIDATION_ERROR' : undefined),
      mode: 'fixture_inspection',
      inspectedAt: new Date().toISOString(),
    };
  }

  async classifyPageSignals(): Promise<BrowserPageSignals> {
    return this.page.evaluate(() => {
      const element = document.querySelector('[data-workday-state]');
      const text = String(document.body?.innerText || document.documentElement?.textContent || '');
      return {
        htmlState: String(element?.getAttribute('data-workday-state') || ''),
        text,
        mfaRequired: Boolean(document.querySelector('[data-mfa-required="true"]')) || /multi-factor|verification code/i.test(text),
        captchaRequired: Boolean(document.querySelector('[data-captcha-required="true"]')) || /captcha|recaptcha/i.test(text),
      };
    });
  }

  async queryFields(): Promise<WorkdayInspectedField[]> {
    const fields = await this.page.evaluate(() => {
      const normalize = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const fieldSelector = 'input[data-ats-field], select[data-ats-field], textarea[data-ats-field], input[data-resume-upload]';
      const cssSelectorFor = (element: Element) => {
        const id = element.getAttribute('id');
        const name = element.getAttribute('name');
        if (id) return `#${id.replace(/"/g, '\\"')}`;
        if (name) return `[name="${name.replace(/"/g, '\\"')}"]`;
        const dataFieldId = element.getAttribute('data-field-id') || element.getAttribute('data-canonical');
        return dataFieldId ? `[data-field-id="${dataFieldId.replace(/"/g, '\\"')}"]` : '';
      };
      const attrsFor = (element: Element) => {
        const attrs: Record<string, string | boolean> = {};
        for (const attr of Array.from(element.attributes || [])) attrs[attr.name] = attr.value || true;
        return attrs;
      };
      const labelFor = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
        const id = element.getAttribute('id');
        const explicit = element.getAttribute('data-label') || element.getAttribute('aria-label');
        if (explicit) return explicit.trim();
        const label = id ? document.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`) : null;
        return String(label?.textContent || element.getAttribute('name') || id || 'Unnamed Workday field').trim();
      };
      const visibleFor = (element: HTMLElement) => {
        const style = window.getComputedStyle(element);
        return element.getAttribute('data-visible') !== 'false'
          && !element.hasAttribute('hidden')
          && element.getAttribute('type') !== 'hidden'
          && element.getAttribute('aria-hidden') !== 'true'
          && style.display !== 'none'
          && style.visibility !== 'hidden';
      };
      const controlTypeFor = (element: Element) => {
        const tag = element.tagName.toLowerCase();
        const rawType = String(element.getAttribute('type') || 'text').toLowerCase();
        if (tag === 'select') return 'select';
        if (tag === 'textarea') return 'textarea';
        if (rawType === 'file') return 'file';
        if (rawType === 'checkbox') return 'checkbox';
        if (rawType === 'radio') return 'radio';
        if (rawType === 'search') return 'combobox';
        return 'text';
      };
      const currentValueFor = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
        if (element instanceof HTMLInputElement && element.type === 'file') return Boolean(element.files && element.files.length);
        if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return element.checked;
        return Boolean(String(element.value || '').trim()) || element.hasAttribute('data-current-value-present');
      };
      const optionsFor = (element: Element) => {
        if (!(element instanceof HTMLSelectElement)) return [];
        return Array.from(element.options || []).map((option) => String(option.label || option.textContent || option.value || '').trim()).filter(Boolean);
      };
      return Array.from(document.querySelectorAll(fieldSelector)).map((element, index) => {
        const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const rawAttributes = attrsFor(control);
        const label = labelFor(control);
        const repeatedSection = String(control.getAttribute('data-repeated-section') || '').trim();
        const repeatIndex = Number(control.getAttribute('data-repeat-index'));
        return {
          fieldId: String(control.getAttribute('data-field-id') || control.getAttribute('id') || control.getAttribute('name') || `field-${index + 1}`).trim(),
          label,
          normalizedLabel: normalize(label),
          inputType: controlTypeFor(control),
          htmlTag: control.tagName.toLowerCase(),
          required: control.hasAttribute('required') || control.getAttribute('aria-required') === 'true' || control.getAttribute('data-required') === 'true',
          visible: visibleFor(control),
          enabled: !control.hasAttribute('disabled') && control.getAttribute('aria-disabled') !== 'true' && control.getAttribute('data-enabled') !== 'false',
          currentValuePresent: currentValueFor(control),
          options: optionsFor(control),
          section: String(control.getAttribute('data-section') || '').trim() || undefined,
          sensitiveCategory: String(control.getAttribute('data-sensitive') || '').trim(),
          canonicalCandidate: String(control.getAttribute('data-canonical') || '').trim() || undefined,
          mappingConfidence: Number(control.getAttribute('data-confidence')) || undefined,
          selector: {
            selectorType: cssSelectorFor(control) ? 'css' : 'unknown',
            selectorValue: cssSelectorFor(control),
            attributeSignals: {
              id: control.getAttribute('id') || '',
              name: control.getAttribute('name') || '',
              dataCanonical: control.getAttribute('data-canonical') || '',
            },
          },
          validationMessage: String(control.getAttribute('data-validation-message') || control.getAttribute('aria-errormessage') || '').trim() || undefined,
          repeatedSectionContext: repeatedSection ? {
            section: repeatedSection,
            index: Number.isFinite(repeatIndex) ? repeatIndex : undefined,
          } : undefined,
          authorizationRequirement: String(control.getAttribute('data-authorization') || '').trim() || undefined,
          userDecisionRequirement: String(control.getAttribute('data-user-decision') || '').trim() || undefined,
          rawAttributes,
        };
      });
    });

    return fields.map((field) => ({
      ...field,
      inputType: controlType(field.inputType),
      sensitiveCategory: sensitivity(field.sensitiveCategory, field.label),
      selector: {
        selectorType: selectorType(field.selector?.selectorType),
        selectorValue: clean(field.selector?.selectorValue),
        attributeSignals: asRecord(field.selector?.attributeSignals),
      },
      mappingConfidence: typeof field.mappingConfidence === 'number' ? field.mappingConfidence : undefined,
      repeatedSectionContext: field.repeatedSectionContext
        ? {
          section: clean(field.repeatedSectionContext.section),
          index: typeof field.repeatedSectionContext.index === 'number' ? field.repeatedSectionContext.index : undefined,
        }
        : undefined,
      rawAttributes: asRecord(field.rawAttributes),
    }));
  }

  async queryValidationMessages(): Promise<string[]> {
    return this.page.evaluate(() => {
      const messages = Array.from(document.querySelectorAll('.wd-validation-error, [role="alert"], [data-validation-message]'))
        .map((element) => {
          return String(element.getAttribute('data-validation-message') || element.textContent || '').trim();
        })
        .filter(Boolean);
      return Array.from(new Set(messages));
    });
  }

  async queryUploadControl(fields: WorkdayInspectedField[]): Promise<WorkdayResumeUploadControl | undefined> {
    const resumeField = fields.find((field) => {
      return field.inputType === 'file'
        && (/resume|cv/i.test(field.label) || Object.prototype.hasOwnProperty.call(field.rawAttributes, 'data-resume-upload'));
    });
    if (!resumeField) return undefined;
    const accept = clean(resumeField.rawAttributes.accept);
    const currentFileState = await this.page.evaluate((selector) => {
      const input = document.querySelector(selector) as HTMLInputElement | null;
      return input && input.files ? input.files.length : 0;
    }, resumeField.selector.selectorValue);
    const surroundingInstructions = await this.page.evaluate((selector) => {
      const input = document.querySelector(selector);
      const section = input?.closest('section, main, form, div');
      return String(section?.textContent || '').replace(/\s+/g, ' ').trim();
    }, resumeField.selector.selectorValue);

    return {
      selectorType: resumeField.selector.selectorType,
      selectorValue: resumeField.selector.selectorValue,
      visible: resumeField.visible,
      enabled: resumeField.enabled,
      acceptedFileTypes: accept ? accept.split(',').map((value) => value.trim()).filter(Boolean) : [],
      required: resumeField.required,
      uploadPermitted: false,
      metadata: {
        fieldId: resumeField.fieldId,
        label: resumeField.label,
        inputType: resumeField.inputType,
        currentFileCount: currentFileState,
        currentFileState: currentFileState > 0 ? 'present' : 'empty',
        surroundingInstructions,
        noRealResumeUpload: true,
      },
    };
  }

  async querySubmitControl(): Promise<WorkdaySubmitControl | undefined> {
    const control = await this.page.evaluate(() => {
      const element = document.querySelector('[data-submit-control="true"], button[type="submit"], input[type="submit"]') as HTMLElement | null;
      if (!element) return null;
      const form = element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.form : element.closest('form');
      const id = element.getAttribute('id') || '';
      const name = element.getAttribute('name') || '';
      const selector = id ? `#${id.replace(/"/g, '\\"')}` : name ? `[name="${name.replace(/"/g, '\\"')}"]` : '[data-submit-control="true"]';
      const style = window.getComputedStyle(element);
      const text = element instanceof HTMLInputElement ? element.value : String(element.textContent || element.getAttribute('aria-label') || '').trim();
      return {
        selectorType: 'css',
        selectorValue: selector,
        visible: !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true' && style.display !== 'none' && style.visibility !== 'hidden',
        enabled: !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement) || !element.disabled,
        text,
        controlType: element.getAttribute('type') || element.tagName.toLowerCase(),
        role: element.getAttribute('role') || (element.tagName.toLowerCase() === 'button' ? 'button' : ''),
        formAction: form ? String(form.getAttribute('action') || '') : '',
        formMethod: form ? String(form.getAttribute('method') || 'get') : '',
        formId: form ? String(form.getAttribute('id') || '') : '',
      };
    });
    if (!control) return undefined;

    return {
      selectorType: 'css',
      selectorValue: control.selectorValue,
      visible: control.visible,
      enabled: control.enabled,
      text: control.text,
      controlType: control.controlType,
      clickPermitted: false,
      noSubmitClick: true,
      metadata: {
        role: control.role,
        formAction: control.formAction,
        formMethod: control.formMethod,
        formId: control.formId,
        buttonFormRelationship: control.formId || control.formAction ? 'associated_form' : 'no_form_association',
        noProductionAction: true,
      },
    };
  }

  async simulateSafeInput(
    snapshot: WorkdayInspectionSnapshot,
    mapping: WorkdayFieldMappingSummary,
  ): Promise<WorkdaySimulatedFill[]> {
    const simulated: WorkdaySimulatedFill[] = [];
    for (const field of snapshot.fields) {
      const result = mapping.mappings.find((entry) => entry.requestedField.visibleLabel === field.label);
      if (!result || !result.canAutofill || !isSafeLocalFill(field, result)) continue;
      const value = clean(result.displayValue || result.value);
      if (!value) continue;
      const didFill = await this.page.evaluate(({ selector, value: nextValue, inputType }) => {
        const element = document.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (!element) return false;
        if (inputType === 'select' && element instanceof HTMLSelectElement) {
          const option = Array.from(element.options || []).find((candidate) => {
            const label = String(candidate.label || candidate.textContent || '').trim().toLowerCase();
            const optionValue = String(candidate.value || '').trim().toLowerCase();
            return label === String(nextValue).trim().toLowerCase() || optionValue === String(nextValue).trim().toLowerCase();
          });
          if (!option) return false;
          element.value = option.value;
        } else if ('value' in element) {
          element.value = String(nextValue);
        } else {
          return false;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, {
        selector: field.selector.selectorValue,
        value,
        inputType: field.inputType,
      });
      if (!didFill) continue;
      simulated.push({
        fieldId: field.fieldId,
        label: field.label,
        selector: field.selector.selectorValue,
        valuePreview: value,
        sensitivity: field.sensitiveCategory,
        simulated: true,
      });
    }
    return simulated;
  }
}

export function classifyBrowserValidation(
  snapshot: WorkdayInspectionSnapshot,
  mapping: WorkdayFieldMappingSummary,
): WorkdayBrowserValidationResult {
  const userGates = uniqueGates(snapshot.userGates.concat(mapping.userGates));
  const emptyRequiredFields = snapshot.fields
    .filter((field) => field.required && field.visible && field.enabled && !field.currentValuePresent)
    .map((field) => field.label);
  const validationMessages = snapshot.validation.validationMessages;

  if (snapshot.pageState === 'ACCOUNT_GATE' || snapshot.pageState === 'SIGN_IN' || snapshot.pageState === 'CREATE_ACCOUNT' || snapshot.pageState === 'SESSION_EXPIRED') {
    return validationResult(false, 'blocked_by_account_gate', emptyRequiredFields, mapping.unresolvedFields, validationMessages, userGates);
  }
  if (snapshot.pageState === 'UNKNOWN') {
    return validationResult(false, 'unsupported_page_state', emptyRequiredFields, mapping.unresolvedFields, validationMessages, userGates);
  }
  if (validationMessages.length || snapshot.pageState === 'VALIDATION_ERROR') {
    return validationResult(false, 'validation_error', emptyRequiredFields, mapping.unresolvedFields, validationMessages, userGates);
  }
  if (userGates.length || mapping.failureCode === 'SENSITIVE_FIELD_REQUIRES_USER' || mapping.failureCode === 'LOW_CONFIDENCE_MAPPING') {
    return validationResult(false, 'blocked_by_user_gate', emptyRequiredFields, mapping.unresolvedFields, validationMessages, userGates);
  }
  if (emptyRequiredFields.length || mapping.unresolvedFields.length) {
    return validationResult(false, 'incomplete', emptyRequiredFields, mapping.unresolvedFields, validationMessages, userGates);
  }
  return validationResult(true, 'valid_for_inspection', [], [], [], []);
}

function validationResult(
  inspectionValid: boolean,
  classification: WorkdayBrowserValidationClassification,
  emptyRequiredFields: string[],
  unresolvedFields: string[],
  validationMessages: string[],
  userGates: UserGate[],
): WorkdayBrowserValidationResult {
  return {
    inspectionValid,
    classification,
    emptyRequiredFields: unique(emptyRequiredFields),
    unresolvedFields: unique(unresolvedFields),
    validationMessages: unique(validationMessages),
    userGates,
    note: inspectionValid
      ? 'Local fixture DOM is valid for inspection only; this is not real application readiness.'
      : 'Local fixture DOM cannot proceed automatically under Phase 4 safety rules.',
  };
}

function guardPageGoto(page: Page, approvedFixtureDir: string, blockedRequests: WorkdayBrowserBlockedRequest[]) {
  const originalGoto = page.goto.bind(page);
  const mutablePage = page as Page & { goto: Page['goto'] };
  mutablePage.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
    const target = clean(url);
    if (!isAllowedBrowserUrl(target, approvedFixtureDir)) {
      blockedRequests.push(blockedRequest(target, 'GET', 'document', 'remote_page_goto_rejected', true));
      throw new Error(`Career OS local browser guard rejected remote navigation: ${target}`);
    }
    return originalGoto(url, options);
  };
}

async function guardRoute(
  route: Route,
  approvedFixtureDir: string,
  blockedRequests: WorkdayBrowserBlockedRequest[],
) {
  const request = route.request();
  const url = request.url();
  if (isAllowedBrowserUrl(url, approvedFixtureDir)) {
    await route.continue();
    return;
  }

  blockedRequests.push(blockedRequest(
    url,
    request.method(),
    request.resourceType(),
    reasonForBlockedRequest(request),
    request.isNavigationRequest(),
  ));
  await route.abort('blockedbyclient').catch(() => undefined);
}

function reasonForBlockedRequest(request: Request) {
  if (request.isNavigationRequest()) return 'external_navigation_blocked';
  if (request.resourceType() === 'script') return 'external_script_blocked';
  if (request.resourceType() === 'image') return 'external_image_blocked';
  if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') return 'external_fetch_blocked';
  return 'external_request_blocked';
}

function blockedRequest(
  url: string,
  method: string,
  resourceType: string,
  reason: string,
  isNavigationRequest: boolean,
): WorkdayBrowserBlockedRequest {
  return {
    url,
    method,
    resourceType,
    reason,
    isNavigationRequest,
    blockedAt: new Date().toISOString(),
  };
}

function isAllowedBrowserUrl(value: string, approvedFixtureDir: string) {
  const url = clean(value);
  if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('file://')) {
    return isPathInsideApprovedDir(fileUrlToPath(url), approvedFixtureDir);
  }
  if (/^https?:\/\//i.test(url)) return false;
  return false;
}

function resolveFixturePath(input: WorkdayLocalBrowserRunnerInput, approvedFixtureDir: string) {
  const source = clean(input.fixturePath);
  if (/^https?:\/\//i.test(source)) {
    throw new WorkdayFixtureError('LIVE_NAVIGATION_PROHIBITED', 'Local browser dry run rejects remote fixture URLs.', {
      fixturePath: source,
    });
  }
  if (source) {
    const resolved = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
    assertFixtureIsApproved(resolved, approvedFixtureDir);
    return resolved;
  }
  const fixtureName = clean(input.fixtureName);
  if (!fixtureName || /[\\/]/.test(fixtureName) || fixtureName.includes('..')) {
    throw new WorkdayFixtureError('FIXTURE_NOT_FOUND', 'A fixture scenario name or approved local fixture path is required.');
  }
  const candidate = path.join(approvedFixtureDir, `${fixtureName}.html`);
  assertFixtureIsApproved(candidate, approvedFixtureDir);
  return candidate;
}

function approvedDirectory(input?: string) {
  const directory = path.resolve(input || DEFAULT_WORKDAY_FIXTURE_DIR);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new WorkdayFixtureError('FIXTURE_NOT_FOUND', 'Approved Workday fixture directory does not exist.', {
      approvedFixtureDir: directory,
    });
  }
  return directory;
}

function assertFixtureIsApproved(filePath: string, approvedFixtureDir: string) {
  if (!isPathInsideApprovedDir(filePath, approvedFixtureDir)) {
    throw new WorkdayFixtureError('LIVE_NAVIGATION_PROHIBITED', 'Fixture path is outside the approved local Workday fixture directory.', {
      fixturePath: filePath,
      approvedFixtureDir,
    });
  }
}

function isPathInsideApprovedDir(filePath: string, approvedFixtureDir: string) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(approvedFixtureDir, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fileUrlToPath(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

async function installSubmitGuard(page: Page) {
  await page.addInitScript(SUBMIT_GUARD_SOURCE);
  await page.evaluate(SUBMIT_GUARD_SOURCE).catch(() => undefined);
}

async function readSubmitGuardAttempts(page: Page): Promise<WorkdaySubmitGuardAttempt[]> {
  return page.evaluate(() => {
    return Array.isArray(window.__careerOsSubmitAttempts)
      ? window.__careerOsSubmitAttempts.map((entry) => ({
        method: String(entry.method || ''),
        selector: String(entry.selector || ''),
        action: String(entry.action || ''),
        key: String(entry.key || ''),
        blockedAt: String(entry.blockedAt || ''),
      }))
      : [];
  }).catch(() => []);
}

function classifyBrowserPage(signals: BrowserPageSignals, fixture: WorkdayFixture): {
  pageState: WorkdayPageState;
  matchedSignals: string[];
  conflictingSignals: string[];
  userGates: UserGate[];
  failureCode?: WorkdayFailureCode;
} {
  const htmlState = normalizePageState(signals.htmlState);
  const metadataState = normalizePageState(fixture.metadata.expectedWorkdayState);
  const inferredState = inferPageStateFromText(signals.text);
  const pageState = htmlState || metadataState || inferredState || 'UNKNOWN';
  const matchedSignals: string[] = [];
  const conflictingSignals: string[] = [];

  if (htmlState) matchedSignals.push(`browser_dom_state:${htmlState}`);
  if (metadataState) matchedSignals.push(`fixture_metadata_state:${metadataState}`);
  if (inferredState) matchedSignals.push(`browser_text_state:${inferredState}`);
  if (htmlState && metadataState && htmlState !== metadataState) {
    conflictingSignals.push(`browser_state_conflict:${htmlState}_vs_${metadataState}`);
  }

  const userGates = pageStateGates(pageState, signals);
  let failureCode: WorkdayFailureCode | undefined;
  if (pageState === 'UNKNOWN') failureCode = 'UNSUPPORTED_WORKDAY_STATE';
  if (pageState === 'ACCOUNT_GATE' || pageState === 'SIGN_IN' || pageState === 'SESSION_EXPIRED') {
    failureCode = pageState === 'ACCOUNT_GATE' ? 'ACCOUNT_GATE' : 'AUTHENTICATION_REQUIRED';
  }
  if (pageState === 'CREATE_ACCOUNT') failureCode = 'ACCOUNT_GATE';

  return {
    pageState,
    matchedSignals,
    conflictingSignals,
    userGates,
    failureCode,
  };
}

function pageStateGates(pageState: WorkdayPageState, signals: BrowserPageSignals): UserGate[] {
  const gates: UserGate[] = [];
  if (pageState === 'ACCOUNT_GATE' || pageState === 'SIGN_IN' || pageState === 'SESSION_EXPIRED') {
    gates.push({
      category: 'AUTHENTICATION_REQUIRED',
      label: 'Workday sign-in required',
      reason: 'The rendered local fixture contains a Workday account or session gate.',
      rawSignals: { pageState },
    });
  }
  if (pageState === 'CREATE_ACCOUNT') {
    gates.push({
      category: 'ACCOUNT_CREATION_REQUIRED',
      label: 'Workday account creation required',
      reason: 'The rendered local fixture contains a Workday create-account gate.',
      rawSignals: { pageState },
    });
  }
  if (signals.mfaRequired) {
    gates.push({
      category: 'MFA_REQUIRED',
      label: 'Workday MFA required',
      reason: 'The rendered local fixture includes MFA signals.',
      rawSignals: { pageState, mfaSignal: true },
    });
  }
  if (signals.captchaRequired) {
    gates.push({
      category: 'CAPTCHA_REQUIRED',
      label: 'Workday CAPTCHA required',
      reason: 'The rendered local fixture includes CAPTCHA signals.',
      rawSignals: { pageState, captchaSignal: true },
    });
  }
  return gates;
}

function inferPageStateFromText(value: string): WorkdayPageState | undefined {
  const text = normalize(value);
  if (/candidate account required|account gate/.test(text)) return 'ACCOUNT_GATE';
  if (/session expired|timed out/.test(text)) return 'SESSION_EXPIRED';
  if (/create account|register/.test(text)) return 'CREATE_ACCOUNT';
  if (/sign in|login|log in/.test(text)) return 'SIGN_IN';
  if (/upload resume|resume upload|attach resume/.test(text)) return 'RESUME_UPLOAD';
  if (/validation error|required field/.test(text)) return 'VALIDATION_ERROR';
  if (/submit ready|ready to submit/.test(text)) return 'SUBMIT_READY';
  if (/review.*submit|submit application/.test(text)) return 'REVIEW';
  if (/voluntary disclosures|gender|veteran|disability/.test(text)) return 'VOLUNTARY_DISCLOSURES';
  if (/application questions|sponsorship|relocation/.test(text)) return 'APPLICATION_QUESTIONS';
  if (/personal information|legal first name|email address/.test(text)) return 'PERSONAL_INFORMATION';
  if (/confirmation|application submitted/.test(text)) return 'CONFIRMATION';
  return undefined;
}

function normalizePageState(value: unknown): WorkdayPageState | undefined {
  const state = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (WORKDAY_PAGE_STATES as readonly string[]).indexOf(state) >= 0 ? state as WorkdayPageState : undefined;
}

function browserEvidence(input: {
  fixture: WorkdayFixture;
  snapshot: WorkdayInspectionSnapshot;
  mapping: WorkdayFieldMappingSummary;
  validation: WorkdayBrowserValidationResult;
  simulatedFills: WorkdaySimulatedFill[];
  blockedRequests: WorkdayBrowserBlockedRequest[];
  submitAttempts: WorkdaySubmitGuardAttempt[];
  screenshotPath: string;
}): AtsEvidenceItem[] {
  const common: JsonRecord = {
    adapter: 'workday',
    browserMode: 'headless',
    executionMode: 'local_browser_dry_run',
    fixtureName: input.fixture.name,
    fixturePath: input.fixture.absolutePath,
    scenario: input.fixture.scenario,
    pageState: input.snapshot.pageState,
    normalizedUrl: input.snapshot.normalizedUrl,
    tenant: input.snapshot.tenant,
    jobId: input.snapshot.jobId,
    inspectedFields: input.snapshot.fields.map((field) => ({
      fieldId: field.fieldId,
      label: field.label,
      selector: field.selector,
      required: field.required,
      visible: field.visible,
      enabled: field.enabled,
    })),
    userGates: input.validation.userGates.map((gate) => gate.category),
    validation: input.validation,
    submitControl: input.snapshot.submitControl,
    resumeUploadControl: input.snapshot.resumeUploadControl,
    blockedRequests: input.blockedRequests,
    submitAttempts: input.submitAttempts,
    screenshotPath: input.screenshotPath,
    submitClickAttempted: false,
    liveNavigationAttempted: false,
    productionWriteAttempted: false,
    noSubmissionConfirmed: true,
    runnerVersion: WORKDAY_LOCAL_BROWSER_RUNNER_VERSION,
    fixtureInspectorVersion: WORKDAY_FIXTURE_INSPECTOR_VERSION,
  };

  return [
    createEvidenceItem({
      kind: 'page_snapshot',
      label: 'Workday local browser fixture rendered',
      value: input.snapshot.pageState,
      url: input.snapshot.normalizedUrl,
      screenshotPath: input.screenshotPath,
      metadata: common,
    }),
    createEvidenceItem({
      kind: 'field_scan',
      label: 'Workday rendered DOM fields inspected',
      value: String(input.snapshot.fields.length),
      url: input.snapshot.normalizedUrl,
      metadata: {
        fixtureName: input.fixture.name,
        fieldsDetected: input.snapshot.fields.length,
        requiredFields: input.snapshot.validation.requiredFields,
        simulatedFills: input.simulatedFills,
      },
    }),
    createEvidenceItem({
      kind: 'validation',
      label: 'Workday rendered DOM validation classified',
      value: input.validation.classification,
      url: input.snapshot.normalizedUrl,
      metadata: {
        fixtureName: input.fixture.name,
        inspectionValid: input.validation.inspectionValid,
        validationMessages: input.validation.validationMessages,
        emptyRequiredFields: input.validation.emptyRequiredFields,
        unresolvedFields: input.validation.unresolvedFields,
      },
    }),
  ];
}

function normalizedContextFromSnapshot(snapshot: WorkdayInspectionSnapshot, fixture: WorkdayFixture): NormalizedAtsContext {
  const detection = detectAts({
    sourceUrl: fixture.fixtureUrl,
    platformHint: 'workday',
    rawJobRecord: {
      ats_platform: 'workday',
      job_url: fixture.fixtureUrl,
    },
    pageSignals: {
      platform: 'workday',
      workdayPageState: snapshot.pageState,
    },
  });
  return {
    detectedPlatform: detection.platform,
    sourceUrl: detection.normalized.sourceUrl,
    normalizedUrl: detection.normalized.normalizedUrl,
    platformHint: 'workday',
    tenant: snapshot.tenant || detection.tenant || null,
    jobId: snapshot.jobId || detection.jobId || null,
    applicationId: null,
    confidence: detection.confidence,
    matchedSignals: unique(snapshot.matchedSignals.concat(detection.matchedSignals)),
    conflictingSignals: unique(snapshot.conflictingSignals.concat(detection.conflictingSignals)),
    unknowns: unique(snapshot.unknowns.concat(detection.unknowns)),
    detectorVersion: detection.detectorVersion,
    adapterId: 'workday',
    adapterVersion: 'career-os-workday-compat-2026-07-24-phase-3-fixture-poc',
    implementationStatus: 'experimental',
    supported: true,
    routingReason: 'Local browser dry run rendered a Workday fixture without live navigation.',
    originalTask: {
      fixtureName: fixture.name,
      fixturePath: fixture.absolutePath,
      localBrowserDryRun: true,
    },
  };
}

function confidenceForSnapshot(snapshot: WorkdayInspectionSnapshot) {
  if (snapshot.conflictingSignals.length) return 0.74;
  if (snapshot.pageState === 'UNKNOWN') return 0.2;
  return 0.96;
}

function isSafeLocalFill(field: WorkdayInspectedField, mapping: CanonicalFieldMappingResult) {
  if (!field.visible || !field.enabled || field.inputType === 'file' || field.inputType === 'checkbox' || field.inputType === 'radio') {
    return false;
  }
  if (!mapping.canAutofill) return false;
  return field.sensitiveCategory === 'standard'
    || field.sensitiveCategory === 'contact'
    || field.sensitiveCategory === 'employment';
}

function controlType(value: unknown): WorkdayInspectedField['inputType'] {
  const text = clean(value);
  if (text === 'text' || text === 'textarea' || text === 'select' || text === 'radio' || text === 'checkbox' || text === 'file' || text === 'combobox') {
    return text;
  }
  return 'unknown';
}

function selectorType(value: unknown): WorkdayInspectedField['selector']['selectorType'] {
  const text = clean(value);
  if (text === 'css' || text === 'role' || text === 'text' || text === 'xpath' || text === 'unknown') {
    return text;
  }
  return 'unknown';
}

function sensitivity(value: unknown, label: string): CanonicalFieldSensitivity {
  const text = clean(value).toLowerCase();
  const allowed: CanonicalFieldSensitivity[] = [
    'standard',
    'contact',
    'employment',
    'salary',
    'relocation',
    'sponsorship',
    'legal',
    'demographic',
    'disability',
    'veteran',
    'conflict_disclosure',
  ];
  return allowed.indexOf(text as CanonicalFieldSensitivity) >= 0
    ? text as CanonicalFieldSensitivity
    : inferSensitivityFromLabel(label);
}

function cleanupArtifacts(artifactDir: string, preserveArtifacts: boolean) {
  if (preserveArtifacts) {
    return {
      completed: false,
      directory: artifactDir,
    };
  }
  fs.rmSync(artifactDir, {
    force: true,
    recursive: true,
  });
  return {
    completed: true,
    directory: artifactDir,
  };
}

function fixtureIdentity(fixture: WorkdayFixture) {
  return {
    name: fixture.name,
    scenario: fixture.scenario,
    path: fixture.absolutePath,
    metadataPath: fixture.metadataPath,
    fixtureUrl: fixture.fixtureUrl,
  };
}

function safePageUrl(page: Page) {
  try {
    return page.url();
  } catch {
    return '';
  }
}

function safeFileName(value: string) {
  return clean(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'workday-fixture';
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueGates(gates: UserGate[]) {
  const seen = new Set<string>();
  const result: UserGate[] = [];
  for (const gate of gates) {
    const key = `${gate.category}:${gate.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(gate);
  }
  return result;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalize(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

export function approvedFixtureFileUrl(fixturePath: string, approvedFixtureDir = DEFAULT_WORKDAY_FIXTURE_DIR) {
  const resolved = path.resolve(fixturePath);
  assertFixtureIsApproved(resolved, approvedDirectory(approvedFixtureDir));
  return pathToFileURL(resolved).toString();
}

declare global {
  interface Window {
    __careerOsSubmitGuardInstalled?: boolean;
    __careerOsSubmitAttempts?: WorkdaySubmitGuardAttempt[];
    __careerOsOriginalOpen?: typeof window.open;
  }

  interface HTMLFormElement {
    __careerOsOriginalSubmit?: HTMLFormElement['submit'];
    __careerOsOriginalRequestSubmit?: HTMLFormElement['requestSubmit'];
  }

  interface HTMLElement {
    __careerOsOriginalClick?: HTMLElement['click'];
  }
}
