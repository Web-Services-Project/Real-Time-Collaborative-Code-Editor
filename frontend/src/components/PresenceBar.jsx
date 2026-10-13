export default function PresenceBar({ members }) {
  if (!members.length) return null;
  return (
    <div className="flex items-center gap-2">
      {members.map((m) => (
        <div
          key={m.userId}
          title={m.userName}
          className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white ring-2 ring-slate-950"
          style={{ backgroundColor: m.color }}
        >
          {m.userName?.[0]?.toUpperCase() || '?'}
        </div>
      ))}
      <span className="text-xs text-slate-500 ml-1">
        {members.length} online
      </span>
    </div>
  );
}
