function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function digitsOnly(value) {
  return clean(value).replace(/[^0-9]/g, '');
}

function cssEscape(value) {
  return value.replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, '\\$1');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssAttributeValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function idSelector(value) {
  return `[id="${cssAttributeValue(value)}"]`;
}

function fieldHaystack(field) {
  return normalized([
    field.label,
    field.id,
    field.name,
    field.ariaLabel,
    field.ariaLabelledby,
    field.dataAutomationId,
    field.role,
    field.className,
    field.placeholder,
  ].filter(Boolean).join(' '));
}

function fieldVisibleLabel(field = {}) {
  return normalized([
    field.label,
    field.ariaLabel,
    field.placeholder,
  ].filter(Boolean).join(' '));
}

function fieldMachineLabel(field = {}) {
  return normalized([
    field.id,
    field.name,
    field.ariaLabelledby,
    field.dataAutomationId,
  ].filter(Boolean).join(' '));
}

function fieldDescriptor(field = {}) {
  return normalized([
    fieldVisibleLabel(field),
    fieldMachineLabel(field),
    field.role,
    field.className,
  ].filter(Boolean).join(' '));
}

function labelLooksLike(value, patterns = []) {
  const text = normalized(value);
  return patterns.some((pattern) => pattern.test(text));
}

function fieldMatchesMappingRoute(field = {}, mapping = {}) {
  const key = normalized(mapping.key);
  if (!key) return true;
  const visibleLabel = fieldVisibleLabel(field);
  const machineLabel = fieldMachineLabel(field);
  const descriptor = fieldDescriptor(field);

  if (key === 'legal_first_name') {
    if (/\b(preferred|last|middle)\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^legal first name$/, /^first name$/])
      || labelLooksLike(machineLabel, [/\blegal first name\b/, /\bfirst name\b/, /\bfirstname\b/]);
  }

  if (key === 'legal_last_name') {
    if (/\b(preferred|first|middle)\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^legal last name$/, /^last name$/])
      || labelLooksLike(machineLabel, [/\blegal last name\b/, /\blast name\b/, /\blastname\b/]);
  }

  if (key === 'address_line_1' || key === 'home_address') {
    if (/\b(address line 2|address 2|line 2|city|state|province|postal|zip|country)\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^address line 1$/, /^address 1$/, /^street address$/, /^home address$/])
      || labelLooksLike(machineLabel, [/\baddress line 1\b/, /\baddress 1\b/, /\bstreet address\b/]);
  }

  if (key === 'country_region') {
    if (/\bphone\b|\bdial\b|\bcalling code\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^country$/, /^country or region$/, /^country region$/])
      || labelLooksLike(machineLabel, [/\bcountry\b/]);
  }

  if (key === 'state') {
    if (/\b(country|phone|dial|calling code|postal|zip|united states)\b/.test(descriptor)) return false;
    return visibleLabel === 'state'
      || visibleLabel.startsWith('state ')
      || /\bstate (?:or |and )?province\b/.test(visibleLabel)
      || /(^| )state($| )/.test(machineLabel);
  }

  if (key === 'country_phone_code') {
    if (/\b(phone number|phone extension|extension|device type|phone device)\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^country phone code$/, /^phone country code$/, /^phone code$/])
      || labelLooksLike(machineLabel, [/\bcountry phone code\b/, /\bphone code\b/]);
  }

  if (key === 'phone_device_type') {
    if (/\b(phone number|phone extension|extension|country phone code|phone code)\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^phone device type$/, /^phone type$/, /^device type$/])
      || labelLooksLike(machineLabel, [/\bphone device type\b/, /\bdevice type\b/]);
  }

  if (key === 'phone_number') {
    if (/\b(country phone code|phone code|phone extension|extension|phone device|device type)\b/.test(descriptor)) return false;
    return labelLooksLike(visibleLabel, [/^phone number$/, /^mobile phone number$/, /^telephone number$/])
      || labelLooksLike(machineLabel, [/\bphone number\b/, /\bphonenumber\b/, /\btelephone number\b/]);
  }

  if (key === 'referral_source') {
    if (/\blinkedin url\b|\bprofile url\b/.test(descriptor)) return false;
    return /how did you hear about us|how did you hear about|how did you learn about|referral source/.test(descriptor);
  }

  return true;
}

function matchesField(field, matcher) {
  const haystack = fieldHaystack(field);
  if (!haystack) return false;
  if (matcher instanceof RegExp) return matcher.test(haystack);

  const target = normalized(matcher);
  if (!target) return false;

  // Prevent the canonical `state` mapping from matching `United States`
  // in country and telephone-country-code controls.
  if (target === 'state') {
    const visibleLabel = normalized([
      field.label,
      field.ariaLabel,
      field.placeholder,
    ].filter(Boolean).join(' '));

    const machineLabel = normalized([
      field.id,
      field.name,
      field.ariaLabelledby,
      field.dataAutomationId,
    ].filter(Boolean).join(' '));

    const descriptor = `${visibleLabel} ${machineLabel}`.trim();

    if (/\b(country|phone|dial|calling code)\b/.test(descriptor)) return false;

    return visibleLabel === 'state'
      || visibleLabel.startsWith('state ')
      || /\bstate (?:or |and )?province\b/.test(visibleLabel)
      || /(^| )state($| )/.test(machineLabel);
  }

  return haystack.includes(target);
}

function optionIndexForStrategy(field, strategy, resolved, mapping = {}) {
  const options = Array.isArray(field.options) ? field.options : [];
  if (!options.length) return -1;
  if (strategy === 'first_available') {
    return options.findIndex((option, index) => index > 0 && isSafeSelectableOption(`${option.label || ''} ${option.value || ''}`));
  }
  if (strategy === 'decline') {
    return options.findIndex((option, index) => index > 0 && isDeclineOption(`${option.label || ''} ${option.value || ''}`));
  }
  if (strategy === 'max_years_at_most') {
    return optionIndexForMaxYears(options, resolved);
  }

  const target = normalized(resolved);
  if (!target) return -1;

  const context = optionMatchContext(field, mapping);
  const direct = options.findIndex((option) => optionMatchesResolved(`${option.label || ''} ${option.value || ''}`, target, context));
  if (direct >= 0) return direct;

  if (target === 'internet search') {
    const onlineSearch = options.findIndex((option) => normalized(option.label) === 'online search');
    if (onlineSearch >= 0) return onlineSearch;
  }

  const tokens = target.split(/\s+/).filter(Boolean);
  return options.findIndex((option) => {
    const haystack = normalized(`${option.label || ''} ${option.value || ''}`);
    return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
  });
}

export async function scanVisibleFields(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const groupLabelForChoice = (element) => {
      if (!(element instanceof HTMLInputElement) || !['radio', 'checkbox'].includes(element.type)) return '';
      const group = element.closest('fieldset, [role="radiogroup"], [role="group"]');
      if (!group) return '';
      const legend = group.querySelector('legend');
      const legendText = normalize(legend?.textContent || '');
      if (legendText) return legendText;
      const text = normalize(group.textContent || '');
      return /(\?|\*)/.test(text) ? text : '';
    };
    const labelTextFor = (element) => {
      const groupLabel = groupLabelForChoice(element);
      if (groupLabel) return groupLabel;
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const labelledBy = normalize(String(element.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' '));
      if (labelledBy) return labelledBy;
      let sibling = element.previousElementSibling;
      for (let index = 0; sibling && index < 4; index += 1, sibling = sibling.previousElementSibling) {
        const siblingText = normalize(sibling.textContent);
        if (siblingText && siblingText.length <= 240) return siblingText;
      }
      const parentLabel = element.parentElement?.querySelector?.('[data-automation-id*="label" i], [data-automation-id*="formLabel" i], label, legend');
      const parentLabelText = normalize(parentLabel?.textContent || '');
      if (parentLabelText) return parentLabelText;
      let current = element.parentElement;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        const localText = normalize(current.textContent);
        const ownText = normalize(element.textContent);
        if (localText && localText !== ownText && localText.length <= 1200 && /(\?|\*)/.test(localText)) return localText;
      }
      const field = element.closest('[data-automation-id], [role="group"], fieldset, div');
      const nearby = field?.querySelector?.('label, legend, [data-automation-id*="label" i]');
      return normalize(nearby?.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder'));
    };
    const valueFor = (element) => {
      if (element instanceof HTMLInputElement && element.type === 'radio') {
        const group = element.name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
          : Array.from(element.closest('fieldset, [role="radiogroup"], [role="group"]')?.querySelectorAll('input[type="radio"]') || []);
        const checked = group.find((node) => node instanceof HTMLInputElement && node.checked);
        return checked ? String(checked.value || 'checked') : '';
      }
      if (element instanceof HTMLInputElement && element.type === 'checkbox') return element.checked ? (element.value || 'checked') : '';
      if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return String(element.value || '');
      if (element instanceof HTMLElement) return normalize(element.textContent);
      return '';
    };
    const selectorFor = (element) => {
      if (!(element instanceof HTMLElement)) return '';
      if (element.id) return `#${CSS.escape(element.id)}`;
      const automationId = element.getAttribute('data-automation-id');
      if (automationId) return `[data-automation-id="${CSS.escape(automationId)}"]`;
      const name = element.getAttribute('name');
      if (name) return `[name="${CSS.escape(name)}"]`;
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) return `[aria-labelledby="${CSS.escape(labelledBy)}"]`;
      return '';
    };
    const isFieldCandidate = (element) => {
      if (!(element instanceof HTMLElement) || !visible(element) || element.hasAttribute('disabled')) return false;
      const tagName = element.tagName.toLowerCase();
      if (['input', 'select', 'textarea'].includes(tagName)) return true;
      const role = normalize(element.getAttribute('role')).toLowerCase();
      const popup = normalize(element.getAttribute('aria-haspopup')).toLowerCase();
      const automationId = normalize(element.getAttribute('data-automation-id')).toLowerCase();
      const text = normalize(element.textContent).toLowerCase();
      const className = normalize(element.getAttribute('class')).toLowerCase();
      return role === 'combobox'
        || (role === 'button' && /select|choose|dropdown|prompt/.test(`${text} ${className} ${automationId}`))
        || popup === 'listbox'
        || popup === 'true'
        || /prompt|select|dropdown|combobox/.test(automationId);
    };

    return Array.from(document.querySelectorAll('input, select, textarea, [role="combobox"], [role="button"], [aria-haspopup], [data-automation-id*="prompt" i], [data-automation-id*="select" i]'))
      .filter(isFieldCandidate)
      .map((element) => {
        const tagName = element.tagName.toLowerCase();
        const type = element instanceof HTMLInputElement ? element.type : tagName;
        const currentValue = valueFor(element);
        const label = labelTextFor(element);
        return {
          ariaLabel: normalize(element.getAttribute('aria-label')),
          ariaLabelledby: normalize(element.getAttribute('aria-labelledby')),
          className: normalize(element.getAttribute('class')),
          dataAutomationId: normalize(element.getAttribute('data-automation-id')),
          currentValue,
          id: element.id || '',
          label,
          name: element.getAttribute('name') || '',
          options: element instanceof HTMLSelectElement
            ? Array.from(element.options).map((option) => ({
                label: normalize(option.label),
                value: String(option.value || ''),
              }))
            : [],
          placeholder: normalize(element.getAttribute('placeholder')),
          required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true' || /\*/.test(label),
          role: normalize(element.getAttribute('role')),
          selector: selectorFor(element),
          tagName,
          type,
        };
      });
  });
}

