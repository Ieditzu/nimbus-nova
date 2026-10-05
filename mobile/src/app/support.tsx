import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/session";
import type { SupportMessage, SupportTicket } from "../api/client";
import { Button, Header, Page, State } from "../components/ui";
import { fonts, useTheme } from "../components/theme";
import { errorMessage } from "../lib/errors";

export default function SupportScreen() {
  const { client } = useAuth();
  const { colors, isDark } = useTheme();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketId, setTicketId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [human, setHuman] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const result = await client.listSupportTickets();
      setTickets(result.tickets);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (!client) return;
    const value = text.trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      const thread = ticketId
        ? await client.sendSupportMessage(ticketId, value)
        : await client.openSupportTicket(value);
      setTicketId(thread.ticket.id);
      setMessages(thread.messages);
      setHuman(thread.ticket.needs_human);
      setText("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page onRefresh={() => void load()} refreshing={loading}>
      <Header title="Suport" subtitle="Nova știe unde sunt butoanele. Un om intră doar dacă nu poate rezolva." />
      <Button variant="outline" icon="arrow-back" onPress={() => router.canGoBack() ? router.back() : router.replace("/profile")}>Înapoi</Button>
      <State loading={loading && tickets.length === 0 && messages.length === 0} error={error} onRetry={() => void load()} />
      {tickets.map(item => (
        <Button key={item.id} variant="outline" onPress={() => void client?.getSupportTicket(item.id).then(thread => {
          setTicketId(thread.ticket.id);
          setMessages(thread.messages);
          setHuman(thread.ticket.needs_human);
        }).catch(cause => setError(errorMessage(cause)))}>
          {item.needs_human ? "Așteaptă echipa · " : ""}{item.subject}
        </Button>
      ))}
      <View style={{ gap: 8 }}>
        {messages.map(item => (
          <Text key={item.id} style={{ color: colors.text, fontFamily: fonts.body }}>
            {item.author === "user" ? "Tu: " : item.author === "admin" ? "Echipa: " : "Nova: "}{item.text}
          </Text>
        ))}
      </View>
      {human ? <Text style={{ color: colors.muted }}>Echipa a fost anunțată.</Text> : null}
      <TextInput
        accessibilityLabel="Mesaj către suport"
        value={text}
        onChangeText={setText}
        editable={!busy}
        multiline
        maxLength={2000}
        placeholder="Unde este butonul?"
        placeholderTextColor={colors.muted}
        keyboardAppearance={isDark ? "dark" : "light"}
        style={{ minHeight: 88, color: colors.text, fontFamily: fonts.body, fontSize: 16 }}
      />
      <Button icon="sparkles" disabled={busy || text.trim().length < 2} onPress={() => void send()}>
        {busy ? "Se trimite..." : "Trimite"}
      </Button>
    </Page>
  );
}
