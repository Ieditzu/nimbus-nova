import { createElement } from "react";
import { Text, View } from "react-native";
import { fonts, useTheme } from "./theme";
import type { ScheduleFieldProps } from "./schedule-field-types";
export function ScheduleField({ label, mode, value, minDate, disabled, onChange }: ScheduleFieldProps) {
 const { colors, isDark } = useTheme();
 return <View style={{ gap: 8 }}>
  <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.text }}>{label}</Text>
  {createElement("input", {
   type: mode, value, min: mode === "date" ? minDate : undefined, disabled,
   "aria-label": label,
   onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
   style: { width: "100%", boxSizing: "border-box", minHeight: 52, padding: 14, borderRadius: 16,
    border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text,
    colorScheme: isDark ? "dark" : "light", fontFamily: "Inter, sans-serif", fontSize: 16 },
  })}
 </View>;
}
