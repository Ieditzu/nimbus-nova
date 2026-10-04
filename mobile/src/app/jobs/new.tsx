import { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/session";
import type { Category } from "../../api/types";
import { categories, categoryLabel } from "../../lib/labels";
import { amountToBani, romanianDateTime } from "../../lib/job-form";
import { errorMessage } from "../../lib/errors";
import { AuthField } from "../../components/auth-fields";
import { Button, Header, Page } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { jobStyles } from "../../components/job-ui";
export default function NewJobScreen() {
  const { client, session } = useAuth();
  const { colors, isDark } = useTheme();
  const s = jobStyles(colors);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [safety, setSafety] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function publish() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const starts_at = romanianDateTime(date, start),
        ends_at = romanianDateTime(date, end);
      if (Date.parse(starts_at) <= Date.now())
        throw new Error("Alege o dată și o oră din viitor.");
      if (
        Date.parse(ends_at) <= Date.parse(starts_at) ||
        Date.parse(ends_at) - Date.parse(starts_at) > 12 * 3600000
      )
        throw new Error(
          "Sfârșitul trebuie să fie după început, la cel mult 12 ore.",
        );
      const result = await client.createTask({
        title: title.trim(),
        city: city.trim(),
        category,
        starts_at,
        ends_at,
        amount_bani: amountToBani(amount),
        description: description.trim(),
        safety_note: safety.trim(),
      });
      router.replace({
        pathname: "/jobs/[id]",
        params: { id: result.task.id },
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (session?.user.volunteer_only)
    return (
      <Page>
        <Header title="Publică o sarcină" />
        <Text style={s.body}>
          Publicarea este disponibilă conturilor de adult.
        </Text>
      </Page>
    );
  return (
    <Page>
      <Header
        title="Publică o sarcină"
        subtitle="Detalii clare, pentru omul potrivit."
      />
      <AuthField
        label="Titlu"
        value={title}
        onChangeText={setTitle}
        editable={!busy}
        maxLength={80}
        placeholder="De exemplu, ajutor la amenajarea unui eveniment"
      />
      <Text style={s.label}>Categorie</Text>
      <View style={s.row}>
        {categories.map((value) => (
          <Pressable
            key={value}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ checked: category === value }}
            onPress={() => setCategory(value)}
            style={[
              s.chip,
              {
                backgroundColor:
                  category === value ? colors.accentSoft : colors.surface,
              },
            ]}
          >
            <Text style={s.chipText}>{categoryLabel[value]}</Text>
          </Pressable>
        ))}
      </View>
      <AuthField
        label="Oraș"
        value={city}
        onChangeText={setCity}
        editable={!busy}
        maxLength={80}
        placeholder="Orașul în care are loc sarcina"
      />
      <AuthField
        label="Data (AAAA-LL-ZZ)"
        value={date}
        onChangeText={setDate}
        editable={!busy}
        placeholder="2026-10-15"
        maxLength={10}
      />
      <AuthField
        label="Ora de început (HH:MM)"
        value={start}
        onChangeText={setStart}
        editable={!busy}
        placeholder="09:00"
        maxLength={5}
      />
      <AuthField
        label="Ora de sfârșit (HH:MM)"
        value={end}
        onChangeText={setEnd}
        editable={!busy}
        placeholder="12:00"
        maxLength={5}
      />
      <Text style={s.body}>
        Orele sunt în fusul orar al României. Maximum 12 ore.
      </Text>
      <AuthField
        label="Sumă propusă (lei)"
        value={amount}
        onChangeText={setAmount}
        editable={!busy}
        keyboardType="decimal-pad"
        placeholder="150"
        maxLength={7}
      />
      <Text style={s.label}>Ce trebuie făcut</Text>
      <TextInput
        accessibilityLabel="Descriere"
        value={description}
        onChangeText={setDescription}
        editable={!busy}
        multiline
        maxLength={500}
        keyboardAppearance={isDark ? "dark" : "light"}
        placeholder="Explică sarcina, locul întâlnirii și ce trebuie să aducă persoana."
        placeholderTextColor={colors.muted}
        style={s.input}
      />
      <AuthField
        label="Detalii de siguranță (opțional)"
        value={safety}
        onChangeText={setSafety}
        editable={!busy}
        maxLength={200}
        placeholder="De exemplu, întâlnire într-un spațiu public"
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        disabled={
          busy ||
          title.trim().length < 3 ||
          city.trim().length < 2 ||
          description.trim().length < 10 ||
          !date ||
          !start ||
          !end ||
          !amount
        }
        onPress={() => void publish()}
      >
        {busy ? "Se publică..." : "Publică anunțul"}
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onPress={() => router.replace("/jobs")}
      >
        Renunță
      </Button>
    </Page>
  );
}
