import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';
import { api } from '@/src/api';

WebBrowser.maybeCompleteAuthSession();

const HERO_IMG = 'https://images.unsplash.com/photo-1704977733553-e3d7d92c4d66?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwyfHxtb3RvcmN5Y2xlJTIwcmlkZXIlMjBoZWxtZXQlMjBwb3J0cmFpdCUyMGRhcmslMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc4NTY2ODQwMnww&ixlib=rb-4.1.0&q=85';

export default function Login() {
  const router = useRouter();
  const { signInEmail, applyToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const capturedUrlRef = useRef<string | null>(null);

  const processSessionId = useCallback(async (sid: string) => {
    setGoogleLoading(true);
    try {
      const res = await api<{ session_token: string; user: any }>('/auth/session', {
        method: 'POST',
        body: JSON.stringify({ session_id: sid }),
      });
      await applyToken(res.session_token);
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  }, [applyToken]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      capturedUrlRef.current = url;
    });
    Linking.getInitialURL().then((u) => {
      if (u) capturedUrlRef.current = u;
      const match = u?.match(/[?#&]session_id=([^&#]+)/);
      if (match) processSessionId(match[1]);
    });
    return () => sub.remove();
  }, [processSessionId]);

  const onGoogle = async () => {
    setError('');
    try {
      const redirectUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin + '/'
        : Linking.createURL('');
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.location.href = authUrl;
        return;
      }
      setGoogleLoading(true);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = null;
      if (result.type === 'success' && (result as any).url) url = (result as any).url;
      if (!url) url = capturedUrlRef.current;
      if (!url) url = await Linking.getInitialURL();
      const m = url?.match(/[?#&]session_id=([^&#]+)/);
      if (m) await processSessionId(m[1]);
      else if (result.type !== 'cancel') setError('Sign-in returned without session');
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const onEmailLogin = async () => {
    if (!email || !password) return setError('Enter email and password');
    setLoading(true);
    setError('');
    try {
      await signInEmail(email.trim(), password);
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Web: detect session_id in URL on mount
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const combined = hash + '&' + search;
    const m = combined.match(/[?#&]session_id=([^&#]+)/);
    if (m) {
      processSessionId(m[1]).then(() => {
        try {
          const url = new URL(window.location.href);
          url.hash = '';
          url.searchParams.delete('session_id');
          window.history.replaceState(window.history.state, '', url.toString());
        } catch {}
      });
    }
  }, [processSessionId]);

  return (
    <View style={s.root} testID="login-screen">
      <Image source={HERO_IMG} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.7)', '#000']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.top}>
            <View style={s.logoRow}>
              <View style={s.logoBadge}>
                <MaterialCommunityIcons name="motorbike" size={26} color={colors.onBrandPrimary} />
              </View>
              <Text style={s.brandName}>MOTOCOM</Text>
            </View>
            <Text style={s.tagline}>Ride together. Talk together.</Text>
          </View>

          <View style={s.bottom}>
            <Text style={s.headline}>Sign in</Text>
            <Text style={s.sub}>Connect intercoms across brands. Any helmet, one channel.</Text>

            {!!error && (
              <View style={s.errorBox} testID="login-error">
                <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [s.googleBtn, pressed && { opacity: 0.85 }]}
              onPress={onGoogle}
              disabled={googleLoading}
              testID="google-signin-button"
            >
              {googleLoading ? (
                <ActivityIndicator color={colors.onSurfaceInverse} />
              ) : (
                <>
                  <MaterialCommunityIcons name="google" size={20} color={colors.onSurfaceInverse} />
                  <Text style={s.googleText}>Continue with Google</Text>
                </>
              )}
            </Pressable>

            {!showEmailForm ? (
              <Pressable
                style={({ pressed }) => [s.emailBtn, pressed && { opacity: 0.85 }]}
                onPress={() => setShowEmailForm(true)}
                testID="show-email-login-button"
              >
                <MaterialCommunityIcons name="email-outline" size={20} color={colors.onSurface} />
                <Text style={s.emailText}>Continue with Email</Text>
              </Pressable>
            ) : (
              <View style={s.form}>
                <TextInput
                  style={s.input}
                  placeholder="Email"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  testID="login-email-input"
                />
                <TextInput
                  style={s.input}
                  placeholder="Password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  testID="login-password-input"
                />
                <Pressable
                  style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}
                  onPress={onEmailLogin}
                  disabled={loading}
                  testID="login-submit-button"
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onBrandPrimary} />
                  ) : (
                    <Text style={s.primaryText}>Sign in</Text>
                  )}
                </Pressable>
              </View>
            )}

            <View style={s.footerRow}>
              <Text style={s.footerText}>New rider? </Text>
              <Link href="/(auth)/register" asChild>
                <Pressable testID="go-register-button" hitSlop={12}>
                  <Text style={s.footerLink}>Create account</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, justifyContent: 'space-between', padding: spacing.xl, paddingTop: spacing.xxxl + spacing.lg },
  top: { alignItems: 'flex-start', gap: spacing.md },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logoBadge: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  brandName: { color: colors.onSurface, fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  tagline: { color: colors.onSurfaceSecondary, fontSize: 14, letterSpacing: 0.5 },
  bottom: { gap: spacing.md, paddingBottom: spacing.xl },
  headline: { color: colors.onSurface, fontSize: 32, fontWeight: '900' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 14, marginBottom: spacing.md },
  errorBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.12)', borderColor: colors.error, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  googleBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceInverse,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.md,
  },
  googleText: { color: colors.onSurfaceInverse, fontSize: 16, fontWeight: '700' },
  emailBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.md,
  },
  emailText: { color: colors.onSurface, fontSize: 16, fontWeight: '700' },
  form: { gap: spacing.md },
  input: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, color: colors.onSurface, fontSize: 15,
  },
  primaryBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  footerLink: { color: colors.brand, fontSize: 14, fontWeight: '700' },
});
