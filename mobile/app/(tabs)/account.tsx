import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { Body, Button, Card, Eyebrow, H1, H2, Screen, styles } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { config } from '../../lib/config';
import { spacing } from '../../lib/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { email, signOut, token } = useAuth();

  async function requestDeletion() {
    if (!token) return;
    await api.support(token, 'Account deletion request', `Please delete the AnswerBrief AI mobile account and associated app access for ${email}.`);
    await Linking.openURL(`mailto:${config.supportEmail}?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20AnswerBrief%20AI%20account%20for%20${encodeURIComponent(email || '')}.`);
  }

  async function logout() {
    await signOut();
    router.replace('/sign-in');
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Account</Eyebrow>
          <H1>Your mobile access</H1>
          <Body>{email}</Body>
        </Card>
        <Card>
          <H2>Legal and support</H2>
          <Link href="/legal" style={styles.button}><Text style={styles.buttonText}>Privacy, Terms, Refund</Text></Link>
          <Button secondary onPress={requestDeletion}>Request account deletion</Button>
          <Body>Account deletion requests are reviewed by support so active orders and completed deliverables are handled correctly.</Body>
        </Card>
        <Button secondary onPress={logout}>Sign out</Button>
      </Screen>
    </ScrollView>
  );
}

