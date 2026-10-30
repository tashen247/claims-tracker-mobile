import { useState } from 'react';
import { Text } from 'react-native';
import { ApiError, api } from '@/api';
import { useAuthStore } from '@/auth/store';
import { Screen } from '@/components/Screen';
import { AuthForm } from '@/features/auth/AuthForm';
import { useTheme } from '@/theme';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen>
      <Text style={{ color: colors.textMuted, marginBottom: 24, fontSize: 15 }}>
        Your account comes with demo motor warranty, funeral and legal policies so you can try a
        claim.
      </Text>
      <AuthForm
        mode="register"
        error={error}
        onSubmit={async (values) => {
          setError(null);
          try {
            await setSession(
              await api.register({
                email: values.email,
                password: values.password,
                fullName: values.fullName ?? '',
              }),
            );
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not create your account');
          }
        }}
      />
    </Screen>
  );
}
