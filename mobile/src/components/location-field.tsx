import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { counties, locationSearch } from "../lib/locations";
import { fonts, useTheme } from "./theme";
import { Icon } from "./ui";
export function LocationField({ county, city, disabled, onChange }: {
 county: string; city: string; disabled: boolean;
 onChange: (county: string, city: string, localityId: string) => void;
}) {
 const { colors, isDark } = useTheme();
 const [mode, setMode] = useState<"county" | "city">();
 const [query, setQuery] = useState("");
 const options = useMemo(() => {
  const needle = locationSearch(query);
  const values = mode === "county" ? counties.map((item) => ({ id: item.name, name: item.name, area: "" })) : counties.find((item) => item.name === county)?.localities ?? [];
  return values.filter((item) => locationSearch(`${item.name} ${item.area}`).includes(needle));
 }, [mode, county, query]);
 function open(next: "county" | "city") { setQuery(""); setMode(next); }
 const field = (label: string, value: string, next: "county" | "city") => <View style={{ gap: 8 }}>
  <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 15 }}>{label}</Text>
  <Pressable disabled={disabled || (next === "city" && !county)} accessibilityRole="button" accessibilityLabel={label}
   onPress={() => open(next)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface }}>
   <Text style={{ fontFamily: fonts.body, color: value ? colors.text : colors.muted }}>{value || (next === "county" ? "Alege județul" : "Alege localitatea")}</Text>
   <Icon name="chevron-down-outline" color={colors.muted} />
  </Pressable>
 </View>;
 return <View style={{ gap: 16 }}>
  {field("Județ", county, "county")}{field("Oraș / localitate", city, "city")}
  <Modal visible={!!mode} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setMode(undefined)}>
   <SafeAreaView style={{ flex: 1, padding: 20, backgroundColor: colors.background, gap: 16 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
     <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.text, flex: 1 }}>{mode === "county" ? "Alege județul" : `Localități · ${county}`}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel="Închide lista" onPress={() => setMode(undefined)} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}><Icon name="close-outline" color={colors.text} /></Pressable>
    </View>
    <TextInput accessibilityLabel="Caută în listă" placeholder="Caută și fără diacritice" value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none"
     keyboardAppearance={isDark ? "dark" : "light"} placeholderTextColor={colors.muted}
     style={{ color: colors.text, fontFamily: fonts.body, fontSize: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, minHeight: 52 }} />
    <FlatList data={options} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
     ListEmptyComponent={<Text style={{ color: colors.muted }}>Nu am găsit localități. Încearcă altă căutare.</Text>}
     renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={item.area && item.area !== item.name ? `${item.name}, ${item.area}` : item.name}
      onPress={() => { onChange(mode === "county" ? item.name : county, mode === "county" ? "" : item.name, mode === "county" ? "" : item.id); setMode(undefined); }}
      style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border, gap: 4 }}>
      <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 16 }}>{item.name}</Text>
      {item.area && item.area !== item.name ? <Text style={{ color: colors.muted }}>{item.area}</Text> : null}
     </Pressable>} />
    <Text style={{ color: colors.muted, fontSize: 12 }}>Date: INS · SIRUTA 2026 · CC BY 4.0</Text>
   </SafeAreaView>
  </Modal>
 </View>;
}
