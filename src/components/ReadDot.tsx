"use client";

/**
 * Read / unread indicator for an application row. Unread = filled blue dot; read = hollow ring (visible on hover).
 * Clicking toggles the current viewer's read state.
 */
export default function ReadDot({ viewed, onToggle }: { viewed?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={viewed ? "Mark as unread" : "Mark as read"}
      title={viewed ? "Read · click to mark as unread" : "Unread · click to mark as read"}
      className="group/dot relative inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-slate-100"
    >
      <span
        className={`block size-2 rounded-full transition ${
          viewed ? "border border-transparent group-hover/dot:border-slate-400" : "bg-indigo-600 ring-[3px] ring-indigo-600/15"
        }`}
      />
    </button>
  );
}
