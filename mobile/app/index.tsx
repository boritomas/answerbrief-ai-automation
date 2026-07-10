import { Redirect } from 'expo-router';
import { LoadingState } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { booting, token } = useAuth();

  if (booting) {
    return <LoadingState label="Opening AnswerBrief AI..." />;
  }

  return <Redirect href={token ? '/(tabs)' : '/sign-in'} />;
}

