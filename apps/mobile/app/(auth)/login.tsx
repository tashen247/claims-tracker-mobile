import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError, api } from '@/api';
import { useAuthStore } from '@/auth/store';
import { Screen } from '@/components/Screen';
import { AuthForm } from '@/features/auth/AuthForm';
import { spacing, useTheme } from '@/theme';

export default function LoginScreen() {
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          Claims Tracker
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Submit a claim in minutes, even without signal, and follow every step to payout.
        </Text>
      </View>
      <AuthForm
        mode="login"
        error={error}
        onSubmit={async (values) => {
          setError(null);
          try {
            await setSession(await api.login({ email: values.email, password: values.password }));
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not log in');
          }
        }}
      />
      <View style={styles.footer}>
        <Text style={{ color: colors.textMuted }}>New here? </Text>
        <Link href="/register" style={{ color: colors.primary, fontWeight: '600' }}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: spacing.xxl * 1.5, marginBottom: spacing.xxl, gap: spacing.sm },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 16, lineHeight: 22 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
