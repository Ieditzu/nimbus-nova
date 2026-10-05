import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../auth/session";
import { Header, Icon, Page, State, useData } from "../components/ui";
import { useTheme } from "../components/theme";
import { jobStyles } from "../components/job-ui";
import { notificationContent, openNotification } from "../notifications/content";

export default function NotificationsScreen() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const s = jobStyles(colors);
  const load = useCallback(() => client.listNotifications(), [client]);
  const { data, loading, error, reload } = useData(load, 10000);
  useFocusEffect(useCallback(() => {
    void client.readNotifications().then(() => reload(true)).catch(() => {});
  }, [client, reload]));
  return <Page onRefresh={() => void reload()} refreshing={loading}>
    <Header title="Notificări" subtitle="Aplicări, mesaje și noutăți despre joburile tale." />
    <State loading={loading} error={error} onRetry={() => void reload()} empty={!loading && !error && data?.notifications.length === 0 ? "Nu ai notificări încă." : undefined} />
    {data?.notifications.map(item => {
      const content = notificationContent(item.kind);
      return <Pressable key={item.id} accessibilityRole="button" onPress={() => openNotification(item.kind, item.task_id)} style={[s.card, { gap: 7, borderColor: item.read_at ? colors.border : colors.accent }]}>
        <View style={[s.row, { alignItems: "center" }]}>
          <Text style={[s.title, { flex: 1 }]}>{content.title}</Text>
          <Icon name="chevron-forward" />
        </View>
        <Text style={s.body}>{content.body}</Text>
        <Text style={s.label}>{new Date(item.created_at).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
      </Pressable>;
    })}
  </Page>;
}
