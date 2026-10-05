import { useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { useAuth } from "../auth/session";
import { errorMessage } from "../lib/errors";
import { Button, Header, Page, State, useData } from "../components/ui";
import { fonts, useTheme } from "../components/theme";

const prizes = [50, 100, 150, 200, 250];
const fills = ["#5B58D6", "#E76577", "#208C81", "#C68A2B", "#315EAA"];

function wheelSlice(index: number) {
  const start = (-90 + index * 72) * Math.PI / 180;
  const end = (-90 + (index + 1) * 72) * Math.PI / 180;
  const x1 = 120 + 110 * Math.cos(start), y1 = 120 + 110 * Math.sin(start);
  const x2 = 120 + 110 * Math.cos(end), y2 = 120 + 110 * Math.sin(end);
  return `M 120 120 L ${x1} ${y1} A 110 110 0 0 1 ${x2} ${y2} Z`;
}

export default function GamesScreen() {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { data, loading, error, reload } = useData(() => client.getGames(), 30000);
  const [turn] = useState(() => new Animated.Value(0));
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState<number | null>(null);
  const [spinError, setSpinError] = useState("");
  async function spin() {
    if (busy || !data?.games.spins_available) return;
    setBusy(true); setWon(null); setSpinError("");
    try {
      const result = await client.spinGame();
      const index = prizes.indexOf(result.xp_won);
      const next = rotation + 1800 + (360 - 36 - index * 72 - rotation % 360 + 360) % 360;
      turn.setValue(rotation);
      Animated.timing(turn, { toValue: next, duration: 2600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        setRotation(next % 360); setWon(result.xp_won); setBusy(false); void reload();
      });
    } catch (e) {
      setSpinError(errorMessage(e)); setBusy(false); void reload();
    }
  }
  const game = data?.games;
  const toNext = game ? 1000 - game.xp % 1000 : 1000;
  return <Page>
    <Header title="Jocuri" subtitle="Revino zilnic și adună XP din evaluări." />
    <State loading={loading} error={error} onRetry={() => void reload()} />
    {game ? <>
      <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 8 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 22 }}>🔥 {game.streak} {game.streak === 1 ? "zi" : "zile"} la rând</Text>
        <Text style={{ color: colors.muted }}>La fiecare 5 zile consecutive primești o rotire. Intră în cont zilnic ca să păstrezi seria.</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}>Nivel {game.level} · {game.xp} XP</Text>
        <View style={{ height: 9, borderRadius: 6, backgroundColor: colors.raised, overflow: "hidden" }}>
          <View style={{ width: `${game.xp % 1000 / 10}%`, height: 9, backgroundColor: colors.accent }} />
        </View>
        <Text style={{ color: colors.muted }}>{toNext} XP până la nivelul următor</Text>
      </View>
      <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 20 }}>Roata XP</Text>
        <Text style={{ color: colors.accent, fontSize: 28, lineHeight: 30 }}>▼</Text>
        <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 10000], outputRange: ["0deg", "10000deg"] }) }] }}>
          <Svg width={240} height={240} viewBox="0 0 240 240" accessibilityLabel="Roata cu premii de 50, 100, 150, 200 sau 250 XP">
            {prizes.map((prize, index) => <Path key={prize} d={wheelSlice(index)} fill={fills[index]} stroke="#fff" strokeWidth={2} />)}
            {prizes.map((prize, index) => {
              const angle = (-54 + index * 72) * Math.PI / 180;
              return <SvgText key={`label-${prize}`} x={120 + 70 * Math.cos(angle)} y={125 + 70 * Math.sin(angle)} fill="#fff" fontSize="15" fontWeight="bold" textAnchor="middle">{prize}</SvgText>;
            })}
          </Svg>
        </Animated.View>
        <Text style={{ color: colors.muted }}>{game.spins_available} {game.spins_available === 1 ? "rotire disponibilă" : "rotiri disponibile"}</Text>
        <Button icon="sparkles" disabled={busy || game.spins_available < 1} onPress={() => void spin()}>{busy ? "Se învârte..." : "Învârte roata"}</Button>
        {won !== null ? <Text accessibilityRole="alert" style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 18 }}>Ai câștigat {won} XP!</Text> : null}
        {spinError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{spinError}</Text> : null}
      </View>
      <Text style={{ color: colors.muted }}>O evaluare de 5 stele îți aduce 250 XP; 4 stele aduc 100 XP. La 1.000 XP urci un nivel.</Text>
    </> : null}
  </Page>;
}
