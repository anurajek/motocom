import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';

type Group = { group_id: string; name: string; description: string; member_count: number; invite_code: string };

export default function Groups() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await api<Group[]>('/groups');
      setGroups(g);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setBusy(true); setError('');
    try {
      await api('/groups', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      setNewName('');
      setCreating(false);
      await load();
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  const joinGroup = async () => {
    if (!inviteCode.trim()) return;
    setBusy(true); setError('');
    try {
      await api('/groups/join', { method: 'POST', body: JSON.stringify({ invite_code: inviteCode.trim().toUpperCase() }) });
      setInviteCode('');
      setJoining(false);
      await load();
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']} testID="groups-screen">
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>GROUPS</Text>
          <Text style={s.sub}>Your riding crews</Text>
        </View>
        <Pressable
          onPress={() => { setJoining(true); setCreating(false); }}
          style={s.iconBtn}
          testID="join-group-open-button"
          hitSlop={10}
        >
          <MaterialCommunityIcons name="link-variant" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable
          onPress={() => { setCreating(true); setJoining(false); }}
          style={[s.iconBtn, { backgroundColor: colors.brand }]}
          testID="create-group-open-button"
          hitSlop={10}
        >
          <MaterialCommunityIcons name="plus" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {(creating || joining) && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.inlineForm}>
            <Text style={s.formTitle}>{creating ? 'New group' : 'Join with invite code'}</Text>
            <TextInput
              placeholder={creating ? 'Group name' : 'Invite code (e.g. A1B2C3)'}
              placeholderTextColor={colors.onSurfaceTertiary}
              value={creating ? newName : inviteCode}
              onChangeText={creating ? setNewName : setInviteCode}
              style={s.input}
              autoCapitalize={creating ? 'sentences' : 'characters'}
              testID={creating ? 'new-group-name-input' : 'invite-code-input'}
            />
            {!!error && <Text style={s.errText}>{error}</Text>}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => { setCreating(false); setJoining(false); setError(''); }}
                style={[s.formBtn, s.formBtnGhost]}
                testID="cancel-form-button"
              >
                <Text style={s.formBtnTextGhost}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={creating ? createGroup : joinGroup}
                style={[s.formBtn, { backgroundColor: colors.brand }]}
                disabled={busy}
                testID={creating ? 'confirm-create-group-button' : 'confirm-join-group-button'}
              >
                {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> :
                  <Text style={s.formBtnText}>{creating ? 'Create' : 'Join'}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <FlatList
        data={groups}
        keyExtractor={(g) => g.group_id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={() => (
          <View style={s.empty} testID="empty-groups">
            <MaterialCommunityIcons name="account-group" size={48} color={colors.onSurfaceTertiary} />
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptyText}>Create a group or join with an invite code to start riding together.</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/groups/${item.group_id}`)}
            style={({ pressed }) => [s.card, pressed && { borderColor: colors.brand }]}
            testID={`group-card-${item.group_id}`}
          >
            <View style={s.cardIcon}>
              <MaterialCommunityIcons name="account-group" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{item.name}</Text>
              <Text style={s.cardMeta}>{item.member_count} member{item.member_count === 1 ? '' : 's'} · Code {item.invite_code}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  inlineForm: {
    marginHorizontal: spacing.lg, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  formTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  input: {
    height: 48, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 15,
  },
  errText: { color: colors.error, fontSize: 12 },
  formBtn: {
    flex: 1, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  formBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  formBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  formBtnTextGhost: { color: colors.onSurfaceSecondary, fontWeight: '700' },

  empty: {
    marginTop: spacing.xxl, padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '900' },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center' },

  card: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '800' },
  cardMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
