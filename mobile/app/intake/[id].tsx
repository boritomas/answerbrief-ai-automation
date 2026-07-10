import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Body, Button, Card, Eyebrow, Field, H1, H2, Screen } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { track } from '../../lib/analytics';
import { spacing } from '../../lib/theme';
import type { IntakeInput } from '../../lib/types';

type PickedFile = {
  mimeType?: string;
  name: string;
  size?: number;
};

export default function IntakeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { email, token } = useAuth();
  const [intake, setIntake] = useState<IntakeInput>({
    careerLane: 'operations',
    name: '',
    targetRole: ''
  });
  const [resume, setResume] = useState<PickedFile | null>(null);
  const [jobPosting, setJobPosting] = useState<PickedFile | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function patch(field: keyof IntakeInput, value: string) {
    setIntake((current) => ({ ...current, [field]: value }));
  }

  async function pick(kind: 'resume' | 'job_posting') {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    });
    if (result.canceled) return;
    const file = result.assets[0];
    const picked = { mimeType: file.mimeType, name: file.name, size: file.size };
    if (kind === 'resume') setResume(picked);
    if (kind === 'job_posting') setJobPosting(picked);
  }

  async function recordFile(file: PickedFile, uploadType: 'resume' | 'job_posting') {
    if (!token || !id) return;
    await api.presignUpload(token, file.name, file.mimeType || 'application/octet-stream').catch(() => undefined);
    await api.recordUpload(token, id, {
      contentType: file.mimeType,
      filename: file.name,
      size: file.size,
      uploadType
    });
  }

  async function submit() {
    if (!token || !id) return;
    setLoading(true);
    setMessage('');
    try {
      await api.submitIntake(token, id, intake);
      if (resume) await recordFile(resume, 'resume');
      if (jobPosting) await recordFile(jobPosting, 'job_posting');
      track({ name: 'mobile_intake_submitted' });
      setMessage('Intake submitted. Your order status will update after review.');
      router.replace(`/order/${id}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to submit intake.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Secure intake</Eyebrow>
          <H1>Send the details for your brief.</H1>
          <Body>Signed in as {email}. Uploads are recorded through the mobile API; direct file storage depends on the production backend configuration.</Body>
        </Card>
        <Card>
          <Field label="Name" onChangeText={(value) => patch('name', value)} value={intake.name} />
          <Field label="Target role" onChangeText={(value) => patch('targetRole', value)} value={intake.targetRole} />
          <Field label="Target company" onChangeText={(value) => patch('targetCompany', value)} value={intake.targetCompany} />
          <Field label="Interview date" onChangeText={(value) => patch('interviewDate', value)} placeholder="Optional" value={intake.interviewDate} />
          <Field label="Career lane" onChangeText={(value) => patch('careerLane', value)} placeholder="operations, compliance, federal..." value={intake.careerLane} />
          <Field label="Job posting text" multiline onChangeText={(value) => patch('jobPostingText', value)} value={intake.jobPostingText} />
          <Field label="Notes" multiline onChangeText={(value) => patch('notes', value)} value={intake.notes} />
        </Card>
        <Card>
          <H2>Uploads</H2>
          <Button secondary onPress={() => pick('resume')}>{resume ? `Resume: ${resume.name}` : 'Select resume'}</Button>
          <Button secondary onPress={() => pick('job_posting')}>{jobPosting ? `Job posting: ${jobPosting.name}` : 'Select job posting'}</Button>
        </Card>
        <Button disabled={loading || !intake.name || !intake.targetRole} onPress={submit}>{loading ? 'Submitting...' : 'Submit intake'}</Button>
        {message ? <Body>{message}</Body> : null}
      </Screen>
    </ScrollView>
  );
}

