import { config } from './config';
import type { ApiResponse, BriefResponse, FitCheckResult, IntakeInput, OrderDetail, OrderEvent, OrderSummary, User } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = {
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected server response.' })) as ApiResponse<T>;

  if (!response.ok) {
    throw new ApiError(data.error || 'Something went wrong.', response.status);
  }

  return data as T;
}

export const api = {
  startAuth(email: string) {
    return request<{ email: string; message: string; otpDeliveryConfigured: boolean }>('/api/mobile/auth/start', {
      method: 'POST',
      body: { email }
    });
  },
  verifyAuth(email: string, otp: string) {
    return request<{ token: string; tokenType: 'Bearer' }>('/api/mobile/auth/verify', {
      method: 'POST',
      body: { email, otp }
    });
  },
  me(token: string) {
    return request<{ user: User }>('/api/mobile/me', { token });
  },
  fitCheck(input: { experienceLevel: string; industry: string; jobTitle: string }) {
    return request<FitCheckResult>('/api/mobile/fit-check', {
      method: 'POST',
      body: input
    });
  },
  orders(token: string) {
    return request<{ orders: OrderSummary[] }>('/api/mobile/orders', { token });
  },
  order(token: string, id: string) {
    return request<{ order: OrderDetail }>(`/api/mobile/orders/${id}`, { token });
  },
  submitIntake(token: string, id: string, intake: IntakeInput) {
    return request<{ order: OrderSummary }>(`/api/mobile/orders/${id}/intake`, {
      method: 'POST',
      token,
      body: intake
    });
  },
  presignUpload(token: string, filename: string, contentType: string) {
    return request<{ uploadUrl?: string }>('/api/mobile/uploads/presign', {
      method: 'POST',
      token,
      body: { contentType, filename }
    });
  },
  recordUpload(token: string, id: string, file: { contentType?: string; filename: string; size?: number; uploadType: 'resume' | 'job_posting' }) {
    return request<{ accepted: boolean; storageConfigured: boolean; uploadStatus: string }>(`/api/mobile/orders/${id}/uploads`, {
      method: 'POST',
      token,
      body: file
    });
  },
  brief(token: string, id: string) {
    return request<BriefResponse>(`/api/mobile/orders/${id}/brief`, { token });
  },
  events(token: string, id: string) {
    return request<{ events: OrderEvent[] }>(`/api/mobile/orders/${id}/events`, { token });
  },
  pushToken(token: string, pushToken: string, platform: string) {
    return request<{ accepted: boolean; message: string; storageConfigured: boolean }>('/api/mobile/push-token', {
      method: 'POST',
      token,
      body: { platform, token: pushToken }
    });
  },
  support(token: string, subject: string, message: string) {
    return request<{ accepted: boolean; message: string; supportEmail: string }>('/api/mobile/support', {
      method: 'POST',
      token,
      body: { message, subject }
    });
  }
};

