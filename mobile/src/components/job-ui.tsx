import { StyleSheet } from "react-native";
import { fonts, type Colors } from "./theme";
export const jobStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 26,
      padding: 20,
      gap: 12,
      backgroundColor: c.surface,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: 22,
      lineHeight: 29,
      color: c.text,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 22,
      color: c.muted,
    },
    price: { fontFamily: fonts.bold, fontSize: 26, color: c.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    section: { gap: 16 },
    label: { fontFamily: fonts.bold, color: c.text, fontSize: 15 },
    error: {
      fontFamily: fonts.body,
      color: c.danger,
      fontSize: 14,
      lineHeight: 22,
    },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 44,
    },
    chipText: { fontFamily: fonts.bold, fontSize: 12, color: c.text },
    input: {
      fontFamily: fonts.body,
      minHeight: 100,
      padding: 16,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: 16,
      textAlignVertical: "top",
    },
  });