function resolveFromPath(source, path) {
  return path.split('.').reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, source);
}

function resolveMappingValue(mapping, context, field) {
  if (mapping.value !== undefined) return mapping.value;
  if (mapping.valueFrom) return resolveFromPath(context, mapping.valueFrom);
  if (typeof mapping.resolve === 'function') return mapping.resolve({ context, field });
  if (mapping.strategy === 'first_available') return '__first_available__';
  if (mapping.strategy === 'decline') return '__decline__';
  return undefined;
}

async function setNativeTextValue(locator, value) {
  await locator.evaluate((element, nextValue) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, String(nextValue));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }, String(value));
}

async function locatorControlMeta(locator) {
  return locator.evaluate((element) => ({
    role: String(element.getAttribute('role') || '').trim().toLowerCase(),
    tagName: String(element.tagName || '').trim().toLowerCase(),
    type: element instanceof HTMLInputElement
      ? String(element.type || '').trim().toLowerCase()
      : '',
  })).catch(() => ({
    role: '',
    tagName: '',
    type: '',
  }));
}

function isChoiceControlMeta(meta = {}) {
  const type = clean(meta.type).toLowerCase();
  const role = clean(meta.role).toLowerCase();
  return type === 'checkbox'
    || type === 'radio'
    || role === 'checkbox'
    || role === 'radio';
}

async function applyTextMapping(page, field, value) {
  const locator = field.id
    ? page.locator(idSelector(field.id)).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : page.locator(`input[aria-label="${field.ariaLabel}"], textarea[aria-label="${field.ariaLabel}"]`).first();
  if (!await locator.count()) return false;
  const meta = await locatorControlMeta(locator);
  if (isChoiceControlMeta(meta)) return false;
  if (!['input', 'textarea'].includes(meta.tagName)) return false;
  await locator.click({ force: true }).catch(() => null);
  await locator.fill(String(value)).catch(async () => {
    await locator.fill('').catch(() => null);
    await setNativeTextValue(locator, value);
  });
  await locator.press('Tab').catch(() => null);
  let finalValue = await locator.inputValue().catch(() => '');
  if (clean(finalValue) !== clean(value)) {
    await setNativeTextValue(locator, value);
    await locator.press('Tab').catch(() => null);
    finalValue = await locator.inputValue().catch(() => '');
  }
  return clean(finalValue) === clean(value);
}

function fieldUsesCombobox(field) {
  return field.role === 'combobox'
    || field.role === 'button'
    || field.tagName === 'button'
    || /prompt|select|dropdown|combobox/i.test(`${field.dataAutomationId || ''} ${field.className || ''}`);
}

function locatorForField(page, field, selectorFallback = '') {
  if (field.selector) return page.locator(field.selector).first();
  if (field.id) return page.locator(idSelector(field.id)).first();
  if (field.name) return page.locator(`[name="${field.name}"]`).first();
  if (field.ariaLabelledby) return page.locator(`[aria-labelledby="${cssEscape(field.ariaLabelledby)}"]`).first();
  if (field.ariaLabel) return page.locator(`${selectorFallback || 'input,textarea,[role="combobox"],button'}[aria-label="${field.ariaLabel}"]`).first();
  return null;
}

const OPTION_SELECTOR = '[role="option"], [data-automation-id*="promptOption" i], [data-automation-id*="prompt-option" i]';

async function visibleComboboxOptionIndex(page, { fieldLabel, mappingKey, strategy, resolved }) {
  return page.locator(OPTION_SELECTOR).evaluateAll((nodes, payload) => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const options = nodes
      .map((node, index) => ({
        index,
        text: normalize(node.textContent || ''),
        visible: visible(node),
      }))
      .filter((option) => option.visible && option.text);

    if (!options.length) return -1;

    if (payload.strategy === 'first_available') {
      const firstRealOption = options.find((option) => !/^(select|choose|please select)\b/.test(option.text));
      return firstRealOption ? firstRealOption.index : options[0].index;
    }
    if (payload.strategy === 'decline') {
      const decline = options.find((option) => /decline|prefer not|do not wish|don.t wish|choose not|not disclosed|i do not want|i don.t want/i.test(option.text));
      return decline ? decline.index : -1;
    }
    if (payload.strategy === 'max_years_at_most') {
      const parseYears = (text) => {
        const numbers = Array.from(String(text || '').matchAll(/\d+/g)).map((match) => Number(match[0]));
        if (!numbers.length) return null;
        if (/less than|under|fewer than/.test(text)) return Math.max(0, numbers[0] - 1);
        return Math.max(...numbers);
      };
      const maxYears = Number(payload.resolved);
      if (!Number.isFinite(maxYears) || maxYears <= 0) return -1;
      let best = null;
      for (const option of options) {
        if (/^(select|choose|please select)\b/.test(option.text)) continue;
        const years = parseYears(option.text);
        if (years === null || years > maxYears) continue;
        if (!best || years > best.years) best = { ...option, years };
      }
      return best ? best.index : -1;
    }

    const target = normalize(payload.resolved);
    if (!target) return -1;

    const context = `${payload.fieldLabel || ''} ${payload.mappingKey || ''}`.toLowerCase();
    const direct = options.find((option) => {
      if (option.text === target) return true;
      if (!/country phone code|phone code|state|province/.test(context) && option.text.startsWith(`${target} `)) return true;
      if (/referral[_\s-]*source|how did you hear/.test(context) && /linkedin/.test(target) && /social network|social media|linkedin/.test(option.text)) return true;
      if (/referral[_\s-]*source|how did you hear/.test(context) && target === 'internet search') {
        return /^(internet search|online search|search engine|internet)$/.test(option.text)
          && !/linkedin|social network|social media/.test(option.text);
      }
      if (/(state|province)/.test(context) && ((target === 'texas' && option.text === 'tx') || (target === 'tx' && option.text === 'texas'))) return true;
      if (/country phone code|phone code/.test(context)) {
        const wantsUs = ['1', 'us', 'usa', 'united states', 'united states of america'].includes(target)
          || target.includes('united states')
          || /\b(?:us|usa|1)\b/.test(target);
        if (wantsUs && /\bunited states\b/.test(option.text) && /\b1\b/.test(option.text) && !/\balbania\b/.test(option.text)) return true;
      }
      if (/phone device type/.test(context) && target === 'mobile' && /mobile|cell|cellular/.test(option.text)) return true;
      return false;
    });
    if (direct) return direct.index;

    if (target === 'internet search') {
      const equivalent = options.find((option) => option.text === 'online search' || option.text.includes('internet search'));
      if (equivalent) return equivalent.index;
    }

    const tokens = target.split(/\s+/).filter(Boolean);
    const fuzzy = options.find((option) => tokens.length > 1 && tokens.every((token) => option.text.includes(token)));
    return fuzzy ? fuzzy.index : -1;
  }, {
    fieldLabel: clean(fieldLabel),
    mappingKey: clean(mappingKey),
    resolved: clean(resolved),
    strategy: clean(strategy),
  });
}

async function comboboxCommittedValue(locator) {
  return clean(await locator.evaluate((element) => {
    let current = element.parentElement;
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      const ownText = normalize(element.textContent || '');
      if (ownText && !/^(select|select one|choose|please select)$/.test(ownText)) return ownText;
    }
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const selectedText = Array.from(
        current.querySelectorAll('.select__single-value, [class*="singleValue"], [class*="single-value"], [class*="multiValue__label"], [class*="multi-value__label"]'),
      )
        .map((node) => normalize(node.textContent || ''))
        .find(Boolean);
      if (selectedText) return selectedText;
      const hiddenValue = Array.from(current.querySelectorAll('input[type="hidden"], input[aria-hidden="true"]'))
        .map((node) => normalize(node.getAttribute('value') || node.value || ''))
        .find(Boolean);
      if (hiddenValue) return hiddenValue;
    }
    return '';
  }).catch(() => ''));
}

