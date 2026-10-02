"use client";

import Link from "next/link";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadPublicUserCard, type OnlineStatus, type PublicUserCard } from "../_lib/user-api";

const statusClasses: Record<OnlineStatus, string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  hidden: "bg-amber-400",
};

export function OnlineStatusDot({ status, className = "", style }: { status: OnlineStatus; className?: string; style?: CSSProperties }) {
  const { t } = useI18n();
  const label = t(`user.onlineStatuses.${status}`);
  return (
    <span
      aria-label={label}
      className={`inline-block rounded-full border-2 border-[var(--panel)] ${statusClasses[status]} ${className}`}
      role="img"
      style={style}
      title={label}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function UserAvatar({
  username,
  avatarUrl,
  onlineStatus,
  size = 40,
  className = "",
}: {
  username: string;
  avatarUrl?: string;
  onlineStatus: OnlineStatus;
  size?: number;
  className?: string;
}) {
  const dotSize = Math.max(10, Math.round(size * 0.28));
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full bg-[var(--panel-subtle)] font-black text-[var(--accent)] ${className}`}
      style={{ height: size, width: size, fontSize: Math.max(12, Math.round(size * 0.4)) }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full rounded-[inherit] object-cover" src={avatarUrl} />
      ) : username.slice(0, 1).toUpperCase()}
      <OnlineStatusDot
        className="absolute bottom-0 right-0"
        status={onlineStatus}
        style={{ height: dotSize, width: dotSize } as CSSProperties}
      />
    </span>
  );
}

export function UserCardAvatar(props: Parameters<typeof UserCardAvatarSession>[0]) {
  const { token, user } = useAuthSnapshot();
  return <UserCardAvatarSession key={`${user?.id || "guest"}:${token || "guest"}:${props.userId}`} {...props} />;
}

function UserCardAvatarSession({
  userId,
  username,
  avatarUrl,
  onlineStatus,
  size = 40,
}: {
  userId: string;
  username: string;
  avatarUrl?: string;
  onlineStatus: OnlineStatus;
  size?: number;
}) {
  const { token } = useAuthSnapshot();
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<PublicUserCard | null>(null);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 16, top: 16 });

  function clearTimers() {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }

  function placeCard() {
    const rectangle = triggerRef.current?.getBoundingClientRect();
    if (!rectangle) return;
    const width = Math.min(320, window.innerWidth - 32);
    const estimatedHeight = 330;
    const left = Math.max(16, Math.min(rectangle.left, window.innerWidth - width - 16));
    const below = rectangle.bottom + 8;
    const top = below + estimatedHeight <= window.innerHeight
      ? below
      : Math.max(16, rectangle.top - estimatedHeight - 8);
    setPosition({ left, top });
  }

  function show(delay = 0) {
    clearTimers();
    openTimer.current = window.setTimeout(() => {
      placeCard();
      setOpen(true);
    }, delay);
  }

  function hide(delay = 150) {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  }

  useEffect(() => {
    if (!open || card || error) return;
    let cancelled = false;
    loadPublicUserCard(userId, token || undefined)
      .then((value) => { if (!cancelled) setCard(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("user.userCardLoadFailed")); });
    return () => { cancelled = true; };
  }, [card, error, open, t, token, userId]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.parentElement?.contains(target)) setOpen(false);
    };
    const reposition = () => placeCard();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  return (
    <span
      className="relative inline-flex"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) hide(0); }}
      onFocus={() => show(0)}
      onMouseEnter={() => show(250)}
      onMouseLeave={() => hide()}
    >
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("user.openUserCard", { name: username })}
        className="focus-ring rounded-full"
        type="button"
        onClick={() => open ? setOpen(false) : show(0)}
      >
        <UserAvatar avatarUrl={avatarUrl} onlineStatus={card?.onlineStatus ?? onlineStatus} size={size} username={username} />
      </button>
      {open ? (
        <span
          aria-label={t("user.userCardTitle", { name: username })}
          className="fixed z-[80] block w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-left shadow-2xl"
          role="dialog"
          style={position}
          onMouseEnter={clearTimers}
          onMouseLeave={() => hide()}
        >
          {card ? <PublicUserCardContent card={card} /> : error ? (
            <span className="block text-sm text-[var(--red)]">{error}</span>
          ) : <span className="block text-sm text-[var(--muted)]">{t("common.loading")}</span>}
        </span>
      ) : null}
    </span>
  );
}

function PublicUserCardContent({ card }: { card: PublicUserCard }) {
  const { locale, t } = useI18n();
  return (
    <>
      <span className="flex items-center gap-3">
        <UserAvatar avatarUrl={card.avatarUrl} onlineStatus={card.onlineStatus} size={48} username={card.username} />
        <span className="min-w-0 flex-1">
          <Link className="focus-ring block truncate rounded-sm font-black hover:text-[var(--accent)]" href={`/user/${encodeURIComponent(card.id)}`}>
            {card.username}
          </Link>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <OnlineStatusDot className="h-3 w-3" status={card.onlineStatus} />
            {t(`user.onlineStatuses.${card.onlineStatus}`)} · {t("user.levelShort", { level: card.level.level })}
          </span>
        </span>
      </span>
      <span className="mt-4 block">
        <span className="flex justify-between gap-2 text-xs font-semibold">
          <span>{t("user.experience")}: {card.level.experience.toLocaleString(locale)}</span>
          <span>{t("user.experienceToNext", { count: card.level.experienceToNextLevel.toLocaleString(locale) })}</span>
        </span>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--panel-subtle)]">
          <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, card.level.progressPercent))}%` }} />
        </span>
      </span>
      <span className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--line)]">
        {Array.from({ length: 6 }, (_, index) => {
          const statistic = card.statistics[index];
          return (
            <span className={`min-h-16 border-[var(--line)] p-2 text-center ${index % 2 === 0 ? "border-r" : ""} ${index < 4 ? "border-b" : ""}`} key={index}>
              {statistic ? (
                <><strong className="block text-lg">{statistic.value.toLocaleString(locale)}</strong><span className="block text-[11px] text-[var(--muted)]">{t(`user.cardStatistics.${statistic.key}`)}</span></>
              ) : <span className="grid h-full place-items-center text-[var(--muted)]">—</span>}
            </span>
          );
        })}
      </span>
    </>
  );
}
