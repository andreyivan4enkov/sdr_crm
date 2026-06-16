import { memberInitial } from "../lib/team-members";

type Member = { id: string; name: string; avatar?: string | null };

const SIZES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-7 h-7 text-[10px]",
  md: "w-9 h-9 text-xs",
  lg: "w-12 h-12 text-sm",
};

export function EmployeeAvatar({
  member,
  size = "sm",
  ring,
}: {
  member?: Member | null;
  size?: keyof typeof SIZES;
  ring?: boolean;
}) {
  const cls = SIZES[size];
  if (!member) {
    return (
      <span className={`${cls} rounded-full bg-slate-200 dark:bg-slate-700 inline-flex items-center justify-center text-slate-400`}>
        ?
      </span>
    );
  }
  const ringCls = ring ? "ring-2 ring-teal-500/40 ring-offset-1 dark:ring-offset-slate-900" : "";
  if (member.avatar) {
    return (
      <img
        src={member.avatar}
        alt=""
        className={`${cls} rounded-full object-cover border border-white/20 shrink-0 ${ringCls}`}
      />
    );
  }
  return (
    <span className={`${cls} rounded-full bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200 inline-flex items-center justify-center font-semibold shrink-0 ${ringCls}`}>
      {memberInitial(member.name)}
    </span>
  );
}

export function EmployeeChip({
  member,
  selected,
  onClick,
  t,
  compact,
}: {
  member: Member;
  selected?: boolean;
  onClick?: () => void;
  t: Record<string, string>;
  compact?: boolean;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border transition shadow-sm ${
        compact ? "px-1.5 py-0.5" : "px-2 py-1"
      } ${
        selected
          ? "bg-teal-600 text-white border-teal-500/40"
          : `${t.border} ${t.surface} ${onClick ? t.hover : ""}`
      }`}
    >
      <EmployeeAvatar member={member} size={compact ? "xs" : "sm"} />
      <span className={`${compact ? "text-[10px]" : "text-xs"} font-medium truncate max-w-[140px] crm-data`}>
        {member.name}
      </span>
    </Tag>
  );
}
