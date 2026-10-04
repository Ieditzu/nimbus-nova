import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

export type ThemePreference = "dark" | "light" | "system";
// Slush-inspired paper grounds and a shared sticker palette. Status colors stay semantic.
export const fonts = {
  body: "Inter_500Medium",
  bold: "Inter_700Bold",
  display: "Anton_400Regular",
};
const light = {
  background: "#dceeff",
  surface: "#ffffff",
  raised: "#e9e9e9",
  text: "#000000",
  muted: "#41464d",
  border: "#000000",
  accent: "#000000",
  onAccent: "#ffffff",
  accentSoft: "#e9ccff",
  blue: "#4da2ff",
  mint: "#55db9c",
  lavender: "#e9ccff",
  yellow: "#ffd731",
  stickerInk: "#000000",
  danger: "#a52b19",
  dangerSoft: "#ffe4df",
  success: "#155c38",
  successSoft: "#dcf5e6",
  warning: "#694711",
  warningSoft: "#fff0d2",
};
export type Colors = typeof light;
const dark: Colors = {
  background: "#17181d",
  surface: "#24262d",
  raised: "#32343d",
  text: "#ffffff",
  muted: "#c0c3ce",
  border: "#adb1c1",
  accent: "#ffffff",
  onAccent: "#17181d",
  accentSoft: "#41334f",
  blue: "#4da2ff",
  mint: "#55db9c",
  lavender: "#e9ccff",
  yellow: "#ffd731",
  stickerInk: "#000000",
  danger: "#ffb4a5",
  dangerSoft: "#402822",
  success: "#ade9c5",
  successSoft: "#253b30",
  warning: "#ffe0a1",
  warningSoft: "#3c3423",
};
const storageKey = "nova.appearance";
const ThemeContext = createContext<{
  colors: Colors;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  storageError: string;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setValue] = useState<ThemePreference>("light");
  const [storageError, setStorageError] = useState("");
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (
          active &&
          !changed.current &&
          (value === "light" || value === "dark" || value === "system")
        )
          setValue(value);
      })
      .catch(() => {
        if (active) setStorageError("Preferința nu a putut fi încărcată.");
      });
    return () => {
      active = false;
    };
  }, []);
  function setPreference(value: ThemePreference) {
    changed.current = true;
    setValue(value);
    setStorageError("");
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(storageKey, value))
      .catch(() => {
        setStorageError(
          "Tema s-a schimbat, dar preferința nu a putut fi salvată.",
        );
      });
  }
  const isDark =
    preference === "system" ? system === "dark" : preference === "dark";
  return (
    <ThemeContext.Provider
      value={{
        colors: isDark ? dark : light,
        isDark,
        preference,
        setPreference,
        storageError,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is missing");
  return value;
}
