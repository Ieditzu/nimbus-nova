import { PwaProvider } from "../pwa/install";
import { NotificationsProvider } from "../notifications/provider";
import { useFonts } from "expo-font";
import { Anton_400Regular } from "@expo-google-fonts/anton/400Regular";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "../components/ui";
import { AuthProvider, useAuth } from "../auth/session";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../components/theme";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Anton_400Regular,
    Manrope_500Medium,
    Manrope_800ExtraBold,
  });
  if (!loaded && !error) return null;
  return (
    <ThemeProvider>
      <AuthProvider>
        <PwaProvider><NotificationsProvider><Navigation /></NotificationsProvider></PwaProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
function Navigation() {
  const { colors, isDark } = useTheme();
  const { session, restoring } = useAuth();
  const ready = !!session?.user.phone_number;
  if (restoring)
    return (
      <View style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
        }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator color={colors.text} />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="profile" />
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="phone" />
        </Stack.Protected>
        <Stack.Protected guard={ready}>
          <Stack.Screen name="index" />
          <Stack.Screen name="task/[id]" />
          <Stack.Screen name="applications" />
          <Stack.Screen name="jobs/index" />
          <Stack.Screen name="jobs/new" />
          <Stack.Screen name="jobs/[id]" />
          <Stack.Screen name="messages/index" />
          <Stack.Screen name="messages/[id]" />
        </Stack.Protected>
      </Stack>
      {ready ? (
        <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: colors.background, flexShrink: 0 }}>
          <BottomNav />
        </SafeAreaView>
      ) : null}
    </View>
  );
}
