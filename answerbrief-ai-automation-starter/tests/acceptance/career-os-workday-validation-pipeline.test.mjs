import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

import { applyFieldMappings } from '../../scripts/lib/career-os-field-engine.mjs';
import {
  emptyValidationReport,
  requiresExactMatch,
  runValidationReadbackRepairPipeline,
  valuesMatch,
} from '../../scripts/lib/career-os-workday-validation-pipeline.mjs';
import { autofillWorkdayFields } from '../../scripts/lib/career-os-workday-production.mjs';
import { loadWorkdayAnswerBank } from '../../scripts/lib/career-os-workday-answer-bank.mjs';

// The submit-approval fingerprint (buildWorkdayReviewFingerprint) is built
// only from field *labels*, never from filled *values* -- so it cannot catch
// the class of defect fixed earlier (identity-field corruption, Phone
// Extension/Phone Number collision, Country Phone Code/Phone Device Type
// cross-contamination): the right label ending up with the wrong value.
// This pipeline closes that gap by reading back each filled field's live DOM
// value after applyFieldMappings runs, comparing it against the value that
// was supposed to be committed, and attempting a bounded repair before
// surfacing anything that still doesn't match.

function textMapping(key, matcher, value) {
  return { key, kind: 'text', matchers: [matcher], value };
}

test('valuesMatch: exact is the default, and substring containment is never used unless explicitly requested', () => {
  assert.deepEqual(valuesMatch('Alex Rivera', 'Alex Rivera'), { match: true, matchType: 'exact' });
  assert.deepEqual(valuesMatch('Alex Rivera', ' alex   rivera '), { match: true, matchType: 'exact' });
  assert.equal(valuesMatch('Mobile', 'Home').match, false);
  assert.equal(valuesMatch('Mobile', '').matchType, 'empty_actual');

  // Reviewer-flagged unsafe partial matches: these must never verify as a
  // match under the default (exact) mode, even though one value contains
  // the other as a substring.
  assert.equal(valuesMatch('1', '10').match, false, '"1" must not verify against "10"');
  assert.equal(valuesMatch('10', '1').match, false, '"10" must not verify against a truncated "1"');
  assert.equal(valuesMatch('9453049338', '945304933').match, false, 'a truncated phone number must not verify');
  assert.equal(valuesMatch('Mobile', 'Mobile Phone').match, false, 'a decorated/partial device-type label must not verify');
  assert.equal(
    valuesMatch('United States of America (+1)', 'United States of America (+1) selected').match,
    false,
    'a decorated country-code label must not verify under exact matching',
  );

  // Explicit opt-in (exact: false) is the only way to get containment
  // matching -- this models a mapping that declared itself free-text.
  assert.equal(valuesMatch('United States of America (+1)', 'United States of America (+1) selected', { exact: false }).match, true);
});

test('requiresExactMatch: exact by default; only an explicit allowPartialMatch opt-out loosens it', () => {
  assert.equal(requiresExactMatch({ key: 'phone_number', kind: 'text' }), true);
  assert.equal(requiresExactMatch({ key: 'phone_extension', kind: 'text' }), true);
  assert.equal(requiresExactMatch({ key: 'country_phone_code', kind: 'select' }), true);
  assert.equal(requiresExactMatch({ key: 'phone_device_type', kind: 'select' }), true);
  assert.equal(requiresExactMatch({ key: 'legal_first_name', kind: 'text' }), true);
  assert.equal(requiresExactMatch({ key: 'email', kind: 'text' }), true);
  assert.equal(requiresExactMatch({ key: 'postal_code', kind: 'text' }), true);
  assert.equal(requiresExactMatch({ key: 'anything_at_all', kind: 'select' }), true);
  assert.equal(requiresExactMatch({ key: 'cover_letter_summary', kind: 'text', allowPartialMatch: true }), false);
});

test('emptyValidationReport reports ok:true with zeroed counters', () => {
  const report = emptyValidationReport();
  assert.equal(report.ok, true);
  assert.equal(report.verifiedCount, 0);
  assert.equal(report.mismatchCount, 0);
  assert.equal(report.unreadableCount, 0);
  assert.deepEqual(report.fieldReports, []);
});

