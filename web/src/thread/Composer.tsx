import { MAX_TEXT_LENGTH } from "@satchel/shared";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMediaQuery } from "../polling";
import { canSend, COUNTER_FROM, textLength } from "./model";

/** Touch devices: Enter is a newline and the Send button sends. */
const TOUCH_QUERY = "(pointer: coarse)";
const MAX_LINES = 5;

/** The text field (grows to five lines) and the Send button. */
export function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
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
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="composer__field">
        <textarea
          ref={field}
          className="composer__input"
          rows={1}
          value={text}
          placeholder="Message"
          aria-label="Message"
          enterKeyHint={touch ? "enter" : "send"}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {length >= COUNTER_FROM && (
          <span className={length > MAX_TEXT_LENGTH ? "composer__count composer__count--over" : "composer__count"}>
            {length} / {MAX_TEXT_LENGTH}
          </span>
        )}
      </div>
      <button type="submit" className="button" disabled={!sendable}>
        Send
      </button>
    </form>
  );
}
