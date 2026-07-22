import { Pool } from 'pg';

type JsonRecord = Record<string, unknown>;

type SelectOptions = {
  rangeEnd?: number;
  rangeStart?: number;
};

type SupabaseConfiguration = {
  databaseUrl: string;
  pgTransportEnabled: boolean;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export type CareerOsTransportStatus =
  | 'pg_healthy'
  | 'rest_primary'
  | 'rest_fallback_active'
  | 'degraded_snapshot'
  | 'database_unavailable'
  | 'configuration_error';

export type CareerOsCircuitState = 'closed' | 'open' | 'half_open';

type CareerOsIncidentRecord = {
  classification: string;
  component: 'database_transport';
  detectedAt: string;
  evidence: string;
  id: string;
  recoveryResult: 'fallback_active' | 'manual_recovery_required' | 'resolved';
  resolvedAt?: string;
  transport: 'pg' | 'rest';
};

type CareerOsTransportHealth = {
  consecutivePgFailures: number;
  incidents: CareerOsIncidentRecord[];
  lastFailureAt?: string;
  lastFailureMessage?: string;
  lastHealthyAt?: string;
  lastProbeAt?: string;
  lastRestSuccessAt?: string;
  lastSuccessTransport?: 'pg' | 'rest';
  probeEligibleAt?: string;
  state: CareerOsCircuitState;
  status: CareerOsTransportStatus;
};

let pool: Pool | null = null;
const PG_FAILURE_THRESHOLD = 2;
const HALF_OPEN_PROBE_INTERVAL_MS = 5 * 60 * 1000;
const incidentLog: CareerOsIncidentRecord[] = [];
const transportHealth: CareerOsTransportHealth = {
  consecutivePgFailures: 0,
  incidents: incidentLog,
  state: 'closed',
  status: 'configuration_error',
};

export function cleanSupabaseEnv(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

export function getCareerOsSupabaseConfiguration(): SupabaseConfiguration {
  return {
    databaseUrl: cleanSupabaseEnv(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    pgTransportEnabled: cleanSupabaseEnv(process.env.CAREER_OS_PG_TRANSPORT_ENABLED) === '1',
    serviceRoleKey: cleanSupabaseEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrl: cleanSupabaseEnv(process.env.SUPABASE_URL),
  };
}

export function careerOsSupabaseConfigured() {
  const configuration = getCareerOsSupabaseConfiguration();
  return Boolean(
    ((configuration.pgTransportEnabled && configuration.databaseUrl) || (configuration.supabaseUrl && configuration.serviceRoleKey))
      && !configuration.serviceRoleKey.startsWith('['),
  );
}

export function getCareerOsTransportHealth() {
  return {
    ...transportHealth,
    incidents: [...incidentLog],
  };
}

export async function careerOsSelectRows(table: string, query: string, options: SelectOptions = {}): Promise<JsonRecord[]> {
  const configuration = getCareerOsSupabaseConfiguration();
  primeTransportStatus(configuration);
  if (shouldUsePgTransport(configuration) && shouldAttemptPg()) {
    try {
      const rows = await pgSelectRows(configuration.databaseUrl, table, query, options);
      markPgSuccess();
      return rows;
    } catch (error) {
      resetPool();
      markPgFailure(error);
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) {
        markTransportUnavailable(error, 'pg');
        throw error;
      }
    }
  }
  try {
    const rows = await restSelectRows(configuration, table, query, options);
    markRestSuccess(configuration);
    return rows;
  } catch (error) {
    markTransportUnavailable(error, 'rest');
    throw error;
  }
}

export async function careerOsPatchRowById(table: string, id: string, patch: JsonRecord) {
  const configuration = getCareerOsSupabaseConfiguration();
  primeTransportStatus(configuration);
  if (shouldUsePgTransport(configuration) && shouldAttemptPg()) {
    try {
      await pgPatchRowById(configuration.databaseUrl, table, id, patch);
      markPgSuccess();
      return;
    } catch (error) {
      resetPool();
      markPgFailure(error);
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) {
        markTransportUnavailable(error, 'pg');
        throw error;
      }
    }
  }
  try {
    await restPatchRowById(configuration, table, id, patch);
    markRestSuccess(configuration);
  } catch (error) {
    markTransportUnavailable(error, 'rest');
    throw error;
  }
}

export async function careerOsPatchRows(table: string, query: string, patch: JsonRecord): Promise<JsonRecord[]> {
  const configuration = getCareerOsSupabaseConfiguration();
  primeTransportStatus(configuration);
  if (shouldUsePgTransport(configuration) && shouldAttemptPg()) {
    try {
      const rows = await pgPatchRows(configuration.databaseUrl, table, query, patch);
      markPgSuccess();
      return rows;
    } catch (error) {
      resetPool();
      markPgFailure(error);
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) {
        markTransportUnavailable(error, 'pg');
        throw error;
      }
    }
  }
  try {
    const rows = await restPatchRows(configuration, table, query, patch);
    markRestSuccess(configuration);
    return rows;
  } catch (error) {
    markTransportUnavailable(error, 'rest');
    throw error;
  }
}

