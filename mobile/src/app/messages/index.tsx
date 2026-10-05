import { useCallback } from "react";
import { Link, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../auth/session";
import { Button, Header, Icon, Page, State, useData } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { jobStyles } from "../../components/job-ui";
export default function InboxScreen() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const s = jobStyles(colors);
  const load = useCallback(() => client.listConversations(), [client]);
  const { data, loading, error, reload } = useData(load);
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
      {data?.conversations.map((chat) => (
        <Link
          key={chat.id}
          href={{ pathname: "/messages/[id]", params: { id: chat.id } }}
          asChild
        >
          <Pressable accessibilityRole="button" style={s.card}>
            <View style={s.row}>
              <Text style={s.title}>{chat.other_user.display_name}</Text>
              <Icon name="chevron-forward" />
            </View>
            <Text style={s.label}>{chat.task_title}</Text>
            <Text style={s.body} numberOfLines={2}>
              {chat.last_message?.text ?? "Începe conversația."}
            </Text>
          </Pressable>
        </Link>
      ))}
    </Page>
  );
}
