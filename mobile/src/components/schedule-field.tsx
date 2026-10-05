import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import { romanianDateTime } from "../lib/job-form";
import { Button, Icon } from "./ui";
import { fonts, useTheme } from "./theme";
import type { ScheduleFieldProps } from "./schedule-field-types";

export function ScheduleField({ label, mode, value, date, minDate, disabled, onChange }: ScheduleFieldProps) {
 const { colors, isDark } = useTheme();
 const [open, setOpen] = useState(false);
 const [pending, setPending] = useState(new Date());
 function initial() {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  try { return new Date(romanianDateTime(mode === "date" ? value || today : date || today, mode === "time" ? value || "09:00" : "12:00")); }
  catch { return new Date(); }
 }
 function accept(selected: Date) {
  const options: Intl.DateTimeFormatOptions = mode === "date" ? { year: "numeric", month: "2-digit", day: "2-digit" } : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  onChange(new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: "Europe/Bucharest" }).format(selected));
  setOpen(false);
 }
 const picker = <DateTimePicker value={pending} mode={mode} timeZoneName="Europe/Bucharest" is24Hour
  minimumDate={mode === "date" && minDate ? new Date(romanianDateTime(minDate, "00:00")) : undefined}
  display={Platform.OS === "ios" ? "spinner" : "default"} themeVariant={isDark ? "dark" : "light"}
  onChange={(event, selected) => {
   if (Platform.OS === "android") { if (event.type === "set" && selected) accept(selected); else setOpen(false); }
   else if (selected) setPending(selected);
  }} />;
 return <View style={{ gap: 8 }}>
  <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.text }}>{label}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
   onPress={() => { setPending(initial()); setOpen(true); }}
   style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, padding: 12, backgroundColor: colors.raised, borderRadius: 12 }}>
   <Icon name={mode === "date" ? "calendar-outline" : "time-outline"} color={colors.muted} size={18} />
   <Text style={{ color: colors.text, fontFamily: fonts.body }}>{value ? (mode === "date" ? new Date(`${value}T12:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" }) : value) : (mode === "date" ? "Alege data" : "Alege ora")}</Text>
  </Pressable>
  {open && Platform.OS === "android" ? picker : null}
  {Platform.OS === "ios" ? <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
   <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.6)" }}>
    <View style={{ backgroundColor: colors.background, borderRadius: 24, padding: 20, gap: 16 }}>
     <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 18 }}>{label}</Text>
     {open ? picker : null}
     <Button onPress={() => accept(pending)}>Alege</Button>
     <Button variant="outline" onPress={() => setOpen(false)}>Renunță</Button>
    </View>
   </View>
  </Modal> : null}
 </View>;
}
