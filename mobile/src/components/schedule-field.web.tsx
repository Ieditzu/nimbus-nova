import { createElement } from "react";
import { Text, View } from "react-native";
import { fonts, useTheme } from "./theme";
import type { ScheduleFieldProps } from "./schedule-field-types";
export function ScheduleField({ label, mode, value, minDate, disabled, onChange }: ScheduleFieldProps) {
 const { colors, isDark } = useTheme();
 return <View style={{ gap: 8 }}>
  <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.muted }}>{label}</Text>
  {createElement("input", {
   type: mode, lang: "ro", value, min: mode === "date" ? minDate : undefined, disabled,
   "aria-label": label,
   onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
   style: { width: "100%", boxSizing: "border-box", minHeight: 52, padding: "12px 8px", borderRadius: 12, minWidth: 0,
    border: "none", background: colors.raised, color: colors.text,
    colorScheme: isDark ? "dark" : "light", fontFamily: "Inter, sans-serif", fontSize: mode === "date" ? 12 : 14 },
  })}
 </View>;
}
