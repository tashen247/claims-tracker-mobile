import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Text } from 'react-native';
import { z } from 'zod';
import { loginRequestSchema, registerRequestSchema } from '@claims/shared';
import { Button, TextField } from '../../components/ui';
import { useTheme } from '../../theme';

type Mode = 'login' | 'register';

const schemas = {
  login: loginRequestSchema.extend({ fullName: z.string().optional() }),
  register: registerRequestSchema,
};

export type AuthFormValues = { email: string; password: string; fullName?: string };

export function AuthForm({
  mode,
  onSubmit,
  error,
}: {
  mode: Mode;
  onSubmit: (values: AuthFormValues) => Promise<void>;
  error?: string | null;
}) {
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(schemas[mode] as unknown as z.ZodType<AuthFormValues, AuthFormValues>),
    defaultValues: { email: '', password: '', fullName: '' },
  });

  return (
    <>
      {mode === 'register' ? (
        <Controller
          control={control}
          name="fullName"
          render={({ field }) => (
            <TextField
              label="Full name"
              autoComplete="name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.fullName?.message}
            />
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={
              mode === 'register' ? 'At least 8 characters with a letter and a number' : undefined
            }
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
          />
        )}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: 12 }}>
          {error}
        </Text>
      ) : null}
      <Button
        label={mode === 'login' ? 'Log in' : 'Create account'}
        loading={isSubmitting}
        onPress={() => void handleSubmit(onSubmit)()}
      />
    </>
  );
}
