import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useTheme, type Colors } from "./theme";
import { Icon } from "./ui";

export function AuthField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        keyboardAppearance={isDark ? "dark" : "light"}
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function PasswordField({
  newPassword = false,
  ...props
}: TextInputProps & { newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.field}>
      <Text style={s.label}>Parolă</Text>
      <View style={s.passwordBox}>
        <TextInput
          accessibilityLabel="Parolă"
          placeholderTextColor={colors.muted}
          keyboardAppearance={isDark ? "dark" : "light"}
          autoComplete={newPassword ? "new-password" : "current-password"}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={newPassword ? "Cel puțin 8 caractere" : "Parola ta"}
          style={s.passwordInput}
          {...props}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Ascunde parola" : "Arată parola"}
          disabled={props.editable === false}
          onPress={() => setVisible(!visible)}
          style={s.eye}
        >
          <Icon name={visible ? "eye-off-outline" : "eye-outline"} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
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
  });
