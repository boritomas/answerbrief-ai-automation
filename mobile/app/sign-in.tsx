import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Card, Body, Eyebrow, Field, H1 } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { track } from '../lib/analytics';
import { spacing } from '../lib/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.startAuth(email);
      setEmail(response.email);
      setMessage(response.message);
      setStep('otp');
      track({ name: 'mobile_auth_started' });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to start sign-in.');
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.verifyAuth(email, otp);
      await setSession(response.token);
      track({ name: 'mobile_auth_verified' });
      router.replace('/(tabs)');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to verify code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ gap: spacing.lg, padding: spacing.lg }}>
          <Card>
            <Eyebrow>AnswerBrief AI Mobile</Eyebrow>
            <H1>Interview prep, wherever you are.</H1>
            <Body>Sign in with the same email used for your AnswerBrief AI web order to complete intake, track your brief, and view completed work.</Body>
          </Card>
          <Card>
            {step === 'email' ? (
              <>
                <Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="you@example.com" value={email} />
                <Button disabled={loading || !email} onPress={start}>{loading ? 'Sending...' : 'Continue'}</Button>
              </>
            ) : (
              <>
                <Field editable={false} label="Email" value={email} />
                <Field keyboardType="number-pad" label="Sign-in code" onChangeText={setOtp} placeholder="Enter your code" value={otp} />
                <Button disabled={loading || !otp} onPress={verify}>{loading ? 'Checking...' : 'Sign in'}</Button>
                <Button secondary onPress={() => setStep('email')}>Use another email</Button>
              </>
            )}
            {message ? <Body>{message}</Body> : null}
          </Card>
          <Body>Existing AnswerBrief AI customers can access their interview prep after signing in.</Body>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
