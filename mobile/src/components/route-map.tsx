import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { projectPoints, type LatLng } from "../lib/geo";
import { fonts, useTheme } from "./theme";

const HEIGHT = 200;

/**
 * Stylized route preview: the real OSRM route geometry drawn as a line between
 * the worker ("Tu") and the task. No map tiles, so it works offline once the route is loaded.
 */
export function RouteMap({
  points,
  from,
  to,
}: {
  points: LatLng[];
  from: LatLng;
  to: LatLng;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const line = points.length >= 2 ? points : [from, to];
  const projected = width ? projectPoints(line, width, HEIGHT, 28) : [];
  const start = projected[0];
  const end = projected[projected.length - 1];
  const grid = width ? Array.from({ length: Math.floor(width / 32) }, (_, i) => (i + 1) * 32) : [];
  const rows = Array.from({ length: Math.floor(HEIGHT / 32) }, (_, i) => (i + 1) * 32);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Harta traseului către locația sarcinii"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[s.box, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      {width ? (
        <Svg width={width} height={HEIGHT}>
          <Rect x={0} y={0} width={width} height={HEIGHT} fill={colors.background} />
          {grid.map((x) => (
            <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={HEIGHT} stroke={colors.border} strokeOpacity={0.12} strokeWidth={1} />
          ))}
          {rows.map((y) => (
            <Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={colors.border} strokeOpacity={0.12} strokeWidth={1} />
          ))}
          <Polyline
            points={projected.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={colors.border}
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points={projected.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={colors.blue}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {start ? (
            <Circle cx={start.x} cy={start.y} r={9} fill={colors.surface} stroke={colors.border} strokeWidth={2} />
          ) : null}
          {end ? (
            <>
              <Circle cx={end.x} cy={end.y} r={12} fill={colors.yellow} stroke="#000000" strokeWidth={2} />
              <Circle cx={end.x} cy={end.y} r={4} fill="#000000" />
            </>
          ) : null}
        </Svg>
      ) : null}
      <View style={s.legend} pointerEvents="none">
        <Text style={[s.tag, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}>Tu</Text>
        <Text style={[s.tag, { backgroundColor: colors.yellow, borderColor: "#000000", color: "#000000" }]}>Sarcina</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: HEIGHT, borderWidth: 1, borderRadius: 24, overflow: "hidden" },
  legend: { position: "absolute", left: 12, top: 12, flexDirection: "row", gap: 6 },
  tag: {
    fontFamily: fonts.bold,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
});
