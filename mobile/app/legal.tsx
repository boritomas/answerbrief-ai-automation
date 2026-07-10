import * as Linking from 'expo-linking';
import { ScrollView } from 'react-native';
import { Body, Button, Card, Eyebrow, H1, H2, Screen } from '../components/ui';
import { config } from '../lib/config';
import { spacing } from '../lib/theme';

export default function LegalScreen() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Legal</Eyebrow>
          <H1>Privacy, terms, and refund policy.</H1>
          <Body>These documents open from the production AnswerBrief AI website.</Body>
        </Card>
        <Card>
          <H2>Privacy Policy</H2>
          <Body>Review how AnswerBrief AI handles resume, job posting, account, and support information.</Body>
          <Button onPress={() => Linking.openURL(config.privacyUrl)}>Open Privacy</Button>
        </Card>
        <Card>
          <H2>Terms</H2>
          <Body>Review the service terms for the web product and mobile companion app.</Body>
          <Button onPress={() => Linking.openURL(config.termsUrl)}>Open Terms</Button>
        </Card>
        <Card>
          <H2>Refund Policy</H2>
          <Body>Review refund policy details for AnswerBrief AI web orders.</Body>
          <Button onPress={() => Linking.openURL(config.refundUrl)}>Open Refund Policy</Button>
        </Card>
      </Screen>
    </ScrollView>
  );
}
