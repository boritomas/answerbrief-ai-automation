import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

import { applyFieldMappings } from '../../scripts/lib/career-os-field-engine.mjs';
import { buildWorkdayQuestionMappings } from '../../scripts/lib/career-os-question-mappings.mjs';
import { loadWorkdayAnswerBank, resolveWorkdayAnswerForLabel } from '../../scripts/lib/career-os-workday-answer-bank.mjs';

// P0 regression coverage for two live defects found on a Capital One
// Workday canary run, in addition to the identity-field-corruption bug
// covered in career-os-field-engine-identity-safety.test.mjs:
//
// (A) "Phone Extension" had no explicit canonical bank entry, so it fell
//     through to fuzzy label matching, where the single-word "Phone" label
//     variation on the phone_number entry scored high enough (substring
//     match) to win against the target "phone extension" -- so Phone
//     Extension silently resolved to and filled with the phone number.
//
// (B) "Phone Device Type" and "Country Phone Code" are two separate Workday
//     combobox prompts that sit close together on the page. The control
//     resolver (clickPromptControlNearLabel) used geometric proximity as
//     its only signal, which let it grab the wrong control for one field's
//     search, and then type/select into the other field's popup.

function candidateTask(overrides = {}) {
  return {
    applicationId: 'workday-phone-fields-fixture',
    candidate: {
      email: 'owner@example.com',
      firstName: 'Alex',
      lastName: 'Rivera',
      phone: '9453049338',
      ...overrides,
    },
    rawRecord: {},
  };
}

test('Part A: Phone Extension resolves to its own canonical field, never to phone_number', () => {
  const bank = loadWorkdayAnswerBank();

  const extension = resolveWorkdayAnswerForLabel('Phone Extension', { bank, task: candidateTask() });
  assert.equal(extension.canonicalField, 'phone_extension');
  assert.notEqual(extension.canonicalField, 'phone_number');
  assert.equal(extension.safeToAutoFill, false, 'an empty extension must never be auto-filled with anything, including the phone number');

  const number = resolveWorkdayAnswerForLabel('Phone Number', { bank, task: candidateTask() });
  assert.equal(number.canonicalField, 'phone_number');
  assert.equal(number.answer, '9453049338');
  assert.equal(number.safeToAutoFill, true);
});

test('Part A: Phone Extension is never treated as a match for phone_number label variations, even under fuzzy scoring', () => {
  const bank = loadWorkdayAnswerBank();
  for (const label of ['Phone Extension', 'Ext', 'Ext.', 'Extension']) {
    const resolution = resolveWorkdayAnswerForLabel(label, { bank, task: candidateTask() });
    assert.notEqual(resolution.canonicalField, 'phone_number', `"${label}" must not resolve to phone_number`);
  }
});

test('Part A: an already-empty Phone Extension field stays empty end-to-end through applyFieldMappings', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        <label for="phoneNumber">Phone Number</label>
        <input id="phoneNumber" value="" />
        <label for="phoneExtension">Phone Extension</label>
        <input id="phoneExtension" value="" />
      </body>
    `);

    const mappings = buildWorkdayQuestionMappings(candidateTask(), {});
    const phoneNumberMapping = mappings.find((mapping) => mapping.key === 'phone_number');
    await applyFieldMappings(page, [phoneNumberMapping], candidateTask());

    assert.equal(await page.inputValue('#phoneNumber'), '9453049338');
    assert.equal(await page.inputValue('#phoneExtension'), '', 'Phone Extension must remain empty; nothing in the mapping set targets it with the phone number');
  } finally {
    await browser.close();
  }
});

const IDENTITY_SENTINELS = {
  email: 'sentinel-untouched@example.com',
  firstName: 'SENTINEL_FIRST_NAME_UNTOUCHED',
  lastName: 'SENTINEL_LAST_NAME_UNTOUCHED',
  phoneExtension: '',
  phoneNumber: 'SENTINEL_PHONE_UNTOUCHED',
};

function identityFieldsHtml() {
  return `
    <div id="identity-section">
      <label for="firstName">First Name</label>
      <input id="firstName" value="${IDENTITY_SENTINELS.firstName}" />
      <label for="lastName">Last Name</label>
      <input id="lastName" value="${IDENTITY_SENTINELS.lastName}" />
      <label for="email">Email Address</label>
      <input id="email" type="email" value="${IDENTITY_SENTINELS.email}" />
      <label for="phoneNumber">Phone Number</label>
      <input id="phoneNumber" value="${IDENTITY_SENTINELS.phoneNumber}" />
      <label for="phoneExtension">Phone Extension</label>
      <input id="phoneExtension" value="${IDENTITY_SENTINELS.phoneExtension}" />
    </div>
  `;
}

async function assertIdentityFieldsUntouched(page) {
  for (const [id, sentinel] of Object.entries(IDENTITY_SENTINELS)) {
    const value = await page.inputValue(`#${id}`);
    assert.equal(value, sentinel, `#${id} must remain untouched`);
  }
}

