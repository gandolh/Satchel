/**
 * The "AI" tag on the real Claude's name (glossary: AI tag). Text in a pill, so
 * colour is never the only sign. Callers decide by member id, never by name.
 */
export function AiTag() {
  return (
    <span className="ml-2 inline-block flex-none rounded-pill bg-control px-2 align-middle text-small leading-4 font-semibold text-muted">
      <span className="sr-only"> (</span>
      AI<span className="sr-only">)</span>
    </span>
  );
}
