import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { palette } from "../components/ui";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.cream },
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
