import data from "../data/romania-localities.json";
import { locationSearch } from "./location-search";
export const counties = data;
export { locationSearch } from "./location-search";
export function findLocation(city: string, localityId?: string, countyName?: string) {
 const matches = counties.flatMap((county) => county.localities
  .filter((locality) => localityId ? locality.id === localityId : locationSearch(locality.name) === locationSearch(city) && (!countyName || county.name === countyName))
  .map((locality) => ({ county: county.name, ...locality })));
 return matches.length === 1 ? matches[0] : undefined;
}