async function applyComboboxMapping(page, field, mapping, resolved) {
  const locator = locatorForField(page, field, 'input');
  if (!locator || !await locator.count()) return false;
  const meta = await locatorControlMeta(locator);
  const fillable = ['input', 'textarea'].includes(meta.tagName);
  const searchText = comboboxSearchText(field, mapping, resolved);

  await locator.click({ force: true }).catch(() => null);
  if (fillable) await locator.fill('').catch(() => null);
  const sentinel = clean(resolved);
  if (fillable && sentinel && !['__first_available__', '__decline__'].includes(sentinel)) {
    await locator.type(searchText, { delay: 20 });
  } else if (!fillable && sentinel && !['__first_available__', '__decline__'].includes(sentinel)) {
    const searchedPrompt = await fillVisiblePromptSearch(page, searchText);
    if (!searchedPrompt) await page.keyboard.type(searchText, { delay: 20 }).catch(() => null);
  } else {
    await locator.press('ArrowDown').catch(() => null);
  }
  await page.waitForTimeout(250);

  let optionIndex = await visibleComboboxOptionIndex(page, {
    fieldLabel: field.label || field.ariaLabel || field.name || field.id,
    mappingKey: mapping.key,
    strategy: mapping.strategy,
    resolved,
  });
  if (optionIndex < 0 && mapping.strategy !== 'first_available' && clean(resolved)) {
    await locator.press('ArrowDown').catch(() => null);
    await page.waitForTimeout(250);
    optionIndex = await visibleComboboxOptionIndex(page, {
      fieldLabel: field.label || field.ariaLabel || field.name || field.id,
      mappingKey: mapping.key,
      strategy: mapping.strategy,
      resolved,
    });
  }
  if (optionIndex < 0) {
    await locator.press('Tab').catch(() => null);
    await page.waitForTimeout(250);
    const committed = await comboboxCommittedValue(locator);
    const finalValue = clean(fillable ? await locator.inputValue().catch(() => '') : await locator.textContent().catch(() => ''));
    const target = normalized(resolved);
    if (target && (normalized(committed).includes(target) || normalized(finalValue).includes(target))) return true;
    return false;
  }

  const option = page.locator(OPTION_SELECTOR).nth(optionIndex);
  if (!await option.count()) return false;
  let optionText = clean(await option.textContent().catch(() => ''));
  await option.click({ force: true });
  await page.waitForTimeout(150);
  if (isLinkedInReferralPrompt(field, mapping, resolved) && /social network|social media/i.test(optionText)) {
    await page.waitForTimeout(350);
    const childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
    if (childIndex >= 0) {
      const child = page.locator(OPTION_SELECTOR).nth(childIndex);
      const childText = clean(await child.textContent().catch(() => ''));
      await child.click({ force: true });
      optionText = [optionText, childText].filter(Boolean).join(' > ');
      await page.waitForTimeout(150);
    }
  }
  let committed = await comboboxCommittedValue(locator);
  if (!committed) {
    await locator.click({ force: true }).catch(() => null);
    if (fillable && sentinel && !['__first_available__', '__decline__'].includes(sentinel)) {
      await locator.press('Meta+A').catch(() => null);
      await locator.type(searchText, { delay: 20 }).catch(() => null);
    } else if (!fillable && sentinel && !['__first_available__', '__decline__'].includes(sentinel)) {
      const searchedPrompt = await fillVisiblePromptSearch(page, searchText);
      if (!searchedPrompt) await page.keyboard.type(searchText, { delay: 20 }).catch(() => null);
    }
    await locator.press('ArrowDown').catch(() => null);
    await locator.press('Enter').catch(() => null);
    await locator.press('Tab').catch(() => null);
    await page.waitForTimeout(250);
    committed = await comboboxCommittedValue(locator);
  }

  const finalValue = clean(fillable ? await locator.inputValue().catch(() => '') : await locator.textContent().catch(() => ''));
  if (mapping.strategy === 'first_available') {
    return Boolean(optionText || committed);
  }
  if (mapping.strategy === 'decline') {
    return isDeclineOption(optionText) || isDeclineOption(committed);
  }
  if (mapping.strategy === 'max_years_at_most') {
    const selectedYears = parseYearsOption(optionText || committed || finalValue);
    const maxYears = Number(resolved);
    return selectedYears !== null && Number.isFinite(maxYears) && selectedYears <= maxYears;
  }
  const context = optionMatchContext(field, mapping);
  const target = normalized(resolved);
  const spec = knownPromptSpec(mapping, resolved);
  if (spec && ['state_texas', 'country_phone_code', 'phone_device_type', 'referral_internet_search'].includes(spec.kind)) {
    return promptEvidenceMatches(spec, `${committed} ${finalValue}`);
  }
  return optionMatchesResolved(committed, target, context)
    || optionMatchesResolved(finalValue, target, context)
    || optionMatchesResolved(optionText, target, context)
    || normalized(committed).includes(target)
    || normalized(finalValue).includes(target)
    || normalized(optionText).includes(target);
}

function isLinkedInReferralPrompt(field = {}, mapping = {}, resolved = '') {
  const context = optionMatchContext(field, mapping);
  return /referral source|how did you hear/.test(context) && /linkedin/.test(normalized(resolved));
}

async function visibleExactComboboxOptionIndex(page, resolved = '') {
  return page.locator(OPTION_SELECTOR).evaluateAll((nodes, targetValue) => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const target = normalize(targetValue);
    return nodes.findIndex((node) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return false;
      const text = normalize(node.textContent || '');
      return text === target;
    });
  }, clean(resolved)).catch(() => -1);
}


async function selectStrictVisibleOption(page, acceptedTexts = []) {
  const normalize = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const accepted = new Set(acceptedTexts.map(normalize).filter(Boolean));
  const options = page.locator(OPTION_SELECTOR);
  const count = await options.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    if (!await option.isVisible().catch(() => false)) continue;

    const optionText = clean(await option.textContent().catch(() => ''));
    const ariaLabel = clean(await option.getAttribute('aria-label').catch(() => ''));
    const title = clean(await option.getAttribute('title').catch(() => ''));
    const candidates = [optionText, ariaLabel, title].map(normalize).filter(Boolean);

    const matched = candidates.some((candidate) => {
      if (accepted.has(candidate)) return true;

      if (accepted.has('texas') || accepted.has('tx')) {
        return candidate === 'texas' || candidate === 'tx';
      }

      if (
        accepted.has('united states of america 1') ||
        accepted.has('united states 1')
      ) {
        return /^united states(?: of america)? 1$/.test(candidate);
      }

      return false;
    });

    if (!matched) continue;

    await option.scrollIntoViewIfNeeded().catch(() => null);
    await option.click({ force: true }).catch(() => null);
    await page.waitForTimeout?.(350).catch(() => null);
    return optionText;
  }

  return '';
}

function comboboxSearchText(field = {}, mapping = {}, resolved = '') {
  const context = optionMatchContext(field, mapping);
  const target = normalized(resolved);
  if (/country phone code|phone code/.test(context) && target.includes('united states')) return 'United States';
  if (/referral source|how did you hear/.test(context) && /linkedin/.test(target)) return 'Social Network';
  if (/referral source|how did you hear/.test(context) && target === 'internet search') return 'Internet Search';
  return clean(resolved);
}

async function applyKnownPromptMapping(page, mapping, resolved) {
  const empty = { applied: false, attempted: false, field: '', reason: '' };
  if (!page?.locator || !page?.evaluate) return empty;
  const spec = knownPromptSpec(mapping, resolved);
  if (!spec) return empty;

  const protectedPrompt = isProtectedKnownPromptSpec(spec);
  let openedAny = false;
  let lastDetails = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const search of spec.searches) {
      await closeOpenPromptMenus(page);
      const prompt = await clickPromptControlNearLabel(page, spec.labelPattern, {
        allowPhoneContext: spec.kind === 'country_phone_code' || spec.kind === 'phone_device_type',
      });
      if (!prompt?.opened) continue;
      openedAny = true;
      await page.waitForTimeout(300);

      const searched = await fillActivePromptSearch(page, prompt, search);
      if (!searched) {
        const searchedVisible = await fillVisiblePromptSearch(page, search);
        if (!searchedVisible && protectedPrompt) {
          await typeActivePromptAhead(page, prompt, search);
        }
      }
      await page.waitForTimeout(300);

      if (spec.kind === 'referral_linkedin') {
        const nestedApplied = await applyLinkedInReferralPromptPath(page, mapping, resolved, spec);
        if (nestedApplied) {
          return {
            applied: true,
            attempted: true,
            field: promptReportField(spec, mapping),
            reason: 'known_prompt_mapping',
          };
        }
      }

      const selected = await selectActivePromptOption(page, prompt, spec);
      lastDetails = selected;
      if (selected?.selectedText) {
        await page.waitForTimeout(450);
        if (await promptMappingCommitted(page, mapping, resolved, spec, selected.selectedText)) {
          return {
            applied: true,
            attempted: true,
            field: promptReportField(spec, mapping),
            reason: 'known_prompt_mapping',
          };
        }
      }

      if (!protectedPrompt && spec.kind === 'referral_linkedin') {
        const optionIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
        if (optionIndex >= 0) {
          const option = page.locator(OPTION_SELECTOR).nth(optionIndex);
          if (await option.count().catch(() => 0)) {
            const optionText = clean(await option.textContent().catch(() => ''));
            await clickOptionRowCenter(page, option);
            await page.waitForTimeout(350);
            if (await promptMappingCommitted(page, mapping, resolved, spec, optionText)) {
              return {
                applied: true,
                attempted: true,
                field: promptReportField(spec, mapping),
                reason: 'known_prompt_mapping',
              };
            }
          }
        }
      }
    }
  }

  await closeOpenPromptMenus(page);
  if (protectedPrompt && openedAny) {
    const screenshotPath = await captureProtectedPromptDiagnostics(page, mapping, resolved, spec, lastDetails);
    return {
      applied: false,
      attempted: true,
      diagnosticScreenshotPath: screenshotPath,
      field: promptReportField(spec, mapping),
      reason: 'protected_prompt_commit_failed',
      terminalFailure: true,
    };
  }

  return { ...empty, attempted: openedAny };
}

