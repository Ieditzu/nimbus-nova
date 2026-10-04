import { formatBani } from "../api/client";
import { useCallback, useState } from "react";
import { Link } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api";
import { categories, categoryLabel, interval } from "../lib/labels";
import type { Category, TaskPublic } from "../api/types";
import { BottomNav, Brand, palette, State, useData } from "../components/ui";
export default function TaskListScreen() {
  const [category, setCategory] = useState<Category | undefined>();
  const [city, setCity] = useState("București");
  const [appliedCity, setAppliedCity] = useState("București");
  const load = useCallback(
    () => api.listOpenTasks({ category, city: appliedCity }),
    [category, appliedCity],
  );
  const { data, loading, error, reload } = useData(load);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.cream }}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={palette.purple}
            />
          }
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <Brand subtitle="Oportunități aproape de tine" />
          <View style={s.hero}>
            <Text style={s.eyebrow}>PENTRU TIMPUL TĂU LIBER ✦</Text>
            <Text style={s.heading}>
              Găsește ceva{"\n"}
              <Text style={{ color: palette.purple }}>
                potrivit pentru tine.
              </Text>
            </Text>
            <Text style={s.intro}>
              Sarcini scurte, clare și aproape de tine. Alege când și cum vrei
              să ajuți.
            </Text>
          </View>
          <View style={s.searchBox}>
            <Text style={s.searchIcon}>⌖</Text>
            <TextInput
              accessibilityLabel="Oraș"
              placeholder="Oraș"
              value={city}
              onChangeText={setCity}
              onSubmitEditing={() => setAppliedCity(city.trim())}
              returnKeyType="search"
              style={s.searchInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setAppliedCity(city.trim())}
              hitSlop={12}
            >
              <Text style={s.searchAction}>Caută</Text>
            </Pressable>
          </View>
          <Text style={s.sectionTitle}>
            Explorează sarcini{" "}
            <Text style={s.count}>{data?.tasks.length ?? 0}</Text>
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filters}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !category }}
              onPress={() => setCategory(undefined)}
            >
              <Text style={[s.filter, !category && s.filterActive]}>Toate</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: category === c }}
                onPress={() => setCategory(c)}
              >
                <Text style={[s.filter, category === c && s.filterActive]}>
                  {categoryLabel[c]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <State
            loading={loading}
            error={error}
            onRetry={() => void reload()}
            empty={
              !loading && !error && data?.tasks.length === 0
                ? "Nu există sarcini deschise."
                : undefined
            }
          />
          {data?.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ScrollView>
        <BottomNav />
      </View>
    </SafeAreaView>
  );
}
function TaskCard({ task }: { task: TaskPublic }) {
  return (
    <Link href={{ pathname: "/task/[id]", params: { id: task.id } }} asChild>
      <Pressable accessibilityRole="button" style={s.card}>
        <View style={s.cardTop}>
          <Text style={s.category}>{categoryLabel[task.category]}</Text>
          <Text style={s.arrow}>↗</Text>
        </View>
        <Text style={s.cardTitle}>{task.title}</Text>
        <Text style={s.cardMeta}>⌖ {task.city}</Text>
        <Text style={s.cardMeta}>
          ◷ {interval(task.starts_at, task.ends_at)}
        </Text>
        {task.safety_note ? (
          <Text style={s.safety}>✳ {task.safety_note}</Text>
        ) : null}
        <View style={s.cardBottom}>
          <View>
            <Text style={s.price}>{formatBani(task.amount_bani)}</Text>
            <Text style={s.caption}>Sumă propusă</Text>
          </View>
          <Text style={s.details}>Vezi detalii →</Text>
        </View>
      </Pressable>
    </Link>
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
  hero: { marginTop: 38, marginBottom: 25 },
  eyebrow: {
    color: palette.purple,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
  },
  heading: {
    color: palette.dark,
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "800",
    letterSpacing: -1.4,
    marginTop: 12,
  },
  intro: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 350,
  },
  searchBox: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 15,
    backgroundColor: "#fff",
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 30,
  },
  searchIcon: { color: palette.purple, fontSize: 26, marginRight: 7 },
  searchInput: { flex: 1, color: palette.dark, fontSize: 14 },
  searchAction: { color: palette.purple, fontWeight: "800", fontSize: 12 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.dark,
    letterSpacing: -0.5,
  },
  count: { fontSize: 12, color: palette.purple },
  filters: { gap: 8, paddingVertical: 15 },
  filter: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.line,
    fontSize: 11,
    fontWeight: "700",
    color: palette.muted,
    overflow: "hidden",
  },
  filterActive: {
    backgroundColor: palette.purple,
    borderColor: palette.purple,
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    padding: 19,
    marginBottom: 13,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  category: {
    color: palette.purple,
    backgroundColor: palette.lavender,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 7,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },
  arrow: { color: palette.purple, fontSize: 22 },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.dark,
    letterSpacing: -0.3,
    marginVertical: 15,
  },
  cardMeta: { fontSize: 11, color: palette.muted, marginBottom: 6 },
  safety: {
    fontSize: 11,
    color: "#765bab",
    backgroundColor: "#f7f2ff",
    padding: 10,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 9,
  },
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    marginTop: 18,
    paddingTop: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  price: { color: palette.dark, fontWeight: "800", fontSize: 17 },
  caption: { color: "#9c96a4", fontSize: 10, marginTop: 3 },
  details: { color: palette.purple, fontSize: 11, fontWeight: "800" },
});
