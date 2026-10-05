import { router } from "expo-router";

export function openNotification(kind: string, taskId: string) {
  if (kind === "new_message" || kind === "job_interest") router.push("/messages");
  else if (kind === "application_received" && taskId) router.push({ pathname: "/jobs/[id]", params: { id: taskId } });
  else if (kind === "job_deleted") router.push("/applications");
  else if (taskId) router.push({ pathname: "/task/[id]", params: { id: taskId } });
  else router.push("/");
}

export function notificationContent(kind: string): { title: string; body: string } {
  switch (kind) {
    case "application_received": return { title: "Candidatură nouă", body: "Cineva a aplicat la anunțul tău. Deschide anunțul ca să vezi candidatura." };
    case "application_accepted": return { title: "Ai fost ales", body: "Candidatura ta a fost acceptată. Deschide jobul pentru detalii." };
    case "application_rejected": return { title: "Job atribuit", body: "Autorul a ales o altă persoană pentru acest job." };
    case "job_interest": return { title: "Cineva este interesat", body: "Ai o conversație nouă despre anunțul tău." };
    case "new_message": return { title: "Mesaj nou", body: "Ai primit un mesaj despre un job." };
    case "task_completed": return { title: "Job finalizat", body: "Jobul s-a încheiat. Deschide-l și evaluează colaborarea." };
    case "task_cancelled": return { title: "Job anulat", body: "Jobul la care participai a fost anulat." };
    case "job_deleted": return { title: "Anunț șters", body: "Anunțul pentru care ai aplicat a fost șters." };
    case "dispute_opened": return { title: "Dispută deschisă", body: "A fost deschisă o dispută pentru acest job." };
    case "nearby_jobs": return { title: "Joburi noi în apropiere", body: "Au apărut joburi noi în orașul tău." };
    default: return { title: "Noutate pe Nova", body: "Ai o actualizare în contul tău." };
  }
}
