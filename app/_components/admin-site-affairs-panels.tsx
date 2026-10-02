"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import {
  canSubmitAboutDraft,
  isCurrentAboutDraftResponse,
} from "../_lib/about-locale-editor";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import {
  changelogDraftForLocale,
  ChangelogLocaleDraft,
  switchChangelogLocaleDraft,
} from "../_lib/site-changelog-locale-editor";
import {
  Notice,
  PanelHeader,
  errorMessage,
  today,
} from "./admin-governance-shared";
import { MarkdownRenderer } from "./markdown-renderer";

type AboutDraft = {
  locale: string;
  title: string;
  bodyMarkdown: string;
  status: string;
  revision: number;
};
export function AboutAdminPanel({ token }: { token: string }) {
  const { locale: currentLocale, t } = useI18n();
  const [locale, setLocale] = useState<string>(currentLocale);
  const [draft, setDraft] = useState<AboutDraft>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadGeneration, setReloadGeneration] = useState(0);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const loadGeneration = useRef(0);
  const selectedLocale = useRef(locale);

  const load = useCallback(
    async (
      requestedLocale: string,
      requestGeneration: number,
      signal: AbortSignal,
    ) => {
      try {
        const value = await apiRequest<AboutDraft>(
          `/api/v1/admin/site-affairs/about/${requestedLocale}`,
          { signal },
          token,
        );
        if (
          !isCurrentAboutDraftResponse({
            aborted: signal.aborted,
            currentGeneration: loadGeneration.current,
            requestGeneration,
            requestedLocale,
            responseLocale: value.locale,
            selectedLocale: selectedLocale.current,
          })
        ) {
          if (
            !signal.aborted &&
            requestGeneration === loadGeneration.current &&
            requestedLocale === selectedLocale.current
          ) {
            const mismatch = t("admin.governance.aboutLocaleMismatch");
            setLoadError(mismatch);
            setMessage(mismatch);
          }
          return;
        }
        setDraft(value);
        setLoadError("");
      } catch (error) {
        if (
          !signal.aborted &&
          requestGeneration === loadGeneration.current &&
          requestedLocale === selectedLocale.current
        ) {
          const loadMessage = errorMessage(error);
          setDraft(undefined);
          setLoadError(loadMessage);
          setMessage(loadMessage);
        }
      } finally {
        if (
          !signal.aborted &&
          requestGeneration === loadGeneration.current &&
          requestedLocale === selectedLocale.current
        ) {
          setLoading(false);
        }
      }
    },
    [t, token],
  );

  useEffect(() => {
    selectedLocale.current = locale;
    const controller = new AbortController();
    const requestGeneration = ++loadGeneration.current;
    queueMicrotask(
      () => void load(locale, requestGeneration, controller.signal),
    );
    return () => controller.abort();
  }, [load, locale, reloadGeneration]);

  const canEdit = canSubmitAboutDraft({
    draft,
    loadError,
    loading,
    saving,
    selectedLocale: locale,
  });

  function prepareLoad(clearMessage: boolean) {
    setDraft(undefined);
    setLoading(true);
    setLoadError("");
    setPreview(false);
    if (clearMessage) setMessage("");
  }

  function changeLocale(nextLocale: string) {
    selectedLocale.current = nextLocale;
    prepareLoad(true);
    setLocale(nextLocale);
  }

  function retryLoad() {
    prepareLoad(true);
    setReloadGeneration((value) => value + 1);
  }

  async function save(publish: boolean) {
    const saveDraft = draft;
    if (!canEdit || !saveDraft) return;
    setSaving(true);
    try {
      await apiRequest(
        `/api/v1/admin/site-affairs/about/${saveDraft.locale}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: saveDraft.title,
            bodyMarkdown: saveDraft.bodyMarkdown,
            publish,
            baseRevision: saveDraft.revision,
          }),
        },
        token,
      );
      if (selectedLocale.current === saveDraft.locale) {
        setMessage(t("admin.governance.saved"));
        prepareLoad(false);
        setReloadGeneration((value) => value + 1);
      }
    } catch (error) {
      if (selectedLocale.current === saveDraft.locale) {
        setMessage(
          error instanceof ApiError && error.code === "SITE_PAGE_EDIT_CONFLICT"
            ? t("admin.governance.editConflict")
            : errorMessage(error),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <PanelHeader
        title={t("admin.governance.about")}
        description={t("admin.governance.aboutDescription")}
      />
      {message ? (
        <Notice text={message} />
      ) : loading ? (
        <Notice text={t("common.loading")} />
      ) : null}
      {loadError ? (
        <button
          className="button-secondary focus-ring mt-3"
          type="button"
          onClick={retryLoad}
        >
          {t("common.retry")}
        </button>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <select
          className="field w-auto"
          value={locale}
          onChange={(event) => changeLocale(event.target.value)}
        >
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          className="button-secondary focus-ring"
          disabled={!canEdit}
          type="button"
          onClick={() => setPreview((value) => !value)}
        >
          {t("admin.governance.preview")}
        </button>
        <button
          className="button-secondary focus-ring"
          disabled={!canEdit}
          type="button"
          onClick={() => void save(false)}
        >
          {t("admin.governance.saveDraft")}
        </button>
        <button
          className="button-primary focus-ring"
          disabled={!canEdit}
          type="button"
          onClick={() => void save(true)}
        >
          {t("admin.governance.publish")}
        </button>
      </div>
      <input
        className="field mt-4"
        disabled={!canEdit}
        value={draft?.title || ""}
        onChange={(event) =>
          setDraft(draft ? { ...draft, title: event.target.value } : draft)
        }
        placeholder={t("admin.governance.titleField")}
      />
      <textarea
        className="field mt-4 min-h-[420px] font-mono"
        disabled={!canEdit}
        value={draft?.bodyMarkdown || ""}
        onChange={(event) =>
          setDraft(
            draft ? { ...draft, bodyMarkdown: event.target.value } : draft,
          )
        }
      />
      {preview && draft ? (
        <div className="markdown-preview mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <MarkdownRenderer emptyText="" markdown={draft.bodyMarkdown} />
        </div>
      ) : null}
    </section>
  );
}

type AdminChangelog = {
  id: string;
  changeDate: string;
  status: string;
  updatedAt: string;
  translations: Record<
    string,
    { title: string; bodyMarkdown: string; status: string }
  >;
};
type AdminChangelogPage = {
  items: AdminChangelog[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};
export function SiteChangelogAdminPanel({ token }: { token: string }) {
  const { locale: currentLocale, t } = useI18n();
  const [page, setPage] = useState<AdminChangelogPage>({
    items: [],
    limit: 30,
    hasMore: false,
    nextCursor: "",
  });
  const [cursor, setCursor] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<AdminChangelog>();
  const [localeDrafts, setLocaleDrafts] = useState<
    Record<string, ChangelogLocaleDraft>
  >({});
  const [baseUpdatedAt, setBaseUpdatedAt] = useState("");
  const [locale, setLocale] = useState<string>(currentLocale);
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publish, setPublish] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(
    (targetCursor = cursor) => {
      const pageCursor = targetCursor
        ? `&cursor=${encodeURIComponent(targetCursor)}`
        : "";
      return apiRequest<AdminChangelogPage>(
        `/api/v1/admin/site-affairs/changelogs?limit=30${pageCursor}`,
        {},
        token,
      )
        .then(setPage)
        .catch((error) => setMessage(errorMessage(error)));
    },
    [cursor, token],
  );
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  function edit(item: AdminChangelog) {
    const value = changelogDraftForLocale(item.translations, locale);
    setEditingItem(item);
    setLocaleDrafts({});
    setBaseUpdatedAt(item.updatedAt);
    setDate(item.changeDate.slice(0, 10));
    setPublish(value.publish);
    setTitle(value.title);
    setBody(value.bodyMarkdown);
  }
  function changeChangelogLocale(nextLocale: string) {
    const switched = switchChangelogLocaleDraft({
      currentDraft: { bodyMarkdown: body, publish, title },
      currentLocale: locale,
      drafts: localeDrafts,
      nextLocale,
      translations: editingItem?.translations || {},
    });
    setLocaleDrafts(switched.drafts);
    setLocale(nextLocale);
    setPublish(switched.nextDraft.publish);
    setTitle(switched.nextDraft.title);
    setBody(switched.nextDraft.bodyMarkdown);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const path = editingItem
      ? `/api/v1/admin/site-affairs/changelogs/${editingItem.id}`
      : "/api/v1/admin/site-affairs/changelogs";
    try {
      await apiRequest(
        path,
        {
          method: editingItem ? "PUT" : "POST",
          body: JSON.stringify({
            changeDate: date,
            locale,
            title,
            bodyMarkdown: body,
            publish,
            baseUpdatedAt: editingItem ? baseUpdatedAt : undefined,
          }),
        },
        token,
      );
      setEditingItem(undefined);
      setLocaleDrafts({});
      setBaseUpdatedAt("");
      setTitle("");
      setBody("");
      setCursor("");
      setCursorHistory([]);
      await load("");
      setMessage(t("admin.governance.saved"));
    } catch (error) {
      setMessage(
        error instanceof ApiError &&
          error.code === "SITE_CHANGELOG_EDIT_CONFLICT"
          ? t("admin.governance.editConflict")
          : errorMessage(error),
      );
    }
  }
  function previousPage() {
    const history = cursorHistory.slice();
    const previousCursor = history.pop() || "";
    setCursorHistory(history);
    setCursor(previousCursor);
  }
  function nextPage() {
    if (!page.nextCursor) return;
    setCursorHistory([...cursorHistory, cursor]);
    setCursor(page.nextCursor);
  }
  return (
    <section>
      <PanelHeader
        title={t("admin.governance.changelogs")}
        description={t("admin.governance.changelogsDescription")}
      />
      {message ? <Notice text={message} /> : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="grid content-start gap-2">
          {page.items.map((item) => (
            <button
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-left hover:border-[var(--accent)]"
              key={item.id}
              type="button"
              onClick={() => edit(item)}
            >
              <strong>{item.changeDate.slice(0, 10)}</strong>
              <span className="ml-2 text-xs text-[var(--muted)]">
                {item.translations[locale]?.status || item.status}
              </span>
              <p className="mt-1 truncate text-sm">
                {Object.values(item.translations)[0]?.title}
              </p>
            </button>
          ))}
          <div className="mt-2 flex justify-between">
            <button
              className="button-secondary focus-ring"
              disabled={cursorHistory.length === 0}
              type="button"
              onClick={previousPage}
            >
              {t("common.previous")}
            </button>
            <button
              className="button-secondary focus-ring"
              disabled={!page.hasMore || !page.nextCursor}
              type="button"
              onClick={nextPage}
            >
              {t("common.next")}
            </button>
          </div>
        </div>
        <form
          className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"
          onSubmit={save}
        >
          <div className="flex flex-wrap gap-2">
            <input
              className="field w-auto"
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <button
              className="button-secondary focus-ring"
              type="button"
              onClick={() => setDate(today())}
            >
              {t("admin.governance.today")}
            </button>
            <select
              className="field w-auto"
              value={locale}
              onChange={(event) => changeChangelogLocale(event.target.value)}
            >
              {supportedLocales.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <input
            className="field"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("admin.governance.titleField")}
          />
          <textarea
            className="field min-h-72 font-mono"
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <label className="flex gap-2 font-bold">
            <input
              checked={publish}
              type="checkbox"
              onChange={(event) => setPublish(event.target.checked)}
            />
            {t("admin.governance.publish")}
          </label>
          <div className="flex gap-2">
            <button
              className="button-secondary focus-ring"
              type="button"
              onClick={() => setPreview((value) => !value)}
            >
              {t("admin.governance.preview")}
            </button>
            <button className="button-primary focus-ring" type="submit">
              {editingItem ? t("common.save") : t("common.create")}
            </button>
          </div>
          {preview ? (
            <div className="markdown-preview rounded-lg border border-[var(--line)] p-4">
              <MarkdownRenderer emptyText="" markdown={body} />
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
