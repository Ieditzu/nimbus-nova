import { useCallback, useState } from "react";
import { Link } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../api";
import { formatBani } from "../api/client";
import type { Category, TaskPublic } from "../api/types";
import { categories, categoryLabel, schedule } from "../lib/labels";
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

const filterLabels: Record<Category, string> = {
  event_setup: "Evenimente",
  light_moving: "Mutări ușoare",
  shop_cover: "Magazine",
  other: "Altele",
};
export default function TaskListScreen() {
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  const [category, setCategory] = useState<Category | undefined>();
  const [city, setCity] = useState("București");
  const [appliedCity, setAppliedCity] = useState("București");
  const load = useCallback(
    () => api.listOpenTasks({ category, city: appliedCity }),
    [category, appliedCity],
  );
  const { data, loading, error, reload } = useData(load);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }
  function search() {
    const next = city.trim();
    if (next === appliedCity) void reload();
    else setAppliedCity(next);
  }
  return (
    <Page onRefresh={() => void refresh()} refreshing={refreshing}>
      <Header title="Sarcini" subtitle="Alege ce poți face și când." />
      <View style={s.searchSection}>
        <Text style={s.label}>Oraș</Text>
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Icon name="location-outline" />
            <TextInput
              accessibilityLabel="Oraș"
              placeholder="Toate orașele"
              placeholderTextColor={colors.muted}
              keyboardAppearance={isDark ? "dark" : "light"}
              value={city}
              onChangeText={setCity}
              onSubmitEditing={search}
              returnKeyType="search"
              style={s.searchInput}
            />
            {city ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Șterge orașul"
                onPress={() => {
                  setCity("");
                  setAppliedCity("");
                }}
                style={s.clear}
              >
                <Icon name="close-circle-outline" size={20} />
              </Pressable>
            ) : null}
          </View>
          <Button onPress={search}>Caută</Button>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filters}
      >
        {[undefined, ...categories].map((value) => (
          <Pressable
            key={value ?? "all"}
            accessibilityRole="button"
            accessibilityState={{ selected: category === value }}
            onPress={() => setCategory(value)}
            style={({ pressed }) => [
              s.filter,
              category === value && s.filterActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[s.filterText, category === value && s.filterTextActive]}
            >
              {value ? filterLabels[value] : "Toate"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.results}>
        <Text style={s.resultsTitle}>
          {category ? filterLabels[category] : "Sarcini disponibile"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizează sarcinile"
          disabled={loading}
          onPress={() => void refresh()}
          style={s.refresh}
        >
          <Icon name="refresh-outline" size={17} />
          <Text style={s.resultsCount}>
            {loading
              ? "Se încarcă"
              : `${data?.tasks.length ?? 0} ${data?.tasks.length === 1 ? "rezultat" : "rezultate"}`}
          </Text>
        </Pressable>
      </View>
      <State
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={
          !loading && !error && data?.tasks.length === 0
            ? "Nu există sarcini deschise."
            : undefined
        }
        emptyAction={
          <Button
            variant="outline"
            onPress={() => {
              setCategory(undefined);
              setCity("");
              setAppliedCity("");
            }}
          >
            Șterge filtrele
          </Button>
        }
      />
      {data?.tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </Page>
  );
}
function TaskCard({ task }: { task: TaskPublic }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const when = schedule(task.starts_at, task.ends_at);
  return (
    <Link href={{ pathname: "/task/[id]", params: { id: task.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${formatBani(task.amount_bani)}, vezi detalii`}
        style={s.card}
      >
        <View style={s.cardTop}>
          <Badge>{categoryLabel[task.category]}</Badge>
          <Icon name="chevron-forward" size={18} />
        </View>
        <Text style={s.cardTitle}>{task.title}</Text>
        <View style={s.meta}>
          <Icon name="location-outline" size={17} />
          <Text style={s.metaText}>{task.city}</Text>
        </View>
        <View style={s.meta}>
          <Icon name="calendar-outline" size={17} />
          <Text style={s.metaText}>{when.date}</Text>
        </View>
        <View style={s.meta}>
          <Icon name="time-outline" size={17} />
          <Text style={s.metaText}>{when.time}</Text>
        </View>
        {task.safety_note ? (
          <View style={s.safety}>
            <Icon name="shield-checkmark-outline" size={16} />
            <Text style={s.safetyText}>{task.safety_note}</Text>
          </View>
        ) : null}
        <View style={s.cardBottom}>
          <View>
            <Text style={s.price}>{formatBani(task.amount_bani)}</Text>
            <Text style={s.caption}>Sumă propusă</Text>
          </View>
          <Text style={s.details}>Vezi detalii</Text>
        </View>
      </Pressable>
    </Link>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    searchSection: { gap: 8 },
    label: { color: c.text, fontSize: 14, fontWeight: "600" },
    searchRow: { flexDirection: "row", gap: 8 },
    searchBox: {
      flex: 1,
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      backgroundColor: c.surface,
      gap: 6,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: c.text,
      fontSize: 16,
      paddingVertical: 12,
    },
    clear: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    filters: { gap: 8 },
    filter: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 22,
      backgroundColor: c.surface,
    },
    filterActive: { backgroundColor: c.accentSoft, borderColor: c.accent },
    filterText: { fontSize: 14, color: c.muted, fontWeight: "500" },
    filterTextActive: { color: c.accent },
    results: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: -8,
    },
    resultsTitle: { fontSize: 15, fontWeight: "600", color: c.text, flex: 1 },
    refresh: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    resultsCount: { fontSize: 12, color: c.muted },
    card: {
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.surface,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    cardTitle: {
      color: c.text,
      fontSize: 20,
      lineHeight: 27,
      fontWeight: "600",
      marginVertical: 16,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    metaText: { flex: 1, color: c.muted, fontSize: 14, lineHeight: 20 },
    safety: { flexDirection: "row", gap: 8, paddingTop: 8 },
    safetyText: { flex: 1, color: c.muted, fontSize: 12, lineHeight: 18 },
    cardBottom: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginTop: 16,
      paddingTop: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    price: {
      color: c.text,
      fontSize: 22,
      fontWeight: "600",
      letterSpacing: -0.4,
    },
    caption: { color: c.muted, fontSize: 12, marginTop: 3 },
    details: { fontSize: 14, fontWeight: "600", color: c.accent },
  });
