import type { ExpoConfig } from 'expo/config';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.answer-brief.com';

const config: ExpoConfig = {
  name: 'AnswerBrief AI',
  slug: 'answerbrief-ai',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'answerbrief',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#F8FAFC'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.nieveslabs.answerbrief',
    infoPlist: {
      NSDocumentsFolderUsageDescription: 'AnswerBrief AI lets you select resume and job posting documents for your interview brief.',
      UIBackgroundModes: ['remote-notification']
    }
  },
  android: {
    package: 'com.nieveslabs.answerbrief',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#2563EB'
    },
    permissions: ['POST_NOTIFICATIONS']
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-document-picker',
    'expo-notifications',
    'expo-font'
  ],
  extra: {
    apiBaseUrl,
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined
    }
  }
};

export default config;