export async function careerOsUpsertRows(table: string, rows: JsonRecord | JsonRecord[]) {
  const configuration = getCareerOsSupabaseConfiguration();
  primeTransportStatus(configuration);
  if (shouldUsePgTransport(configuration) && shouldAttemptPg()) {
    try {
      await pgUpsertRows(configuration.databaseUrl, table, rows);
      markPgSuccess();
      return;
    } catch (error) {
      resetPool();
      markPgFailure(error);
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) {
        markTransportUnavailable(error, 'pg');
        throw error;
      }
    }
  }
  try {
    await restUpsertRows(configuration, table, rows);
    markRestSuccess(configuration);
  } catch (error) {
    markTransportUnavailable(error, 'rest');
    throw error;
  }
}

async function restSelectRows(configuration: SupabaseConfiguration, table: string, query: string, options: SelectOptions) {
  requireRestConfiguration(configuration);
  const headers: Record<string, string> = {
    apikey: configuration.serviceRoleKey,
    Authorization: `Bearer ${configuration.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
  if (typeof options.rangeStart === 'number' && typeof options.rangeEnd === 'number') {
    headers.Range = `${options.rangeStart}-${options.rangeEnd}`;
  }

  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${table}?${query}`, {
    cache: 'no-store',
    headers,
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} query failed with status ${response.status}.`);
  }

  return await response.json() as JsonRecord[];
}

async function restPatchRowById(configuration: SupabaseConfiguration, table: string, id: string, patch: JsonRecord) {
  requireRestConfiguration(configuration);
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    body: JSON.stringify(patch),
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`Career OS ${table} update failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
}

async function restPatchRows(configuration: SupabaseConfiguration, table: string, query: string, patch: JsonRecord) {
  requireRestConfiguration(configuration);
  const params = new URLSearchParams(query);
  if (!params.has('select')) params.set('select', '*');
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
    body: JSON.stringify(patch),
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    method: 'PATCH',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`Career OS ${table} conditional update failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
  return await response.json() as JsonRecord[];
}

async function restUpsertRows(configuration: SupabaseConfiguration, table: string, rows: JsonRecord | JsonRecord[]) {
  requireRestConfiguration(configuration);
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    body: JSON.stringify(rows),
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`Career OS ${table} upsert failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
}

function requireRestConfiguration(configuration: SupabaseConfiguration) {
  if (!configuration.supabaseUrl || !configuration.serviceRoleKey || configuration.serviceRoleKey.startsWith('[')) {
    throw new Error('Career OS Supabase service configuration is unavailable.');
  }
}

function canFallbackToRest(configuration: SupabaseConfiguration) {
  return Boolean(configuration.supabaseUrl && configuration.serviceRoleKey && !configuration.serviceRoleKey.startsWith('['));
}

function shouldUsePgTransport(configuration: SupabaseConfiguration) {
  return Boolean(configuration.pgTransportEnabled && configuration.databaseUrl);
}

function shouldFallbackToRest(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return [
    'ecircuitbreaker',
    'too many authentication failures',
    'password authentication failed',
    'authentication query failed',
    'connection timeout',
    'connection terminated',
    'eauthquery',
    'timeout',
    'timeout expired',
    'terminating connection',
    'connection to database not available',
    'connect etimedout',
  ].some((needle) => message.includes(needle));
}

function primeTransportStatus(configuration: SupabaseConfiguration) {
  if (shouldUsePgTransport(configuration)) {
    transportHealth.status = transportHealth.state === 'open' ? 'rest_fallback_active' : 'pg_healthy';
    return;
  }
  if (canFallbackToRest(configuration)) {
    transportHealth.status = 'rest_primary';
    transportHealth.state = 'closed';
    transportHealth.probeEligibleAt = undefined;
    return;
  }
  transportHealth.status = 'configuration_error';
  transportHealth.state = 'closed';
}

function shouldAttemptPg() {
  if (transportHealth.state === 'closed') return true;
  const now = Date.now();
  if (!transportHealth.probeEligibleAt) return true;
  if (now >= Date.parse(transportHealth.probeEligibleAt)) {
    transportHealth.state = 'half_open';
    transportHealth.lastProbeAt = new Date(now).toISOString();
    return true;
  }
  transportHealth.status = 'rest_fallback_active';
  return false;
}

function markPgSuccess() {
  const now = new Date().toISOString();
  transportHealth.consecutivePgFailures = 0;
  transportHealth.lastFailureMessage = undefined;
  transportHealth.lastHealthyAt = now;
  transportHealth.lastSuccessTransport = 'pg';
  transportHealth.state = 'closed';
  transportHealth.status = 'pg_healthy';
  resolveOpenIncident('pg');
}

function markPgFailure(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || 'pg read failed');
  const now = new Date().toISOString();
  transportHealth.consecutivePgFailures += 1;
  transportHealth.lastFailureAt = now;
  transportHealth.lastFailureMessage = message;
  if (transportHealth.consecutivePgFailures >= PG_FAILURE_THRESHOLD) {
    transportHealth.state = 'open';
    transportHealth.status = 'rest_fallback_active';
    transportHealth.probeEligibleAt = new Date(Date.now() + HALF_OPEN_PROBE_INTERVAL_MS).toISOString();
    recordIncident(message, 'pg', 'fallback_active');
    return;
  }
  transportHealth.state = 'half_open';
}

