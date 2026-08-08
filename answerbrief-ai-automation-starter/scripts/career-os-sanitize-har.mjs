// Run this on any HAR export (Chrome DevTools > Network > "Save all as
// HAR") BEFORE sharing it for debugging. Strips passwords, tokens,
// cookies, and Authorization headers from every request/response entry.
// Never share a raw, unsanitized HAR -- it contains exactly what you
// typed, including plaintext credentials.
//
// Usage: node scripts/career-os-sanitize-har.mjs <input.har> [output.har]
// (default output: <input>.sanitized.har)

import fs from 'node:fs';
import path from 'node:path';

const SENSITIVE_KEY_PATTERN = /password|passwd|pwd|actiontoken|action_token|cookie|authorization|auth[-_]?token|session|csrf|xsrf|credential|secret|reset[-_]?token|api[-_]?key|bearer/i;
const REDACTED = '[REDACTED]';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/career-os-sanitize-har.mjs <input.har> [output.har]');
  process.exit(1);
}
const outputPath = process.argv[3] || inputPath.replace(/\.har$/i, '') + '.sanitized.har';

const har = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function redactNameValuePairs(list) {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    if (SENSITIVE_KEY_PATTERN.test(String(entry.name || ''))) {
      return { ...entry, value: entry.value == null ? entry.value : REDACTED };
    }
    return entry;
  });
}

// Cookies are redacted unconditionally regardless of the cookie's own
// name -- a session/auth cookie's name is often arbitrary (e.g.
// career_os_admin), so name-pattern matching alone would miss it. The
// presence of a cookie value at all is what's sensitive.
function redactAllValues(list) {
  if (!Array.isArray(list)) return list;
  return list.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    return { ...entry, value: entry.value == null ? entry.value : REDACTED };
  });
}

function redactBodyText(text, mimeType) {
  if (typeof text !== 'string') return text;
  if (/json/i.test(mimeType || '')) {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(redactDeep(parsed));
    } catch {
      // fall through
    }
  }
  if (/x-www-form-urlencoded/i.test(mimeType || '')) {
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
  return text.replace(/("(?:password|passwd|pwd|actionToken|credential|secret|token)"\s*:\s*)"[^"]*"/gi, `$1"${REDACTED}"`);
}

function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? (val == null ? val : REDACTED) : redactDeep(val);
    }
    return out;
  }
  return value;
}

function sanitizeMessage(message) {
  if (!message) return message;
  return {
    ...message,
    cookies: redactAllValues(message.cookies),
    headers: redactNameValuePairs(message.headers),
    queryString: redactNameValuePairs(message.queryString),
    postData: message.postData ? {
      ...message.postData,
      params: redactNameValuePairs(message.postData.params),
      text: redactBodyText(message.postData.text, message.postData.mimeType),
    } : message.postData,
  };
}

const entries = har?.log?.entries;
if (Array.isArray(entries)) {
  for (const entry of entries) {
    entry.request = sanitizeMessage(entry.request);
    entry.response = sanitizeMessage(entry.response);
    if (typeof entry.request?.url === 'string') {
      entry.request.url = entry.request.url.replace(/([?&])([A-Za-z0-9_-]+)=[^&\s]+/g, (m, p, key) =>
        SENSITIVE_KEY_PATTERN.test(key) ? `${p}${key}=${REDACTED}` : m);
    }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(har, null, 2));
console.log(`Sanitized HAR written to ${path.resolve(outputPath)}`);
console.log('Spot-check it yourself before sharing -- this strips known-sensitive field names, not a substitute for review.');
