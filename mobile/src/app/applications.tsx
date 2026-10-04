import { useCallback, useState } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { formatBani } from "../api/client";
import {
  applicationStatusLabel,
  schedule,
  taskStatusLabel,
} from "../lib/labels";
import {
  Badge,
  Button,
  Header,
  Icon,
  Page,
  State,
  useData,
} from "../components/ui";
import { useTheme, type Colors } from "../components/theme";

export default function MyApplicationsScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const load = useCallback(() => api.listMyApplications(), []);
  const { data, loading, error, reload } = useData(load);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }
  return (
    <Page onRefresh={() => void refresh()} refreshing={refreshing}>
      <Header
        title="Aplicările mele"
        subtitle="Vezi răspunsurile organizatorilor."
      />
      <View style={s.summary}>
        <Text style={s.summaryText}>
          {data
            ? `${data.applications.length} ${data.applications.length === 1 ? "aplicare" : "aplicări"}`
            : "Aplicări"}
        </Text>
        <Button
          variant="outline"
          icon="refresh-outline"
          disabled={loading}
          onPress={() => void refresh()}
        >
          Actualizează
        </Button>
      </View>
      <State
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={
          !loading && !error && data?.applications.length === 0
            ? "Nu ai aplicat încă la nicio sarcină."
            : undefined
        }
        emptyAction={
          <Link href="/" replace asChild>
            <Pressable accessibilityRole="button" style={s.emptyButton}>
              <Text style={s.emptyButtonText}>Vezi sarcinile disponibile</Text>
            </Pressable>
          </Link>
        }
      />
      {data?.applications.map((app) => {
        const when = schedule(app.task.starts_at, app.task.ends_at);
        return (
          <Link
            href={{ pathname: "/task/[id]", params: { id: app.task.id } }}
            asChild
            key={app.id}
          >
            <Pressable accessibilityRole="button" style={s.card}>
              <View style={s.top}>
                <Badge
                  tone={
                    app.status === "accepted"
                      ? "success"
                      : app.status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {applicationStatusLabel[app.status]}
                </Badge>
                <Icon name="chevron-forward" size={18} />
              </View>
              <Text style={s.title}>{app.task.title}</Text>
              <Text style={s.meta}>
                {app.task.city} · {when.date}
              </Text>
              <Text style={s.meta}>{when.time}</Text>
              <View style={s.statusRow}>
                <Text style={s.meta}>Starea sarcinii</Text>
                <Text style={s.status}>{taskStatusLabel[app.task.status]}</Text>
              </View>
              <View style={s.messageBox}>
                <Text style={s.messageLabel}>Mesajul tău</Text>
                <Text style={s.message}>{app.message}</Text>
              </View>
              <View style={s.bottom}>
                <Text style={s.price}>{formatBani(app.task.amount_bani)}</Text>
                <Text style={s.details}>Vezi sarcina</Text>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </Page>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    summary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    summaryText: { fontSize: 14, color: c.muted },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
    },
    top: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: 20,
      lineHeight: 27,
      fontWeight: "600",
      color: c.text,
      marginTop: 16,
      marginBottom: 8,
    },
    meta: { color: c.muted, fontSize: 14, lineHeight: 22 },
    statusRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 16,
    },
    status: { color: c.text, fontSize: 14, fontWeight: "600", lineHeight: 22 },
    messageBox: {
      marginTop: 16,
      padding: 12,
      backgroundColor: c.raised,
      borderRadius: 8,
    },
    messageLabel: { color: c.muted, fontSize: 12, marginBottom: 5 },
    message: { color: c.text, fontSize: 14, lineHeight: 21 },
    bottom: {
      marginTop: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    price: { fontSize: 18, color: c.text, fontWeight: "600" },
    details: { color: c.accent, fontSize: 14, fontWeight: "600" },
    emptyButton: {
      minHeight: 48,
      padding: 14,
      backgroundColor: c.accent,
      borderRadius: 12,
    },
    emptyButtonText: { color: c.onAccent, fontSize: 14, fontWeight: "600" },
  });
