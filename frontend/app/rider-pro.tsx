import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';

type Status = { is_pro: boolean; status?: string | null; cancel_at_period_end: boolean; current_period_end?: number | null };

const PERKS = [
  { icon: 'infinity', title: 'Unlimited groups', body: 'Create and join as many riding crews as you want.' },
  { icon: 'map-marker-path', title: 'Ride heatmaps', body: 'See your most-traveled roads over time.' },
  { icon: 'cloud-outline', title: 'Cloud ride history', body: 'All rides backed up, exportable to GPX.' },
  { icon: 'microphone-plus', title: 'Priority PTT channels', body: 'Low-latency voice with quality boost.' },
  { icon: 'shield-star', title: 'Support the app', body: 'Keep MotoCom independent and ad-free.' },
];

export default function RiderPro() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<Status>('/billing/status');
      setStatus(s);
    } catch (e: any) {
      setError(e?.message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle deep link return from Stripe on native
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('stripe-return')) {
        // Give webhook a moment to arrive
        setTimeout(load, 1500);
      }
    });
    return () => sub.remove();
  }, [load]);

  const subscribe = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const returnUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin + '/rider-pro'
        : Linking.createURL('stripe-return');
      const res = await api<{ url: string }>('/billing/checkout-session', {
        method: 'POST',
        body: JSON.stringify({ return_url: returnUrl }),
      });
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.location.href = res.url;
      } else {
        await WebBrowser.openAuthSessionAsync(res.url, returnUrl);
        setMsg('Verifying subscription…');
        setTimeout(load, 1500);
      }
    } catch (e: any) {
      setError(e?.message || 'Subscription failed');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      await api('/billing/cancel', { method: 'POST' });
      setMsg('Subscription will cancel at end of period.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const isPro = !!status?.is_pro;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="rider-pro-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10} testID="rider-pro-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={s.headerTitle}>RIDER PRO</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <LinearGradient
            colors={[colors.brandTertiary, colors.surfaceSecondary]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={{ padding: spacing.lg }}>
            <View style={s.badge}>
              <MaterialCommunityIcons name="crown" size={14} color={colors.brand} />
              <Text style={s.badgeText}>MOTOCOM RIDER PRO</Text>
            </View>
            <Text style={s.heroPrice}>$4.99<Text style={s.heroPriceUnit}> / month</Text></Text>
            <Text style={s.heroTrial}>7-day free trial · Cancel anytime</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : isPro ? (
          <View style={s.statusCard} testID="pro-active-card">
            <View style={s.statusRow}>
              <MaterialCommunityIcons name="check-decagram" size={22} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={s.statusTitle}>Rider Pro active</Text>
                <Text style={s.statusSub}>
                  {status?.status === 'trialing' ? 'Free trial in progress' : 'Subscription active'}
                  {status?.cancel_at_period_end ? ' · Cancels at period end' : ''}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>WHAT YOU GET</Text>
        <View style={{ gap: spacing.sm }}>
          {PERKS.map((p) => (
            <View key={p.title} style={s.perkRow} testID={`perk-${p.title.split(' ')[0].toLowerCase()}`}>
              <View style={s.perkIcon}>
                <MaterialCommunityIcons name={p.icon as any} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.perkTitle}>{p.title}</Text>
                <Text style={s.perkBody}>{p.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {!!error && (
          <View style={s.errorBox} testID="rider-pro-error">
            <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
        {!!msg && (
          <View style={s.msgBox} testID="rider-pro-message">
            <MaterialCommunityIcons name="information" size={16} color={colors.brand} />
            <Text style={s.msgText}>{msg}</Text>
          </View>
        )}

        {isPro ? (
          <Pressable
            onPress={cancel}
            style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.85 }]}
            disabled={busy || status?.cancel_at_period_end}
            testID="cancel-subscription-button"
          >
            {busy ? <ActivityIndicator color={colors.error} /> :
              <Text style={s.cancelText}>{status?.cancel_at_period_end ? 'CANCELING AT PERIOD END' : 'CANCEL SUBSCRIPTION'}</Text>}
          </Pressable>
        ) : (
          <Pressable
            onPress={subscribe}
            style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}
            disabled={busy}
            testID="start-trial-button"
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={s.primaryText}>START 7-DAY FREE TRIAL</Text>}
          </Pressable>
        )}

        <Text style={s.footnote}>
          Payments are processed by Stripe. Access begins immediately during the trial and continues month-to-month.
          You'll be charged $4.99 monthly after the trial unless you cancel first.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.onSurface, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },

  hero: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.brand, minHeight: 130 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: 'rgba(255,94,0,0.20)', borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.brand,
  },
  badgeText: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  heroPrice: { color: colors.onSurface, fontSize: 44, fontWeight: '900', marginTop: spacing.sm },
  heroPriceUnit: { fontSize: 16, fontWeight: '700', color: colors.onSurfaceSecondary },
  heroTrial: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },

  statusCard: {
    padding: spacing.md, backgroundColor: 'rgba(50,215,75,0.10)',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.success,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '900' },
  statusSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginTop: spacing.md },
  perkRow: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  perkIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  perkTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '900' },
  perkBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  errorBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.12)', borderColor: colors.error, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 12, flex: 1 },
  msgBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    backgroundColor: 'rgba(255,94,0,0.12)', borderColor: colors.brand, borderWidth: 1,
    padding: spacing.md, borderRadius: radius.md,
  },
  msgText: { color: colors.brand, fontSize: 12, flex: 1 },

  primaryBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.md,
  },
  primaryText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  cancelBtn: {
    height: 56, borderRadius: radius.md, backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.error,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.md,
  },
  cancelText: { color: colors.error, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  footnote: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: spacing.md, lineHeight: 16, textAlign: 'center' },
});
