import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/session";
import { api } from "../../api";
import { formatBani, NovaError } from "../../api/client";
import { errorMessage } from "../../lib/errors";
import { categoryLabel, schedule, taskStatusLabel } from "../../lib/labels";
import { Badge, Button, Icon, Page, State, useData } from "../../components/ui";
import { fonts, useTheme, type Colors } from "../../components/theme";

export default function TaskDetailScreen() {
  const { colors, isDark } = useTheme();
  const { session, restoring, client } = useAuth();
  const s = styles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => api.getTask(id), [id]);
  const { data, loading, error, reload } = useData(load);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  async function apply() {
    setActionError("");
    setBusy(true);
    try {
      await client.applyToTask(id, { message: message.trim() });
      router.push("/applications");
    } catch (e) {
      if (e instanceof NovaError && e.code === "profile_required") {
        router.push("/profile");
        return;
      }
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const task = data?.task;
  const when = task ? schedule(task.starts_at, task.ends_at) : undefined;
  return (
    <Page>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
        style={s.back}
      >
        <Icon name="arrow-back" color={colors.text} />
        <Text style={s.backText}>Înapoi</Text>
      </Pressable>
      <State loading={loading} error={error} onRetry={() => void reload()} />
      {task && when ? (
        <>
          <Badge>{categoryLabel[task.category]}</Badge>
          <View style={s.headingBlock}>
            <Text accessibilityRole="header" style={s.title}>
              {task.title}
            </Text>
            <Text style={s.poster}>Publicată de {task.poster_name}</Text>
          </View>
          <View style={s.facts}>
            <View style={s.pay}>
              <Text style={s.amount}>{formatBani(task.amount_bani)}</Text>
              <Text style={s.meta}>Sumă propusă</Text>
            </View>
            <View style={s.fact}>
              <Icon name="location-outline" />
              <Text style={s.factText}>{task.city}</Text>
            </View>
            <View style={s.fact}>
              <Icon name="calendar-outline" />
              <Text style={s.factText}>{when.date}</Text>
            </View>
            <View style={s.fact}>
              <Icon name="time-outline" />
              <Text style={s.factText}>{when.time}</Text>
            </View>
            <Text style={s.note}>Sumă propusă de organizator.</Text>
          </View>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Ce ai de făcut</Text>
            <Text style={s.body}>{task.description}</Text>
          </View>
          {task.safety_note ? (
            <View style={s.safety}>
              <View style={s.fact}>
                <Icon name="shield-checkmark-outline" color={colors.accent} />
                <Text style={s.sectionTitle}>Siguranță</Text>
              </View>
              <Text style={s.body}>{task.safety_note}</Text>
            </View>
          ) : null}
          {task.status === "open" && restoring ? (
            <State loading />
          ) : task.status === "open" && !session ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Vrei să aplici?</Text>
              <Text style={s.body}>
                Conectează-te sau creează un cont pentru a trimite un mesaj
                organizatorului.
              </Text>
              <Button onPress={() => router.push("/profile")}>
                Conectează-te pentru a aplica
              </Button>
            </View>
          ) : task.status === "open" ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Aplică la această sarcină</Text>
              <Text style={s.body}>
                Spune-i organizatorului cum poți ajuta.
              </Text>
              <View style={s.messageLabel}>
                <Text style={s.label}>Mesaj</Text>
                <Text style={s.meta}>{message.length}/280</Text>
              </View>
              <TextInput
                accessibilityLabel="Mesajul candidaturii"
                keyboardAppearance={isDark ? "dark" : "light"}
                editable={!busy}
                multiline
                maxLength={280}
                value={message}
                onChangeText={setMessage}
                placeholder="De exemplu, pot ajunge la ora stabilită și ajut la amenajare."
                placeholderTextColor={colors.muted}
                style={s.input}
              />
              {!message.trim() ? (
                <Text style={s.help}>
                  Scrie un mesaj pentru a putea aplica.
                </Text>
              ) : null}
              {actionError ? (
                <Text accessibilityRole="alert" style={s.error}>
                  {actionError}
                </Text>
              ) : null}
              <Button
                disabled={busy || !message.trim()}
                onPress={() => void apply()}
              >
                {busy ? "Se trimite..." : "Aplică"}
              </Button>
            </View>
          ) : (
            <View style={s.closed}>
              <Badge>{taskStatusLabel[task.status]}</Badge>
              <Text style={s.body}>
                Această sarcină nu mai primește aplicări.
              </Text>
            </View>
          )}
        </>
      ) : null}
    </Page>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    back: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      alignSelf: "flex-start",
    },
    backText: { fontFamily: fonts.bold, color: c.text, fontSize: 15 },
    headingBlock: { gap: 10 },
    title: {
      fontFamily: fonts.bold,
      color: c.text,
      fontSize: 28,
      lineHeight: 35,
      letterSpacing: -0.6,
    },
    poster: { fontFamily: fonts.body, color: c.muted, fontSize: 14 },
    facts: {
      padding: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
      gap: 14,
    },
    pay: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingBottom: 16,
      gap: 3,
    },
    amount: {
      fontFamily: fonts.bold,
      fontSize: 30,
      color: c.text,
      letterSpacing: -0.5,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    fact: { flexDirection: "row", alignItems: "center", gap: 10 },
    factText: {
      fontFamily: fonts.body,
      flex: 1,
      fontSize: 15,
      color: c.text,
      lineHeight: 22,
    },
    note: {
      fontFamily: fonts.body,
      color: c.muted,
      fontSize: 12,
      lineHeight: 18,
      paddingTop: 4,
    },
    section: { gap: 12 },
    sectionTitle: { fontFamily: fonts.bold, color: c.text, fontSize: 18 },
    body: {
      fontFamily: fonts.body,
      color: c.muted,
      fontSize: 15,
      lineHeight: 23,
    },
    safety: {
      backgroundColor: c.accentSoft,
      borderRadius: 24,
      padding: 16,
      gap: 10,
    },
    messageLabel: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
    },
    label: { fontFamily: fonts.bold, fontSize: 14, color: c.text },
    input: {
      fontFamily: fonts.body,
      minHeight: 120,
      padding: 14,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: 16,
      lineHeight: 23,
      borderRadius: 24,
    },
    help: {
      fontFamily: fonts.body,
      color: c.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    error: {
      fontFamily: fonts.body,
      backgroundColor: c.dangerSoft,
      color: c.danger,
      fontSize: 14,
      lineHeight: 21,
      borderRadius: 24,
      padding: 14,
      overflow: "hidden",
    },
    closed: {
      gap: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
    },
  });
