"use client";

import { useEffect, useState } from "react";
import {
  createFavoriteCollection,
  FavoriteCollection,
  loadFavoriteCollections,
  loadFavoriteMembership,
  saveFavoriteMembership,
} from "../_lib/favorite-api";
import { useI18n } from "../_lib/i18n-provider";

export function FavoritePickerModal({ entityType, entityKey, title, token, onClose, onSaved }: {
  entityType: string;
  entityKey: string;
  title: string;
  token: string;
  onClose: () => void;
  onSaved: (selected: boolean) => void;
}) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadFavoriteCollections(token), loadFavoriteMembership(token, entityType, entityKey)])
      .then(([items, ids]) => {
        if (!cancelled) {
          setCollections(items);
          setSelected(new Set(ids));
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t("favorites.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [entityKey, entityType, t, token]);

  async function createCollection() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createFavoriteCollection(token, name);
      setCollections((current) => [...current, created]);
      setSelected((current) => new Set(current).add(created.id));
      setNewName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.createFailed"));
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await saveFavoriteMembership(token, entityType, entityKey, [...selected]);
      onSaved(result.collectionIds.length > 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("favorites.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label={t("favorites.chooseFolders")}>
    <section className="w-full max-w-lg overflow-hidden rounded-lg bg-[var(--panel)] shadow-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4">
        <div><h2 className="text-xl font-black">{t("favorites.chooseFolders")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{title}</p></div>
        <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
      </header>
      <div className="p-4">
        {error ? <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-700 dark:text-red-300">{error}</p> : null}
        {loading ? <p className="py-8 text-center font-bold text-[var(--muted)]">{t("common.loading")}</p> : <div className="grid gap-2">{collections.map((collection) => <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3" key={collection.id}><span><span className="font-bold">{collection.isDefault ? t("favorites.defaultFolder") : collection.name}</span><span className="ml-2 text-xs text-[var(--muted)]">{t("favorites.itemCount", { count: collection.itemCount })}</span></span><input checked={selected.has(collection.id)} type="checkbox" onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(collection.id); else next.delete(collection.id); return next; })} /></label>)}</div>}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input className="field" placeholder={t("favorites.newFolderName")} value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createCollection(); } }} /><button className="button-secondary focus-ring" disabled={!newName.trim()} type="button" onClick={() => void createCollection()}>{t("favorites.createFolder")}</button></div>
      </div>
      <footer className="flex justify-end border-t border-[var(--line)] p-4"><button className="button-primary focus-ring" disabled={loading || saving} type="button" onClick={() => void save()}>{saving ? t("common.loading") : t("common.save")}</button></footer>
    </section>
  </div>;
}
