import { useCallback, useState } from "react";
import { Link, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../auth/session";
import { Button, Header, Icon, Page, State, useData } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { jobStyles } from "../../components/job-ui";
import { errorMessage } from "../../lib/errors";
export default function InboxScreen() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const s = jobStyles(colors);
  const load = useCallback(() => client.listConversations(), [client]);
  const { data, loading, error, reload } = useData(load, 4000);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function remove(id: string) {
    if (deleting) return;
    setDeleting(true); setDeleteError("");
    try { await client.hideConversation(id); setConfirmId(null); await reload(); }
    catch (e) { setDeleteError(errorMessage(e)); }
    finally { setDeleting(false); }
  }
  return (
    <Page onRefresh={() => void reload()} refreshing={loading}>
      <Header
        title="Mesaje"
        subtitle="Conversațiile tale despre joburi."
      />
      <State
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={
          !loading && !error && data?.conversations.length === 0
            ? "Nu ai mesaje încă. Deschide un job și apasă «Trimite un mesaj» pentru a începe."
            : undefined
        }
        emptyAction={<Button variant="outline" onPress={() => router.replace("/")}>Găsește un job</Button>}
      />
      {deleteError ? <Text accessibilityRole="alert" style={s.error}>{deleteError}</Text> : null}
      {data?.conversations.map((chat) => (
        <View key={chat.id} style={s.card}>
          <Link href={{ pathname: "/messages/[id]", params: { id: chat.id } }} asChild>
          <Pressable accessibilityRole="button">
            <View style={s.row}>
              <Text style={s.title}>{chat.other_user.display_name}</Text>
              <Icon name="chevron-forward" />
            </View>
            <Text style={s.label}>{chat.task_title}</Text>
            <Text style={s.body} numberOfLines={2}>
              {chat.last_message?.text ?? "Începe conversația."}
            </Text>
          </Pressable></Link>
          {confirmId === chat.id ? <View style={{ gap: 8 }}>
            <Text style={s.body}>Elimini conversația doar din lista ta. Va reapărea dacă primești un mesaj nou.</Text>
            <Button variant="outline" disabled={deleting} onPress={() => void remove(chat.id)}>{deleting ? "Se elimină..." : "Da, elimină"}</Button>
            <Button variant="outline" onPress={() => setConfirmId(null)}>Anulează</Button>
          </View> : <Button variant="outline" icon="trash-outline" onPress={() => setConfirmId(chat.id)}>Elimină conversația</Button>}
        </View>
      ))}
    </Page>
  );
}