function phoneDeviceTypeAndCountryCodeHtml({ wireExplicitAssociations = true } = {}) {
  // Two Workday-style combobox prompts placed close together, as they are
  // on the real "My Information" page (Phone Device Type directly above
  // Country Phone Code).
  const deviceTypeFor = wireExplicitAssociations ? ' for="phoneDeviceTypeControl"' : '';
  const countryCodeFor = wireExplicitAssociations ? ' for="countryPhoneCodeControl"' : '';
  return `
    <div id="phone-section" style="padding:8px">
      <label${deviceTypeFor}>Phone Device Type</label>
      <button id="phoneDeviceTypeControl" role="combobox" aria-haspopup="listbox" aria-controls="phoneDeviceTypeListbox">Home</button>
      <div id="phoneDeviceTypeListbox" role="listbox" style="display:none">
        <input type="text" placeholder="search" />
        <div role="option">Mobile</div>
        <div role="option">Home</div>
        <div role="option">Work</div>
      </div>

      <label${countryCodeFor}>Country Phone Code</label>
      <button id="countryPhoneCodeControl" role="combobox" aria-haspopup="listbox" aria-controls="countryPhoneCodeListbox">Austria (+43)</button>
      <div id="countryPhoneCodeListbox" role="listbox" style="display:none">
        <input type="text" placeholder="search" />
        <div role="option">United States of America (+1)</div>
        <div role="option">Austria (+43)</div>
      </div>
    </div>
    <script>
      function wireToggle(controlId, listboxId) {
        document.getElementById(controlId).addEventListener('click', () => {
          document.getElementById(listboxId).style.display = 'block';
        });
        document.getElementById(listboxId).addEventListener('click', (event) => {
          const option = event.target.closest('[role="option"]');
          if (!option) return;
          document.getElementById(controlId).textContent = option.textContent;
          document.getElementById(listboxId).style.display = 'none';
        });
      }
      wireToggle('phoneDeviceTypeControl', 'phoneDeviceTypeListbox');
      wireToggle('countryPhoneCodeControl', 'countryPhoneCodeListbox');
    </script>
  `;
}

function phoneDeviceTypeMapping() {
  return [{ key: 'phone_device_type', kind: 'select', matchers: [/phone device type/i], value: 'Mobile' }];
}

function countryPhoneCodeMapping() {
  return [{ key: 'country_phone_code', kind: 'select', matchers: [/country phone code/i], value: 'United States of America (+1)' }];
}

test('Part B: Phone Device Type resolves to its own control and commits "Mobile", not the Country Phone Code control', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<body>${identityFieldsHtml()}${phoneDeviceTypeAndCountryCodeHtml()}</body>`);

    const results = await applyFieldMappings(page, phoneDeviceTypeMapping(), {});

    assert.equal(results[0]?.applied, true, 'Phone Device Type selection must succeed against its own control');
    assert.equal(await page.locator('#phoneDeviceTypeControl').textContent(), 'Mobile');
    assert.equal(await page.locator('#countryPhoneCodeControl').textContent(), 'Austria (+43)', 'Country Phone Code control must be untouched by a Phone Device Type operation');
    await assertIdentityFieldsUntouched(page);
  } finally {
    await browser.close();
  }
});

test('Part B: Country Phone Code resolves to its own control and commits "United States of America (+1)", not the Phone Device Type control', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<body>${identityFieldsHtml()}${phoneDeviceTypeAndCountryCodeHtml()}</body>`);

    const results = await applyFieldMappings(page, countryPhoneCodeMapping(), {});

    assert.equal(results[0]?.applied, true, 'Country Phone Code selection must succeed against its own control');
    assert.match(await page.locator('#countryPhoneCodeControl').textContent(), /united states of america.*\+1/i);
    assert.equal(await page.locator('#phoneDeviceTypeControl').textContent(), 'Home', 'Phone Device Type control must be untouched by a Country Phone Code operation');
    await assertIdentityFieldsUntouched(page);
  } finally {
    await browser.close();
  }
});

