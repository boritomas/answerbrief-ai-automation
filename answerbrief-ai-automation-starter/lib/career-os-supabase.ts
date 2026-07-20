import { Pool } from 'pg';

type JsonRecord = Record<string, unknown>;

type SelectOptions = {
  rangeEnd?: number;
  rangeStart?: number;
};

type SupabaseConfiguration = {
  databaseUrl: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

let pool: Pool | null = null;

export function cleanSupabaseEnv(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

export function getCareerOsSupabaseConfiguration(): SupabaseConfiguration {
  return {
    databaseUrl: cleanSupabaseEnv(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    serviceRoleKey: cleanSupabaseEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrl: cleanSupabaseEnv(process.env.SUPABASE_URL),
  };
}

export function careerOsSupabaseConfigured() {
  const configuration = getCareerOsSupabaseConfiguration();
  return Boolean(
    (configuration.databaseUrl || (configuration.supabaseUrl && configuration.serviceRoleKey))
      && !configuration.serviceRoleKey.startsWith('['),
  );
}

export async function careerOsSelectRows(table: string, query: string, options: SelectOptions = {}): Promise<JsonRecord[]> {
  const configuration = getCareerOsSupabaseConfiguration();
  if (configuration.databaseUrl) {
    try {
      return await pgSelectRows(configuration.databaseUrl, table, query, options);
    } catch (error) {
      resetPool();
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) throw error;
    }
  }
  return await restSelectRows(configuration, table, query, options);
}

export async function careerOsPatchRowById(table: string, id: string, patch: JsonRecord) {
  const configuration = getCareerOsSupabaseConfiguration();
  if (configuration.databaseUrl) {
    try {
      await pgPatchRowById(configuration.databaseUrl, table, id, patch);
      return;
    } catch (error) {
      resetPool();
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) throw error;
    }
  }
  await restPatchRowById(configuration, table, id, patch);
}

export async function careerOsUpsertRows(table: string, rows: JsonRecord | JsonRecord[]) {
  const configuration = getCareerOsSupabaseConfiguration();
  if (configuration.databaseUrl) {
    try {
      await pgUpsertRows(configuration.databaseUrl, table, rows);
      return;
    } catch (error) {
      resetPool();
      if (!canFallbackToRest(configuration) || !shouldFallbackToRest(error)) throw error;
    }
  }
  await restUpsertRows(configuration, table, rows);
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

function shouldFallbackToRest(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return [
    'password authentication failed',
    'authentication query failed',
    'connection timeout',
    'connection terminated',
    'eauthquery',
    'timeout',
    'terminating connection',
    'connection to database not available',
  ].some((needle) => message.includes(needle));
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
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function resetPool() {
  const currentPool = pool;
  pool = null;
  void currentPool?.end().catch(() => {});
}