function isProtectedKnownPromptSpec(spec = {}) {
  return ['state_texas', 'country_phone_code', 'phone_device_type'].includes(spec.kind);
}

function promptReportField(spec = {}, mapping = {}) {
  if (spec.kind === 'state_texas') return 'State';
  if (spec.kind === 'country_phone_code') return 'Country Phone Code';
  if (spec.kind === 'phone_device_type') return 'Phone Device Type';
  if (/referral/i.test(spec.kind || mapping.key || '')) return 'How Did You Hear About Us?';
  return clean(mapping.key);
}

function promptEvidenceMatches(spec = {}, evidence = '') {
  const raw = clean(evidence);
  const text = normalized(raw);
  if (!text) return false;

  if (spec.kind === 'state_texas') {
    return /\b(texas|tx)\b/.test(text) && !/\balabama\b/.test(text);
  }

  if (spec.kind === 'country_phone_code') {
    return /\bunited states(?: of america)?\b/.test(text)
      && (/\+1|\(\+1\)/.test(raw) || /\bunited states(?: of america)? 1\b/.test(text) || /\b1 item selected\b/.test(text))
      && !/\balbania\b/.test(text);
  }

  if (spec.kind === 'phone_device_type') {
    return /\b(mobile|personal mobile|cell|cellular)\b/.test(text)
      && !/\b(landline|home phone|work phone)\b/.test(text);
  }

  if (spec.kind === 'referral_internet_search') {
    return /\b(internet search|online search|search engine|internet)\b/.test(text)
      && !/\b(linkedin|social network|social media)\b/.test(text);
  }

  if (spec.kind === 'referral_linkedin') {
    return /\blinkedin\b/.test(text)
      || (/\b(social network|social media)\b/.test(text)
        && !/\b(campus|corporate website|directemployers|job board|recruiting event|required|0 items selected)\b/.test(text));
  }

  return false;
}

async function fillActivePromptSearch(page, prompt = {}, value = '') {
  if (!page?.evaluate || !page?.keyboard) return false;
  const focused = await page.evaluate(({ promptMeta, searchText }) => {
    const normalize = (item) => String(item || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const activeControl = promptMeta.activePromptId
      ? document.querySelector(`[data-career-os-active-prompt-id="${CSS.escape(promptMeta.activePromptId)}"]`)
      : promptMeta.controlId
        ? document.getElementById(promptMeta.controlId)
        : document.querySelector('[data-career-os-active-prompt-id]');
    const controlledIds = String(`${promptMeta.ariaControls || ''} ${promptMeta.ariaOwns || ''}`)
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean);
    const controlRect = activeControl instanceof HTMLElement ? activeControl.getBoundingClientRect() : null;
    const containers = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], [role="dialog"], [data-automation-id*="prompt" i], [data-automation-id*="popup" i], [data-automation-id*="menu" i], ul, div'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        let score = 0;
        if (node.id && controlledIds.includes(node.id)) score += 10000;
        if (node.querySelector('[role="option"], [data-automation-id*="promptOption" i], [data-automation-id*="prompt-option" i]')) score += 500;
        if (controlRect) score -= Math.abs(rect.top - controlRect.bottom) + Math.abs(rect.left - controlRect.left) / 4;
        return { node, score, text: normalize(node.textContent || '') };
      })
      .filter((entry) => /search/i.test(entry.text) || entry.node.querySelector('input'))
      .sort((left, right) => right.score - left.score);
    for (const { node } of containers) {
      const input = Array.from(node.querySelectorAll('input, [role="searchbox"], textarea'))
        .find((candidate) => candidate instanceof HTMLElement && visible(candidate));
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) continue;
      input.focus();
      input.value = '';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: '' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.setAttribute('data-career-os-active-search', 'true');
      return Boolean(searchText);
    }
    return false;
  }, { promptMeta: prompt, searchText: clean(value) }).catch(() => false);
  if (!focused) return false;
  await page.keyboard.press('Meta+A').catch(() => null);
  await page.keyboard.press('Backspace').catch(() => null);
  await page.keyboard.type(clean(value), { delay: 20 }).catch(() => null);
  return true;
}

async function typeActivePromptAhead(page, prompt = {}, value = '') {
  const searchText = clean(value);
  if (!searchText || !page?.evaluate || !page?.keyboard) return false;
  const focused = await page.evaluate(({ promptMeta }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const activeControl = promptMeta.activePromptId
      ? document.querySelector(`[data-career-os-active-prompt-id="${CSS.escape(promptMeta.activePromptId)}"]`)
      : promptMeta.controlId
        ? document.getElementById(promptMeta.controlId)
        : document.querySelector('[data-career-os-active-prompt-id]');
    const controlledIds = String(`${promptMeta.ariaControls || ''} ${promptMeta.ariaOwns || ''}`)
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean);
    const controlledPopup = controlledIds
      .map((id) => document.getElementById(id))
      .find((node) => node instanceof HTMLElement && visible(node));
    const activeRect = activeControl instanceof HTMLElement ? activeControl.getBoundingClientRect() : null;
    const popup = controlledPopup || Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], [role="dialog"], [data-automation-id*="prompt" i], [data-automation-id*="popup" i], [data-automation-id*="menu" i]'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const hasOptions = Boolean(node.querySelector('[role="option"], [role="menuitem"], [data-automation-id*="promptOption" i], [data-automation-id*="prompt-option" i]'));
        let score = hasOptions ? 1000 : 0;
        if (activeRect) score -= Math.abs(rect.top - activeRect.bottom) + Math.abs(rect.left - activeRect.left) / 4;
        return { node, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.node;
    const target = popup instanceof HTMLElement
      ? popup
      : activeControl instanceof HTMLElement
        ? activeControl
        : null;
    if (!target) return false;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    return document.activeElement === target || target.contains(document.activeElement);
  }, { promptMeta: prompt }).catch(() => false);
  if (!focused) return false;
  await page.keyboard.type(searchText, { delay: 20 }).catch(() => null);
  await page.waitForTimeout?.(250).catch(() => null);
  return true;
}

async function selectActivePromptOption(page, prompt = {}, spec = {}) {
  if (!page?.evaluate) return { selectedText: '', visibleOptions: [] };
  return page.evaluate(({ kind, promptMeta }) => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const activeControl = promptMeta.activePromptId
      ? document.querySelector(`[data-career-os-active-prompt-id="${CSS.escape(promptMeta.activePromptId)}"]`)
      : promptMeta.controlId
        ? document.getElementById(promptMeta.controlId)
        : document.querySelector('[data-career-os-active-prompt-id]');
    const controlId = promptMeta.controlId || activeControl?.id || '';
    const controlRect = activeControl instanceof HTMLElement ? activeControl.getBoundingClientRect() : null;
    const controlledIds = new Set(String(`${promptMeta.ariaControls || ''} ${promptMeta.ariaOwns || ''}`)
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean));
    const rowFor = (element) => {
      let best = element;
      let current = element;
      const targetText = cleanText(element.textContent || '');
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
        if (!(current instanceof HTMLElement)) continue;
        const rect = current.getBoundingClientRect();
        const text = cleanText(current.textContent || '');
        if (targetText && !text.includes(targetText)) continue;
        if (rect.width >= 80 && rect.height >= 14 && rect.height <= 90) best = current;
      }
      return best;
    };
    const menuFor = (element) => element.closest('[role="listbox"], [role="menu"], [role="dialog"], [data-automation-id*="prompt" i], [data-automation-id*="popup" i], [data-automation-id*="menu" i], ul');
    const clickElement = (element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      element.click();
    };
    const optionMatches = (text, raw) => {
      if (!text) return false;
      if (kind === 'state_texas') return (text === 'texas' || text === 'tx') && !/\balabama\b/.test(text);
      if (kind === 'country_phone_code') {
        return /\bunited states(?: of america)?\b/.test(text)
          && (/\+1|\(\+1\)/.test(raw) || /\bunited states(?: of america)? 1\b/.test(text))
          && !/\balbania\b/.test(text);
      }
      if (kind === 'phone_device_type') return /^(mobile|personal mobile|cell|cellular)$/.test(text) && !/\blandline\b/.test(text);
      if (kind === 'referral_internet_search') {
        return /^(internet search|online search|search engine|internet)$/.test(text)
          && !/\b(linkedin|social network|social media)\b/.test(text);
      }
      if (kind === 'referral_linkedin') return text === 'linkedin';
      return false;
    };
    const rawOptions = Array.from(document.querySelectorAll('[role="option"], [data-automation-id*="promptOption" i], [data-automation-id*="prompt-option" i], li[role="option"], [role="menuitem"]'))
      .filter((element) => element instanceof HTMLElement && visible(element));
    const candidates = rawOptions.map((option) => {
      const row = rowFor(option);
      const menu = menuFor(option);
      const raw = cleanText(option.textContent || row.textContent || '');
      const text = normalize(raw);
      const rect = row.getBoundingClientRect();
      const owner = option.getAttribute('data-owner') || row.getAttribute('data-owner') || '';
      if (controlId && owner && owner !== controlId) return null;
      let score = 0;
      if (controlId && owner === controlId) score += 10000;
      if (menu?.id && controlledIds.has(menu.id)) score += 9000;
      if (option.id && controlledIds.has(option.id)) score += 8000;
      if (controlRect) {
        const verticalGap = Math.max(0, rect.top - controlRect.bottom);
        score += Math.max(0, 2000 - verticalGap - Math.abs(rect.left - controlRect.left) / 4);
      }
      const menuRole = String(menu?.getAttribute('role') || '').toLowerCase();
      if (menuRole === 'listbox' || menuRole === 'menu') score += 500;
      return { node: option, raw, row, score, text };
    })
      .filter(Boolean)
      .filter((entry) => entry.raw && entry.raw.length <= 160)
      .sort((left, right) => right.score - left.score || left.raw.length - right.raw.length);
    const visibleOptions = candidates.slice(0, 25).map((entry) => entry.raw);
    const selected = candidates.find((entry) => optionMatches(entry.text, entry.raw));
    if (!selected) return { selectedText: '', visibleOptions };
    clickElement(selected.node);
    return { selectedText: selected.raw, visibleOptions };
  }, { kind: spec.kind, promptMeta: prompt }).catch(() => ({ selectedText: '', visibleOptions: [] }));
}

