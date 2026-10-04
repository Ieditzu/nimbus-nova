import { useCallback } from "react";
import { Link, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../../auth/session";
import { formatBani } from "../../api/client";
import { schedule, taskStatusLabel } from "../../lib/labels";
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
export default function MyJobsScreen() {
  const { client, session } = useAuth();
  const { colors } = useTheme();
  const s = jobStyles(colors);
  const load = useCallback(() => client.listMyTasks(), [client]);
  const { data, loading, error, reload } = useData(load);
  return (
    <Page onRefresh={() => void reload()} refreshing={loading}>
      <Header
        title="Anunțurile tale"
        subtitle="Publică o sarcină și găsește ajutor."
      />
      {session?.user.volunteer_only ? (
        <Text style={s.body}>
          Publicarea este disponibilă de la 16 ani.
        </Text>
      ) : (
        <Button icon="add-outline" onPress={() => router.push("/jobs/new")}>
          Publică o sarcină
        </Button>
      )}
      <State
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        empty={
          !loading && !error && data?.tasks.length === 0
            ? "Nu ai publicat încă nicio sarcină."
            : undefined
        }
      />
      {data?.tasks.map((task) => {
        const when = schedule(task.starts_at, task.ends_at);
        return (
          <Link
            key={task.id}
            href={{ pathname: "/jobs/[id]", params: { id: task.id } }}
            asChild
          >
            <Pressable
              style={s.card}
              accessibilityRole="button"
              accessibilityLabel={`Gestionează ${task.title}`}
            >
              <Badge tone={task.status === "open" ? "success" : "neutral"}>
                {taskStatusLabel[task.status]}
              </Badge>
              <Text style={s.title}>{task.title}</Text>
              <Text style={s.body}>
                {task.city} · {when.date}
              </Text>
              <Text style={s.body}>{when.time}</Text>
              <View style={s.row}>
                <Text style={s.price}>{task.amount_bani === 0 ? "Voluntariat" : formatBani(task.amount_bani)}</Text>
                <Text style={s.label}>Vezi aplicările →</Text>
              </View>
            </Pressable>
          </Link>
        );
      })}
    </Page>
  );
}
