import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Body, Card, Eyebrow, H1, H2, Screen, styles } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { spacing } from '../../lib/theme';

const steps = ['Free Fit Check', 'Complete intake for a web order', 'Track status', 'View and share your brief'];

export default function HomeScreen() {
  const { email } = useAuth();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Welcome</Eyebrow>
          <H1>Walk into your interview knowing exactly what to say.</H1>
          <Body>{email ? `Signed in as ${email}.` : 'Sign in to view your AnswerBrief AI web orders.'}</Body>
        </Card>
        <Card>
          <H2>Mobile companion app</H2>
          <Body>Use this app for Fit Check, intake, secure file uploads, order status, brief viewing, support, and notifications. Purchases stay on the web product.</Body>
        </Card>
        <View style={{ gap: spacing.sm }}>
          {steps.map((step, index) => (
            <Card key={step}>
              <Text style={[styles.eyebrow, { fontSize: 14 }]}>Step {index + 1}</Text>
              <H2>{step}</H2>
            </Card>
          ))}
        </View>
        <Link href="/(tabs)/fit-check" style={styles.button}>
          <Text style={styles.buttonText}>Start Free Fit Check</Text>
        </Link>
      </Screen>
    </ScrollView>
  );
}
