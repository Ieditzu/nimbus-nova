import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/session";
import { errorMessage } from "../lib/errors";
import { fonts, useTheme } from "./theme";
import { AuthField } from "./auth-fields";
import { Button, Icon } from "./ui";
export function PhoneForm() {
  const { session, updatePhone, signOut } = useAuth();
  const { colors } = useTheme();
  const [phone, setPhone] = useState(session?.user.phone_number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updatePhone(phone);
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={[
        s.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Icon name="call-outline" size={32} color={colors.text} />
      <Text
        accessibilityRole="header"
        style={[s.title, { color: colors.text }]}
      >
        Numărul tău de telefon
      </Text>
      <Text style={[s.body, { color: colors.muted }]}>
        Completează numărul pentru a deschide aplicația. Nu este afișat în
        anunțuri sau conversații.
      </Text>
      <AuthField
        label="Număr de telefon"
        value={phone}
        onChangeText={setPhone}
        editable={!busy}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+40 712 345 678"
        maxLength={30}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[s.body, { color: colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
      <Button disabled={busy || !phone.trim()} onPress={() => void save()}>
        {busy ? "Se salvează..." : "Salvează și continuă"}
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onPress={() => void signOut().catch((e) => setError(errorMessage(e)))}
      >
        Deconectează-te
      </Button>
    </View>
  );
}
const s = StyleSheet.create({
  card: { padding: 20, borderWidth: 1, borderRadius: 28, gap: 18 },
  title: { fontFamily: fonts.display, fontSize: 28 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
});