async function captureProtectedPromptDiagnostics(page, mapping = {}, resolved = '', spec = {}, details = null) {
  const screenshotPath = `.career-os-browser-worker/screenshots/workday-protected-prompt-${clean(mapping.key).replace(/[^a-z0-9_-]+/gi, '-')}-${Date.now()}.png`;
  await page.screenshot?.({ fullPage: true, path: screenshotPath }).catch(() => null);
  const diagnostics = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], [role="option"], [data-automation-id*="prompt" i]'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .slice(0, 20)
      .map((node) => ({
        role: node.getAttribute('role') || '',
        text: normalize(node.textContent || '').slice(0, 300),
      }));
  }).catch(() => []);
  console.error('[workday] protected prompt commit failed', JSON.stringify({
    field: promptReportField(spec, mapping),
    key: clean(mapping.key),
    requested: clean(resolved),
    screenshotPath,
    visibleOptions: details?.visibleOptions || [],
    diagnostics,
  }));
  return screenshotPath;
}

function knownPromptSpec(mapping = {}, resolved = '') {
  const key = normalized(mapping.key);
  const target = normalized(resolved);
  if (/referral source|how did you hear/.test(key) && target === 'internet search') {
    return {
      kind: 'referral_internet_search',
      labelPattern: /how did you hear about us|how did you hear about|how did you learn about|referral source/i,
      searches: ['Internet Search', 'Online Search', 'Search Engine', 'Internet'],
    };
  }
  if (/referral source|how did you hear/.test(key) && /linkedin/.test(target)) {
    return {
      kind: 'referral_linkedin',
      labelPattern: /how did you hear about us/i,
      searches: ['LinkedIn', 'Social Network', 'Social Media'],
    };
  }
  if (/^(state|province|state province)$/.test(key) && /^(texas|tx)$/.test(target)) {
    return {
      kind: 'state_texas',
      labelPattern: /^state\b|^province\b/i,
      searches: ['Texas'],
    };
  }
  if (/country phone code|phone code/.test(key)) {
    const wantsUs = target.includes('united states') || /\b(?:us|usa|1)\b/.test(target);
    if (wantsUs) {
      return {
        kind: 'country_phone_code',
        labelPattern: /country phone code/i,
        searches: ['United States', 'United States of America'],
      };
    }
  }
  if (/phone device type/.test(key) && /mobile|cell|cellular/.test(target)) {
    return {
      kind: 'phone_device_type',
      labelPattern: /phone device type/i,
      searches: ['Mobile', 'Personal Mobile', 'Cellular', 'Cell'],
    };
  }
  return null;
}

async function clickPromptControlNearLabel(page, labelPattern, options = {}) {
  return page.evaluate(({ allowPhoneContext, source }) => {
    const labelRegex = new RegExp(source, 'i');
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const isPromptControl = (element) => {
      if (!(element instanceof HTMLElement) || !visible(element)) return false;
      const tagName = element.tagName.toLowerCase();
      const role = normalize(element.getAttribute('role')).toLowerCase();
      const popup = normalize(element.getAttribute('aria-haspopup')).toLowerCase();
      const automationId = normalize(element.getAttribute('data-automation-id')).toLowerCase();
      const className = normalize(element.getAttribute('class')).toLowerCase();
      const text = normalize(element.textContent).toLowerCase();
      if (/save and continue|back|decline|accept cookies/i.test(text)) return false;
      return tagName === 'select'
        || role === 'combobox'
        || popup === 'listbox'
        || popup === 'true'
        || /prompt|select|dropdown|combobox/.test(`${automationId} ${className}`)
        || (role === 'button' && /0 items selected|select|choose|dropdown/.test(`${text} ${automationId} ${className}`));
    };
    const labelNodes = Array.from(document.querySelectorAll('label, legend, [data-automation-id*="label" i], [data-automation-id*="formLabel" i]'))
      .filter((element) => element instanceof HTMLElement && visible(element))
      .map((element) => {
        const text = normalize(element.textContent || '');
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          text,
          top: rect.top,
          width: rect.width,
        };
      })
      .filter((entry) => labelRegex.test(entry.text))
      .filter((entry) => !/^error\b|errors found|required and must have a value/i.test(entry.text))
      .filter((entry) => entry.text.length <= 280);
    const controls = Array.from(document.querySelectorAll('select, button, [role="button"], [role="combobox"], [aria-haspopup], [data-automation-id*="prompt" i], [data-automation-id*="select" i]'))
      .filter(isPromptControl);
    const candidates = [];
    for (const control of controls) {
      const controlRect = control.getBoundingClientRect();
      for (const label of labelNodes) {
        const verticalGap = controlRect.top - label.bottom;
        const horizontalGap = Math.abs(controlRect.left - label.left);
        if (verticalGap < -30 || verticalGap > 180) continue;
        if (horizontalGap > Math.max(260, label.width + 180)) continue;
        const score = 250000 - (verticalGap * 100) - horizontalGap - Math.abs(controlRect.width - Math.max(label.width, controlRect.width));
        candidates.push({ control, labelText: label.text, score });
      }
      let current = control.parentElement;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const text = normalize(current.textContent || '');
        if (!labelRegex.test(text)) continue;
        if (!allowPhoneContext && /phone number|country phone code|postal code/i.test(text) && !/how did you hear about us/i.test(text)) continue;
        const rect = current.getBoundingClientRect();
        const area = Math.max(1, rect.width * rect.height);
        const labelDistance = Math.abs(controlRect.top - rect.top);
        if (area > 450000 || labelDistance > 260) continue;
        let score = 100000 - area - labelDistance;
        if (/how did you hear about us/i.test(text)) score += 50000;
        if (/0 items selected/.test(normalize(control.textContent || ''))) score += 1000;
        candidates.push({ control, labelText: text, score });
        break;
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    const selected = candidates[0]?.control;
    if (!(selected instanceof HTMLElement)) return { opened: false };
    for (const node of Array.from(document.querySelectorAll('[data-career-os-active-prompt-id]'))) {
      node.removeAttribute('data-career-os-active-prompt-id');
    }
    if (!selected.id) selected.id = `career-os-prompt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    if (selected.tagName.toLowerCase() === 'select') {
      return {
        controlId: selected.id,
        nativeSelect: true,
        opened: false,
      };
    }
    const activePromptId = `prompt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    selected.setAttribute('data-career-os-active-prompt-id', activePromptId);
    const labelText = candidates[0]?.labelText || '';
    const ariaControls = selected.getAttribute('aria-controls') || '';
    const ariaOwns = selected.getAttribute('aria-owns') || '';
    selected.scrollIntoView({ block: 'center', inline: 'nearest' });
    selected.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    selected.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    selected.click();
    return {
      activePromptId,
      ariaControls,
      ariaOwns,
      controlId: selected.id,
      labelText,
      opened: true,
    };
  }, { allowPhoneContext: options.allowPhoneContext === true, source: labelPattern.source }).catch(() => false);
}

