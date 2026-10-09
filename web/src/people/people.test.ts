import { describe, expect, it } from "vitest";
import { filterPeople } from "./people";

const people = [
  { subject: "a", displayName: "Andrei" },
  { subject: "m", displayName: "Maria" },
];

describe("filterPeople", () => {
  it("keeps everyone for an empty query", () => {
    expect(filterPeople(people, "  ")).toEqual(people);
  });
  it("matches part of a name, ignoring case", () => {
    expect(filterPeople(people, "MAR").map((p) => p.subject)).toEqual(["m"]);
    expect(filterPeople(people, "zzz")).toEqual([]);
  });
});
