import { useCallback, useRef, useState, type ReactNode } from "react";
import { Link, useFocusEffect, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export const palette = {
  purple: "#7353d6",
  dark: "#28253b",
  muted: "#797588",
  cream: "#fbf9f5",
  line: "#e9e5ed",
  lavender: "#f0eafa",
};
export function useData<T>(load: () => Promise<T>, interval = 5000) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const invalidate = useCallback(() => {
    seq.current++;
  }, []);
  const reload = useCallback(async () => {
    const current = ++seq.current;
    try {
      const result = await load();
      if (current === seq.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === seq.current)
        setError(e instanceof Error ? e.message : "A apărut o eroare.");
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const start = Promise.resolve().then(() => {
        if (active) return reload();
      });
      const timer =
        interval > 0
          ? setInterval(() => {
              void reload();
            }, interval)
          : undefined;
      return () => {
        active = false;
        void start;
        if (timer) clearInterval(timer);
        invalidate();
      };
    }, [reload, interval, invalidate]),
  );
  return { data, loading, error, reload };
}
export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.mark}>
        <Text style={styles.markText}>✳</Text>
      </View>
      <View>
        <Text style={styles.brand}>Nova</Text>
        {subtitle && <Text style={styles.brandSub}>{subtitle}</Text>}
      </View>
    </View>
  );
}
export function Page({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.page}>
        {scroll ? (
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
        <BottomNav />
      </View>
    </SafeAreaView>
  );
}
export function BottomNav() {
  const path = usePathname();
  const tabs = [
    { href: "/" as const, icon: "⌂", label: "Descoperă" },
    { href: "/applications" as const, icon: "▤", label: "Candidaturile mele" },
    { href: "/profile" as const, icon: "◉", label: "Profil" },
  ];
  return (
    <View style={styles.bottom}>
      {tabs.map((tab) => (
        <Link href={tab.href} replace asChild key={tab.href}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: path === tab.href }}
            style={styles.navItem}
          >
            <Text style={[styles.navIcon, path === tab.href && styles.active]}>
              {tab.icon}
            </Text>
            <Text style={[styles.navText, path === tab.href && styles.active]}>
              {tab.label}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "outline";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === "outline" && styles.outline,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[styles.buttonText, variant === "outline" && styles.outlineText]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function State({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: string;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <View style={styles.state}>
        <ActivityIndicator color={palette.purple} />
        <Text style={styles.stateText}>Se încarcă...</Text>
      </View>
    );
  if (error)
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>{error}</Text>
        {onRetry && (
          <Pressable onPress={onRetry}>
            <Text style={styles.retry}>Reîncearcă →</Text>
          </Pressable>
        )}
      </View>
    );
  if (empty)
    return (
      <View style={styles.state}>
        <Text style={{ fontSize: 30, color: palette.purple }}>✳</Text>
        <Text style={styles.stateText}>{empty}</Text>
      </View>
    );
  return null;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.cream },
  page: { flex: 1 },
  scroll: {
    padding: 22,
    paddingBottom: 42,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: palette.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: "white", fontSize: 27, lineHeight: 32 },
  brand: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: palette.dark,
  },
  brandSub: { fontSize: 10, color: palette.muted, marginTop: 1 },
  bottom: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingBottom: 7,
    paddingTop: 10,
  },
  navItem: { flex: 1, alignItems: "center", gap: 2 },
  navIcon: { fontSize: 25, color: "#aca5b8", height: 31 },
  navText: { fontSize: 10, fontWeight: "700", color: "#a39cac" },
  active: { color: palette.purple },
  button: {
    backgroundColor: palette.purple,
    borderRadius: 13,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  outline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfc3e6" },
  outlineText: { color: palette.purple },
  state: { padding: 45, alignItems: "center", gap: 14 },
  stateText: {
    color: palette.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  error: {
    backgroundColor: "#fff0ee",
    padding: 15,
    borderRadius: 11,
    marginVertical: 14,
  },
  errorText: { color: "#a44942", fontSize: 13 },
  retry: { color: palette.purple, fontWeight: "800", marginTop: 8 },
});
