import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, useFocusEffect, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { errorMessage } from "../lib/errors";
import { useTheme } from "./theme";
export function useData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const invalidate = useCallback(() => {
    seq.current++;
  }, []);
  const reload = useCallback(async () => {
    const current = ++seq.current;
    setLoading(true);
    try {
      const result = await load();
      if (current === seq.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === seq.current) {
        setError(errorMessage(e));
        setData(undefined);
      }
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
      return () => {
        active = false;
        void start;
        invalidate();
      };
    }, [reload, invalidate]),
  );
  return { data, loading, error, reload };
}
export function Icon({
  name,
  size = 20,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.muted} />;
}
export function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { colors, isDark, setPreference } = useTheme();
  return (
    <View style={s.header}>
      <View style={s.grow}>
        <Text style={[s.wordmark, { color: colors.accent }]}>nova</Text>
        <Text
          accessibilityRole="header"
          style={[s.title, { color: colors.text }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[s.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action ?? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isDark ? "Activează tema luminoasă" : "Activează tema întunecată"
          }
          onPress={() => setPreference(isDark ? "light" : "dark")}
          style={({ pressed }) => [
            s.iconButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.65 : 1,
            },
          ]}
        >
          <Icon
            name={isDark ? "sunny-outline" : "moon-outline"}
            color={colors.text}
          />
        </Pressable>
      )}
    </View>
  );
}
const PageScrollContext = createContext<() => void>(() => {});
export const usePageScroll = () => useContext(PageScrollContext);

export function Page({
  children,
  onRefresh,
  refreshing = false,
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: 0, animated: false }),
    );
  }, []);
  return (
    <SafeAreaView
      style={[s.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        ref={scroll}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          ) : undefined
        }
      >
        <PageScrollContext.Provider value={scrollToTop}>
          {children}
        </PageScrollContext.Provider>
      </ScrollView>
      {footer ? (
        <View
          style={[
            s.footer,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          {footer}
        </View>
      ) : null}
      <BottomNav />
    </SafeAreaView>
  );
}
export function BottomNav() {
  const path = usePathname();
  const { colors } = useTheme();
  const tabs = [
    { href: "/" as const, icon: "search-outline" as const, label: "Sarcini" },
    {
      href: "/applications" as const,
      icon: "file-tray-outline" as const,
      label: "Aplicări",
    },
    {
      href: "/profile" as const,
      icon: "person-outline" as const,
      label: "Profil",
    },
  ];
  return (
    <View
      style={[
        s.bottom,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      {tabs.map((tab) => {
        const selected =
          path === tab.href || (tab.href === "/" && path.startsWith("/task/"));
        return (
          <Link href={tab.href} replace asChild key={tab.href}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={s.navItem}
            >
              <View
                style={[
                  s.navIcon,
                  selected && { backgroundColor: colors.accentSoft },
                ]}
              >
                <Icon
                  name={tab.icon}
                  size={22}
                  color={selected ? colors.accent : colors.muted}
                />
              </View>
              <Text
                style={[
                  s.navText,
                  { color: selected ? colors.accent : colors.muted },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}
export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  icon,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "outline";
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const foreground = variant === "primary" ? colors.onAccent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor:
            variant === "primary" ? colors.accent : colors.surface,
          borderColor: variant === "primary" ? colors.accent : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={19} color={foreground} /> : null}
      <Text style={[s.buttonText, { color: foreground }]}>{children}</Text>
    </Pressable>
  );
}
export function State({
  loading,
  error,
  empty,
  onRetry,
  emptyAction,
}: {
  loading?: boolean;
  error?: string;
  empty?: string;
  onRetry?: () => void;
  emptyAction?: ReactNode;
}) {
  const { colors } = useTheme();
  if (loading)
    return (
      <View style={s.state}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[s.body, { color: colors.muted }]}>Se încarcă...</Text>
      </View>
    );
  if (error)
    return (
      <View style={[s.notice, { backgroundColor: colors.dangerSoft }]}>
        <Text
          accessibilityRole="alert"
          style={[s.body, { color: colors.danger }]}
        >
          {error}
        </Text>
        {error === "API oprit" ? (
          <Text style={[s.body, { color: colors.danger }]}>
            Nu putem încărca datele. Verifică conexiunea și încearcă din nou.
          </Text>
        ) : null}
        {onRetry ? (
          <Button variant="outline" icon="refresh-outline" onPress={onRetry}>
            Reîncearcă
          </Button>
        ) : null}
      </View>
    );
  if (empty)
    return (
      <View style={s.state}>
        <Icon name="file-tray-outline" size={30} />
        <Text style={[s.body, { color: colors.muted, textAlign: "center" }]}>
          {empty}
        </Text>
        {emptyAction}
      </View>
    );
  return null;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const { colors } = useTheme();
  const foreground = tone === "neutral" ? colors.muted : colors[tone];
  const background = tone === "neutral" ? colors.raised : colors[`${tone}Soft`];
  return (
    <View style={[s.badge, { backgroundColor: background }]}>
      <Text style={[s.badgeText, { color: foreground }]}>{children}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 28,
    gap: 20,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 4,
  },
  grow: { flex: 1 },
  wordmark: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.7,
    lineHeight: 38,
  },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  iconButton: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 5,
  },
  navItem: { flex: 1, minHeight: 58, alignItems: "center", gap: 3 },
  navIcon: { paddingHorizontal: 20, paddingVertical: 5, borderRadius: 16 },
  navText: { fontSize: 12, fontWeight: "600" },
  button: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 21 },
  state: { paddingVertical: 32, gap: 16, alignItems: "center" },
  notice: { padding: 16, gap: 12, borderRadius: 12 },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  badge: {
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
});
