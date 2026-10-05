import {
  createContext,
  useContext,
  useEffect,
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
  AccessibilityInfo,
  Animated,
  Easing,
  useWindowDimensions,
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
import { fonts, useTheme } from "./theme";
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
/** Decorative stickers never convey task or verification status. */
export function Sticker({
  name = "sparkles",
  color,
  size = 44,
}: {
  name?: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.sticker,
        { width: size, height: size, backgroundColor: color ?? colors.yellow },
      ]}
    >
      <Icon name={name} size={size * 0.5} color={colors.stickerInk} />
    </View>
  );
}
export function Header({
  title,
  subtitle,
  action,
  hero = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  hero?: boolean;
}) {
  const { colors, isDark, setPreference } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  return (
    <View style={s.header}>
      <View style={s.brandRow}>
        <View style={s.brand}>
          <Sticker size={32} color={colors.mint} />
          <Text style={[s.wordmark, { color: colors.text }]}>NOVA</Text>
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
      <View style={[s.heading, hero && s.hero]}>
        {hero && fontScale <= 1.3 ? (
          <View
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={s.heroArt}
          >
            <View style={[s.ribbon, { borderColor: colors.blue }]} />
            <View style={s.heroSticker}>
              <Sticker
                name="arrow-up-outline"
                color={colors.yellow}
                size={34}
              />
            </View>
            <View style={s.smallSticker}>
              <Sticker name="star" color={colors.lavender} size={28} />
            </View>
          </View>
        ) : null}
        <Text
          accessibilityRole="header"
          style={[
            s.title,
            hero && s.heroTitle,
            hero && width < 360 && { fontSize: 40, lineHeight: 46 },
            hero && fontScale > 1.3 && { maxWidth: "100%" },
            { color: colors.text },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[s.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        ) : null}
      </View>
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
      edges={["top", "left", "right"]}
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
    </SafeAreaView>
  );
}
const dockTabs = [
  { href: "/" as const, icon: "search-outline" as const, label: "Joburi" },
  {
    href: "/jobs" as const,
    icon: "briefcase-outline" as const,
    label: "Anunțuri",
  },
  {
    href: "/messages" as const,
    icon: "chatbubbles-outline" as const,
    label: "Mesaje",
  },
  {
    href: "/profile" as const,
    icon: "person-outline" as const,
    label: "Profil",
  },
];
// Mounted beside the stack so the indicator survives screen changes.
export function BottomNav() {
  const path = usePathname();
  const { colors } = useTheme();
  const selectedIndex =
    path.startsWith("/profile") ||
    path.startsWith("/phone") ||
    path.startsWith("/applications")
      ? 3
      : path.startsWith("/messages")
        ? 2
        : path.startsWith("/jobs")
          ? 1
          : 0;
  const [position] = useState(() => new Animated.Value(selectedIndex));
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        changed = true;
        if (active) setReduceMotion(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !changed) setReduceMotion(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      position.stopAnimation();
      position.setValue(selectedIndex);
      return;
    }
    const animation = Animated.spring(position, {
      toValue: selectedIndex,
      stiffness: 320,
      damping: 30,
      mass: 0.8,
      overshootClamping: true,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [position, selectedIndex, reduceMotion]);
  const tabWidth = Math.max(0, (width - 12) / dockTabs.length);
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        s.bottom,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          style={[
            s.dockIndicator,
            {
              backgroundColor: colors.accent,
              width: tabWidth,
              transform: [
                { translateX: Animated.multiply(position, tabWidth) },
              ],
            },
          ]}
        />
      ) : null}
      {dockTabs.map((tab, index) => (
        <DockTab
          key={tab.href}
          tab={tab}
          selected={selectedIndex === index}
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  );
}
function DockTab({
  tab,
  selected,
  reduceMotion,
}: {
  tab: (typeof dockTabs)[number];
  selected: boolean;
  reduceMotion: boolean;
}) {
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation();
      progress.setValue(selected ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [selected, reduceMotion, progress]);
  return (
    <Link href={tab.href} replace asChild>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected }}
        style={s.navItem}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            s.navContent,
            {
              opacity: Animated.subtract(1, progress),
            },
          ]}
        >
          <Icon name={tab.icon} size={22} color={colors.text} />
          <Text style={[s.navText, { color: colors.text }]}>{tab.label}</Text>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[s.navContent, StyleSheet.absoluteFill, { opacity: progress }]}
        >
          <Icon name={tab.icon} size={22} color={colors.onAccent} />
          <Text style={[s.navText, { color: colors.onAccent }]}>
            {tab.label}
          </Text>
        </Animated.View>
      </Pressable>
    </Link>
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
          {error === "API oprit" ? "Nu ne putem conecta momentan." : error}
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
    <View
      style={[
        s.badge,
        { backgroundColor: background, borderColor: colors.border },
      ]}
    >
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
  header: { gap: 24, marginBottom: 4 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.5 },
  heading: { gap: 10 },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  hero: { paddingVertical: 12, minHeight: 168 },
  heroTitle: { fontSize: 46, lineHeight: 52, maxWidth: "76%" },
  heroArt: { position: "absolute", right: 0, top: 8, width: 60, height: 110 },
  ribbon: {
    position: "absolute",
    width: 52,
    height: 104,
    borderWidth: 14,
    borderRadius: 70,

    right: 0,
    top: 0,
  },
  heroSticker: { position: "absolute", right: -4, bottom: 0 },
  smallSticker: { position: "absolute", right: 30, top: -5 },
  sticker: {
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ rotate: "-12deg" }],
  },
  iconButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 999,
    padding: 5,
    marginHorizontal: 16,
    marginBottom: 0,
    maxWidth: 608,
    width: "92%",
    alignSelf: "center",
  },
  navItem: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  dockIndicator: {
    position: "absolute",
    left: 6,
    top: 6,
    bottom: 6,
    borderRadius: 999,
  },
  navContent: { alignItems: "center", justifyContent: "center", gap: 3 },
  navText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.3 },
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    letterSpacing: 0.2,
    flexShrink: 1,
    textAlign: "center",
  },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  state: { paddingVertical: 32, gap: 16, alignItems: "center" },
  notice: { padding: 20, gap: 12, borderRadius: 24 },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.15 },
});
