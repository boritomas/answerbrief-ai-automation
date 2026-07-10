import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Body, Card, EmptyState, Eyebrow, H1, H2, LoadingState, Screen, styles } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { spacing } from '../../lib/theme';
import type { OrderDetail, OrderEvent } from '../../lib/types';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([api.order(token, id), api.events(token, id)])
      .then(([orderResponse, eventResponse]) => {
        setOrder(orderResponse.order);
        setEvents(eventResponse.events);
      })
      .catch((error) => setMessage(error instanceof ApiError ? error.message : 'Unable to load order.'))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) {
    return <LoadingState label="Loading order..." />;
  }

  if (!order) {
    return <Screen><EmptyState title="Order unavailable" body={message || 'This order could not be loaded.'} /></Screen>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <Screen>
        <Card>
          <Eyebrow>Order status</Eyebrow>
          <H1>{order.packageName}</H1>
          <Body>{order.status}</Body>
          <Body>Payment: {order.paymentStatus} • Intake: {order.intakeStatus} • Brief: {order.briefStatus}</Body>
          <View style={{ gap: spacing.sm }}>
            <Link href={`/intake/${order.id}`} style={styles.button}><Text style={styles.buttonText}>Complete intake</Text></Link>
            <Link href={`/brief/${order.id}`} style={[styles.button, styles.secondaryButton]}><Text style={styles.secondaryButtonText}>View brief</Text></Link>
          </View>
        </Card>
        <Card>
          <H2>Timeline</H2>
          {events.length === 0 ? <Body>No events yet.</Body> : events.map((event) => (
            <View key={event.id}>
              <Body>{new Date(event.at).toLocaleString()}</Body>
              <H2>{event.event.replaceAll('_', ' ')}</H2>
              {event.message ? <Body>{event.message}</Body> : null}
            </View>
          ))}
        </Card>
      </Screen>
    </ScrollView>
  );
}

