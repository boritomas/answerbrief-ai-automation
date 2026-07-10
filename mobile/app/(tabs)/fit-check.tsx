import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Eyebrow, Field, H1, H2, Screen } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { track } from '../../lib/analytics';
import { colors, spacing } from '../../lib/theme';
import type { FitCheckResult } from '../../lib/types';

export default function FitCheckScreen() {
  const [jobTitle, setJobTitle] = useState('');
  const [industry, setIndustry] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Senior');
  const [result, setResult] = useState<FitCheckResult | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.fitCheck({ experienceLevel, industry, jobTitle });
      setResult(response);
      track({ name: 'mobile_fit_check_completed', properties: { score: response.score } });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to run Fit Check.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Free Fit Check</Eyebrow>
          <H1>See where your interview prep should focus.</H1>
          <Body>This free companion-app check helps you quickly spot interview prep strengths and gaps.</Body>
        </Card>
        <Card>
          <Field label="Target job title" onChangeText={setJobTitle} placeholder="Senior Compliance Analyst" value={jobTitle} />
          <Field label="Industry" onChangeText={setIndustry} placeholder="Financial services, federal, telecom..." value={industry} />
          <Field label="Experience level" onChangeText={setExperienceLevel} placeholder="Entry, mid, senior, executive" value={experienceLevel} />
          <Button disabled={loading || !jobTitle || !industry || !experienceLevel} onPress={submit}>{loading ? 'Running...' : 'Run Fit Check'}</Button>
          {message ? <Body>{message}</Body> : null}
        </Card>
        {result ? (
          <Card>
            <Eyebrow>Fit Check Result</Eyebrow>
            <Text style={{ color: colors.primary, fontSize: 46, fontWeight: '900' }}>{result.score}</Text>
            <H2>{result.recommendedPackageName}</H2>
            <Body>{result.alignment}</Body>
            <View style={{ gap: spacing.sm }}>
              <H2>Strengths</H2>
              {result.strengths.map((item) => <Body key={item}>• {item}</Body>)}
              <H2>Gaps to prepare</H2>
              {result.gaps.map((item) => <Body key={item}>• {item}</Body>)}
            </View>
          </Card>
        ) : null}
      </Screen>
    </ScrollView>
  );
}
