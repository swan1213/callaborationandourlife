// Small text helpers shared by the live view and the dialogs.

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function duration(s) {
  if (!s.endedAt) return '';
  const min = Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
