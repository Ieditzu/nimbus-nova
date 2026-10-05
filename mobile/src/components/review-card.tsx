import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { Review } from "../api/types";
import { api } from "../api";
import { useAuth } from "../auth/session";
import { errorMessage } from "../lib/errors";
import { Button, useData } from "./ui";
import { fonts, useTheme } from "./theme";

export function LevelBadge({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const load = useCallback(() => api.getReputation(userId), [userId]);
  const { data } = useData(load);
  if (!data) return null;
  return <Text style={{ color: colors.muted, fontSize: 13 }}>
    ⭐ {data.count ? data.average.toFixed(1) : "Nou"} · Nivel {data.level} · {data.xp} XP
  </Text>;
}

export function ReviewCard({ taskId, reviews, onSubmitted }: { taskId: string; reviews: Review[]; onSubmitted: () => Promise<unknown> }) {
  const { session, client } = useAuth();
  const { colors, isDark } = useTheme();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = reviews.find(review => review.author_id === session?.user.id);
  async function submit() {
    if (!stars || busy) return;
    setBusy(true); setError("");
    try {
      await client.createReview(taskId, { stars, text: comment.trim() || "Evaluare după colaborare." });
      await onSubmitted();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12 }}>
    <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 18 }}>Evaluează colaborarea</Text>
    {mine ? <Text style={{ color: colors.muted }}>Ai trimis {mine.stars} {mine.stars === 1 ? "stea" : "stele"}. Mulțumim!</Text> : <>
      <Text style={{ color: colors.muted }}>Jobul s-a încheiat. Lasă o evaluare celeilalte persoane.</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} stele`} accessibilityState={{ checked: stars === value }} onPress={() => setStars(value)} style={{ padding: 5 }}>
          <Text style={{ color: value <= stars ? colors.accent : colors.muted, fontSize: 30 }}>{value <= stars ? "★" : "☆"}</Text>
        </Pressable>)}
      </View>
      <TextInput accessibilityLabel="Comentariu despre colaborare" value={comment} onChangeText={setComment} maxLength={280} multiline placeholder="Cum a fost colaborarea? (opțional)" placeholderTextColor={colors.muted} keyboardAppearance={isDark ? "dark" : "light"} style={{ color: colors.text, backgroundColor: colors.raised, borderRadius: 12, padding: 12, minHeight: 58 }} />
      <Button disabled={!stars || busy} onPress={() => void submit()}>{busy ? "Se trimite..." : "Trimite evaluarea"}</Button>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    </>}
    {reviews.length > 0 ? <Text style={{ color: colors.muted }}>{reviews.length} {reviews.length === 1 ? "evaluare trimisă" : "evaluări trimise"}</Text> : null}
  </View>;
}
