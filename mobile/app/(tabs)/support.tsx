import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Body, Button, Card, Eyebrow, Field, H1, Screen } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { spacing } from '../../lib/theme';

export default function SupportScreen() {
  const { token } = useAuth();
  const [subject, setSubject] = useState('Mobile app support');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!token) return;
    setLoading(true);
    setStatus('');
    try {
      const response = await api.support(token, subject, message);
      setStatus(response.message || 'Support request received.');
      setMessage('');
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : 'Unable to send support request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Support</Eyebrow>
          <H1>Questions about your brief?</H1>
          <Body>Send a support request. For account deletion, use the Account tab.</Body>
        </Card>
        <Card>
          <Field label="Subject" onChangeText={setSubject} value={subject} />
          <Field label="Message" multiline onChangeText={setMessage} placeholder="Tell us what you need help with." value={message} />
          <Button disabled={loading || !message} onPress={submit}>{loading ? 'Sending...' : 'Send support request'}</Button>
          {status ? <Body>{status}</Body> : null}
        </Card>
      </Screen>
    </ScrollView>
  );
}

