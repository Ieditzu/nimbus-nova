import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "../../auth/session";
import { formatBani } from "../../api/client";
import {
  applicationStatusLabel,
  schedule,
  taskStatusLabel,
} from "../../lib/labels";
import { errorMessage } from "../../lib/errors";
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
    return { task, applications };
  }, [id, client, session?.user.id]);
  const { data, loading, error, reload } = useData(load);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
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
            <Text style={s.price}>{formatBani(data.task.amount_bani)}</Text>
            <Text style={s.body}>{data.task.description}</Text>
          </View>
          {actionError ? (
            <Text accessibilityRole="alert" style={s.error}>
              {actionError}
            </Text>
          ) : null}
          <Text style={s.title}>Aplicări ({data.applications.length})</Text>
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
