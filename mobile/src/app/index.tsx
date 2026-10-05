import { useCallback, useState } from "react";
import { Link, router } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../auth/session";
import { api } from "../api";
import { formatBani } from "../api/client";
import type { JobType, TaskPublic } from "../api/types";
import { jobCategories, jobTypeLabel, schedule } from "../lib/labels";
import { errorMessage } from "../lib/errors";
import {
  Button,
  Header,
  Icon,
  Page,
  State,
  Sticker,
  useData,
} from "../components/ui";
import { LocationField } from "../components/location-field";
import { fonts, useTheme, type Colors } from "../components/theme";

const filterLabels: Record<JobType, string> = {
  short_term: "Termen scurt",
  long_term: "Termen lung",
  volunteer: "Voluntariat",
};
export default function TaskListScreen() {
  const { client, session } = useAuth();
  const { colors } = useTheme();
  const s = styles(colors);
  const [category, setCategory] = useState<JobType | undefined>();
  const [phrase, setPhrase] = useState("");
  const [assistNote, setAssistNote] = useState("");
  const [applied, setApplied] = useState({ county: "", city: "", locality_id: "" });
  const load = useCallback(
    () => api.listOpenTasks({ job_type: category, ...applied }),
    [category, applied],
  );
  const { data, loading, error, reload } = useData(load);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }
  async function understand() {
    if (!session) { setAssistNote("Intră în cont ca să cauți în cuvinte."); return; }
    try {
      const result = await client.assistSearch(phrase);
      if (result.job_type === "short_term" || result.job_type === "long_term" || result.job_type === "volunteer") setCategory(result.job_type);
      if (result.city) setApplied(current => ({ ...current, city: result.city }));
      setAssistNote([result.city, result.job_type && filterLabels[result.job_type as JobType]].filter(Boolean).join(" · ") || "Nu am găsit un filtru clar.");
    } catch (e) { setAssistNote(errorMessage(e)); }
  }
  return (
    <Page onRefresh={() => void refresh()} refreshing={refreshing}>
      <Header
        title="Găsește un job"
        subtitle="Joburi plătite și voluntariat, în zona ta."
      />
      {!session?.user.volunteer_only ? <Button variant="outline" icon="add-outline" onPress={() => router.push("/jobs/new")}>Publică un job</Button> : null}
      <View style={s.searchSection}>
        <TextInput accessibilityLabel="Caută în cuvinte" value={phrase} onChangeText={setPhrase} maxLength={800} placeholder="De exemplu: mutat o masă sâmbătă în București" placeholderTextColor={colors.muted} style={{ fontFamily: fonts.body, fontSize: 16, color: colors.text, minHeight: 48 }} />
        <Button icon="sparkles" variant="outline" disabled={phrase.trim().length < 8} onPress={() => void understand()}>Înțelege căutarea</Button>
        {assistNote ? <Text style={{ color: colors.muted }}>{assistNote}</Text> : null}
        <Text style={s.label}>Unde cauți?</Text>
        <LocationField county={applied.county} city={applied.city} disabled={false} onChange={(county, city, locality_id) => {
          setApplied({ county, city, locality_id });
        }} />
        <Text style={s.locationHelp}>{applied.city ? `Rezultate din ${applied.city}, ${applied.county}` : applied.county ? `Toate localitățile din ${applied.county}` : "Vezi joburi din toată țara. Alege o zonă pentru rezultate mai apropiate."}</Text>
        {applied.county ? <Button variant="outline" onPress={() => setApplied({ county: "", city: "", locality_id: "" })}>Vezi toată țara</Button> : null}
      </View>
      <View style={s.filters}>
        {[undefined, ...jobCategories].map((value) => (
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
      </View>
      <View style={s.results}>
        <Text style={s.resultsTitle}>
          {category ? filterLabels[category] : "Joburi disponibile"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizează joburile"
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
            ? (applied.county || category ? "Nu am găsit joburi cu aceste filtre. Încearcă altă zonă sau toate categoriile." : session?.user.volunteer_only ? "Nu sunt joburi disponibile momentan. Revino mai târziu sau verifică altă zonă." : "Nu sunt joburi disponibile momentan. Poți publica primul anunț.")
            : undefined
        }
        emptyAction={applied.county || category ? (
          <Button variant="outline" onPress={() => { setCategory(undefined); setApplied({ county: "", city: "", locality_id: "" }); }}>Vezi toate joburile</Button>
        ) : undefined}
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
  const sticker = {
    event_setup: { color: colors.lavender, icon: "balloon-outline" as const },
    light_moving: { color: colors.mint, icon: "cube-outline" as const },
    shop_cover: { color: colors.blue, icon: "storefront-outline" as const },
    other: { color: colors.yellow, icon: "sparkles" as const },
  }[task.category];
  return (
    <Link href={{ pathname: "/task/[id]", params: { id: task.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${task.amount_bani === 0 ? "Voluntariat" : formatBani(task.amount_bani)}, vezi detalii`}
        style={s.card}
      >
        <View style={[s.cardTop, { backgroundColor: sticker.color }]}>
          <Sticker
            name={sticker.icon}
            color={colors.surface === "#ffffff" ? "#ffffff" : sticker.color}
            size={44}
          />
          <Text style={s.category}>{task.job_type ? jobTypeLabel[task.job_type] : categoryLabel[task.category]}</Text>
          <Icon name="arrow-forward" size={20} color={colors.stickerInk} />
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
            <Text style={s.price}>{task.amount_bani === 0 ? "Voluntariat" : formatBani(task.amount_bani)}</Text>
            <Text style={s.caption}>{task.amount_bani === 0 ? "Activitate fără plată" : "Plată propusă"}</Text>
          </View>
          <Text style={s.details}>Vezi detalii</Text>
        </View>
      </Pressable>
    </Link>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    searchSection: { gap: 16, backgroundColor: c.surface, borderRadius: 24, padding: 20 },
    label: { fontFamily: fonts.bold, color: c.text, fontSize: 14 },
    locationHelp: { fontFamily: fonts.body, color: c.muted, fontSize: 12, lineHeight: 19 },
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    filter: {
      minHeight: 48,
      flexBasis: "47%", flexGrow: 1,
      justifyContent: "center", alignItems: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 22,
      backgroundColor: c.surface,
    },
    filterActive: { backgroundColor: c.accent, borderColor: c.accent },
    filterText: { fontFamily: fonts.bold, fontSize: 13, color: c.text },
    filterTextActive: { color: c.onAccent },
    results: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: -8,
    },
    resultsTitle: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: c.text,
      flex: 1,
    },
    refresh: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    resultsCount: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
    card: {
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
      backgroundColor: c.surface,
    },
    cardTop: {
      padding: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#000000",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    category: {
      fontFamily: fonts.bold,
      color: c.stickerInk,
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    cardTitle: {
      fontFamily: fonts.bold,
      color: c.text,
      fontSize: 23,
      lineHeight: 29,
      marginVertical: 16,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    metaText: {
      fontFamily: fonts.body,
      flex: 1,
      color: c.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    safety: { flexDirection: "row", gap: 8, paddingTop: 8 },
    safetyText: {
      fontFamily: fonts.body,
      flex: 1,
      color: c.muted,
      fontSize: 12,
      lineHeight: 18,
    },
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
      fontFamily: fonts.bold,
      color: c.text,
      fontSize: 25,
      letterSpacing: -0.4,
    },
    caption: {
      fontFamily: fonts.body,
      color: c.muted,
      fontSize: 12,
      marginTop: 3,
    },
    details: { fontFamily: fonts.bold, fontSize: 14, color: c.accent },
  });