test('Part B: option-set validation rejects a Phone Device Type search when only country dialing codes are visible (wrong-control safety net)', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Only a Country Phone Code control/listbox exists on this page. If a
    // Phone Device Type mapping's control-resolution mistakenly grabbed it
    // (e.g. no explicit label association available, ambiguous proximity),
    // the option-set validation must refuse to type/select rather than
    // silently committing a country code as if it were a device type.
    await page.setContent(`
      <body>
        ${identityFieldsHtml()}
        <div id="phone-section">
          <label for="countryPhoneCodeControl">Phone Device Type</label>
          <button id="countryPhoneCodeControl" role="combobox" aria-haspopup="listbox" aria-controls="countryPhoneCodeListbox">Austria (+43)</button>
          <div id="countryPhoneCodeListbox" role="listbox" style="display:none">
            <input type="text" placeholder="search" />
            <div role="option">United States of America (+1)</div>
            <div role="option">Austria (+43)</div>
            <div role="option">Armenia (+374)</div>
          </div>
        </div>
        <script>
          document.getElementById('countryPhoneCodeControl').addEventListener('click', () => {
            document.getElementById('countryPhoneCodeListbox').style.display = 'block';
          });
        </script>
      </body>
    `);

    const results = await applyFieldMappings(page, phoneDeviceTypeMapping(), {});

    assert.equal(results[0]?.applied, false, 'must fail closed rather than accept a country-code option set for a device-type request');
    assert.equal(results[0]?.reason, 'wrong_control_option_set_mismatch');
    assert.equal(await page.locator('#countryPhoneCodeControl').textContent(), 'Austria (+43)', 'the mismatched control must be left exactly as it was found');
    await assertIdentityFieldsUntouched(page);
  } finally {
    await browser.close();
  }
});

test('Part B: option-set validation rejects a Country Phone Code search when only device-type options are visible', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        ${identityFieldsHtml()}
        <div id="phone-section">
          <label for="deviceTypeControl">Country Phone Code</label>
          <button id="deviceTypeControl" role="combobox" aria-haspopup="listbox" aria-controls="deviceTypeListbox">Home</button>
          <div id="deviceTypeListbox" role="listbox" style="display:none">
            <input type="text" placeholder="search" />
            <div role="option">Mobile</div>
            <div role="option">Home</div>
            <div role="option">Work</div>
          </div>
        </div>
        <script>
          document.getElementById('deviceTypeControl').addEventListener('click', () => {
            document.getElementById('deviceTypeListbox').style.display = 'block';
          });
        </script>
      </body>
    `);

    const results = await applyFieldMappings(page, countryPhoneCodeMapping(), {});

    assert.equal(results[0]?.applied, false, 'must fail closed rather than accept a device-type option set for a country-code request');
    assert.equal(results[0]?.reason, 'wrong_control_option_set_mismatch');
    assert.equal(await page.locator('#deviceTypeControl').textContent(), 'Home');
    await assertIdentityFieldsUntouched(page);
  } finally {
    await browser.close();
  }
});

test('Part C: selecting Phone Device Type or Country Phone Code cannot alter First Name, Last Name, Email, Phone Number, or Phone Extension', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<body>${identityFieldsHtml()}${phoneDeviceTypeAndCountryCodeHtml({ wireExplicitAssociations: false })}</body>`);

    await applyFieldMappings(page, phoneDeviceTypeMapping(), {});
    await applyFieldMappings(page, countryPhoneCodeMapping(), {});

    await assertIdentityFieldsUntouched(page);
    assert.equal(await page.inputValue('#firstName'), 'SENTINEL_FIRST_NAME_UNTOUCHED', 'First Name must remain Alex-equivalent sentinel');
    assert.equal(await page.inputValue('#lastName'), 'SENTINEL_LAST_NAME_UNTOUCHED', 'Last Name must remain Rivera-equivalent sentinel');
  } finally {
    await browser.close();
  }
});