function markRestSuccess(configuration: SupabaseConfiguration) {
  const now = new Date().toISOString();
  transportHealth.lastRestSuccessAt = now;
  transportHealth.lastSuccessTransport = 'rest';
  if (shouldUsePgTransport(configuration) && transportHealth.state !== 'closed') {
    transportHealth.status = 'rest_fallback_active';
    return;
  }
  transportHealth.status = canFallbackToRest(configuration) ? 'rest_primary' : 'pg_healthy';
  if (!shouldUsePgTransport(configuration)) {
    transportHealth.consecutivePgFailures = 0;
    transportHealth.lastFailureAt = undefined;
    transportHealth.lastFailureMessage = undefined;
    transportHealth.probeEligibleAt = undefined;
    transportHealth.state = 'closed';
    resolveOpenIncident('pg');
  }
}

function markTransportUnavailable(error: unknown, transport: 'pg' | 'rest') {
  const message = String(error instanceof Error ? error.message : error || 'database unavailable');
  transportHealth.lastFailureAt = new Date().toISOString();
  transportHealth.lastFailureMessage = message;
  transportHealth.status = 'database_unavailable';
  recordIncident(message, transport, 'manual_recovery_required');
}

function recordIncident(evidence: string, transport: 'pg' | 'rest', recoveryResult: CareerOsIncidentRecord['recoveryResult']) {
  const classification = normalizeIncidentClassification(evidence);
  const existing = incidentLog.find((incident) => !incident.resolvedAt && incident.classification === classification && incident.transport === transport);
  if (existing) return;
  incidentLog.unshift({
    classification,
    component: 'database_transport',
    detectedAt: new Date().toISOString(),
    evidence,
    id: `incident-${transport}-${Date.now()}`,
    recoveryResult,
    transport,
  });
  incidentLog.splice(20);
}

function resolveOpenIncident(transport: 'pg' | 'rest') {
  const openIncident = incidentLog.find((incident) => !incident.resolvedAt && incident.transport === transport);
  if (!openIncident) return;
  openIncident.resolvedAt = new Date().toISOString();
  openIncident.recoveryResult = 'resolved';
}

function normalizeIncidentClassification(message: string) {
  const lowered = message.toLowerCase();
  if (lowered.includes('password authentication failed')) return 'authentication_failed';
  if (lowered.includes('timeout')) return 'timeout';
  if (lowered.includes('connection terminated')) return 'connection_terminated';
  if (lowered.includes('configuration')) return 'configuration_error';
  return 'database_transport_failure';
}

async function pgSelectRows(databaseUrl: string, table: string, query: string, options: SelectOptions) {
  const parsed = parseSupabaseQuery(query);
  const values: unknown[] = [];
  const whereClauses = parsed.filters.map((filter) => {
    values.push(filter.value);
    return `${quoteIdent(filter.column)} = $${values.length}`;
  });
  const orderClause = parsed.orders.length
    ? ` ORDER BY ${parsed.orders.map((order) => `${quoteIdent(order.column)} ${order.direction}${order.nulls}`).join(', ')}`
    : '';
  let sql = `SELECT * FROM ${quoteIdent(table)}`;
  if (whereClauses.length) sql += ` WHERE ${whereClauses.join(' AND ')}`;
  sql += orderClause;

  const rangeStart = typeof options.rangeStart === 'number' ? options.rangeStart : 0;
  const explicitLimit = parsed.limit ?? (
    typeof options.rangeStart === 'number' && typeof options.rangeEnd === 'number'
      ? options.rangeEnd - options.rangeStart + 1
      : undefined
  );
  if (typeof explicitLimit === 'number') {
    values.push(explicitLimit);
    sql += ` LIMIT $${values.length}`;
  }
  if (rangeStart > 0) {
    values.push(rangeStart);
    sql += ` OFFSET $${values.length}`;
  }

  const result = await getPool(databaseUrl).query(sql, values);
  return result.rows as JsonRecord[];
}

