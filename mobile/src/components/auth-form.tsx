import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/session";
import { useTheme, type Colors } from "./theme";
import { Button, usePageScroll } from "./ui";
import { AuthField, PasswordField } from "./auth-fields";
import { SignupForm } from "./signup-form";
import { errorMessage } from "../lib/errors";

export function AuthForm() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { signIn, notice, restore } = useAuth();
  const [signup, setSignup] = useState(false);
  const scrollToTop = usePageScroll();
  useEffect(() => {
    scrollToTop();
  }, [signup, scrollToTop]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      setPassword("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (signup)
    return (
      <SignupForm
        initialEmail={email}
        onLogin={(value, message) => {
          setEmail(value);
          setPassword("");
          setConfirmation(message ?? "");
          setError("");
          setSignup(false);
        }}
      />
    );
  return (
    <View style={s.form}>
      <View style={s.intro}>
        <Text style={s.title}>Conectează-te</Text>
        <Text style={s.body}>Intră în cont pentru profil și aplicări.</Text>
      </View>
      {notice ? (
        <View style={s.notice}>
          <Text style={s.body}>{notice}</Text>
          <Button
            variant="outline"
            disabled={busy}
            onPress={() => void restore()}
          >
            Reverifică sesiunea
          </Button>
        </View>
      ) : null}
      {confirmation ? (
        <Text accessibilityLiveRegion="polite" style={s.body}>
          {confirmation}
        </Text>
      ) : null}
      <AuthField
        label="Email"
        editable={!busy}
        autoComplete="email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        placeholder="nume@exemplu.ro"
      />
      <PasswordField
        editable={!busy}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => {
          if (email.trim() && password && !busy) void submit();
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        disabled={busy || !email.trim() || !password}
        onPress={() => void submit()}
      >
        {busy ? "Se conectează..." : "Conectează-te"}
      </Button>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          setPassword("");
          setError("");
          setSignup(true);
        }}
        style={s.switch}
      >
        <Text style={s.switchText}>Nu ai cont? Creează unul</Text>
      </Pressable>
    </View>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    form: {
      gap: 18,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 24,
    },
    intro: { gap: 8 },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    body: { fontSize: 14, lineHeight: 21, color: c.muted },
    error: {
      color: c.danger,
      backgroundColor: c.dangerSoft,
      padding: 14,
      borderRadius: 10,
      fontSize: 14,
      lineHeight: 21,
      overflow: "hidden",
    },
    switch: { minHeight: 48, justifyContent: "center", alignItems: "center" },
    switchText: {
      color: c.accent,
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },
    notice: { gap: 12 },
  });
