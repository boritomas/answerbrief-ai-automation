// Redacts secret-shaped data from arbitrary diagnostic payloads (API
// request/response logs, HAR files, etc.) before they're ever written to
// disk, printed, or handed to anyone -- including this agent. Built after
// Tomas reviewed a raw browser HAR of the Employer Authentication panel
// and found it captured plaintext Workday passwords in POST bodies (an
// inherent property of any HAR: it records exactly what was typed). The
// fix isn't "stop sending the password to the server" -- updating a
// Keychain credential requires transmitting it once, over localhost, to
// the process that can write to the Keychain -- it's making sure a raw
// capture is never the thing that gets shared or persisted again.

const SENSITIVE_KEY_PATTERN = /password|passwd|pwd|actiontoken|action_token|cookie|authorization|auth[-_]?token|session|csrf|xsrf|credential|secret|reset[-_]?token|api[-_]?key|bearer/i;

const SENSITIVE_QUERY_PARAM_PATTERN = /^(password|token|secret|key|auth|session|credential|code)$/i;

const REDACTED = '[REDACTED]';

export function redactDiagnosticPayload(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticPayload(item, seen));
  if (typeof value === 'string') return redactSensitiveUrlOrString(value);
  if (typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = entryValue === null || entryValue === undefined ? entryValue : REDACTED;
      continue;
    }
    // HAR entries nest headers/cookies/query params as arrays of
    // { name, value } pairs rather than plain objects -- name-based key
    // matching above doesn't see them, so handle that shape explicitly.
    // Cookies are ALWAYS redacted unconditionally, regardless of the
    // cookie's own name: a session/auth cookie's name is often arbitrary
    // (e.g. career_os_admin), so name-pattern matching alone would miss
    // it -- the presence of a cookie value at all is what's sensitive.
    if (key === 'cookies') {
      result[key] = redactAllValues(entryValue);
      continue;
    }
    if (key === 'headers' || key === 'queryString' || key === 'params') {
      result[key] = redactHarNameValuePairs(entryValue);
      continue;
    }
    if (key === 'postData' && entryValue && typeof entryValue === 'object') {
      result[key] = redactPostData(entryValue as Record<string, unknown>);
      continue;
    }
    result[key] = redactDiagnosticPayload(entryValue, seen);
  }
  return result;
}

function redactAllValues(value: unknown): unknown {
  if (!Array.isArray(value)) return redactDiagnosticPayload(value);
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const record = entry as Record<string, unknown>;
    return { ...record, value: record.value === null || record.value === undefined ? record.value : REDACTED };
  });
}

function redactHarNameValuePairs(value: unknown): unknown {
  if (!Array.isArray(value)) return redactDiagnosticPayload(value);
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const record = entry as Record<string, unknown>;
    const name = String(record.name || '');
    if (SENSITIVE_KEY_PATTERN.test(name)) {
      return { ...record, value: record.value === null || record.value === undefined ? record.value : REDACTED };
    }
    return record;
  });
}

function redactPostData(postData: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...postData };
  if (typeof result.text === 'string') {
    result.text = redactBodyText(result.text, String(postData.mimeType || ''));
  }
  if (Array.isArray(result.params)) {
    result.params = redactHarNameValuePairs(result.params);
  }
  return result;
}

function redactBodyText(text: string, mimeType: string): string {
  if (/json/i.test(mimeType)) {
    try {
      return JSON.stringify(redactDiagnosticPayload(JSON.parse(text)));
    } catch {
      // fall through to generic string redaction
    }
  }
  if (/x-www-form-urlencoded/i.test(mimeType)) {
    try {
      const params = new URLSearchParams(text);
      for (const key of Array.from(params.keys())) {
        if (SENSITIVE_KEY_PATTERN.test(key)) params.set(key, REDACTED);
      }
      return params.toString();
    } catch {
      // fall through
    }
  }
  return redactSensitiveUrlOrString(text);
}

function redactSensitiveUrlOrString(value: string): string {
  let result = value;
  // Bearer tokens and similar inline credential-shaped values.
  result = result.replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${REDACTED}`);
  // key=value pairs (query strings, form bodies) where the key looks secret.
  result = result.replace(/([?&:]|^)([A-Za-z0-9_-]+)=([^&\s"']+)/g, (match, prefix, key, val) => {
    return SENSITIVE_QUERY_PARAM_PATTERN.test(key) || SENSITIVE_KEY_PATTERN.test(key)
      ? `${prefix}${key}=${REDACTED}`
      : match;
  });
  // "password":"..." style JSON fragments embedded in a larger string.
  result = result.replace(/("(?:password|passwd|pwd|actionToken|credential|secret|token)"\s*:\s*)"[^"]*"/gi, `$1"${REDACTED}"`);
  return result;
}
