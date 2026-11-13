import type { Page } from "@playwright/test";
import type { StubOptions } from "./fixtures";

/** The screens the specs walk, each with the stubs it needs and the steps that put it in its drawn state. */
export interface Screen {
  name: string;
  path: string;
  stubs?: StubOptions;
  act?: (page: Page) => Promise<void>;
  /** Drawn on the redesign board, so the shots spec compares it with its comp. */
  drawn?: boolean;
}

const BASE = "/satchel/";

export const SCREENS: Screen[] = [
  { name: "chat-list", path: BASE, drawn: true },
  {
    name: "thread",
    path: `${BASE}c/alma`,
    drawn: true,
    act: async (page) => {
      await page.getByLabel("Message").fill("Bringing the big basket");
    },
  },
  {
    name: "new-group",
    path: `${BASE}new`,
    drawn: true,
    act: async (page) => {
      await page.getByRole("button", { name: "New group" }).click();
      await page.getByLabel("Group name").fill("Saturday market");
      await page.getByRole("checkbox", { name: "alma" }).click();
      await page.getByRole("checkbox", { name: "boris" }).click();
    },
  },
  { name: "new-chat", path: `${BASE}new` },
  { name: "new-chat-nobody", path: `${BASE}new`, stubs: { people: "none" } },
  { name: "inbox", path: `${BASE}c/inbox` },
  { name: "share", path: `${BASE}share?text=Worth%20a%20look` },
  { name: "settings", path: `${BASE}settings` },
  { name: "sign-in", path: BASE, stubs: { session: "signed-out" } },
  { name: "gate-loading", path: BASE, stubs: { session: "loading" } },
  { name: "gate-unreachable", path: BASE, stubs: { session: "unreachable" } },
  { name: "list-empty", path: BASE, stubs: { list: "empty" } },
  { name: "list-loading", path: BASE, stubs: { list: "loading" } },
  { name: "list-error", path: BASE, stubs: { list: "error" } },
];
