import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../auth/session";
import { AuthForm } from "../components/auth-form";
import { NovaError } from "../api/client";
import type { Profile } from "../api/types";
import { errorMessage } from "../lib/errors";
import { Button, Header, Icon, Page, State, useData } from "../components/ui";
import {
  useTheme,
  type Colors,
  type ThemePreference,
} from "../components/theme";

export default function ProfileScreen() {
  const { colors, preference, setPreference, storageError } = useTheme();
  const s = styles(colors);
  const { session, restoring } = useAuth();
  const options: { value: ThemePreference; label: string }[] = [
    { value: "dark", label: "Întunecată" },
    { value: "light", label: "Luminoasă" },
    { value: "system", label: "Sistem" },
  ];
  return (
    <Page>
      <Header
        title="Profil"
        subtitle={
          session ? "Datele văzute de organizatori." : "Contul tău Nova."
        }
      />
      {restoring ? (
        <State loading />
      ) : session ? (
        <WorkerProfile />
      ) : (
        <AuthForm />
      )}
      <View style={s.appearance}>
        <Text style={s.sectionTitle}>Aspect</Text>
        <View style={s.options}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              aria-checked={preference === option.value}
              accessibilityState={{ checked: preference === option.value }}
              onPress={() => setPreference(option.value)}
              style={({ pressed }) => [
                s.option,
                preference === option.value && s.optionActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  s.optionText,
                  preference === option.value && s.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {storageError ? (
          <Text accessibilityRole="alert" style={s.help}>
            {storageError}
          </Text>
        ) : null}
      </View>
    </Page>
  );
}
function WorkerProfile() {
  const { session, signOut, notice, client } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const { colors } = useTheme();
  const s = styles(colors);
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await signOut();
    } catch (e) {
      setLogoutError(errorMessage(e));
    } finally {
      setLoggingOut(false);
    }
  }
  const load = useCallback(async () => {
    let result;
    try {
      result = await client.getMyProfile();
    } catch (e) {
      if (e instanceof NovaError && e.status === 404 && session)
        return {
          profile: {
            user_id: session.user.id,
            display_name: session.user.display_name,
            skills: [],
            city: "",
            availability: "",
            bio: "",
          } as Profile,
        };
      throw e;
    }
    if (result.profile.user_id !== session?.user.id)
      throw new NovaError(
        503,
        "profile_mismatch",
        "Profilul nu corespunde contului conectat.",
      );
    return result;
  }, [session, client]);
  const { data, loading, error, reload } = useData(load);
  return (
    <>
      {notice ? <Text style={s.help}>{notice}</Text> : null}
      <Button
        variant="outline"
        disabled={loggingOut}
        onPress={() => void logout()}
      >
        {loggingOut ? "Se deconectează..." : "Deconectează-te"}
      </Button>
      {logoutError ? (
        <Text accessibilityRole="alert" style={s.error}>
          {logoutError}
        </Text>
      ) : null}
      <State loading={loading} error={error} onRetry={() => void reload()} />
      {data?.profile ? (
        <ProfileForm key={data.profile.user_id} profile={data.profile} />
      ) : null}
    </>
  );
}
function ProfileForm({ profile }: { profile: Profile }) {
  const { client, session } = useAuth();
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [city, setCity] = useState(profile.city);
  const [availability, setAvailability] = useState(profile.availability);
  const [bio, setBio] = useState(profile.bio);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const inputProps = {
    placeholderTextColor: colors.muted,
    keyboardAppearance: isDark ? ("dark" as const) : ("light" as const),
    editable: !busy,
  };
  function edit(setValue: (value: string) => void) {
    return (value: string) => {
      setValue(value);
      setSaved(false);
    };
  }
  async function save() {
    setBusy(true);
    setSaveError("");
    setSaved(false);
    try {
      const result = await client.putMyProfile({
        skills: skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        city: city.trim(),
        availability: availability.trim(),
        bio: bio.trim(),
      });
      setSkills(result.profile.skills.join(", "));
      setCity(result.profile.city);
      setAvailability(result.profile.availability);
      setBio(result.profile.bio);
      setSaved(true);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.form}>
      <View style={s.identity}>
        <View style={s.avatar}>
          <Icon name="person-outline" size={25} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{profile.display_name}</Text>
          <Text style={s.help}>
            {session?.user.volunteer_only
              ? "Cont pentru voluntariat"
              : "Contul tău Nova"}
          </Text>
        </View>
      </View>
      <View style={s.field}>
        <Text style={s.label}>Competențe</Text>
        <TextInput
          {...inputProps}
          accessibilityLabel="Competențe"
          value={skills}
          onChangeText={edit(setSkills)}
          placeholder="Organizare, comunicare"
          style={s.input}
        />
        <Text style={s.help}>Separă prin virgulă. Maximum 8 competențe.</Text>
      </View>
      <View style={s.field}>
        <Text style={s.label}>Oraș</Text>
        <TextInput
          {...inputProps}
          accessibilityLabel="Oraș"
          maxLength={80}
          value={city}
          onChangeText={edit(setCity)}
          placeholder="București"
          style={s.input}
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Disponibilitate</Text>
        <TextInput
          {...inputProps}
          accessibilityLabel="Disponibilitate"
          maxLength={80}
          value={availability}
          onChangeText={edit(setAvailability)}
          placeholder="De exemplu, după-amiaza"
          style={s.input}
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>
          Despre mine <Text style={s.optional}>(opțional)</Text>
        </Text>
        <TextInput
          {...inputProps}
          accessibilityLabel="Despre mine"
          multiline
          maxLength={280}
          value={bio}
          onChangeText={edit(setBio)}
          placeholder="Ce ar trebui să știe organizatorul?"
          style={[s.input, s.textarea]}
        />
        <Text style={s.counter}>{bio.length}/280</Text>
      </View>
      {saveError ? (
        <Text accessibilityRole="alert" style={s.error}>
          {saveError}
        </Text>
      ) : null}
      {saved ? (
        <View accessibilityLiveRegion="polite" style={s.success}>
          <Icon name="checkmark-circle-outline" color={colors.success} />
          <Text style={s.successText}>Profilul a fost salvat.</Text>
        </View>
      ) : null}
      <Button disabled={busy} onPress={() => void save()}>
        {busy ? "Se salvează..." : "Salvează profilul"}
      </Button>
    </View>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    appearance: { gap: 12 },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: "600" },
    options: { flexDirection: "row", gap: 6 },
    option: {
      flex: 1,
      minHeight: 48,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      padding: 8,
    },
    optionActive: { backgroundColor: c.accentSoft, borderColor: c.accent },
    optionText: { color: c.muted, fontSize: 13, fontWeight: "500" },
    optionTextActive: { color: c.accent },
    form: { gap: 20 },
    identity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 24,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.accentSoft,
    },
    name: { color: c.text, fontSize: 19, fontWeight: "600" },
    field: { gap: 8 },
    label: { color: c.text, fontSize: 14, fontWeight: "600" },
    optional: { color: c.muted, fontWeight: "400" },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
      minHeight: 50,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.surface,
    },
    textarea: { minHeight: 110, textAlignVertical: "top" },
    help: { fontSize: 12, color: c.muted, lineHeight: 18 },
    counter: { fontSize: 12, color: c.muted, textAlign: "right" },
    error: {
      color: c.danger,
      backgroundColor: c.dangerSoft,
      padding: 14,
      borderRadius: 10,
      overflow: "hidden",
      fontSize: 14,
      lineHeight: 21,
    },
    success: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      padding: 14,
      backgroundColor: c.successSoft,
      borderRadius: 10,
    },
    successText: { color: c.success, fontSize: 14 },
  });
