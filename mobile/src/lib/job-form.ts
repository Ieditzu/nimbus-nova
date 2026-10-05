export function amountToBani(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized))
    throw new Error("Introdu suma în lei, cu maximum două zecimale.");
  const [lei, bani = ""] = normalized.split(".");
  const amount = Number(lei) * 100 + Number(bani.padEnd(2, "0"));
  if (amount > 500000) throw new Error("Suma maximă este 5000 lei.");
  return amount;
}
export function platformFeeBani(amountBani: number): number {
  return Math.floor((amountBani * 5 + 50) / 100);
}
// Jobs use Romanian wall-clock time, regardless of the phone's current time zone.
export function romanianDateTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Folosește data AAAA-LL-ZZ și ora HH:MM.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  )
    throw new Error("Data sau ora nu este validă.");
  if (
    year < 2026 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    throw new Error("Data sau ora nu este validă.");
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let instant = wall;
  for (let step = 0; step < 3; step++) {
    const parts = Object.fromEntries(
      format.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    const seen = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const delta = wall - seen;
    if (delta === 0) return new Date(instant).toISOString();
    instant += delta;
  }
  throw new Error(
    "Data sau ora nu există în calendarul României. Alege altă oră.",
  );
}