async function promptValueNearLabel(page, labelPattern) {
  return page.evaluate((source) => {
    const labelRegex = new RegExp(source, 'i');
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('label, [data-automation-id*="formField" i], [data-automation-id*="formLabel" i], [role="group"], fieldset, div'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .map((node) => ({ node, text: normalize(node.textContent || '') }))
      .filter((entry) => labelRegex.test(entry.text))
      .sort((left, right) => left.text.length - right.text.length);
    return nodes[0]?.text || '';
  }, labelPattern.source).catch(() => '');
}

async function findNestedLinkedInOption(page, parentOption) {
  await parentOption.hover({ force: true }).catch(() => null);
  await page.waitForTimeout(350);
  let childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
  if (childIndex >= 0) return childIndex;

  await clickOptionChevron(page, parentOption);
  await page.waitForTimeout(500);
  childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
  if (childIndex >= 0) return childIndex;

  await page.keyboard?.press?.('ArrowRight').catch(() => null);
  await page.waitForTimeout(500);
  childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
  if (childIndex >= 0) return childIndex;

  await clickOptionRowCenter(page, parentOption);
  await page.waitForTimeout(350);
  childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
  if (childIndex >= 0) return childIndex;

  await clickOptionRowCenter(page, parentOption);
  await clickOptionRowCenter(page, parentOption);
  await page.waitForTimeout(500);
  childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
  if (childIndex >= 0) return childIndex;

  await fillVisiblePromptSearch(page, 'LinkedIn').catch(() => false);
  await page.waitForTimeout(350);
  return visibleExactComboboxOptionIndex(page, 'LinkedIn');
}

async function applyLinkedInReferralPromptPath(page, mapping, resolved, spec) {
  const parents = [/^social network$/i, /^social media$/i, /^job board$/i, /^internet$/i, /^online$/i];
  for (const parentPattern of parents) {
    let parentIndex = await visibleOptionIndexByPattern(page, parentPattern);
    if (parentIndex < 0) {
      parentIndex = await visiblePromptTextElementIndex(page, parentPattern);
    }
    const parent = parentIndex >= 0 ? page.locator(OPTION_SELECTOR).nth(parentIndex) : null;
    if (parent && await parent.count().catch(() => 0)) {
      await parent.hover({ force: true }).catch(() => null);
      await clickOptionChevron(page, parent).catch(() => null);
      await page.waitForTimeout(450);
    } else {
      const clickedParent = await clickVisiblePromptText(page, parentPattern, { rightEdge: true });
      if (!clickedParent) continue;
      await page.waitForTimeout(450);
    }

    let childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
    if (childIndex < 0) childIndex = await visiblePromptTextElementIndex(page, /^linkedin$/i);
    if (childIndex < 0) {
      await page.keyboard?.press?.('ArrowRight').catch(() => null);
      await page.waitForTimeout(350);
      childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
      if (childIndex < 0) childIndex = await visiblePromptTextElementIndex(page, /^linkedin$/i);
    }
    if (childIndex < 0) {
      await clickVisiblePromptText(page, parentPattern, { rightEdge: false });
      await page.waitForTimeout(350);
      childIndex = await visibleExactComboboxOptionIndex(page, 'LinkedIn');
      if (childIndex < 0) childIndex = await visiblePromptTextElementIndex(page, /^linkedin$/i);
    }
    if (childIndex < 0) {
      await clickVisiblePromptText(page, /^linkedin$/i, { rightEdge: false });
      await page.waitForTimeout(350);
      await closeOpenPromptMenus(page);
      if (await promptMappingCommitted(page, mapping, resolved, spec, 'LinkedIn')) return true;
      continue;
    }

    const child = page.locator(OPTION_SELECTOR).nth(childIndex);
    if (await child.count().catch(() => 0)) {
      await clickOptionRowCenter(page, child);
    } else {
      await clickVisiblePromptText(page, /^linkedin$/i, { rightEdge: false });
    }
    await page.waitForTimeout(350);
    await closeOpenPromptMenus(page);
    if (await promptMappingCommitted(page, mapping, resolved, spec, 'LinkedIn')) return true;
  }
  return false;
}

async function selectVisiblePromptOptionByPatterns(page, patterns = []) {
  for (const pattern of patterns) {
    const optionIndex = await visibleOptionIndexByPattern(page, pattern);
    if (optionIndex >= 0) {
      const option = page.locator(OPTION_SELECTOR).nth(optionIndex);
      if (await option.count().catch(() => 0)) {
        await clickOptionRowCenter(page, option);
        return true;
      }
    }
    if (await clickVisiblePromptText(page, pattern, { rightEdge: false })) return true;
  }
  return false;
}

async function visiblePromptTextElementIndex(page, pattern) {
  return page.locator(OPTION_SELECTOR).evaluateAll((nodes, source) => {
    const optionRegex = new RegExp(source, 'i');
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    return nodes.findIndex((node) => node instanceof HTMLElement && visible(node) && optionRegex.test(normalize(node.textContent || '')));
  }, pattern.source).catch(() => -1);
}

async function clickVisiblePromptText(page, pattern, options = {}) {
  const box = await page.evaluate(({ rightEdge, source }) => {
    const optionRegex = new RegExp(source, 'i');
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll('[role="option"], [data-automation-id*="promptOption" i], [data-automation-id*="prompt-option" i], li, div, span'))
      .filter((element) => element instanceof HTMLElement && visible(element))
      .map((element) => {
        const text = normalize(element.textContent || '');
        const rect = element.getBoundingClientRect();
        const role = String(element.getAttribute('role') || '').toLowerCase();
        const automationId = String(element.getAttribute('data-automation-id') || '').toLowerCase();
        const menuish = role === 'option' || /prompt|option|menu|list/i.test(automationId);
        const exact = optionRegex.test(text) && text.length <= 80;
        const reasonableRow = rect.width >= 60 && rect.height >= 14 && rect.height <= 80;
        if (!exact || !reasonableRow) return null;
        return {
          height: rect.height,
          menuish,
          textLength: text.length,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter(Boolean)
      .sort((left, right) => Number(right.menuish) - Number(left.menuish) || left.textLength - right.textLength || left.width - right.width);
    const candidate = candidates[0];
    if (!candidate) return null;
    return {
      x: candidate.x + (rightEdge ? Math.max(8, candidate.width - 14) : Math.min(Math.max(24, candidate.width / 2), Math.max(24, candidate.width - 24))),
      y: candidate.y + candidate.height / 2,
    };
  }, { rightEdge: options.rightEdge === true, source: pattern.source }).catch(() => null);
  if (!box || !page?.mouse) return false;
  await page.mouse.click(box.x, box.y).catch(() => null);
  return true;
}

async function clickOptionChevron(page, option) {
  const box = await optionRowBox(option);
  if (!box || !page?.mouse) return false;
  await page.mouse.click(box.x + Math.max(8, box.width - 14), box.y + box.height / 2).catch(() => null);
  return true;
}

async function clickOptionRowCenter(page, option) {
  const box = await optionRowBox(option);
  if (box && page?.mouse) {
    await page.mouse.click(box.x + Math.min(Math.max(24, box.width / 2), Math.max(24, box.width - 24)), box.y + box.height / 2).catch(() => null);
    return true;
  }
  await option.click({ force: true }).catch(() => null);
  return true;
}

async function optionRowBox(option) {
  return option.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return null;
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const targetText = normalize(element.textContent || '');
    let best = element;
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      if (!(current instanceof HTMLElement)) continue;
      const rect = current.getBoundingClientRect();
      const text = normalize(current.textContent || '');
      if (!text.includes(targetText)) continue;
      if (rect.width >= 140 && rect.height >= 16 && rect.height <= 80) {
        best = current;
      }
    }
    const rect = best.getBoundingClientRect();
    return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
  }).catch(() => null);
}

async function visibleOptionIndexByPattern(page, pattern) {
  return page.locator(OPTION_SELECTOR).evaluateAll((nodes, source) => {
    const optionRegex = new RegExp(source, 'i');
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return nodes.findIndex((node) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return false;
      return optionRegex.test(String(node.textContent || ''));
    });
  }, pattern.source).catch(() => -1);
}

async function promptMappingCommitted(page, mapping, resolved, spec, selectedText = '') {
  await page.waitForTimeout?.(350).catch(() => null);
  const refreshedFields = await scanVisibleFields(page).catch(() => []);
  const field = refreshedFields.find((candidate) => (mapping.matchers || []).some((matcher) => matchesField(candidate, matcher))
    && fieldMatchesMappingRoute(candidate, mapping));
  if (field && fieldAlreadyHasResolvedValue(field, mapping, resolved)) return true;

  const promptText = await selectedPromptValueNearLabel(page, spec.labelPattern);
  const evidence = `${field?.currentValue || ''} ${promptText}`;
  if (['state_texas', 'country_phone_code', 'phone_device_type', 'referral_internet_search', 'referral_linkedin'].includes(spec.kind)) {
    return promptEvidenceMatches(spec, evidence);
  }
  if (spec.kind === 'country_phone_code') {
    return promptEvidenceMatches(spec, evidence);
  }
  if (spec.kind === 'phone_device_type') {
    return promptEvidenceMatches(spec, evidence);
  }
  if (spec.kind === 'referral_linkedin') {
    return promptEvidenceMatches(spec, evidence);
  }
  return Boolean(selectedText && field);
}

async function selectedPromptValueNearLabel(page, labelPattern) {
  return page.evaluate((source) => {
    const labelRegex = new RegExp(source, 'i');
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const roots = Array.from(document.querySelectorAll('[data-automation-id*="formField" i], [role="group"], fieldset, div'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.textContent || '');
        return { area: Math.max(1, rect.width * rect.height), node, text };
      })
      .filter((entry) => labelRegex.test(entry.text))
      .sort((left, right) => left.area - right.area || left.text.length - right.text.length);
    for (const { node } of roots) {
      const copy = node.cloneNode(true);
      if (!(copy instanceof HTMLElement)) continue;
      for (const popup of Array.from(copy.querySelectorAll('[role="listbox"], [role="option"], [role="menu"], [data-automation-id*="promptOption" i], [data-automation-id*="prompt-option" i], ul, li'))) {
        popup.remove();
      }
      const text = normalize(copy.textContent || '');
      if (text) return text;
    }
    return '';
  }, labelPattern.source).catch(() => '');
}

