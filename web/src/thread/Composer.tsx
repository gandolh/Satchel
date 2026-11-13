import { MAX_TEXT_LENGTH } from "@satchel/shared";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import { useMediaQuery } from "../polling";
import { canSend, COUNTER_FROM, textLength } from "./model";
import { Button } from "../components/ui/Button";

/** Touch devices: Enter is a newline and the Send button sends. */
const TOUCH_QUERY = "(pointer: coarse)";
const MAX_LINES = 5;

/**
 * The text field (grows to five lines) and the Send button. `initialText`
 * prefills it, unsent (a share from Android's share sheet); over the limit it
 * shows the usual counter and Send stays off, nothing is cut.
 */
export function Composer({ onSend, initialText = "" }: { onSend: (text: string) => void; initialText?: string }) {
  const [text, setText] = useState(initialText);
  const field = useRef<HTMLTextAreaElement>(null);
  const touch = useMediaQuery(TOUCH_QUERY);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 22;
    const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_LINES + chrome)}px`;
  }, [text]);

  const length = textLength(text);
  const sendable = canSend(text);

  const send = () => {
    if (!canSend(text)) return;
    onSend(text);
    setText("");
    field.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || touch) return;
    event.preventDefault();
    send();
  };

  return (
    <form
      className="flex flex-none items-end gap-2 border-t border-line bg-surface px-4 pt-3 pb-[max(--spacing(3),env(safe-area-inset-bottom,0px))] wide:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <textarea
          ref={field}
          className="block min-h-12 w-full resize-none rounded-[24px] border border-outline bg-sunk px-4 py-2.75 text-input text-ink focus-visible:outline-offset-1"
          rows={1}
          value={text}
          placeholder="Message"
          aria-label="Message"
          enterKeyHint={touch ? "enter" : "send"}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {length >= COUNTER_FROM && (
          <span
            className={cn(
              "absolute right-3 bottom-[calc(100%+2px)] text-small",
              length > MAX_TEXT_LENGTH ? "font-semibold text-bad" : "text-muted",
            )}
          >
            {length} / {MAX_TEXT_LENGTH}
          </span>
        )}
      </div>
      <Button type="submit" className="min-h-12 px-6 text-input max-wide:px-5" disabled={!sendable}>
        Send
      </Button>
    </form>
  );
}
