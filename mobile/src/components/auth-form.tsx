import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { useAuth } from "../auth/session";
import { useTheme, type Colors } from "./theme";
import { Button, Icon } from "./ui";
import { errorMessage } from "../lib/errors";

export function AuthForm() {
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  const { signIn, notice, restore } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const signup = mode === "signup";
  const props = {
    placeholderTextColor: colors.muted,
    keyboardAppearance: isDark ? ("dark" as const) : ("light" as const),
    editable: !busy,
  };
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    ? new Date(`${birthDate}T12:00:00`)
    : null;
  const adultDate = birth
    ? new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate())
    : null;
  const minor =
    adultDate && !Number.isNaN(adultDate.getTime()) && adultDate > new Date();
  async function submit() {
    setBusy(true);
    setError("");
    setConfirmation("");
    let created = false;
    try {
      if (signup) {
        await api.register({
          role: "worker",
          email: email.trim(),
          password,
          display_name: name.trim(),
          birth_date: birthDate.trim(),
          ...(minor ? { guardian_email: guardianEmail.trim() } : {}),
        });
        created = true;
      }
      await signIn(email, password);
      setPassword("");
    } catch (e) {
      setError(errorMessage(e));
      if (created) {
        setMode("login");
        setConfirmation(
          "Contul a fost creat. Conectează-te pentru a continua.",
        );
        setPassword("");
      }
    } finally {
      setBusy(false);
    }
  }
  function switchMode() {
    setMode(signup ? "login" : "signup");
    setError("");
    setConfirmation("");
    setPassword("");
  }
  return (
    <View style={s.form}>
      <View style={s.intro}>
        <Text style={s.title}>
          {signup ? "Creează un cont" : "Conectează-te"}
        </Text>
        <Text style={s.body}>
          {signup
            ? "Caută sarcini și trimite aplicări din contul tău."
            : "Intră în cont pentru profil și aplicări."}
        </Text>
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
      {signup ? (
        <View style={s.field}>
          <Text style={s.label}>Nume complet</Text>
          <TextInput
            {...props}
            accessibilityLabel="Nume complet"
            autoComplete="name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            placeholder="Numele tău"
            style={s.input}
          />
        </View>
      ) : null}
      <View style={s.field}>
        <Text style={s.label}>Email</Text>
        <TextInput
          {...props}
          accessibilityLabel="Email"
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          placeholder="nume@exemplu.ro"
          style={s.input}
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Parolă</Text>
        <View style={s.passwordBox}>
          <TextInput
            {...props}
            accessibilityLabel="Parolă"
            autoComplete={signup ? "new-password" : "current-password"}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            placeholder={signup ? "Cel puțin 8 caractere" : "Parola ta"}
            onSubmitEditing={() => {
              if (!signup && email.trim() && password && !busy) void submit();
            }}
            style={s.passwordInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? "Ascunde parola" : "Arată parola"}
            onPress={() => setVisible(!visible)}
            style={s.eye}
          >
            <Icon name={visible ? "eye-off-outline" : "eye-outline"} />
          </Pressable>
        </View>
      </View>
      {signup ? (
        <>
          <View style={s.field}>
            <Text style={s.label}>Data nașterii</Text>
            <TextInput
              {...props}
              accessibilityLabel="Data nașterii"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="AAAA-LL-ZZ"
              style={s.input}
            />
            <Text style={s.help}>
              De exemplu, 2000-06-15. Sub 18 ani, contul este doar pentru
              voluntariat.
            </Text>
          </View>
          {minor ? (
            <View style={s.field}>
              <Text style={s.label}>Emailul tutorelui</Text>
              <TextInput
                {...props}
                accessibilityLabel="Emailul tutorelui"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={guardianEmail}
                onChangeText={setGuardianEmail}
                placeholder="Emailul părintelui sau tutorelui"
                style={s.input}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        disabled={
          busy ||
          !email.trim() ||
          !password ||
          (signup &&
            (!name.trim() ||
              !birthDate.trim() ||
              (Boolean(minor) && !guardianEmail.trim())))
        }
        onPress={() => void submit()}
      >
        {busy
          ? "Se conectează..."
          : signup
            ? "Creează contul"
            : "Conectează-te"}
      </Button>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={switchMode}
        style={s.switch}
      >
        <Text style={s.switchText}>
          {signup ? "Ai deja cont? Conectează-te" : "Nu ai cont? Creează unul"}
        </Text>
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
    field: { gap: 8 },
    label: { color: c.text, fontSize: 14, fontWeight: "600" },
    input: {
      backgroundColor: c.surface,
      color: c.text,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      minHeight: 50,
      fontSize: 16,
    },
    passwordBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
    },
    passwordInput: {
      flex: 1,
      minWidth: 0,
      color: c.text,
      fontSize: 16,
      padding: 14,
      minHeight: 50,
    },
    eye: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    help: { color: c.muted, fontSize: 12, lineHeight: 18 },
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
