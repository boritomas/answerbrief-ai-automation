import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
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
  uri: string;
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
  const maxUploadBytes = 8 * 1024 * 1024;

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
    const picked = { mimeType: file.mimeType, name: file.name, size: file.size, uri: file.uri };
    if (kind === 'resume') setResume(picked);
    if (kind === 'job_posting') setJobPosting(picked);
  }

  async function recordFile(file: PickedFile, uploadType: 'resume' | 'job_posting') {
    if (!token || !id) return;
    if (file.size && file.size > maxUploadBytes) {
      throw new Error(`${file.name} is larger than 8 MB.`);
    }
    const contentBase64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64
    });
    await api.recordUpload(token, id, {
      contentBase64,
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
      const uploadFailures: string[] = [];
      if (resume) {
        await recordFile(resume, 'resume').catch((error) => {
          uploadFailures.push(error instanceof Error ? error.message : 'Resume upload failed.');
        });
      }
      if (jobPosting) {
        await recordFile(jobPosting, 'job_posting').catch((error) => {
          uploadFailures.push(error instanceof Error ? error.message : 'Job posting upload failed.');
        });
      }
      track({ name: 'mobile_intake_submitted' });
      if (uploadFailures.length > 0) {
        setMessage(`Intake submitted, but ${uploadFailures.join(' ')}`);
      } else {
        router.replace(`/order/${id}`);
      }
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
          <Body>Signed in as {email}. Your files are uploaded through the authenticated AnswerBrief AI mobile API.</Body>
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
          <Body>PDF, Word, and text files up to 8 MB each.</Body>
          <Button secondary onPress={() => pick('resume')}>{resume ? `Resume: ${resume.name}` : 'Select resume'}</Button>
          <Button secondary onPress={() => pick('job_posting')}>{jobPosting ? `Job posting: ${jobPosting.name}` : 'Select job posting'}</Button>
        </Card>
        <Button disabled={loading || !intake.name || !intake.targetRole} onPress={submit}>{loading ? 'Submitting...' : 'Submit intake'}</Button>
        {message ? <Body>{message}</Body> : null}
      </Screen>
    </ScrollView>
  );
}
