"use client";

import { useEffect, useRef, useState } from "react";
import {
  createFavoriteCollection,
  FavoriteCollection,
  FavoritePage,
  loadFavoriteCollections,
  loadFavoriteMembershipSummary,
  saveFavoriteMembershipChanges,
} from "../_lib/favorite-api";
import {
  appendCreatedFavoriteCollection,
  changeFavoriteSelection,
  favoriteSelectionChecked,
  favoriteSelectionDelta,
} from "../_lib/favorite-selection";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";

type FavoritePickerProps = {
  entityType: string;
  entityPublicId: string;
  title: string;
  token: string;
  onClose: () => void;
  onSaved: (selected: boolean) => void;
};

export function FavoritePickerModal(props: FavoritePickerProps) {
  const { user } = useAuthSnapshot();
  return <FavoritePickerContent key={`${user?.id || "guest"}:${props.entityType}:${props.entityPublicId}:${props.token}`} {...props} />;
}

function FavoritePickerContent({ entityType, entityPublicId, title, token, onClose, onSaved }: FavoritePickerProps) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [collectionPage, setCollectionPage] = useState<FavoritePage<FavoriteCollection> | null>(null);
  const [favoritePickerCursorHistory, setFavoritePickerCursorHistory] = useState<string[]>([]);
  const [serverSelected, setServerSelected] = useState<Set<string>>(new Set());
  const [selectionChanges, setSelectionChanges] = useState<Map<string, boolean>>(new Map());
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mutationInFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busy = saving || creating;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const [error, setError] = useState("");
  const currentCursor = favoritePickerCursorHistory.at(-1) ?? "";

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setLoadSucceeded(false);
        setError("");
      }
    });
    loadFavoriteCollections(token, currentCursor)
      .then(async (page) => ({
        page,
        summary: await loadFavoriteMembershipSummary(token, entityType, [entityPublicId], page.items.map((item) => item.id)),
      }))
      .then(({ page, summary }) => {
        if (!cancelled) {
          setLoadSucceeded(true);
          setCollections(page.items);
          setCollectionPage(page);
          setServerSelected(new Set(summary.collectionIdsByEntity[entityPublicId] ?? []));
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("favorites.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [attempt, currentCursor, entityPublicId, entityType, t, token]);

  async function createCollection() {
    const name = newName.trim();
    if (!name || loading || busy || mutationInFlight.current || !loadSucceeded) return;
    mutationInFlight.current = true;
    setCreating(true);
    setError("");
    try {
      const created = await createFavoriteCollection(token, name);
      setCollections((current) => appendCreatedFavoriteCollection(current, created));
      setSelectionChanges((current) => changeFavoriteSelection(current, created.id, true));
      setNewName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.createFailed"));
    } finally {
      mutationInFlight.current = false;
      setCreating(false);
    }
  }

  async function save() {
    if (loading || busy || mutationInFlight.current || !loadSucceeded) return;
    mutationInFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const changes = favoriteSelectionDelta(selectionChanges);
      const result = await saveFavoriteMembershipChanges(
        token,
        entityType,
        entityPublicId,
        changes.addCollectionIds,
        changes.removeCollectionIds,
      );
      onSaved(result.selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.saveFailed"));
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }

  return <dialog aria-label={t("favorites.chooseFolders")} className="fixed m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-lg border-0 bg-transparent p-0 text-[var(--foreground)] backdrop:bg-black/55" ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <section className="w-full max-w-lg overflow-hidden rounded-lg bg-[var(--panel)] shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4">
        <div><h2 className="text-xl font-black">{t("favorites.chooseFolders")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{title}</p></div>
        <button className="button-secondary focus-ring" type="button" disabled={busy} onClick={onClose}>{t("common.close")}</button>
      </header>
      <div className="p-4">
        {error ? <p role="alert" className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-700 dark:text-red-300">{error}</p> : null}
        {!loading && !loadSucceeded ? <button className="button-secondary focus-ring mb-3" type="button" onClick={() => setAttempt(value => value + 1)}>{t("common.retry")}</button> : null}
        {loading ? <p className="py-8 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : <div className="grid gap-2">{collections.map((collection) => <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3" key={collection.id}><span className="font-bold">{collection.isDefault ? t("favorites.defaultFolder") : collection.name}</span><input disabled={busy} checked={favoriteSelectionChecked(serverSelected, selectionChanges, collection.id)} type="checkbox" onChange={(event) => setSelectionChanges((current) => changeFavoriteSelection(current, collection.id, event.target.checked))} /></label>)}</div>}
        {collectionPage && (favoritePickerCursorHistory.length > 0 || collectionPage.hasMore) ? <div className="mt-3 flex items-center justify-between gap-3"><button className="button-secondary focus-ring" disabled={loading || busy || favoritePickerCursorHistory.length === 0} type="button" onClick={() => setFavoritePickerCursorHistory((history) => history.slice(0, -1))}>{t("common.previous")}</button><span className="text-xs font-bold text-[var(--muted)]">{t("favorites.page", { page: favoritePickerCursorHistory.length + 1 })}</span><button className="button-secondary focus-ring" disabled={loading || busy || !collectionPage.hasMore || !collectionPage.nextCursor} type="button" onClick={() => setFavoritePickerCursorHistory((history) => [...history, collectionPage.nextCursor])}>{t("common.next")}</button></div> : null}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input aria-label={t("favorites.newFolderName")} disabled={busy} className="field" placeholder={t("favorites.newFolderName")} value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createCollection(); } }} /><button className="button-secondary focus-ring" disabled={loading || busy || !loadSucceeded || !newName.trim()} type="button" onClick={() => void createCollection()}>{t("favorites.createFolder")}</button></div>
      </div>
      <footer className="flex justify-end border-t border-[var(--line)] p-4"><button className="button-primary focus-ring" disabled={loading || busy || !loadSucceeded} type="button" onClick={() => void save()}>{saving ? t("common.loading") : t("common.save")}</button></footer>
    </section>
  </dialog>;
}
