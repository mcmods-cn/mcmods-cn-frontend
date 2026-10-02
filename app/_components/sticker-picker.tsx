"use client";

/* eslint-disable @next/next/no-img-element */
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import { loadStickerCatalog, stickerToken, type StickerCatalogPack } from "../_lib/sticker-api";

type StickerPickerProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function StickerPicker({ inputRef, value, onChange, disabled = false }: StickerPickerProps) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<StickerCatalogPack[]>([]);
  const [selectedPack, setSelectedPack] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadStickerCatalog(locale)
      .then((catalog) => {
        if (cancelled) return;
        setPacks(catalog.packs);
        setError("");
        setSelectedPack((current) => catalog.packs.some((pack) => pack.code === current) ? current : catalog.packs[0]?.code || "");
      })
      .catch((reason) => {
        if (!cancelled) { setPacks([]); setError(reason instanceof Error ? reason.message : t("common.loadFailed")); }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, locale, open, t]);

  function insert(packCode: string, stickerCode: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const token = stickerToken(packCode, stickerCode);
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const normalizedQuery = query.toLocaleLowerCase(locale);
  const visible = packs
    .find((pack) => pack.code === selectedPack)
    ?.stickers.filter((sticker) => (
      sticker.name.toLocaleLowerCase(locale).includes(normalizedQuery)
      || sticker.code.includes(query.toLowerCase())
    )) ?? [];
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        className="button-secondary focus-ring px-3 py-2 text-sm"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {t("stickers.insert")}
      </button>
      {open ? (
        <div
          aria-label={t("stickers.pickerTitle")}
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 shadow-xl"
          role="dialog"
        >
          {error ? <div className="mb-3"><p role="alert" className="text-xs text-[var(--red)]">{error}</p><button className="button-secondary focus-ring mt-2 text-xs" type="button" onClick={() => setAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : null}
          <input className="field" value={query} placeholder={t("stickers.search")} onChange={(event) => setQuery(event.target.value)} />
          <div className="mt-3 grid max-h-64 min-h-24 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-7">
            {visible.map((sticker) => (
              <button
                className="focus-ring grid aspect-square place-items-center rounded-md border border-[var(--line)] p-1 hover:border-[var(--accent)]"
                key={sticker.code}
                title={sticker.name}
                type="button"
                onClick={() => insert(selectedPack, sticker.code)}
              >
                <img alt={sticker.name} className="max-h-12 max-w-full object-contain" loading="lazy" src={sticker.imageURL} />
              </button>
            ))}
          </div>
          {visible.length === 0 ? <p className="py-6 text-center text-sm text-[var(--muted)]">{t("stickers.empty")}</p> : null}
          <div className="mt-3 flex max-w-full gap-2 overflow-x-auto border-t border-[var(--line)] pt-3">
            {packs.map((pack) => (
              <button
                className={`focus-ring shrink-0 rounded-md px-3 py-2 text-sm font-bold ${selectedPack === pack.code ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-subtle)]"}`}
                key={pack.code}
                type="button"
                onClick={() => setSelectedPack(pack.code)}
              >
                {pack.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