async function fillVisiblePromptSearch(page, value) {
  const search = page.locator([
    'input[placeholder="Search"]:visible',
    'input[aria-label*="Search" i]:visible',
    '[role="listbox"] input:visible',
    '[data-automation-id*="prompt" i] input:visible',
  ].join(', ')).last();
  if (await search.count().catch(() => 0)) {
    await search.click({ force: true }).catch(() => null);
    await search.press('Meta+A').catch(() => null);
    await search.fill('').catch(() => null);
    await search.type(clean(value), { delay: 20 }).catch(async () => {
      await search.fill(clean(value)).catch(() => null);
    });
    if (clean(await search.inputValue().catch(() => '')) === clean(value)) return true;
  }

  const points = await visiblePromptSearchClickPoints(page);
  for (const point of points) {
    if (!page?.mouse || !page?.keyboard) break;
    await page.mouse.click(point.x, point.y).catch(() => null);
    await page.keyboard.press('Meta+A').catch(() => null);
    await page.keyboard.press('Backspace').catch(() => null);
    await page.keyboard.type(clean(value), { delay: 20 }).catch(() => null);
    await page.waitForTimeout?.(200).catch(() => null);
    const targetPattern = promptSearchVerificationPattern(value);
    if (!targetPattern || await visibleOptionIndexByPattern(page, targetPattern) >= 0 || await visiblePromptTextElementIndex(page, targetPattern) >= 0) {
      return true;
    }
  }
  return false;
}

function promptSearchVerificationPattern(value) {
  const text = clean(value);
  if (/united states/i.test(text)) return /united states/i;
  if (/linkedin/i.test(text)) return /linkedin/i;
  if (/social network/i.test(text)) return /social network/i;
  if (/mobile|cell/i.test(text)) return /mobile|cell/i;
  return text ? new RegExp(escapeRegExp(text), 'i') : null;
}

async function visiblePromptSearchClickPoints(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], [data-automation-id*="prompt" i], div, ul'))
      .filter((element) => element instanceof HTMLElement && visible(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = normalize(element.textContent || '');
        return {
          area: Math.max(1, rect.width * rect.height),
          height: rect.height,
          text,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter((entry) => entry.width >= 180 && entry.width <= 720 && entry.height >= 70 && entry.height <= 900)
      .filter((entry) => /search/i.test(entry.text))
      .filter((entry) => /afghanistan|campus|corporate website|landline|mobile|social network|united states/i.test(entry.text))
      .sort((left, right) => {
        const leftCountryList = /afghanistan|aland islands|albania|american samoa/i.test(left.text);
        const rightCountryList = /afghanistan|aland islands|albania|american samoa/i.test(right.text);
        if (leftCountryList || rightCountryList) return Number(rightCountryList) - Number(leftCountryList) || right.area - left.area;
        return left.area - right.area || right.y - left.y;
      })
      .slice(0, 4);
    const points = [];
    for (const entry of candidates) {
      const x = entry.x + Math.min(110, Math.max(55, entry.width * 0.25));
      if (/afghanistan|aland islands|albania|american samoa/i.test(entry.text)) {
        points.push({ x, y: entry.y + entry.height - 78 });
        points.push({ x, y: entry.y + entry.height - 60 });
      } else {
        points.push({ x, y: entry.y + Math.min(36, Math.max(24, entry.height * 0.08)) });
        points.push({ x, y: entry.y + entry.height - Math.min(72, Math.max(44, entry.height * 0.14)) });
      }
    }
    return points;
  }).catch(() => []);
}

async function applySelectMapping(page, field, mapping, resolved) {
  if (fieldUsesCombobox(field)) {
    return applyComboboxMapping(page, field, mapping, resolved);
  }
  if (field.type === 'radio' || field.type === 'checkbox') {
    return applyRadioMapping(page, mapping, resolved);
  }
  if (field.tagName !== 'select') {
    return clean(resolved) && clean(resolved) !== '__first_available__'
      ? applyTextMapping(page, field, resolved)
      : false;
  }
  const locator = field.id
    ? page.locator(idSelector(field.id)).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : field.selector
        ? page.locator(field.selector).first()
        : null;
  if (!locator || !await locator.count()) return false;
  const meta = await locatorControlMeta(locator);
  if (isChoiceControlMeta(meta)) {
    return applyRadioMapping(page, mapping, resolved);
  }
  const radioFallback = await applyRadioMapping(page, mapping, resolved);
  if (radioFallback) return true;
  const index = optionIndexForStrategy(field, mapping.strategy, resolved, mapping);
  if (index < 0) return false;
  await locator.selectOption({ index });
  await locator.evaluate((element) => {
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  });
  const selectedIndex = await locator.evaluate((element) => element.selectedIndex);
  return selectedIndex === index;
}

async function applyRadioMapping(page, mapping, resolved) {
  const choiceControlSelector = 'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]';
  const nearbyApplied = await applyNearbyChoiceByQuestion(page, mapping, resolved);
  if (nearbyApplied) return true;
  let group = null;
  for (const matcher of mapping.matchers || []) {
    const candidates = page.locator('fieldset, [role="radiogroup"], [role="group"], [data-automation-id*="formField" i], label, div')
      .filter({ hasText: matcher })
      .filter({ has: page.locator(choiceControlSelector) });
    const count = Math.min(await candidates.count(), 50);
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      const score = await candidate.evaluate((element) => {
        const textLength = String(element.textContent || '').replace(/\s+/g, ' ').trim().length;
        const tag = String(element.tagName || '').toLowerCase();
        const role = String(element.getAttribute('role') || '').toLowerCase();
        const automationId = String(element.getAttribute('data-automation-id') || '').toLowerCase();
        let score = textLength || 9999;
        if (tag === 'fieldset' || role === 'radiogroup' || role === 'group') score -= 5000;
        if (automationId.includes('formfield')) score -= 2500;
        return score;
      }).catch(() => Number.POSITIVE_INFINITY);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best && await best.count()) {
      group = best;
      break;
    }
  }
  if (!group || !await group.count()) return false;
  if (await choiceGroupHasResolvedChecked(group, resolved)) return true;
  let option = null;
  if (clean(resolved) === '__first_available__') {
    option = group.locator('label, [role="radio"], [role="checkbox"]').filter({
      has: page.locator('input[type="radio"], input[type="checkbox"]'),
    }).first();
  } else if (clean(resolved) === '__decline__') {
    option = group.locator('label, [role="radio"], [role="checkbox"]').filter({
      has: page.locator('input[type="radio"], input[type="checkbox"]'),
      hasText: /decline|prefer not|do not wish|don.t wish|choose not|not disclosed|i do not want|i don.t want/i,
    }).first();
  } else {
    const escaped = String(resolved).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    option = group.locator('label, [role="radio"], [role="checkbox"]').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }).first();
    if (!await option.count()) {
      option = group.locator('label, [role="radio"], [role="checkbox"]').filter({ hasText: new RegExp(escaped, 'i') }).first();
    }
  }
  if (!await option.count()) {
    const inputIndex = await choiceInputIndexForResolved(group, resolved);
    if (inputIndex < 0) return false;
    const input = group.locator('input[type="radio"], input[type="checkbox"]').nth(inputIndex);
    await input.check({ force: true }).catch(async () => {
      await input.click({ force: true }).catch(() => null);
    });
    return choiceGroupHasResolvedChecked(group, resolved);
  }
  const control = option.locator('input[type="radio"], input[type="checkbox"]').first();
  if (await control.count()) {
    await control.check({ force: true }).catch(async () => {
      await control.click({ force: true }).catch(() => null);
    });
    return choiceGroupHasResolvedChecked(group, resolved);
  }
  await option.click({ force: true }).catch(() => null);
  if (await choiceGroupHasResolvedChecked(group, resolved)) return true;
  const checked = await option.evaluate((element) => {
    const value = element.getAttribute('aria-checked') || element.getAttribute('data-checked') || '';
    return /true/i.test(value) || /\bchecked\b|\bselected\b/i.test(String(element.className || ''));
  }).catch(() => false);
  return Boolean(checked);
}

async function applyNearbyChoiceByQuestion(page, mapping, resolved) {
  const target = normalized(resolved);
  if (!['yes', 'no'].includes(target)) return false;
  const matcherPayload = (mapping.matchers || []).map((matcher) => matcher instanceof RegExp
    ? { kind: 'regex', source: matcher.source, flags: matcher.flags }
    : { kind: 'text', value: clean(matcher) });
  if (!matcherPayload.length || !page?.evaluate) return false;
  return page.evaluate(({ matchers, targetValue }) => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const matches = (text) => matchers.some((matcher) => {
      if (matcher.kind === 'regex') return new RegExp(matcher.source, matcher.flags || 'i').test(text);
      return normalize(text).includes(normalize(matcher.value));
    });
    const optionTextFor = (input) => {
      const id = input.getAttribute('id') || '';
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return normalize([
        explicit?.textContent,
        input.closest('label')?.textContent,
        input.parentElement?.textContent,
        input.nextElementSibling?.textContent,
        input.getAttribute('aria-label'),
        input.getAttribute('value'),
      ].filter(Boolean).join(' '));
    };
    const clickInput = (input) => {
      const id = input.getAttribute('id') || '';
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const target = explicit || input.closest('label') || input;
      target.click();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.checked || input.getAttribute('aria-checked') === 'true';
    };
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter((input) => input instanceof HTMLInputElement);
    for (const input of inputs) {
      const optionText = optionTextFor(input);
      if (!(optionText === targetValue || optionText.startsWith(`${targetValue} `) || optionText.includes(` ${targetValue} `))) continue;
      let current = input.parentElement;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const text = normalize(current.textContent || '');
        if (!text || !matches(text)) continue;
        if (clickInput(input)) return true;
      }
    }
    return false;
  }, { matchers: matcherPayload, targetValue: target }).catch(() => false);
}

