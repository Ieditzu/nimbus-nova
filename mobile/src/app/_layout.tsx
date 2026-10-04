import { useFonts } from "expo-font";
import { Anton_400Regular } from "@expo-google-fonts/anton/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { AuthProvider } from "../auth/session";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../components/theme";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Anton_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });
  if (!loaded && !error) return null;
  return (
    <ThemeProvider>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </ThemeProvider>
  );
}
function Navigation() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="task/[id]" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="applications" />
      </Stack>
    </>
  );
}
