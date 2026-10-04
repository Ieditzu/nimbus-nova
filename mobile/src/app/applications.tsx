import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listMyApplications } from "../api/client";
import { amount, applicationStatusLabel, taskStatusLabel } from "../api/format";
import { BottomNav, Brand, palette, State, useData } from "../components/ui";
export default function MyApplicationsScreen() {
  const load = useCallback(() => listMyApplications(), []);
  const { data, loading, error, reload } = useData(load);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.cream }}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={palette.purple}
            />
          }
        >
          <Brand />
          <Text style={s.eyebrow}>DRUMUL TĂU CU NOVA</Text>
          <Text style={s.title}>
            Candidaturile <Text style={{ color: palette.purple }}>mele.</Text>
          </Text>
          <Text style={s.intro}>
            Urmărește răspunsul pentru fiecare sarcină. Trage în jos pentru
            actualizare.
          </Text>
          <State
            loading={loading}
            error={error}
            onRetry={() => void reload()}
            empty={
              !loading && !error && data?.applications.length === 0
                ? "Nu ai candidaturi încă. Descoperă o sarcină și aplică."
                : undefined
            }
          />
          {data?.applications.map((app) => (
            <View style={s.card} key={app.id}>
              <View style={s.top}>
                <Text style={s.badge}>
                  {applicationStatusLabel[app.status]}
                </Text>
                <Text style={s.price}>{amount(app.task.amount_bani)}</Text>
              </View>
              <Text style={s.cardTitle}>{app.task.title}</Text>
              <Text style={s.meta}>⌖ {app.task.city}</Text>
              <Text style={s.meta}>
                Starea sarcinii:{" "}
                <Text style={{ fontWeight: "800", color: palette.dark }}>
                  {taskStatusLabel[app.task.status]}
                </Text>
              </Text>
              <Text style={s.message}>„{app.message}”</Text>
              {app.status === "accepted" && (
                <Text style={s.accepted}>
                  ✦ Ai fost selectată pentru această sarcină.
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
        <BottomNav />
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  content: {
    padding: 22,
    paddingBottom: 38,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: palette.purple,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
    marginTop: 40,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: palette.dark,
    marginTop: 10,
    letterSpacing: -1.3,
  },
  intro: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 29,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    padding: 20,
    marginBottom: 13,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    backgroundColor: palette.lavender,
    color: palette.purple,
    padding: 8,
    borderRadius: 7,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
  },
  price: { fontWeight: "800", color: palette.dark, fontSize: 14 },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.dark,
    marginTop: 17,
    marginBottom: 12,
  },
  meta: { fontSize: 12, color: palette.muted, marginBottom: 7 },
  message: {
    color: "#625c70",
    fontSize: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 15,
  },
  accepted: {
    color: "#458a71",
    backgroundColor: "#e5f4ef",
    padding: 10,
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 14,
  },
});
