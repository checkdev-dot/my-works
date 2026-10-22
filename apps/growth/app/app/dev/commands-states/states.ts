export type Key = "questions" | "reply" | "nothing" | "disconnected";
export const STATES: { key: Key; label: string }[] = [
  { key: "questions", label: "Questions queued for Claude" },
  { key: "reply", label: "Reply came back" },
  { key: "nothing", label: "Nothing queued for Claude" },
  { key: "disconnected", label: "Not connected" },
];
