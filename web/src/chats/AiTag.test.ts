import { CLAUDE_MEMBER, type ConversationSummary, type Member } from "@satchel/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScreenHeader } from "../layout/ScreenHeader";
import { AiTag } from "../layout/AiTag";
import { ChatRow } from "./ChatRow";
import { hasClaude } from "./conversation";

const ME = "sub-me";
const member = (id: string, displayName: string): Member => ({ id, displayName, seenUpTo: 0, seenAt: null });
const chat = (overrides: Partial<ConversationSummary>): ConversationSummary => ({
  id: "c",
  kind: "direct",
  title: null,
  members: [],
  lastMessage: null,
  unreadCount: 0,
  ...overrides,
});

const inbox = chat({ kind: "inbox", members: [member(ME, "owner"), member(CLAUDE_MEMBER, "Claude")] });
// A friend who renamed themselves "Claude": same name, a Ward subject for an id.
const impostor = chat({ members: [member(ME, "owner"), member("sub-friend", "Claude")] });

const row = (conversation: ConversationSummary) =>
  renderToStaticMarkup(createElement(ChatRow, { conversation, me: ME, selected: false }));

describe("the AI tag", () => {
  it("is decided by member id", () => {
    expect(hasClaude(inbox)).toBe(true);
    expect(hasClaude(impostor)).toBe(false);
  });

  it("marks Claude's row in the chat list", () => {
    expect(row(inbox)).toContain("AI");
  });

  it("leaves a person called Claude untagged", () => {
    const html = row(impostor);
    expect(html).toContain("Claude");
    expect(html).not.toContain("AI");
  });

  it("marks the thread header's heading for Claude, not for a person called Claude", () => {
    const header = (conversation: ConversationSummary) =>
      renderToStaticMarkup(
        createElement(ScreenHeader, {
          title: "Claude",
          tag: hasClaude(conversation) ? createElement(AiTag) : undefined,
        }),
      );
    expect(header(inbox)).toMatch(/<h2[^>]*>Claude.*AI.*<\/h2>/su);
    expect(header(impostor)).not.toContain("AI");
  });
});
