import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/session";
import type { Category, TaskPublic } from "../../api/types";
import { categories, categoryLabel } from "../../lib/labels";
import { amountToBani, romanianDateTime } from "../../lib/job-form";
import { errorMessage } from "../../lib/errors";
import { AuthField } from "../../components/auth-fields";
import { Button, Header, Page, State } from "../../components/ui";
import { useTheme } from "../../components/theme";
import { jobStyles } from "../../components/job-ui";
export default function NewJobScreen() {
  const { client, session } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [existing, setExisting] = useState<TaskPublic>();
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
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void client.getTask(id).then(({ task }) => {
      if (cancelled) return;
      if (task.poster_id !== session?.user.id || task.status !== "open") throw new Error("Poți edita doar anunțurile tale deschise.");
      const local = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)).split(" ");
      const [day, begins] = local(task.starts_at);
      setTitle(task.title); setCity(task.city); setCategory(task.category);
      setDate(day); setStart(begins); setEnd(local(task.ends_at)[1]);
      setAmount((task.amount_bani / 100).toFixed(2));
      setDescription(task.description); setSafety(task.safety_note); setExisting(task);
    }).catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [id, client, session?.user.id]);
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
      const body = {
        title: title.trim(),
        city: city.trim(),
        category,
        starts_at,
        ends_at,
        amount_bani: amountToBani(amount),
        description: description.trim(),
        safety_note: safety.trim(),
        photo_url: existing?.photo_url, sector: existing?.sector, lat: existing?.lat, lng: existing?.lng,
      };
      const result = id ? await client.updateTask(id, body) : await client.createTask(body);
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
  if (id && existing?.id !== id) return <Page><Header title="Editează anunțul" /><State loading={!error} error={error} /><Button variant="outline" onPress={() => router.replace("/jobs")}>Toate anunțurile</Button></Page>;
  if (session?.user.volunteer_only)
    return (
      <Page>
        <Header title="Publică o sarcină" />
        <Text style={s.body}>
          Publicarea este disponibilă de la 16 ani.
        </Text>
      </Page>
    );
  return (
    <Page>
      <Header
        title={id ? "Editează anunțul" : "Publică o sarcină"}
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
        {busy ? "Se salvează..." : id ? "Salvează modificările" : "Publică anunțul"}
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
