import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../auth/session";
import type { ChatMessage, Conversation } from "../../api/types";
import { mergeMessages } from "../../chat/merge";
import { errorMessage } from "../../lib/errors";
import { Button, Icon } from "../../components/ui";
import { fonts, useTheme } from "../../components/theme";
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, session } = useAuth();
  const { colors, isDark } = useTheme();
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [older, setOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderBusy = useRef(false);
  const generation = useRef(0);
  const list = useRef<FlatList<ChatMessage>>(null);
  useFocusEffect(
    useCallback(() => {
      const run = ++generation.current;
      let stopped = false;
      let working = false;
      let cursor = 0;
      let initialized = false;
      setLoading(true);
      setError("");
      setMessages([]);
      setConversation(undefined);
      setOlder(false);
      setSending(false);
      setSendError("");
      setLoadingOlder(false);
      olderBusy.current = false;
      async function poll() {
        if (
          stopped ||
          working ||
          (AppState.currentState !== null && AppState.currentState !== "active")
        )
          return;
        working = true;
        try {
          const page = await client.listMessages(
            id,
            initialized ? cursor : undefined,
          );
          if (stopped || generation.current !== run) return;
          setConversation(page.conversation);
          setMessages((current) => mergeMessages(current, page.messages));
          if (!initialized) setOlder(page.has_more);
          cursor = page.next_cursor;
          initialized = true;
          setError("");
        } catch (e) {
          if (!stopped && generation.current === run) setError(errorMessage(e));
        } finally {
          working = false;
          if (!stopped && generation.current === run) setLoading(false);
        }
      }
      void poll();
      const timer = setInterval(() => void poll(), 3000);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void poll();
      });
      return () => {
        stopped = true;
        ++generation.current;
        clearInterval(timer);
        subscription.remove();
      };
    }, [client, id]),
  );
  async function loadOlder() {
    if (!older || olderBusy.current || !messages.length) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    const run = generation.current;
    try {
      const page = await client.listMessages(
        id,
        undefined,
        messages[messages.length - 1].sequence,
      );
      if (run !== generation.current) return;
      setMessages((current) => mergeMessages(current, page.messages));
      setOlder(page.has_more);
    } catch (e) {
      if (run === generation.current) setError(errorMessage(e));
    } finally {
      olderBusy.current = false;
      if (run === generation.current) setLoadingOlder(false);
    }
  }
  async function send() {
    if (sending || !draft.trim() || !conversation) return;
    setSending(true);
    setSendError("");
    const run = generation.current;
    const text = draft.trim();
    try {
      const checked = await client.checkMessage(text).catch(() => ({ ok: true, warning: "" }));
      const { message, warning } = await client.sendMessage(id, text);
      if (run !== generation.current) return;
      setMessages((current) => mergeMessages(current, [message]));
      setDraft("");
      setSendError(checked.warning || warning || "");
      list.current?.scrollToOffset({ offset: 0, animated: false });
    } catch (e) {
      if (run === generation.current) setSendError(errorMessage(e));
    } finally {
      if (run === generation.current) setSending(false);
    }
  }
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[s.safe, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.header, { borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Înapoi la mesaje"
            style={s.back}
            onPress={() => router.replace("/messages")}
          >
            <Icon name="arrow-back" color={colors.text} />
          </Pressable>
          <View style={s.grow}>
            <Text style={[s.name, { color: colors.text }]}>
              {conversation?.other_user.display_name ?? "Conversație"}
            </Text>
            <Text style={[s.meta, { color: colors.muted }]} numberOfLines={2}>
              {conversation?.task_title}
            </Text>
          </View>
        </View>
        {conversation?.other_user.phone_number ? <View style={[s.notice, { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }]}>
          <Text selectable style={[s.meta, { color: colors.text }]}>{conversation.other_user.phone_number}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Sună persoana" style={s.back}
            onPress={() => void Linking.openURL(`tel:${conversation.other_user.phone_number}`).catch(() => setSendError("Telefonul nu poate deschide apelul."))}>
            <Icon name="call-outline" color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Trimite SMS" style={s.back}
            onPress={() => void Linking.openURL(`sms:${conversation.other_user.phone_number}`).catch(() => setSendError("Dispozitivul nu poate deschide aplicația SMS."))}>
            <Icon name="chatbox-outline" color={colors.text} /><Text style={[s.meta, { color: colors.text }]}>SMS</Text>
          </Pressable>
        </View> : null}
        {error || sendError ? (
          <View style={s.notice}>
            <Text
              accessibilityRole="alert"
              style={[s.meta, { color: colors.danger }]}
            >
              {error || sendError}
            </Text>
            {error ? (
              <Text style={[s.meta, { color: colors.muted }]}>
                Reconectare automată...
              </Text>
            ) : null}
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator style={s.notice} color={colors.text} />
        ) : null}
        <FlatList
          ref={list}
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.messages}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={colors.text} /> : null
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === session?.user.id;
            return (
              <View
                style={[
                  s.bubble,
                  {
                    alignSelf: mine ? "flex-end" : "flex-start",
                    backgroundColor: mine ? colors.accentSoft : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text selectable style={[s.text, { color: colors.text }]}>
                  {item.text}
                </Text>
                <Text style={[s.time, { color: colors.muted }]}>
                  {new Date(item.created_at).toLocaleString("ro-RO", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            );
          }}
        />
        {!loading && conversation && !messages.length ? (
          <Text style={[s.empty, { color: colors.muted }]}>
            Începe cu un mesaj despre sarcină.
          </Text>
        ) : null}
        <View style={[s.composer, { borderColor: colors.border }]}>
          <TextInput
            accessibilityLabel="Mesaj"
            value={draft}
            onChangeText={setDraft}
            editable={!sending && !!conversation}
            multiline
            maxLength={2000}
            keyboardAppearance={isDark ? "dark" : "light"}
            placeholder="Scrie un mesaj..."
            placeholderTextColor={colors.muted}
            style={[
              s.input,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
          <Button
            icon="send-outline"
            disabled={sending || !draft.trim() || !conversation}
            onPress={() => void send()}
          >
            {sending ? "..." : "Trimite"}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    padding: 16,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  back: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 20 },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  messages: { padding: 16, gap: 12 },
  bubble: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    maxWidth: "88%",
    gap: 8,
    marginBottom: 10,
  },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  time: { fontFamily: fonts.body, fontSize: 10, alignSelf: "flex-end" },
  notice: { padding: 16, gap: 8 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    padding: 20,
    textAlign: "center",
  },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    maxHeight: 110,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 16,
  },
});
