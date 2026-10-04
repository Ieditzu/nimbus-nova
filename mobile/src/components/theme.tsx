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
const dark = {
  background: "#101615",
  surface: "#19211f",
  raised: "#222d29",
  text: "#f0f4f2",
  muted: "#a9b8b0",
  border: "#34433c",
  accent: "#96e0ba",
  onAccent: "#112b1e",
  accentSoft: "#263c31",
  danger: "#ffb4ac",
  dangerSoft: "#392522",
  success: "#96e0ba",
  successSoft: "#263c31",
  warning: "#e8ca89",
  warningSoft: "#373020",
};
export type Colors = typeof dark;
const light: Colors = {
  background: "#f4f6f3",
  surface: "#ffffff",
  raised: "#eaf0e9",
  text: "#17261e",
  muted: "#526359",
  border: "#d0dbd0",
  accent: "#256247",
  onAccent: "#ffffff",
  accentSoft: "#dfede3",
  danger: "#a1332b",
  dangerSoft: "#fbe9e6",
  success: "#256247",
  successSoft: "#dfede3",
  warning: "#795510",
  warningSoft: "#f5ecd8",
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
  const [preference, setValue] = useState<ThemePreference>("dark");
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
