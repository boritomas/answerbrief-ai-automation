import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

import { applyFieldMappings } from '../../scripts/lib/career-os-field-engine.mjs';

// Regression coverage for a live defect observed on a Capital One Workday
// canary run: the "Country Phone Code" combobox search-input finder
// (fillActivePromptSearch in career-os-field-engine.mjs) used a container
// query that fell back to a bare 'ul, div' selector. On a page where an
// unrelated wrapper div happened to contain both the word "search" (e.g.
// nav text like "Search for Jobs") and nearby identity inputs, the finder
// picked that wrapper instead of the real popup and typed the search text
// (the literal string "United States of America") into the first visible
// input inside it -- which was the applicant's First Name field.
//
// The fix tightens the container selector to match only genuine popup
// containers (role=listbox/menu/dialog or Workday's own
// data-automation-id="prompt/popup/menu" attributes -- the same selector
// list career-os-field-engine.mjs already used successfully in the
// neighboring typeActivePromptAhead fallback), and adds a second,
// independent guard that refuses to type into any candidate input whose
// own label/aria-label/name/id/autocomplete looks like an identity field
// (first/last name, email, phone number, phone extension, address, city,
// postal code), even if a container match were to occur.

const IDENTITY_SENTINELS = {
  email: 'sentinel-untouched@example.com',
  firstName: 'SENTINEL_FIRST_NAME_UNTOUCHED',
  lastName: 'SENTINEL_LAST_NAME_UNTOUCHED',
  phoneExtension: 'SENTINEL_EXTENSION_UNTOUCHED',
  phoneNumber: 'SENTINEL_PHONE_UNTOUCHED',
};

function identitySectionHtml() {
  return `
    <nav><a href="#">Search for Jobs</a></nav>
    <div id="identity-section">
      <label for="firstName">First Name</label>
      <input id="firstName" name="firstName" value="${IDENTITY_SENTINELS.firstName}" />
      <label for="lastName">Last Name</label>
      <input id="lastName" name="lastName" value="${IDENTITY_SENTINELS.lastName}" />
      <label for="email">Email Address</label>
      <input id="email" name="email" type="email" autocomplete="email" value="${IDENTITY_SENTINELS.email}" />
      <label for="phoneNumber">Phone Number</label>
      <input id="phoneNumber" name="phoneNumber" value="${IDENTITY_SENTINELS.phoneNumber}" />
      <label for="phoneExtension">Phone Extension</label>
      <input id="phoneExtension" name="phoneExtension" value="${IDENTITY_SENTINELS.phoneExtension}" />
    </div>
  `;
}

async function assertIdentityFieldsUntouched(page) {
  for (const [id, sentinel] of Object.entries(IDENTITY_SENTINELS)) {
    const value = await page.inputValue(`#${id}`);
    assert.equal(value, sentinel, `#${id} must remain untouched by an unrelated combobox fill`);
  }
}

function countryPhoneCodeMapping() {
  return [{
    key: 'country_phone_code',
    kind: 'select',
    matchers: [/country phone code/i],
    value: 'United States of America (+1)',
  }];
}

test('applyFieldMappings never writes a Workday combobox search value into unrelated identity fields when no compliant popup renders', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        ${identitySectionHtml()}
        <div id="phone-code-section">
          <label for="countryPhoneCodeControl">Country Phone Code</label>
          <button id="countryPhoneCodeControl" role="combobox" aria-haspopup="listbox">Austria (+43)</button>
        </div>
      </body>
    `);

    const results = await applyFieldMappings(page, countryPhoneCodeMapping(), {});

    await assertIdentityFieldsUntouched(page);
    assert.equal(results[0]?.key, 'country_phone_code');
    assert.equal(results[0]?.applied, false, 'must fail closed rather than silently write to the wrong field');
  } finally {
    await browser.close();
  }
});

test('applyFieldMappings never writes a Workday combobox search value into unrelated identity fields even when a decoy div contains an input', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // A large wrapper containing the word "search" AND a nested input,
    // positioned right next to the control -- exactly the shape that
    // satisfied the old fallback selector's scoring.
    await page.setContent(`
      <body>
        <div id="decoy-wrapper" style="padding:40px">
          <span>Search for Jobs near you</span>
          ${identitySectionHtml()}
        </div>
        <div id="phone-code-section">
          <label for="countryPhoneCodeControl">Country Phone Code</label>
          <button id="countryPhoneCodeControl" role="combobox" aria-haspopup="listbox">Austria (+43)</button>
        </div>
      </body>
    `);

    await applyFieldMappings(page, countryPhoneCodeMapping(), {});

    await assertIdentityFieldsUntouched(page);
  } finally {
    await browser.close();
  }
});

test('applyFieldMappings still completes a well-formed Workday combobox selection after the tightened container match', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <body>
        ${identitySectionHtml()}
        <div id="phone-code-section">
          <label for="countryPhoneCodeControl">Country Phone Code</label>
          <button id="countryPhoneCodeControl" role="combobox" aria-haspopup="listbox" aria-controls="phoneCodeListbox">Austria (+43)</button>
          <div id="phoneCodeListbox" role="listbox" style="display:none">
            <input type="text" placeholder="search" />
            <div role="option">United States of America (+1)</div>
            <div role="option">Austria (+43)</div>
          </div>
        </div>
        <script>
          document.getElementById('countryPhoneCodeControl').addEventListener('click', () => {
            document.getElementById('phoneCodeListbox').style.display = 'block';
          });
          document.getElementById('phoneCodeListbox').addEventListener('click', (event) => {
            const option = event.target.closest('[role="option"]');
            if (!option) return;
            document.getElementById('countryPhoneCodeControl').textContent = option.textContent;
            document.getElementById('phoneCodeListbox').style.display = 'none';
          });
        </script>
      </body>
    `);

    const results = await applyFieldMappings(page, countryPhoneCodeMapping(), {});

    await assertIdentityFieldsUntouched(page);
    assert.equal(results[0]?.applied, true, 'a genuine role="listbox" popup must still be found and used');
  } finally {
    await browser.close();
  }
});
