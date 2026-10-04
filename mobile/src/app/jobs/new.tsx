import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../auth/session";
import type { JobType, TaskPublic } from "../../api/types";
import { jobCategories, jobTypeLabel } from "../../lib/labels";
import { amountToBani, romanianDateTime } from "../../lib/job-form";
import { errorMessage } from "../../lib/errors";
import { LocationField } from "../../components/location-field";
import { findLocation } from "../../lib/locations";
import { ScheduleField } from "../../components/schedule-field";
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
  const [county, setCounty] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [city, setCity] = useState("");
  const [jobType, setJobType] = useState<JobType>("short_term");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
      const place = findLocation(task.city, task.locality_id, task.county);
      setCounty(place?.county ?? ""); setLocalityId(place?.id ?? "");
      setTitle(task.title); setCity(task.city); setJobType(task.job_type ?? (task.amount_bani === 0 ? "volunteer" : "short_term"));
      setDate(day); setEndDate(local(task.ends_at)[0]); setStart(begins); setEnd(local(task.ends_at)[1]);
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
        ends_at = romanianDateTime(jobType === "long_term" ? endDate : date, end);
      if (Date.parse(starts_at) <= Date.now())
        throw new Error("Alege o dată și o oră din viitor.");
      if (
        Date.parse(ends_at) <= Date.parse(starts_at) ||
        Date.parse(ends_at) - Date.parse(starts_at) > (jobType === "long_term" ? 365 * 24 : 12) * 3600000
      )
        throw new Error(
          jobType === "long_term" ? "Alege un sfârșit după început, la cel mult un an." : "Sfârșitul trebuie să fie după început, la cel mult 12 ore.",
        );
      if (jobType !== "volunteer" && amountToBani(amount) === 0) throw new Error("Pentru un job plătit introdu o sumă mai mare decât zero.");
      const body = {
        title: title.trim(),
        city: city.trim(), county, locality_id: localityId,
        category: existing?.category ?? "other", job_type: jobType,
        starts_at,
        ends_at,
        amount_bani: jobType === "volunteer" ? 0 : amountToBani(amount),
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
        {jobCategories.map((value) => (
          <Pressable
            key={value}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ checked: jobType === value }}
            onPress={() => setJobType(value)}
            style={[
              s.chip,
              {
                backgroundColor:
                  jobType === value ? colors.accentSoft : colors.surface,
              },
            ]}
          >
            <Text style={s.chipText}>{jobTypeLabel[value]}</Text>
          </Pressable>
        ))}
      </View>
      <LocationField county={county} city={city} disabled={busy} onChange={(nextCounty, nextCity, nextId) => { setCounty(nextCounty); setCity(nextCity); setLocalityId(nextId); }} />
      <ScheduleField label="Data de început" mode="date" value={date} disabled={busy} onChange={setDate} />
      <ScheduleField label="Ora de început" mode="time" value={start} date={date} disabled={busy} onChange={setStart} />
      {jobType === "long_term" ? <ScheduleField label="Data de sfârșit" mode="date" value={endDate} minDate={date || undefined} disabled={busy} onChange={setEndDate} /> : null}
      <ScheduleField label="Ora de sfârșit" mode="time" value={end} date={jobType === "long_term" ? endDate : date} disabled={busy} onChange={setEnd} />
      <Text style={s.body}>{jobType === "long_term" ? "Alege perioada jobului. Orele sunt în fusul orar al României." : "Orele sunt în fusul orar al României. Maximum 12 ore."}</Text>
      {jobType === "volunteer" ? <Text style={s.body}>Voluntariat fără plată. Nu trebuie să introduci un preț.</Text> : <AuthField
        label="Sumă propusă (lei)" value={amount} onChangeText={setAmount} editable={!busy}
        keyboardType="decimal-pad" placeholder="150" maxLength={7} />}
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
          city.trim().length < 2 || !county || !localityId ||
          description.trim().length < 10 ||
          !date ||
          !start ||
          !end ||
          (jobType === "long_term" && !endDate) ||
          (jobType !== "volunteer" && !amount)
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
