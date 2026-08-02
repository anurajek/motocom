import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';

export default function Register() {
  const router = useRouter();
  const { registerEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [bike, setBike] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email || !password || !name) return setError('Fill all required fields');
    setLoading(true);
    setError('');
    try {
      await registerEmail(email.trim(), password, name.trim(), bike.trim() || undefined);
    } catch (e: any) {
      setError(e?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="register-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} testID="register-back-button" style={s.backBtn}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={colors.onSurface} />
            </Pressable>
          </View>
          <Text style={s.title}>Create account</Text>
          <Text style={s.sub}>Join the group. Ride connected.</Text>

          {!!error && (
            <View style={s.errorBox} testID="register-error">
              <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.form}>
            <FieldLabel label="Rider name *" />
            <TextInput
              style={s.input} placeholder="e.g. Rex Volt"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={name} onChangeText={setName}
              testID="register-name-input"
            />
            <FieldLabel label="Email *" />
            <TextInput
              style={s.input} placeholder="you@example.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none" keyboardType="email-address"
              value={email} onChangeText={setEmail}
              testID="register-email-input"
            />
            <FieldLabel label="Password *" />
            <TextInput
              style={s.input} placeholder="Min 6 chars"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              value={password} onChangeText={setPassword}
              testID="register-password-input"
            />
            <FieldLabel label="Your bike (optional)" />
            <TextInput
              style={s.input} placeholder="e.g. Ducati Monster"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={bike} onChangeText={setBike}
              testID="register-bike-input"
            />

            <Pressable
              style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}
              onPress={submit} disabled={loading}
              testID="register-submit-button"
            >
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={s.primaryText}>Create account</Text>}
            </Pressable>

            <View style={s.footerRow}>
              <Text style={s.footerText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable hitSlop={12} testID="go-login-button">
                  <Text style={s.footerLink}>Sign in</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={s.fieldLabel}>{label}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  header: { marginBottom: spacing.md, marginTop: -spacing.sm },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: '900' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 14, marginTop: spacing.xs, marginBottom: spacing.lg },
  form: { gap: spacing.sm },
  fieldLabel: { color: colors.onSurfaceSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.md },
  input: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, color: colors.onSurface, fontSize: 15,
  },
  primaryBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl,
  },
  primaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  footerLink: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  errorBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.12)', borderColor: colors.error, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
