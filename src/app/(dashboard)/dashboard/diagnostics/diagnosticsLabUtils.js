export const modalityOptions = [
  { value: "text", label: "Text", icon: "chat" },
  { value: "vision", label: "Vision", icon: "image" },
  { value: "audio", label: "Audio", icon: "mic" },
  { value: "tool-calling", label: "Tool Calling", icon: "handyman" },
];

export const defaultPrompts = {
  text: 'Reply with exactly "diagnostic-ok".',
  vision: "Describe the attached image in one short sentence.",
  audio: "Upload an audio sample to store a manual audio diagnostic record.",
  "tool-calling": 'Call the `diagnostic_echo` function with value `"diagnostic-ok"`.',
};

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStatusVariant(supported) {
  return supported ? "success" : "warning";
}