async function pgPatchRowById(databaseUrl: string, table: string, id: string, patch: JsonRecord) {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  const values: unknown[] = [];
  const setClauses = entries.map(([key, value]) => {
    values.push(serializeValue(value));
    const placeholder = value !== null && typeof value === 'object'
      ? `$${values.length}::jsonb`
      : `$${values.length}`;
    return `${quoteIdent(key)} = ${placeholder}`;
  });
  values.push(id);
  const sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE id = $${values.length}`;
  await getPool(databaseUrl).query(sql, values);
}

async function pgPatchRows(databaseUrl: string, table: string, query: string, patch: JsonRecord) {
  const entries = Object.entries(patch);
  if (!entries.length) return [];
  const parsed = parseSupabaseQuery(query);
  const values: unknown[] = [];
  const setClauses = entries.map(([key, value]) => {
    values.push(serializeValue(value));
    const placeholder = value !== null && typeof value === 'object'
      ? `$${values.length}::jsonb`
      : `$${values.length}`;
    return `${quoteIdent(key)} = ${placeholder}`;
  });
  const whereClauses = parsed.filters.map((filter) => {
    values.push(filter.value);
    return `${quoteIdent(filter.column)} = $${values.length}`;
  });
  let sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')}`;
  if (whereClauses.length) sql += ` WHERE ${whereClauses.join(' AND ')}`;
  sql += ' RETURNING *';
  const result = await getPool(databaseUrl).query(sql, values);
  return result.rows as JsonRecord[];
}

async function pgUpsertRows(databaseUrl: string, table: string, rows: JsonRecord | JsonRecord[]) {
  const rowList = Array.isArray(rows) ? rows : [rows];
  if (!rowList.length) return;
  const columns = Array.from(new Set(rowList.flatMap((row) => Object.keys(row))));
  const values: unknown[] = [];
  const tuples = rowList.map((row) => {
    const placeholders = columns.map((column) => {
      const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null;
      values.push(serializeValue(value));
      return value !== null && typeof value === 'object'
        ? `$${values.length}::jsonb`
        : `$${values.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const updateColumns = columns.filter((column) => column !== 'id');
  const sql = `
    INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')})
    VALUES ${tuples.join(', ')}
    ON CONFLICT (id) DO UPDATE
    SET ${updateColumns.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(', ')}
  `;
  await getPool(databaseUrl).query(sql, values);
}

function parseSupabaseQuery(query: string) {
  const params = new URLSearchParams(query);
  const filters: Array<{ column: string; value: string }> = [];
  const orders: Array<{ column: string; direction: 'ASC' | 'DESC'; nulls: '' | ' NULLS FIRST' | ' NULLS LAST' }> = [];
  let limit: number | undefined;

  for (const [key, value] of Array.from(params.entries())) {
    if (key === 'select') continue;
    if (key === 'limit') {
      const parsed = Number(value);
      limit = Number.isFinite(parsed) ? parsed : undefined;
      continue;
    }
    if (key === 'order') {
      for (const part of value.split(',')) {
        const [column, directionToken, nullsToken] = part.split('.');
        if (!column) continue;
        orders.push({
          column,
          direction: directionToken === 'asc' ? 'ASC' : 'DESC',
          nulls: nullsToken === 'nullsfirst' ? ' NULLS FIRST' : nullsToken === 'nullslast' ? ' NULLS LAST' : '',
        });
      }
      continue;
    }
    if (value.startsWith('eq.')) {
      filters.push({ column: key, value: decodeURIComponent(value.slice(3)) });
    }
  }

  return { filters, limit, orders };
}

function quoteIdent(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function serializeValue(value: unknown) {
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value ?? null;
}

function getPool(databaseUrl: string) {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 5000,
      max: 5,
      query_timeout: 4000,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 4000,
    });
  }
  return pool;
}

function resetPool() {
  const currentPool = pool;
  pool = null;
  void currentPool?.end().catch(() => {});
}
