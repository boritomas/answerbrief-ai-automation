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
  if (mapping.strategy === 'first_available') return '__first_available__';
  if (mapping.value !== undefined) return mapping.value;
  if (mapping.valueFrom) return resolveFromPath(context, mapping.valueFrom);
  if (typeof mapping.resolve === 'function') return mapping.resolve({ context, field });
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

async function applyTextMapping(page, field, value) {
  const locator = field.id
    ? page.locator(`#${cssEscape(field.id)}`).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : page.locator(`input[aria-label="${field.ariaLabel}"], textarea[aria-label="${field.ariaLabel}"]`).first();
  if (!await locator.count()) return false;
  await locator.fill('');
  await setNativeTextValue(locator, value);
  const finalValue = await locator.inputValue().catch(() => '');
  return clean(finalValue) === clean(value);
}

async function applySelectMapping(page, field, mapping, resolved) {
  const locator = field.id
    ? page.locator(`#${cssEscape(field.id)}`).first()
    : field.name
      ? page.locator(`[name="${field.name}"]`).first()
      : null;
  if (!locator || !await locator.count()) return false;
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
  const option = group.locator('label').filter({ hasText: new RegExp(`^\\s*${String(resolved).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first();
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
    if (!field) {
      results.push({ key: mapping.key, matched: false, applied: false, reason: 'field_not_found' });
      continue;
    }

    const resolved = resolveMappingValue(mapping, context, field);
    if (resolved === undefined || resolved === null || clean(resolved) === '') {
      results.push({ key: mapping.key, matched: true, applied: false, reason: 'value_unresolved', field: field.label || field.id });
      continue;
    }

    let applied = false;
    if (mapping.kind === 'select') {
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
