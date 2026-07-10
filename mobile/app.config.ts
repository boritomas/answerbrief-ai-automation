import type { ExpoConfig } from 'expo/config';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.answer-brief.com';
const easProjectId = '36ae905e-d073-4c1b-ae37-4ded41c58c96';

const config: ExpoConfig = {
  name: 'AnswerBrief AI',
  owner: 'tomasnieves',
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
  runtimeVersion: {
    policy: 'appVersion'
  },
  updates: easProjectId
    ? {
        url: `https://u.expo.dev/${easProjectId}`
      }
    : {
        enabled: false
      },
  ios: {
    buildNumber: '1',
    supportsTablet: true,
    bundleIdentifier: 'com.nieveslabs.answerbrief',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSDocumentsFolderUsageDescription: 'AnswerBrief AI lets you select resume and job posting documents for your interview brief.',
      UIBackgroundModes: ['remote-notification']
    }
  },
  android: {
    package: 'com.nieveslabs.answerbrief',
    versionCode: 1,
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
      projectId: easProjectId
    }
  }
};

export default config;
