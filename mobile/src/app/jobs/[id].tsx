import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Text, View } from "react-native";
import { useAuth } from "../../auth/session";
import { formatBani } from "../../api/client";
import {
  applicationStatusLabel,
  schedule,
  taskStatusLabel,
} from "../../lib/labels";
import { errorMessage } from "../../lib/errors";
import { hasLocation, taskMapsUrl } from "../../lib/geo";
import { LevelBadge, ReviewCard } from "../../components/review-card";
import {
  Badge,
  Button,
  Header,
  Page,
  State,
  useData,
} from "../../components/ui";
import { useTheme } from "../../components/theme";
import { jobStyles } from "../../components/job-ui";
export default function ManageJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, session } = useAuth();
  const { colors } = useTheme();
  const s = jobStyles(colors);
  const load = useCallback(async () => {
    const { task } = await client.getTask(id);
    if (task.poster_id !== session?.user.id)
      throw new Error("Acest anunț nu aparține contului tău.");
    const { applications } = await client.listTaskApplications(id);
    const reviews = task.status === "completed" ? (await client.listReviews(id)).reviews : [];
    return { task, applications, reviews };
  }, [id, client, session?.user.id]);
  const { data, loading, error, reload } = useData(load, 5000);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [mapError, setMapError] = useState("");
  async function action(call: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await call();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await client.deleteTask(id); router.replace("/jobs"); }
    catch (e) { setActionError(errorMessage(e)); setBusy(false); }
  }
  async function chat(participant: string) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const { conversation } = await client.startTaskConversation(
        id,
        participant,
      );
      router.push({
        pathname: "/messages/[id]",
        params: { id: conversation.id },
      });
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const when = data
    ? schedule(data.task.starts_at, data.task.ends_at)
    : undefined;
  return (
    <Page onRefresh={() => void reload()} refreshing={loading}>
      <Header title="Anunțul tău" />
      <Button variant="outline" onPress={() => router.replace("/jobs")}>
        Toate anunțurile
      </Button>
      <State loading={loading} error={error} onRetry={() => void reload()} />
      {data && when ? (
        <>
          <View style={s.card}>
            <Badge>{taskStatusLabel[data.task.status]}</Badge>
            <Text style={s.title}>{data.task.title}</Text>
            <Text style={s.body}>
              {data.task.city} · {when.date}
            </Text>
            <Text style={s.body}>{when.time}</Text>
            <Text style={s.price}>{data.task.amount_bani === 0 ? "Voluntariat" : formatBani(data.task.amount_bani)}</Text>
            <Text style={s.body}>{data.task.description}</Text>
          </View>
          {data.task.status === "completed" && data.task.assignee_id ? <ReviewCard taskId={id} reviews={data.reviews} onSubmitted={reload} /> : null}
          <View style={s.card}>
            <Text style={s.title}>Locație</Text>
            <Text style={s.body}>{[data.task.sector, data.task.city, data.task.county ? `jud. ${data.task.county}` : ""].filter(Boolean).join(", ")}</Text>
            {hasLocation(data.task) ? <Text selectable style={s.body}>Punct GPS: {data.task.lat.toFixed(5)}, {data.task.lng.toFixed(5)}</Text> : null}
            <Button variant="outline" icon="map-outline" onPress={() => { setMapError(""); void Linking.openURL(taskMapsUrl(data.task, true)).catch(() => setMapError("Nu am putut deschide Google Maps.")); }}>Deschide în Google Maps</Button>
            {mapError ? <Text accessibilityRole="alert" style={s.error}>{mapError}</Text> : null}
          </View>
          {actionError ? (
            <Text accessibilityRole="alert" style={s.error}>
              {actionError}
            </Text>
          ) : null}
          {data.task.status === "open" ? <View style={s.card}>
            <Button variant="outline" icon="create-outline" disabled={busy}
              onPress={() => router.push({ pathname: "/jobs/new", params: { id } })}>Editează anunțul</Button>
            {confirmDelete ? <>
              <Text style={s.body}>Ștergi anunțul? Nu va mai apărea în căutări, iar aplicările în așteptare vor fi respinse.</Text>
              <Button disabled={busy} onPress={() => void remove()}>{busy ? "Se șterge..." : "Da, șterge anunțul"}</Button>
              <Button variant="outline" disabled={busy} onPress={() => setConfirmDelete(false)}>Păstrează anunțul</Button>
            </> : <Button variant="outline" icon="trash-outline" disabled={busy} onPress={() => setConfirmDelete(true)}>Șterge anunțul</Button>}
          </View> : null}
          <Text style={s.title}>Aplicări ({data.applications.length})</Text>
          {data.task.amount_bani > 0 && data.task.status === "open" ? (
            <Text style={s.body}>
              Alegerea unei persoane confirmă potrivirea în Nova. Dacă activitatea
              este un raport de muncă, contractul legal trebuie încheiat separat
              înainte să înceapă lucrul.
            </Text>
          ) : null}
          {!data.applications.length ? (
            <Text style={s.body}>
              Persoanele interesate vor apărea aici. Poți discuta cu ele înainte
              să alegi.
            </Text>
          ) : null}
          {data.applications.map((app) => (
            <View key={app.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.label}>{app.worker_name}</Text>
                <Badge>{applicationStatusLabel[app.status]}</Badge>
              </View>
              <LevelBadge userId={app.worker_id} />
              <Text style={s.body}>{app.skills.join(" · ")}</Text>
              <Text style={s.body}>{app.message}</Text>
              <Button
                variant="outline"
                icon="chatbubble-outline"
                disabled={busy}
                onPress={() => void chat(app.worker_id)}
              >
                Discută despre sarcină
              </Button>
              {data.task.status === "open" && app.status === "pending" ? (
                <Button
                  disabled={busy}
                  onPress={() =>
                    void action(() => client.acceptApplication(app.id))
                  }
                >
                  Alege această persoană
                </Button>
              ) : null}
            </View>
          ))}
          {data.task.status === "assigned" ? (
            <Button
              disabled={busy}
              onPress={() => void action(() => client.completeTask(id))}
            >
              Marchează ca finalizată
            </Button>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
