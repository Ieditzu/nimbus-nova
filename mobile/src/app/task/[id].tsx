import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, applyToTask, getTask } from "../../api/client";
import { amount, categoryLabel, interval } from "../../api/format";
import { Button, Page, palette, State, useData } from "../../components/ui";
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => getTask(id), [id]);
  const { data, loading, error, reload } = useData(load);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  async function apply() {
    setActionError("");
    setBusy(true);
    try {
      await applyToTask(id, message.trim());
      router.push("/applications");
    } catch (e) {
      if (e instanceof ApiError && e.code === "profile_required") {
        router.push("/profile");
        return;
      }
      setActionError(e instanceof Error ? e.message : "A apărut o eroare.");
    } finally {
      setBusy(false);
    }
  }
  const task = data?.task;
  return (
    <Page>
      <Text onPress={() => router.back()} style={s.back}>
        ← Înapoi la sarcini
      </Text>
      <State loading={loading} error={error} onRetry={() => void reload()} />
      {task && (
        <>
          <Text style={s.category}>{categoryLabel[task.category]}</Text>
          <Text style={s.title}>{task.title}</Text>
          <View style={s.card}>
            <Text style={s.label}>DETALIILE SARCINII</Text>
            <View style={s.row}>
              <Text style={s.icon}>⌖</Text>
              <View>
                <Text style={s.detailLabel}>Locație</Text>
                <Text style={s.detail}>{task.city}</Text>
              </View>
            </View>
            <View style={s.row}>
              <Text style={s.icon}>◷</Text>
              <View>
                <Text style={s.detailLabel}>Când</Text>
                <Text style={s.detail}>
                  {interval(task.starts_at, task.ends_at)}
                </Text>
              </View>
            </View>
            <View style={s.row}>
              <Text style={s.icon}>◈</Text>
              <View>
                <Text style={s.detailLabel}>Sumă propusă</Text>
                <Text style={s.detail}>{amount(task.amount_bani)}</Text>
              </View>
            </View>
            <Text style={s.note}>
              Sumă propusă. În acest demo nu se încasează plata.
            </Text>
          </View>
          <Text style={s.heading}>Despre sarcină</Text>
          <Text style={s.body}>{task.description}</Text>
          {task.safety_note ? (
            <View style={s.safety}>
              <Text style={s.heading}>✳ Siguranță</Text>
              <Text style={s.body}>{task.safety_note}</Text>
            </View>
          ) : null}
          <Text style={s.heading}>Trimite candidatura</Text>
          <Text style={s.body}>
            Spune-i organizatorului de ce poți ajuta. Totul rămâne în Nova.
          </Text>
          <TextInput
            accessibilityLabel="Mesajul candidaturii"
            multiline
            maxLength={280}
            value={message}
            onChangeText={setMessage}
            placeholder="Ex. Pot ajunge cu 15 minute mai devreme..."
            style={s.input}
          />
          {actionError ? (
            <Text style={s.error} accessibilityRole="alert">
              {actionError}
            </Text>
          ) : null}
          <Button
            disabled={
              busy || message.trim().length === 0 || task.status !== "open"
            }
            onPress={() => void apply()}
          >
            {busy ? "Se trimite..." : "Aplică la sarcină →"}
          </Button>
          <Text style={s.disclaimer}>
            Demo pentru adulți. Fără angajare sau plată prin Nova.
          </Text>
        </>
      )}
    </Page>
  );
}
const s = StyleSheet.create({
  back: {
    color: palette.purple,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 30,
  },
  category: {
    alignSelf: "flex-start",
    color: palette.purple,
    backgroundColor: palette.lavender,
    padding: 8,
    borderRadius: 7,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: palette.dark,
    letterSpacing: -1.2,
    marginTop: 14,
    marginBottom: 22,
    lineHeight: 37,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    padding: 21,
    marginBottom: 26,
  },
  label: {
    fontSize: 10,
    color: palette.purple,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  icon: { fontSize: 25, color: palette.purple, width: 27 },
  detailLabel: { fontSize: 10, color: palette.muted },
  detail: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.dark,
    marginTop: 2,
  },
  note: { fontSize: 10, color: palette.muted, marginTop: 15 },
  heading: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.dark,
    marginBottom: 10,
  },
  body: {
    fontSize: 13,
    color: palette.muted,
    lineHeight: 21,
    marginBottom: 24,
  },
  safety: {
    padding: 18,
    backgroundColor: "#f2ecfa",
    borderRadius: 14,
    marginBottom: 25,
  },
  input: {
    height: 110,
    textAlignVertical: "top",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 13,
    padding: 14,
    fontSize: 13,
    color: palette.dark,
    marginBottom: 13,
  },
  error: {
    color: "#a44942",
    backgroundColor: "#fff0ee",
    padding: 12,
    borderRadius: 9,
    overflow: "hidden",
    marginBottom: 12,
  },
  disclaimer: {
    color: "#9d96a5",
    fontSize: 10,
    textAlign: "center",
    marginTop: 15,
  },
});
