import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { api } from "../api";
import type { SupportMessage } from "../api/client";
import { Button, Header, Page } from "../components/ui";
import { fonts, useTheme } from "../components/theme";
import { errorMessage } from "../lib/errors";

const STORAGE = "nova-support-ticket";

export default function SupportScreen() {
  const { colors, isDark } = useTheme();
  const [ticketId, setTicketId] = useState("");
  const [guestKey, setGuestKey] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [human, setHuman] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE).then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw) as { id?: string; key?: string };
      if (!saved.id || !saved.key) return;
      setTicketId(saved.id);
      setGuestKey(saved.key);
      return api.getSupportTicket(saved.id, saved.key).then(thread => {
        setMessages(thread.messages);
        setHuman(thread.ticket.needs_human);
      });
    }).catch(() => undefined);
  }, []);

  async function send() {
    const value = text.trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      if (ticketId) {
        const thread = await api.sendSupportMessage(ticketId, value, guestKey);
        setMessages(thread.messages);
        setHuman(thread.ticket.needs_human);
      } else {
        const thread = await api.openSupportTicket(value);
        setTicketId(thread.ticket.id);
        setMessages(thread.messages);
        setHuman(thread.ticket.needs_human);
        if (thread.guest_key) {
          setGuestKey(thread.guest_key);
          await AsyncStorage.setItem(STORAGE, JSON.stringify({ id: thread.ticket.id, key: thread.guest_key }));
        }
      }
      setText("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Header title="Suport" subtitle="Nu îți trebuie cont. Dacă Nova nu poate rezolva, tichetul ajunge la echipă." />
      <Button variant="outline" icon="arrow-back" onPress={() => router.canGoBack() ? router.back() : router.replace("/profile")}>Înapoi</Button>
      {messages.map(item => (
        <Text key={item.id} style={{ color: colors.text, fontFamily: fonts.body }}>
          {item.author === "user" ? "Tu: " : item.author === "admin" ? "Echipa: " : "Nova: "}{item.text}
        </Text>
      ))}
      {human ? <Text style={{ color: colors.muted }}>Echipa a fost anunțată.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
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
