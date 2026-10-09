import type { Person } from "@satchel/shared";

/** People whose name contains `query` (case-insensitive, whitespace trimmed); all of them for an empty query. */
export function filterPeople(people: readonly Person[], query: string): Person[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [...people];
  return people.filter((person) => person.displayName.toLocaleLowerCase().includes(needle));
}
