import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { errorMessage } from "../lib/errors";
import { searchPlaces, type Place } from "../lib/geo";
import { Button, Icon } from "./ui";
import { fonts, useTheme, type Colors } from "./theme";

/**
 * Lets a poster attach a location to a task: search an address in Romania or
 * use the phone's position. Exact coordinates are only shown to the accepted worker.
 */
export function LocationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Place | null;
  onChange: (place: Place | null) => void;
  disabled?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setError("");
      searchPlaces(q, controller.signal)
        .then((places) => {
          if (!controller.signal.aborted) setResults(places);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const canSearch = query.trim().length >= 3;
  const shown = canSearch ? results : [];

  async function locateMe() {
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error("Permite accesul la locație sau caută o adresă.");
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      onChange({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        label: "Locația mea curentă",
      });
      setQuery("");
      setResults([]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.label}>Locația sarcinii</Text>
      {value ? (
        <View style={s.selected}>
          <Icon name="location" color={colors.text} />
          <Text style={s.selectedText} numberOfLines={3}>
            {value.label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Elimină locația"
            disabled={disabled}
            onPress={() => onChange(null)}
            style={s.remove}
          >
            <Icon name="close-circle-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Caută adresa"
            editable={!disabled}
            value={query}
            onChangeText={setQuery}
            placeholder="Caută o adresă, de exemplu Str. Victoriei 10, București"
            placeholderTextColor={colors.muted}
            keyboardAppearance={isDark ? "dark" : "light"}
            autoCorrect={false}
            style={s.input}
          />
          {searching ? <Text style={s.help}>Se caută...</Text> : null}
          {shown.map((place) => (
            <Pressable
              key={`${place.lat},${place.lng}`}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => {
                onChange(place);
                setQuery("");
                setResults([]);
              }}
              style={s.result}
            >
              <Icon name="location-outline" color={colors.text} />
              <Text style={s.resultText} numberOfLines={2}>
                {place.label}
              </Text>
            </Pressable>
          ))}
          {!searching && canSearch && !shown.length && !error ? (
            <Text style={s.help}>Nu am găsit această adresă.</Text>
          ) : null}
          <Button
            variant="outline"
            icon="locate-outline"
            disabled={disabled}
            onPress={() => void locateMe()}
          >
            Folosește locația mea
          </Button>
        </>
      )}
      <Text style={s.help}>
        Adresa exactă o vede doar persoana acceptată. Ceilalți văd o zonă
        aproximativă.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = (c: Colors) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    label: { fontFamily: fonts.bold, color: c.text, fontSize: 14 },
    input: {
      fontFamily: fonts.body,
      backgroundColor: c.surface,
      color: c.text,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 14,
      minHeight: 50,
      fontSize: 16,
    },
    result: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      backgroundColor: c.surface,
    },
    resultText: { fontFamily: fonts.body, flex: 1, color: c.text, fontSize: 14, lineHeight: 20 },
    selected: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 20,
      backgroundColor: c.accentSoft,
    },
    selectedText: { fontFamily: fonts.body, flex: 1, color: c.text, fontSize: 14, lineHeight: 20 },
    remove: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    help: { fontFamily: fonts.body, color: c.muted, fontSize: 12, lineHeight: 18 },
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
