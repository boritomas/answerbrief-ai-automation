function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cssEscape(value) {
  return value.replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, '\\$1');
}

function fieldHaystack(field) {
  return normalized([
    field.label,
    field.id,
    field.name,
    field.ariaLabel,
    field.role,
    field.className,
    field.placeholder,
  ].filter(Boolean).join(' '));
}

function matchesField(field, matcher) {
  const haystack = fieldHaystack(field);
  if (!haystack) return false;
  if (matcher instanceof RegExp) return matcher.test(haystack);
  return haystack.includes(normalized(matcher));
}

function optionIndexForStrategy(field, strategy, resolved) {
  const options = Array.isArray(field.options) ? field.options : [];
  if (!options.length) return -1;
  if (strategy === 'first_available') {
    return options.findIndex((option, index) => index > 0 && clean(option.value || option.label));
  }

  const target = normalized(resolved);
  if (!target) return -1;

  const direct = options.findIndex((option) => {
    return normalized(option.label) === target || normalized(option.value) === target;
  });
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
    const labelTextFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('[data-automation-id], [role="group"], fieldset, div');
      const nearby = field?.querySelector?.('label, legend');
      return normalize(nearby?.textContent);
    };

    return Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((element) => element instanceof HTMLElement && visible(element) && !element.hasAttribute('disabled'))
      .map((element) => {
        const tagName = element.tagName.toLowerCase();
        const type = element instanceof HTMLInputElement ? element.type : tagName;
        const currentValue = element instanceof HTMLSelectElement
          ? String(element.value || '')
          : 'value' in element
            ? String(element.value || '')
            : '';
        return {
          ariaLabel: normalize(element.getAttribute('aria-label')),
          className: normalize(element.getAttribute('class')),
          currentValue,
          id: element.id || '',
          label: labelTextFor(element),
          name: element.getAttribute('name') || '',
          options: element instanceof HTMLSelectElement
            ? Array.from(element.options).map((option) => ({
                label: normalize(option.label),
                value: String(option.value || ''),
              }))
            : [],
          placeholder: normalize(element.getAttribute('placeholder')),
          required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
          role: normalize(element.getAttribute('role')),
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
    ? page.locator(`#${cssEscape(field.id)}`).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : page.locator(`input[aria-label="${field.ariaLabel}"], textarea[aria-label="${field.ariaLabel}"]`).first();
  if (!await locator.count()) return false;
  const meta = await locatorControlMeta(locator);
  if (isChoiceControlMeta(meta)) return false;
  await locator.fill('');
  await setNativeTextValue(locator, value);
  const finalValue = await locator.inputValue().catch(() => '');
  return clean(finalValue) === clean(value);
}

function fieldUsesCombobox(field) {
  return field.role === 'combobox';
}

async function visibleComboboxOptionIndex(page, { strategy, resolved }) {
  return page.locator('[role="option"]').evaluateAll((nodes, payload) => {
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

    const target = normalize(payload.resolved);
    if (!target) return -1;

    const direct = options.find((option) => option.text === target || option.text.startsWith(`${target} `));
    if (direct) return direct.index;

    if (target === 'internet search') {
      const equivalent = options.find((option) => option.text === 'online search' || option.text.includes('internet search'));
      if (equivalent) return equivalent.index;
    }

    const tokens = target.split(/\s+/).filter(Boolean);
    const fuzzy = options.find((option) => tokens.length > 1 && tokens.every((token) => option.text.includes(token)));
    return fuzzy ? fuzzy.index : -1;
  }, { resolved: clean(resolved), strategy: clean(strategy) });
}

async function comboboxCommittedValue(locator) {
  return clean(await locator.evaluate((element) => {
    let current = element.parentElement;
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  const locator = field.id
    ? page.locator(`#${cssEscape(field.id)}`).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : page.locator(`input[aria-label="${field.ariaLabel}"]`).first();
  if (!await locator.count()) return false;

  await locator.click({ force: true }).catch(() => null);
  await locator.fill('');
  if (clean(resolved) && clean(resolved) !== '__first_available__') {
    await locator.type(String(resolved), { delay: 20 });
  } else {
    await locator.press('ArrowDown').catch(() => null);
  }
  await page.waitForTimeout(250);

  let optionIndex = await visibleComboboxOptionIndex(page, { strategy: mapping.strategy, resolved });
  if (optionIndex < 0 && mapping.strategy !== 'first_available' && clean(resolved)) {
    await locator.press('ArrowDown').catch(() => null);
    await page.waitForTimeout(250);
    optionIndex = await visibleComboboxOptionIndex(page, { strategy: mapping.strategy, resolved });
  }
  if (optionIndex < 0) return false;

  const option = page.locator('[role="option"]').nth(optionIndex);
  if (!await option.count()) return false;
  const optionText = clean(await option.textContent().catch(() => ''));
  await option.click();
  await page.waitForTimeout(150);
  let committed = await comboboxCommittedValue(locator);
  if (!committed) {
    await locator.click({ force: true }).catch(() => null);
    if (clean(resolved) && clean(resolved) !== '__first_available__') {
      await locator.press('Meta+A').catch(() => null);
      await locator.type(String(resolved), { delay: 20 }).catch(() => null);
    }
    await locator.press('ArrowDown').catch(() => null);
    await locator.press('Enter').catch(() => null);
    await locator.press('Tab').catch(() => null);
    await page.waitForTimeout(250);
    committed = await comboboxCommittedValue(locator);
  }

  const finalValue = clean(await locator.inputValue().catch(() => ''));
  if (mapping.strategy === 'first_available') {
    return Boolean(optionText || committed);
  }
  return normalized(committed).includes(normalized(resolved))
    || normalized(finalValue).includes(normalized(resolved))
    || normalized(optionText).includes(normalized(resolved));
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
    ? page.locator(`#${cssEscape(field.id)}`).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : null;
  if (!locator || !await locator.count()) return false;
  const meta = await locatorControlMeta(locator);
  if (isChoiceControlMeta(meta)) {
    return applyRadioMapping(page, mapping, resolved);
  }
  const radioFallback = await applyRadioMapping(page, mapping, resolved);
  if (radioFallback) return true;
  const index = optionIndexForStrategy(field, mapping.strategy, resolved);
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
  const group = page.locator('fieldset, [role="group"], div').filter({
    hasText: mapping.matchers.find((matcher) => matcher instanceof RegExp) || mapping.matchers[0],
  }).first();
  if (!await group.count()) return false;
  let option = null;
  if (clean(resolved) === '__first_available__') {
    option = group.locator('label').filter({
      has: page.locator('input[type="radio"], input[type="checkbox"]'),
    }).first();
  } else {
    const escaped = String(resolved).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    option = group.locator('label').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`, 'i') }).first();
    if (!await option.count()) {
      option = group.locator('label').filter({ hasText: new RegExp(escaped, 'i') }).first();
    }
  }
  if (!await option.count()) return false;
  const control = option.locator('input[type="radio"], input[type="checkbox"]').first();
  if (!await control.count()) return false;
  await control.check();
  return await control.isChecked();
}

export async function applyFieldMappings(page, mappings, context) {
  const fields = await scanVisibleFields(page);
  const results = [];

  for (const mapping of mappings) {
    const matchers = mapping.matchers || [];
    const field = fields.find((candidate) => matchers.some((matcher) => matchesField(candidate, matcher)));
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
