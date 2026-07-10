import Constants from 'expo-constants';

type ExtraConfig = {
  apiBaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra || {}) as ExtraConfig;

export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiBaseUrl || 'https://www.answer-brief.com',
  privacyUrl: 'https://www.answer-brief.com/privacy',
  termsUrl: 'https://www.answer-brief.com/terms',
  refundUrl: 'https://www.answer-brief.com/refund',
  supportEmail: 'support@answer-brief.com'
};

