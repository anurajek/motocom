import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

type Group = { group_id: string; name: string; description: string; owner_id: string; invite_code: string; member_count: number };
type Member = { user_id: string; name: string; email: string; picture?: string | null; bike?: string | null };
type Message = { message_id: string; group_id: string; user_id: string; user_name: string; text: string; created_at: string };

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'chat' | 'members'>('chat');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [g, m, msgs] = await Promise.all([
        api<Group>(`/groups/${id}`),
        api<Member[]>(`/groups/${id}/members`),
        api<Message[]>(`/groups/${id}/messages`),
      ]);
      setGroup(g);
      setMembers(m);
      setMessages(msgs);
    } catch {}
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== 'chat') return;
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [tab, load]);

  const send = async () => {
    if (!text.trim() || !id) return;
    setSending(true);
    const draft = text.trim();
    setText('');
    try {
      const m = await api<Message>(`/groups/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: draft }),
      });
      setMessages((prev) => [...prev, m]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(draft);
    } finally {
      setSending(false);
    }
  };

  const leave = async () => {
    if (!id) return;
    try {
      await api(`/groups/${id}/leave`, { method: 'DELETE' });
      router.replace('/(tabs)/groups');
    } catch {}
  };

  if (!group) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.loader}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']} testID="group-detail-screen">
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10} testID="group-back-button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{group.name}</Text>
          <Text style={s.sub}>{group.member_count} member{group.member_count === 1 ? '' : 's'} · Code {group.invite_code}</Text>
        </View>
        <Pressable onPress={leave} style={s.leaveBtn} hitSlop={10} testID="leave-group-button">
          <MaterialCommunityIcons name="exit-to-app" size={18} color={colors.error} />
        </Pressable>
      </View>

      <View style={s.tabsRow}>
        <Pressable
          onPress={() => setTab('chat')}
          style={[s.tabBtn, tab === 'chat' && s.tabBtnActive]}
          testID="tab-chat"
        >
          <Text style={[s.tabText, tab === 'chat' && s.tabTextActive]}>CHAT</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('members')}
          style={[s.tabBtn, tab === 'members' && s.tabBtnActive]}
          testID="tab-members"
        >
          <Text style={[s.tabText, tab === 'members' && s.tabTextActive]}>MEMBERS</Text>
        </Pressable>
      </View>

      {tab === 'chat' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={80}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.message_id}
            contentContainerStyle={s.chatList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={() => (
              <View style={s.empty} testID="empty-messages">
                <MaterialCommunityIcons name="message-text-outline" size={44} color={colors.onSurfaceTertiary} />
                <Text style={s.emptyText}>No messages yet. Say hi!</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const mine = item.user_id === user?.user_id;
              return (
                <View style={[s.msgRow, mine && { justifyContent: 'flex-end' }]} testID={`msg-${item.message_id}`}>
                  <View style={[s.msgBubble, mine ? s.msgMine : s.msgTheirs]}>
                    {!mine && <Text style={s.msgAuthor}>{item.user_name}</Text>}
                    <Text style={[s.msgText, mine && { color: colors.onBrandPrimary }]}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={s.composer}>
            <TextInput
              placeholder="Send a message"
              placeholderTextColor={colors.onSurfaceTertiary}
              value={text}
              onChangeText={setText}
              style={s.composerInput}
              onSubmitEditing={send}
              testID="chat-input"
            />
            <Pressable
              onPress={send}
              style={({ pressed }) => [s.sendBtn, pressed && { opacity: 0.85 }]}
              disabled={sending || !text.trim()}
              testID="send-message-button"
            >
              {sending ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> :
                <MaterialCommunityIcons name="send" size={20} color={colors.onBrandPrimary} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.user_id}
          contentContainerStyle={s.list}
          ListHeaderComponent={() => (
            <View style={s.inviteCard}>
              <Text style={s.inviteLabel}>INVITE OTHER RIDERS</Text>
              <Text style={s.inviteCode} selectable testID="invite-code-display">{group.invite_code}</Text>
              <Text style={s.inviteHint}>Share this code so friends can join the group.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={s.memberRow} testID={`member-${item.user_id}`}>
              <View style={s.memberAvatar}>
                <Text style={s.memberInitial}>{(item.name || item.email).slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.memberName} numberOfLines={1}>
                  {item.name} {item.user_id === group.owner_id ? '(owner)' : ''}
                </Text>
                <Text style={s.memberBike} numberOfLines={1}>{item.bike || item.email}</Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '900' },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  leaveBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
  },

  tabsRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  tabBtn: {
    height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: 'rgba(255,94,0,0.12)', borderColor: colors.brand },
  tabText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  tabTextActive: { color: colors.brand },

  chatList: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  msgRow: { flexDirection: 'row' },
  msgBubble: {
    maxWidth: '78%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  msgMine: { backgroundColor: colors.brand, borderBottomRightRadius: 2 },
  msgTheirs: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 2, borderWidth: 1, borderColor: colors.border },
  msgAuthor: { color: colors.brand, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msgText: { color: colors.onSurface, fontSize: 14 },

  composer: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  composerInput: {
    flex: 1, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, color: colors.onSurface, fontSize: 14,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl },
  inviteCard: {
    padding: spacing.lg, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand,
    marginBottom: spacing.md, alignItems: 'center',
  },
  inviteLabel: { color: colors.brand, fontSize: 11, letterSpacing: 2, fontWeight: '900' },
  inviteCode: { color: colors.onSurface, fontSize: 32, fontWeight: '900', letterSpacing: 4, marginVertical: spacing.sm },
  inviteHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: 'center' },

  memberRow: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  memberAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary,
    borderWidth: 2, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { color: colors.brand, fontSize: 16, fontWeight: '900' },
  memberName: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  memberBike: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
