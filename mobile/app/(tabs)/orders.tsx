import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, EmptyState, Eyebrow, H1, H2, LoadingState, Screen, styles } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { registerForBriefNotifications } from '../../lib/notifications';
import { spacing } from '../../lib/theme';
import type { OrderSummary } from '../../lib/types';

export default function OrdersScreen() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.orders(token);
      setOrders(response.orders);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function enableNotifications() {
    if (!token) return;
    const result = await registerForBriefNotifications(token).catch((error) => ({ registered: false, reason: String(error) }));
    setMessage(result.registered ? 'Brief-ready notifications are enabled.' : result.reason || 'Notifications were not enabled.');
  }

  if (loading) {
    return <LoadingState label="Loading orders..." />;
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <Screen>
        <Card>
          <Eyebrow>Orders</Eyebrow>
          <H1>Your interview prep</H1>
          <Body>Only existing AnswerBrief AI website orders appear here.</Body>
          <Button secondary onPress={enableNotifications}>Notify me when brief is ready</Button>
          {message ? <Body>{message}</Body> : null}
        </Card>
        {orders.length === 0 ? (
          <EmptyState title="No orders found" body="Sign in with the same email used for your web order. If the order is new, wait a moment and pull to refresh." />
        ) : (
          <View style={{ gap: spacing.md }}>
            {orders.map((order) => (
              <Card key={order.id}>
                <H2>{order.packageName}</H2>
                <Body>Status: {order.status}</Body>
                <Body>Intake: {order.intakeStatus} • Brief: {order.briefStatus}</Body>
                <Link href={`/order/${order.id}`} style={styles.button}>
                  <Text style={styles.buttonText}>Open order</Text>
                </Link>
              </Card>
            ))}
          </View>
        )}
      </Screen>
    </ScrollView>
  );
}