test('pipeline verifies a correctly-filled field as ok with no repair needed', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <label for="firstName">First Name</label>
        <input id="firstName" value="" />
      </body>
    `);
    const mapping = textMapping('legal_first_name', /first name/i, 'Alex');
    const results = await applyFieldMappings(page, [mapping], {});
    assert.equal(results[0]?.applied, true);

    const report = await runValidationReadbackRepairPipeline(page, [mapping], results, {});
    assert.equal(report.ok, true);
    assert.equal(report.verifiedCount, 1);
    assert.equal(report.mismatchCount, 0);
    assert.equal(report.repairedCount, 0);
    assert.equal(report.fieldReports[0].status, 'verified');
  } finally {
    await browser.close();
  }
});

test('pipeline detects a transient mismatch and repairs it by re-applying the mapping', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <label for="firstName">First Name</label>
        <input id="firstName" value="" />
      </body>
    `);
    const mapping = textMapping('legal_first_name', /first name/i, 'Alex');
    const results = await applyFieldMappings(page, [mapping], {});
    assert.equal(results[0]?.applied, true);

    // Simulate some other page interaction clobbering the value after the
    // original fill, before the validation pipeline ever runs.
    await page.fill('#firstName', 'CORRUPTED_BY_UNRELATED_INTERACTION');

    const report = await runValidationReadbackRepairPipeline(page, [mapping], results, {});
    assert.equal(report.ok, true);
    assert.equal(report.repairedCount, 1);
    assert.equal(report.mismatchCount, 0);
    assert.equal(report.fieldReports[0].repaired, true);
    assert.equal(await page.inputValue('#firstName'), 'Alex');
  } finally {
    await browser.close();
  }
});

test('pipeline fails closed when a field keeps reverting to the wrong value across repair attempts', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <label for="firstName">First Name</label>
        <input id="firstName" value="" />
        <script>
          document.getElementById('firstName').addEventListener('input', (event) => {
            const element = event.target;
            if (element.value !== 'STUCK_WRONG_VALUE') {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(element, 'STUCK_WRONG_VALUE');
            }
          });
        </script>
      </body>
    `);
    // applyTextMapping already has its own inline commit check, so a fill path
    // that reverts synchronously on every attempt would be caught there and
    // reported as applied:false -- this test instead models the pipeline as
    // an independent second check: some other fill path (or future bug in
    // one) reported applied:true, but the value never actually stuck.
    const mapping = textMapping('legal_first_name', /first name/i, 'Alex');
    const results = [{ key: 'legal_first_name', matched: true, applied: true, field: 'First Name', value: 'Alex' }];

    const report = await runValidationReadbackRepairPipeline(page, [mapping], results, {}, { maxRepairAttempts: 2 });
    assert.equal(report.ok, false, 'a field that never settles on the expected value must never be reported ok');
    assert.equal(report.mismatchCount, 1);
    assert.equal(report.repairedCount, 0);
    assert.equal(report.fieldReports[0].status, 'mismatch');
    assert.equal(report.fieldReports[0].repairAttempts, 2);
    assert.equal(report.fieldReports[0].actual, 'STUCK_WRONG_VALUE');
  } finally {
    await browser.close();
  }
});

test('pipeline fails closed when the filled control can no longer be found on readback', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <label for="firstName">First Name</label>
        <input id="firstName" value="" />
      </body>
    `);
    const mapping = textMapping('legal_first_name', /first name/i, 'Alex');
    const results = await applyFieldMappings(page, [mapping], {});
    assert.equal(results[0]?.applied, true);

    // Simulate the control being torn down/re-rendered by the page after the
    // fill (e.g. the framework replaced the DOM node with a fresh one).
    await page.evaluate(() => document.getElementById('firstName').remove());

    const report = await runValidationReadbackRepairPipeline(page, [mapping], results, {}, { maxRepairAttempts: 1 });
    assert.equal(report.ok, false, 'an unreadable field must never be silently treated as verified');
    assert.equal(report.unreadableCount, 1);
  } finally {
    await browser.close();
  }
});

