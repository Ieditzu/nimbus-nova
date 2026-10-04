export function locationSearch(value: string) {
 return value.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/sh/g, "s").replace(/tz/g, "t").replace(/[\s-]+/g, " ").trim();
}
