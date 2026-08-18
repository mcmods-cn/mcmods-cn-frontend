"use client";

/* eslint-disable @next/next/no-img-element */
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { abortMultipartUpload, completeOSSUpload, computeFileSHA256, putFileToOSS, type OSSDirectUploadTicket } from "../_lib/oss-upload";

type AdminSticker = {
  code: string;
  status: string;
  sortOrder: number;
  imageFileId: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  checksum: string;
  translations: Record<string, string>;
};

type AdminStickerPack = {
  code: string;
  status: string;
  sortOrder: number;
  translations: Record<string, string>;
  stickers: AdminSticker[];
};

type StickerAdminResponse = {
  locales: string[];
  packs: AdminStickerPack[];
};

export function AdminStickerPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<StickerAdminResponse>({ locales: [], packs: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [packCode, setPackCode] = useState("");
  const [packNames, setPackNames] = useState<Record<string, string>>({});
  const [selectedPack, setSelectedPack] = useState("");
  const [stickerCode, setStickerCode] = useState("");
  const [stickerNames, setStickerNames] = useState<Record<string, string>>({});
  const [image, setImage] = useState<File | null>(null);

  const load = useCallback(async () => {
    setData(await apiRequest<StickerAdminResponse>("/api/v1/admin/stickers", {}, token));
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    apiRequest<StickerAdminResponse>("/api/v1/admin/stickers", {}, token)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("admin.stickers.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [t, token]);

  async function createPack(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await apiRequest("/api/v1/admin/sticker-packs", {
        method: "POST",
        body: JSON.stringify({ code: packCode, status: "active", sortOrder: data.packs.length * 10, translations: packNames }),
      }, token);
      setPackCode("");
      setPackNames({});
      await load();
      setMessage(t("admin.stickers.packSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.stickers.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadStickerFile(file: File, pack: string) {
    const sha256 = await computeFileSHA256(file);
    const ticket = await apiRequest<OSSDirectUploadTicket>("/api/v1/admin/oss/uploads/presign", {
      method: "POST",
      body: JSON.stringify({
        originalName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        sha256,
        category: `stickers-${pack}`,
        source: "sticker-upload",
      }),
    }, token);
    if (ticket.uploadRequired !== false) {
      try {
        await putFileToOSS(ticket, file);
      } catch (error) {
        await abortMultipartUpload("/api/v1/admin/oss/uploads/complete", ticket, token);
        throw error;
      }
    }
    const record = ticket.uploadRequired === false && ticket.file ? ticket.file : await completeOSSUpload<{ id: string }>("/api/v1/admin/oss/uploads/complete", ticket, token);
    if (!record?.id) throw new Error(t("admin.stickers.uploadFailed"));
    return record.id;
  }

  async function createSticker(event: FormEvent) {
    event.preventDefault();
    if (!image) return;
    setBusy(true);
    setMessage("");
    try {
      const imageFileId = await uploadStickerFile(image, selectedPack);
      await apiRequest(`/api/v1/admin/sticker-packs/${encodeURIComponent(selectedPack)}/stickers`, {
        method: "POST",
        body: JSON.stringify({ code: stickerCode, imageFileId, status: "active", sortOrder: 0, translations: stickerNames }),
      }, token);
      setStickerCode("");
      setStickerNames({});
      setImage(null);
      await load();
      setMessage(t("admin.stickers.stickerSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.stickers.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function togglePack(pack: AdminStickerPack) {
    await apiRequest(`/api/v1/admin/sticker-packs/${pack.code}`, {
      method: "PUT",
      body: JSON.stringify({
        status: pack.status === "active" ? "disabled" : "active",
        sortOrder: pack.sortOrder,
        translations: pack.translations,
      }),
    }, token);
    await load();
  }

  async function toggleSticker(pack: AdminStickerPack, sticker: AdminSticker) {
    await apiRequest(`/api/v1/admin/sticker-packs/${pack.code}/stickers/${sticker.code}`, {
      method: "PUT",
      body: JSON.stringify({
        status: sticker.status === "active" ? "disabled" : "active",
        sortOrder: sticker.sortOrder,
        translations: sticker.translations,
      }),
    }, token);
    await load();
  }

  async function savePack(pack: AdminStickerPack, form: HTMLFormElement) {
    const values = new FormData(form);
    const translations = Object.fromEntries(data.locales.map((locale) => [locale, String(values.get(`name:${locale}`) || "").trim()]));
    setBusy(true);
    setMessage("");
    try {
      await apiRequest(`/api/v1/admin/sticker-packs/${pack.code}`, {
        method: "PUT",
        body: JSON.stringify({ status: pack.status, sortOrder: Number(values.get("sortOrder")) || 0, translations }),
      }, token);
      await load();
      setMessage(t("admin.stickers.packSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.stickers.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSticker(pack: AdminStickerPack, sticker: AdminSticker, form: HTMLFormElement) {
    const values = new FormData(form);
    const translations = Object.fromEntries(data.locales.map((locale) => [locale, String(values.get(`name:${locale}`) || "").trim()]));
    const replacement = values.get("image");
    setBusy(true);
    setMessage("");
    try {
      const imageFileId = replacement instanceof File && replacement.size > 0 ? await uploadStickerFile(replacement, pack.code) : "";
      await apiRequest(`/api/v1/admin/sticker-packs/${pack.code}/stickers/${sticker.code}`, {
        method: "PUT",
        body: JSON.stringify({ imageFileId, status: sticker.status, sortOrder: Number(values.get("sortOrder")) || 0, translations }),
      }, token);
      await load();
      setMessage(t("admin.stickers.stickerSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.stickers.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function deletePack(pack: AdminStickerPack) {
    if (!window.confirm(`${t("common.delete")} ${pack.code}?`)) return;
    await apiRequest(`/api/v1/admin/sticker-packs/${pack.code}`, { method: "DELETE" }, token);
    await load();
  }

  async function deleteSticker(pack: AdminStickerPack, sticker: AdminSticker) {
    if (!window.confirm(`${t("common.delete")} ${pack.code}:${sticker.code}?`)) return;
    await apiRequest(`/api/v1/admin/sticker-packs/${pack.code}/stickers/${sticker.code}`, { method: "DELETE" }, token);
    await load();
  }

  return (
    <section className="grid gap-5">
      <header>
        <h1 className="text-3xl font-black">{t("admin.stickers.title")}</h1>
        <p className="mt-2 text-[var(--muted)]">{t("admin.stickers.description")}</p>
      </header>
      {message ? <p className="rounded-lg border border-[var(--line)] p-3 font-bold">{message}</p> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <form className="surface grid gap-3 p-5" onSubmit={createPack}>
          <h2 className="text-xl font-black">{t("admin.stickers.createPack")}</h2>
          <input
            className="field font-mono"
            pattern="[a-z0-9][a-z0-9_-]*"
            placeholder="dogs"
            required
            value={packCode}
            onChange={(event) => setPackCode(event.target.value.toLowerCase())}
          />
          <TranslationFields locales={data.locales} names={packNames} onChange={setPackNames} />
          <button className="button-primary focus-ring" disabled={busy} type="submit">
            {t("common.create")}
          </button>
        </form>

        <form className="surface grid gap-3 p-5" onSubmit={createSticker}>
          <h2 className="text-xl font-black">{t("admin.stickers.createSticker")}</h2>
          <select className="field" required value={selectedPack} onChange={(event) => setSelectedPack(event.target.value)}>
            <option value="">{t("admin.stickers.selectPack")}</option>
            {data.packs.map((pack) => (
              <option key={pack.code} value={pack.code}>{localizedStickerName(pack.translations, locale, pack.code)}</option>
            ))}
          </select>
          <input
            className="field font-mono"
            pattern="[a-z0-9][a-z0-9_-]*"
            placeholder="happy"
            required
            value={stickerCode}
            onChange={(event) => setStickerCode(event.target.value.toLowerCase())}
          />
          <input
            accept="image/png,image/gif"
            className="field"
            required
            type="file"
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
          />
          <TranslationFields locales={data.locales} names={stickerNames} onChange={setStickerNames} />
          <button className="button-primary focus-ring" disabled={busy || !selectedPack || !image} type="submit">
            {t("common.create")}
          </button>
        </form>
      </div>

      <div className="grid gap-4">
        {data.packs.map((pack) => (
          <article className="surface p-5" key={pack.code}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{localizedStickerName(pack.translations, locale, pack.code)}</h2>
                <code>{pack.code}</code>
              </div>
              <div className="flex gap-2">
                <button className="button-secondary focus-ring" type="button" onClick={() => void togglePack(pack)}>
                  {pack.status === "active" ? t("admin.stickers.disable") : t("admin.stickers.enable")}
                </button>
                {pack.stickers.length === 0 ? (
                  <button className="button-secondary focus-ring text-[var(--danger)]" type="button" onClick={() => void deletePack(pack)}>
                    {t("common.delete")}
                  </button>
                ) : null}
              </div>
            </div>
            <PackEditor busy={busy} locales={data.locales} pack={pack} onSave={savePack} />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pack.stickers.map((sticker) => (
                <div className="rounded-lg border border-[var(--line)] p-3 text-center" key={sticker.code}>
                  <img
                    alt={localizedStickerName(sticker.translations, locale, sticker.code)}
                    className="mx-auto h-16 max-w-full object-contain"
                    src={`/api/v1/oss/files/${sticker.imageFileId}/content`}
                  />
                  <p className="mt-2 truncate font-bold">{localizedStickerName(sticker.translations, locale, sticker.code)}</p>
                  <code className="text-xs">{sticker.code}</code>
                  <StickerEditor busy={busy} locales={data.locales} pack={pack} sticker={sticker} onSave={saveSticker} />
                  <button className="mt-2 block w-full text-sm font-bold text-[var(--accent)]" type="button" onClick={() => void toggleSticker(pack, sticker)}>
                    {sticker.status === "active" ? t("admin.stickers.disable") : t("admin.stickers.enable")}
                  </button>
                  <button className="mt-1 block w-full text-sm font-bold text-[var(--danger)]" type="button" onClick={() => void deleteSticker(pack, sticker)}>
                    {t("common.delete")}
                  </button>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type PackEditorProps = {
  busy: boolean;
  locales: string[];
  pack: AdminStickerPack;
  onSave: (pack: AdminStickerPack, form: HTMLFormElement) => Promise<void>;
};

function PackEditor({ busy, locales, pack, onSave }: PackEditorProps) {
  const { t } = useI18n();
  return (
    <details className="mt-4 rounded-lg border border-[var(--line)] p-3 text-left">
      <summary className="cursor-pointer font-bold">{t("common.edit")}</summary>
      <form
        className="mt-3 grid gap-3"
        key={`${pack.code}:${pack.sortOrder}:${JSON.stringify(pack.translations)}`}
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(pack, event.currentTarget);
        }}
      >
        <label className="font-bold">
          {t("admin.stickers.sortOrder")}
          <input className="field mt-1" defaultValue={pack.sortOrder} name="sortOrder" type="number" />
        </label>
        <UncontrolledTranslationFields locales={locales} names={pack.translations} />
        <button className="button-primary focus-ring justify-self-start" disabled={busy} type="submit">
          {t("common.save")}
        </button>
      </form>
    </details>
  );
}

type StickerEditorProps = {
  busy: boolean;
  locales: string[];
  pack: AdminStickerPack;
  sticker: AdminSticker;
  onSave: (pack: AdminStickerPack, sticker: AdminSticker, form: HTMLFormElement) => Promise<void>;
};

function StickerEditor({ busy, locales, pack, sticker, onSave }: StickerEditorProps) {
  const { t } = useI18n();
  return (
    <details className="mt-3 rounded-lg border border-[var(--line)] p-2 text-left">
      <summary className="cursor-pointer text-sm font-bold">{t("common.edit")}</summary>
      <form
        className="mt-3 grid gap-2"
        key={`${sticker.code}:${sticker.sortOrder}:${sticker.checksum}:${JSON.stringify(sticker.translations)}`}
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(pack, sticker, event.currentTarget);
        }}
      >
        <label className="text-sm font-bold">
          {t("admin.stickers.sortOrder")}
          <input className="field mt-1" defaultValue={sticker.sortOrder} name="sortOrder" type="number" />
        </label>
        <label className="text-sm font-bold">
          {t("admin.stickers.replaceImage")}
          <input accept="image/png,image/gif" className="field mt-1" name="image" type="file" />
        </label>
        <UncontrolledTranslationFields locales={locales} names={sticker.translations} />
        <button className="button-primary focus-ring" disabled={busy} type="submit">
          {t("common.save")}
        </button>
      </form>
    </details>
  );
}

function UncontrolledTranslationFields({ locales, names }: { locales: string[]; names: Record<string, string> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {locales.map((locale) => (
        <label className="text-sm font-bold" key={locale}>
          {locale}
          <input className="field mt-1" defaultValue={names[locale] || ""} maxLength={80} name={`name:${locale}`} required />
        </label>
      ))}
    </div>
  );
}

type TranslationFieldsProps = {
  locales: string[];
  names: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
};

function TranslationFields({ locales, names, onChange }: TranslationFieldsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {locales.map((locale) => (
        <label className="text-sm font-bold" key={locale}>
          {locale}
          <input
            className="field mt-1"
            maxLength={80}
            required
            value={names[locale] || ""}
            onChange={(event) => onChange({ ...names, [locale]: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function localizedStickerName(translations: Record<string, string>, locale: string, fallback: string) {
  return translations[locale] || translations["zh-CN"] || translations["en-US"] || fallback;
}
