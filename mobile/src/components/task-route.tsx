import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import {
  fetchRoute,
  formatDistance,
  formatDuration,
  googleMapsUrl,
  type LatLng,
  type RouteInfo,
} from "../lib/geo";
import { errorMessage } from "../lib/errors";
import { RouteMap } from "./route-map";
import { Button, Icon, State } from "./ui";
import { fonts, useTheme, type Colors } from "./theme";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; origin: LatLng; route: RouteInfo }
  | { kind: "error"; message: string; origin?: LatLng };

/**
 * Shown to the accepted worker: ETA, distance and the route line inside the app,
 * then a hand-off to Google Maps for turn-by-turn navigation.
 */
export function TaskRoute({ dest }: { dest: LatLng }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [openError, setOpenError] = useState("");

  const destLat = dest.lat;
  const destLng = dest.lng;
  useEffect(() => {
    const controller = new AbortController();
    let origin: LatLng | undefined;
    async function load() {
      setPhase({ kind: "loading" });
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted")
          throw new Error(
            "Permite accesul la locație pentru a vedea timpul de drum. Poți deschide oricum Google Maps.",
          );
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        origin = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const route = await fetchRoute(
          origin,
          { lat: destLat, lng: destLng },
          controller.signal,
        );
        if (!controller.signal.aborted) setPhase({ kind: "ready", origin, route });
      } catch (e) {
        if (controller.signal.aborted) return;
        setPhase({ kind: "error", message: errorMessage(e), origin });
      }
    }
    void load();
    return () => controller.abort();
  }, [destLat, destLng, attempt]);

  const origin =
    phase.kind === "ready" || phase.kind === "error" ? phase.origin : undefined;
  const openMaps = useCallback(async () => {
    setOpenError("");
    try {
      await Linking.openURL(
        googleMapsUrl({ lat: destLat, lng: destLng }, origin),
      );
    } catch {
      setOpenError("Nu am putut deschide Google Maps.");
    }
  }, [destLat, destLng, origin]);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Icon name="navigate-outline" color={colors.text} />
        <Text accessibilityRole="header" style={s.title}>
          Drumul până la sarcină
        </Text>
      </View>
      {phase.kind === "loading" ? (
        <State loading />
      ) : phase.kind === "ready" ? (
        <>
          <View style={s.stats}>
            <View style={s.stat}>
              <Text style={s.statValue}>
                {formatDuration(phase.route.durationS)}
              </Text>
              <Text style={s.statLabel}>Timp estimat cu mașina</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>
                {formatDistance(phase.route.distanceM)}
              </Text>
              <Text style={s.statLabel}>Distanță</Text>
            </View>
          </View>
          <RouteMap
            points={phase.route.points}
            from={phase.origin}
            to={{ lat: destLat, lng: destLng }}
          />
        </>
      ) : (
        <Text accessibilityRole="alert" style={s.error}>
          {phase.message}
        </Text>
      )}
      {phase.kind === "error" ? (
        <Button
          variant="outline"
          icon="refresh-outline"
          onPress={() => setAttempt((n) => n + 1)}
        >
          Reîncearcă
        </Button>
      ) : null}
      <Button icon="map-outline" onPress={() => void openMaps()}>
        Deschide în Google Maps
      </Button>
      {openError ? (
        <Text accessibilityRole="alert" style={s.error}>
          {openError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    card: {
      gap: 14,
      padding: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
    },
    head: { flexDirection: "row", alignItems: "center", gap: 10 },
    title: { fontFamily: fonts.bold, color: c.text, fontSize: 18, flex: 1 },
    stats: { flexDirection: "row", gap: 12 },
    stat: {
      flex: 1,
      padding: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.yellow,
      gap: 2,
    },
    statValue: { fontFamily: fonts.display, color: "#000000", fontSize: 28, lineHeight: 34 },
    statLabel: { fontFamily: fonts.body, color: "#000000", fontSize: 12 },
    error: {
      fontFamily: fonts.body,
      backgroundColor: c.dangerSoft,
      color: c.danger,
      fontSize: 14,
      lineHeight: 21,
      borderRadius: 24,
      padding: 14,
      overflow: "hidden",
    },
  });
