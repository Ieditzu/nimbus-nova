import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { errorMessage } from "../lib/errors";
import type { Profile } from "../api/types";
import { Button, Brand, Page, palette, State, useData } from "../components/ui";
export default function ProfileScreen() {
  const load = useCallback(() => api.getMyProfile(), []);
  const { data, loading, error, reload } = useData(load);
  return (
    <Page>
      <Brand />
      <Text style={s.eyebrow}>UN PROFIL, MAI MULTE OPORTUNITĂȚI</Text>
      <Text style={s.title}>
        Profilul <Text style={{ color: palette.purple }}>meu.</Text>
      </Text>
      <Text style={s.intro}>
        Spune câteva lucruri despre tine. Organizatorii văd doar informațiile
        utile pentru sarcină.
      </Text>
      <State loading={loading} error={error} onRetry={() => void reload()} />
      {!loading && !error && data?.profile && (
        <ProfileForm
          key={data.profile.user_id}
          profile={data.profile}
          onSaved={reload}
        />
      )}
    </Page>
  );
}
function ProfileForm({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: () => Promise<void>;
}) {
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [city, setCity] = useState(profile.city);
  const [availability, setAvailability] = useState(profile.availability);
  const [bio, setBio] = useState(profile.bio);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    setSaveError("");
    setSaved(false);
    try {
      await api.putMyProfile({
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        city: city.trim(),
        availability: availability.trim(),
        bio: bio.trim(),
      });
      setSaved(true);
      await onSaved();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      <Text style={s.label}>NUME</Text>
      <Text style={s.readOnly}>{profile.display_name}</Text>
      <Text style={s.help}>Numele este setat pentru acest demo.</Text>
      <Text style={s.label}>COMPETENȚE</Text>
      <TextInput
        accessibilityLabel="Competențe"
        value={skills}
        onChangeText={setSkills}
        placeholder="Ex. organizare, comunicare"
        style={s.input}
      />
      <Text style={s.help}>Desparte competențele prin virgulă.</Text>
      <Text style={s.label}>ORAȘ</Text>
      <TextInput
        accessibilityLabel="Oraș"
        value={city}
        onChangeText={setCity}
        placeholder="București"
        style={s.input}
      />
      <Text style={s.label}>DISPONIBILITATE</Text>
      <TextInput
        accessibilityLabel="Disponibilitate"
        value={availability}
        onChangeText={setAvailability}
        placeholder="Ex. După-amieze"
        style={s.input}
      />
      <Text style={s.label}>DESPRE MINE</Text>
      <TextInput
        accessibilityLabel="Despre mine"
        multiline
        maxLength={280}
        value={bio}
        onChangeText={setBio}
        placeholder="Câteva cuvinte despre tine"
        style={[s.input, s.textarea]}
      />
      {saveError ? (
        <Text style={s.error} accessibilityRole="alert">
          {saveError}
        </Text>
      ) : null}
      {saved ? <Text style={s.success}>Profilul a fost salvat.</Text> : null}
      <Button disabled={busy} onPress={() => void save()}>
        {busy ? "Se salvează..." : "Salvează profilul"}
      </Button>
    </View>
  );
}
const s = StyleSheet.create({
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
    marginBottom: 27,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 21,
    borderWidth: 1,
    borderColor: palette.line,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: palette.purple,
    marginBottom: 8,
    marginTop: 16,
  },
  readOnly: {
    color: palette.dark,
    fontSize: 15,
    fontWeight: "800",
    padding: 12,
    backgroundColor: "#f5f2f6",
    borderRadius: 9,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: palette.dark,
    backgroundColor: "#fff",
  },
  textarea: { height: 105, textAlignVertical: "top", marginBottom: 22 },
  help: { fontSize: 10, color: "#aaa4ad", marginTop: 7 },
  error: {
    color: "#a44942",
    backgroundColor: "#fff0ee",
    padding: 12,
    marginBottom: 13,
    borderRadius: 8,
    overflow: "hidden",
  },
  success: {
    color: "#347551",
    backgroundColor: "#edf7ef",
    padding: 12,
    marginBottom: 13,
    borderRadius: 8,
    overflow: "hidden",
  },
});