async function choiceInputIndexForResolved(group, resolved) {
  return group.locator('input[type="radio"], input[type="checkbox"]').evaluateAll((nodes, targetValue) => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (String(targetValue || '').trim() === '__first_available__') return nodes.length ? 0 : -1;
    const target = normalize(targetValue);
    const textFor = (node) => {
      const id = node.getAttribute('id') || '';
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const pieces = [
        node.getAttribute('aria-label'),
        node.getAttribute('value'),
        explicit?.textContent,
        node.closest('label')?.textContent,
        node.parentElement?.textContent,
        node.nextElementSibling?.textContent,
      ];
      return normalize(pieces.filter(Boolean).join(' '));
    };
    return nodes.findIndex((node) => {
      const text = textFor(node);
      return text === target
        || text.split(/\s+/)[0] === target
        || (target && text.includes(target));
    });
  }, clean(resolved)).catch(() => -1);
}

async function choiceGroupHasResolvedChecked(group, resolved) {
  return group.evaluate((element, targetValue) => {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const wantsFirstAvailable = String(targetValue || '').trim() === '__first_available__';
    const target = normalize(targetValue);
    const textFor = (node) => {
      const id = node.getAttribute('id') || '';
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const pieces = [
        node.getAttribute('aria-label'),
        node.getAttribute('value'),
        explicit?.textContent,
        node.closest('label')?.textContent,
        node.parentElement?.textContent,
        node.nextElementSibling?.textContent,
      ];
      return normalize(pieces.filter(Boolean).join(' '));
    };
    const selected = Array.from(element.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter((node) => node instanceof HTMLInputElement && node.checked);
    if (wantsFirstAvailable) return selected.length > 0;
    return selected.some((node) => {
      const text = textFor(node);
      return text === target
        || text.split(/\s+/)[0] === target
        || (target && text.includes(target));
    });
  }, clean(resolved)).catch(() => false);
}

function isDeclineOption(value) {
  return /decline|prefer not|do not wish|don.t wish|choose not|not disclosed|i do not want|i don.t want/i.test(normalized(value));
}

function isSafeSelectableOption(value) {
  const text = normalized(value);
  return Boolean(text) && !/^(select|choose|please select|select one|none)$/.test(text);
}

function parseYearsOption(value) {
  const text = normalized(value);
  const numbers = Array.from(text.matchAll(/\d+/g)).map((match) => Number(match[0]));
  if (!numbers.length) return null;
  if (/less than|under|fewer than/.test(text)) return Math.max(0, numbers[0] - 1);
  return Math.max(...numbers);
}

function optionIndexForMaxYears(options, resolved) {
  const maxYears = Number(resolved);
  if (!Number.isFinite(maxYears) || maxYears <= 0) return -1;
  let bestIndex = -1;
  let bestYears = -1;
  options.forEach((option, index) => {
    const text = `${option.label || ''} ${option.value || ''}`;
    if (index === 0 && !isSafeSelectableOption(text)) return;
    const years = parseYearsOption(text);
    if (years === null || years > maxYears || years < bestYears) return;
    bestIndex = index;
    bestYears = years;
  });
  return bestIndex;
}

function optionMatchContext(field = {}, mapping = {}) {
  return normalized([
    mapping.key,
    field.label,
    field.ariaLabel,
    field.name,
    field.id,
  ].filter(Boolean).join(' '));
}

function optionMatchesResolved(optionText, target, context = '') {
  const option = normalized(optionText);
  if (!option || !target) return false;
  if (option === target || normalized(optionText.split(/\s+/)[0]) === target) return true;
  if (context.includes('state') || context.includes('province')) {
    if (target === 'texas' && /\btx\b/.test(option)) return true;
    if (target === 'tx' && /\btexas\b/.test(option)) return true;
  }
  if (/referral source|how did you hear/.test(context) && /linkedin/.test(target) && /social network|social media|linkedin/.test(option)) return true;
  if (/referral source|how did you hear/.test(context) && target === 'internet search') {
    return /^(internet search|online search|search engine|internet)$/.test(option)
      && !/linkedin|social network|social media/.test(option);
  }
  if (context.includes('country phone code') || context.includes('phone code')) {
    const wantsUs = ['1', 'us', 'usa', 'united states', 'united states of america'].includes(target)
      || target.includes('united states')
      || /\b(?:us|usa|1)\b/.test(target);
    if (wantsUs && /\bunited states(?: of america)?\b/.test(option) && /\b1\b/.test(option) && !/\balbania\b/.test(option)) return true;
  }
  if (context.includes('phone device type') && target === 'mobile' && /mobile|cell|cellular/.test(option)) return true;
  if (context.includes('degree')) {
    if (/master/.test(target) && /master/.test(option)) return true;
    if (/bachelor/.test(target) && /bachelor/.test(option)) return true;
    if (/associate/.test(target) && /associate/.test(option)) return true;
  }
  return false;
}

function fieldCompatibleWithMapping(field = {}, mapping = {}) {
  const kind = clean(mapping.kind).toLowerCase();
  const tagName = clean(field.tagName).toLowerCase();
  const type = clean(field.type).toLowerCase();
  const role = clean(field.role).toLowerCase();
  if (kind === 'text') {
    return ['input', 'textarea'].includes(tagName)
      && !['checkbox', 'radio', 'button', 'submit', 'file', 'hidden'].includes(type)
      && !['button', 'checkbox', 'radio'].includes(role);
  }
  if (kind === 'select' || kind === 'radio') {
    return tagName === 'select'
      || fieldUsesCombobox(field)
      || type === 'radio'
      || type === 'checkbox'
      || role === 'radio'
      || role === 'checkbox';
  }
  return true;
}

export async function applyFieldMappings(page, mappings, context) {
  const fields = await scanVisibleFields(page);
  const results = [];

  for (const mapping of mappings) {
    await closeOpenPromptMenus(page);
    const matchers = mapping.matchers || [];
    const matchingFields = fields.filter((candidate) => matchers.some((matcher) => matchesField(candidate, matcher))
      && fieldMatchesMappingRoute(candidate, mapping));
    const field = matchingFields.find((candidate) => fieldCompatibleWithMapping(candidate, mapping)) || matchingFields[0];
    const resolved = resolveMappingValue(mapping, context, field);
    if (resolved === undefined || resolved === null || clean(resolved) === '') {
      results.push({
        key: mapping.key,
        matched: Boolean(field),
        applied: false,
        reason: 'value_unresolved',
        field: field?.label || field?.id,
      });
      continue;
    }

    const knownPromptResult = await applyKnownPromptMapping(page, mapping, resolved);
    if (knownPromptResult.applied) {
      results.push({
        key: mapping.key,
        matched: true,
        applied: true,
        field: knownPromptResult.field || field?.label || field?.id || promptReportField(knownPromptSpec(mapping, resolved), mapping),
        reason: knownPromptResult.reason || 'known_prompt_mapping',
        value: clean(resolved),
      });
      continue;
    }
    if (knownPromptResult.terminalFailure) {
      results.push({
        key: mapping.key,
        matched: true,
        applied: false,
        diagnosticScreenshotPath: knownPromptResult.diagnosticScreenshotPath,
        field: knownPromptResult.field || field?.label || field?.id || promptReportField(knownPromptSpec(mapping, resolved), mapping),
        reason: knownPromptResult.reason || 'protected_prompt_commit_failed',
        value: clean(resolved),
      });
      return results;
    }

    if (!field) {
      if (mapping.kind === 'select' || mapping.kind === 'radio') {
        const applied = await applyRadioMapping(page, mapping, resolved);
        results.push({
          key: mapping.key,
          matched: applied,
          applied,
          reason: applied ? undefined : 'field_not_found',
          value: mapping.strategy === 'first_available' ? '__first_available__' : clean(resolved),
        });
        continue;
      }

      results.push({ key: mapping.key, matched: false, applied: false, reason: 'field_not_found' });
      continue;
    }

    if (fieldAlreadyHasResolvedValue(field, mapping, resolved)) {
      await closeOpenPromptMenus(page);
      results.push({
        key: mapping.key,
        matched: true,
        applied: true,
        field: field.label || field.id,
        reason: 'already_set',
        value: mapping.strategy === 'first_available' ? '__first_available__' : clean(resolved),
      });
      continue;
    }

    let applied = false;
    if (field.type === 'radio' || field.type === 'checkbox') {
      applied = await applyRadioMapping(page, mapping, resolved);
    } else if (mapping.kind === 'select') {
      applied = await applySelectMapping(page, field, mapping, resolved);
    } else if (mapping.kind === 'radio') {
      applied = await applyRadioMapping(page, mapping, resolved);
    } else {
      applied = await applyTextMapping(page, field, resolved);
    }

    results.push({
      key: mapping.key,
      matched: true,
      applied,
      field: field.label || field.id,
      value: mapping.strategy === 'first_available' ? '__first_available__' : clean(resolved),
    });
  }

  return results;
}

function fieldAlreadyHasResolvedValue(field = {}, mapping = {}, resolved = '') {
  const current = normalized(field.currentValue);
  const target = normalized(resolved);
  if (!current || !target || ['__first_available__', '__decline__'].includes(clean(resolved))) return false;
  const context = optionMatchContext(field, mapping);
  const spec = knownPromptSpec(mapping, resolved);
  if (spec && ['state_texas', 'country_phone_code', 'phone_device_type', 'referral_internet_search', 'referral_linkedin'].includes(spec.kind)) {
    return promptEvidenceMatches(spec, field.currentValue);
  }
  if (normalized(mapping.key) === 'phone_number') {
    return current === digitsOnly(target) || current === target || digitsOnly(current) === digitsOnly(target);
  }
  return optionMatchesResolved(current, target, context) || current.includes(target);
}

async function closeOpenPromptMenus(page) {
  if (!page?.keyboard) return;
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press('Escape').catch(() => null);
    await page.waitForTimeout?.(75).catch(() => null);
  }
}