test('pipeline requires exact match for enumerated select fields (phone device type / country phone code) -- a decorated/partial committed value fails closed, not verified', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <label for="deviceType">Phone Device Type</label>
        <select id="deviceType"><option value="">Select</option><option value="Mobile">Mobile</option><option value="Home">Home</option></select>
      </body>
    `);
    // The mapping's intended value is "Mobile", but the control ended up
    // committed to a decorated/partial variant -- under the old
    // bidirectional-substring rule this would have wrongly verified.
    await page.selectOption('#deviceType', { label: 'Home' });
    const mapping = { key: 'phone_device_type', kind: 'select', matchers: [/phone device type/i], value: 'Mobile' };
    const results = [{ key: 'phone_device_type', matched: true, applied: true, field: 'Phone Device Type', value: 'Mobile' }];

    const report = await runValidationReadbackRepairPipeline(page, [mapping], results, {}, { maxRepairAttempts: 0 });
    assert.equal(report.ok, false, 'a select field committed to the wrong option must fail closed under exact matching');
    assert.equal(report.mismatchCount, 1);
  } finally {
    await browser.close();
  }
});

test('autofillWorkdayFields: the bounded mappings path is routed through readback and fails closed on a wrong committed value (regression for the previously-unvalidated mappingResults path)', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Only one field on the page, matched by the *bounded* mapping pass
    // (buildWorkdayQuestionMappings), not the answer-bank/per-page pass --
    // this exercises the "!mappings.length" early-return branch in
    // autofillWorkdayFields, which previously returned emptyValidationReport()
    // (ok:true) unconditionally regardless of what the bounded pass applied.
    await page.setContent(`
      <body>
        <label for="legalFirstName">Legal First Name</label>
        <input id="legalFirstName" value="" />
        <script>
          // Simulate the field silently reverting after the bounded fill
          // committed the correct value -- exactly the "applied:true but the
          // DOM disagrees" scenario the validation pipeline exists to catch.
          window.__corruptAfterFill = () => {
            const el = document.getElementById('legalFirstName');
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(el, 'CORRUPTED_AFTER_BOUNDED_FILL');
          };
        </script>
      </body>
    `);
    const task = {
      applicationId: 'bounded-mapping-validation-fixture',
      candidate: { email: '', firstName: 'Alex', lastName: '', phone: '' },
      rawRecord: {},
    };
    const bank = loadWorkdayAnswerBank();
    const reports = [];
    const runtime = {
      async report(payload) {
        reports.push(payload);
      },
      async safeShot() {
        return '';
      },
    };

    const result = await autofillWorkdayFields(page, task, runtime, bank, { fields: [] }, {});
    assert.equal(await page.inputValue('#legalFirstName'), 'Alex', 'sanity check: the bounded pass filled the field correctly');

    // Now corrupt the DOM the way a race/re-render bug would, and re-run the
    // validation the same way autofillWorkdayFields does, directly, to prove
    // the bounded path's applied result is actually checked against the live
    // DOM rather than assumed correct.
    await page.evaluate(() => window.__corruptAfterFill());
    const revalidated = await runValidationReadbackRepairPipeline(
      page,
      result.applied.length ? [{ key: 'legal_first_name', kind: 'text', matchers: [/legal first name/i], value: 'Alex' }] : [],
      [{ key: 'legal_first_name', matched: true, applied: true, field: 'Legal First Name', value: 'Alex' }],
      task,
      { maxRepairAttempts: 0 },
    );
    assert.equal(revalidated.ok, false, 'a corrupted bounded-mapping field must be caught, not silently reported ok');

    // And critically: the original (pre-corruption) result already went
    // through the pipeline inside autofillWorkdayFields itself -- confirm it
    // reported a real (not vacuous/bypassed) validation outcome for the
    // bounded pass.
    assert.ok(result.validation, 'autofillWorkdayFields must return a validation report for the bounded mappings path');
    assert.equal(result.validation.ok, true, 'the correctly-filled bounded field should verify ok before corruption');
    assert.equal(result.validation.verifiedCount, 1, 'the bounded pass applied field must actually be counted as verified, not skipped');
  } finally {
    await browser.close();
  }
});

test('pipeline ignores unresolved/unapplied/first-available results, only verifying fields that were actually applied', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<body></body>');
    const results = [
      { key: 'unresolved', applied: false, reason: 'value_unresolved' },
      { key: 'first_available', applied: true, value: '__first_available__' },
    ];
    const report = await runValidationReadbackRepairPipeline(page, [], results, {});
    assert.equal(report.ok, true);
    assert.equal(report.fieldReports.length, 0);
  } finally {
    await browser.close();
  }
});
