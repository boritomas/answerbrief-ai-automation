import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import type { ReactNode } from 'react';
import { colors, radii, spacing } from '../lib/theme';

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Button({ children, disabled, onPress, secondary }: { children: ReactNode; disabled?: boolean; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [
      styles.button,
      secondary ? styles.secondaryButton : styles.primaryButton,
      disabled ? styles.disabled : null,
      pressed && !disabled ? styles.pressed : null
    ]}>
      <Text style={[styles.buttonText, secondary ? styles.secondaryButtonText : null]}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, multiline, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#94A3B8"
        style={[styles.input, multiline ? styles.multiline : null, props.style]}
      />
    </View>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Body>{label}</Body>
    </View>
  );
}

export function EmptyState({ action, body, title }: { action?: ReactNode; body: string; title: string }) {
  return (
    <Card>
      <H2>{title}</H2>
      <Body>{body}</Body>
      {action}
    </Card>
  );
}

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: '#0F172A',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24
  },
  h1: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 39
  },
  h2: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.control,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  primaryButton: {
    backgroundColor: colors.primary
  },
  secondaryButton: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderWidth: 1
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButtonText: {
    color: colors.primaryDark
  },
  disabled: {
    opacity: 0.5
  },
  pressed: {
    transform: [{ scale: 0.99 }]
  },
  field: {
    gap: spacing.xs
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md
  },
  multiline: {
    minHeight: 132,
    paddingTop: spacing.md,
    textAlignVertical: 'top'
  },
  state: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center'
  }
});
