import { useState, type Dispatch, type SetStateAction } from "react";
import { useI18n } from "../../_lib/i18n-provider";
import type { BackendModGalleryImage } from "../../_lib/mod-api";
import { uploadUserFileToOSS, type OSSFileRecord } from "../../_lib/oss-upload";
import { createOSSUploadBatchTasks, processOSSUploadBatch, type OSSUploadBatchTask } from "../../_lib/oss-upload-batch.mts";
import type { SquareCropOutput } from "../square-image-crop-dialog";
import { useEditorWrite } from "./use-editor-write";

type ProjectImages = { iconUrl: string; galleryImages: BackendModGalleryImage[] };
type UploadTask = OSSUploadBatchTask<File, OSSFileRecord>;

export function useProjectImages<T extends ProjectImages>({
  token, iconSource, gallerySource, gallerySize, setDraft, setMessage,
}: {
  token: string; iconSource: string; gallerySource: string; gallerySize: number;
  setDraft: Dispatch<SetStateAction<T>>; setMessage: (message: string) => void;
}) {
  const { t } = useI18n();
  const [iconPreviewUrl, setIconPreviewUrl] = useState("");
  const [iconUploading, setIconUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryUploadTasks, setGalleryUploadTasks] = useState<UploadTask[]>([]);
  const icon = useEditorWrite();
  const gallery = useEditorWrite();

  async function uploadIcon(output: SquareCropOutput) {
    const file = output.files.get(128);
    const request = file && token ? icon.beginWrite() : null;
    if (!file || !request) { URL.revokeObjectURL(output.previewUrl); return; }
    setIconUploading(true);
    setMessage("");
    try {
      const record = await uploadUserFileToOSS(file, token, iconSource, undefined, request.signal);
      if (request.signal.aborted) return;
      const storageUrl = record.storageUrl || record.accessUrl;
      if (!storageUrl) throw new Error(t("mods.submission.iconUploadFailed"));
      setDraft(current => ({ ...current, iconUrl: storageUrl }));
      setIconPreviewUrl(record.accessUrl || storageUrl);
    } catch (error) {
      if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : t("mods.submission.iconUploadFailed"));
    } finally {
      URL.revokeObjectURL(output.previewUrl);
      if (icon.finishWrite(request)) setIconUploading(false);
    }
  }

  async function processGallery(tasks: UploadTask[], retryKey?: string) {
    if (!tasks.length || !token) return;
    const request = gallery.beginWrite();
    if (!request) return;
    setGalleryUploading(true);
    setMessage("");
    try {
      const result = await processOSSUploadBatch<File, OSSFileRecord>(tasks, {
        signal: request.signal,
        upload: file => uploadUserFileToOSS(file, token, gallerySource, undefined, request.signal),
        shouldProcess: retryKey ? task => task.key === retryKey : undefined,
        onChange: setGalleryUploadTasks,
        onUploaded: (task, record) => setDraft(current => {
          if (current.galleryImages.some(image => image.fileId === record.id)) return current;
          const image: BackendModGalleryImage = { fileId: record.id, name: record.originalName || task.file.name,
            contentType: record.contentType, sizeBytes: record.sizeBytes, url: record.accessUrl };
          return { ...current, galleryImages: [...current.galleryImages, image].slice(0, 32) };
        }),
      });
      if (!request.signal.aborted && result.some(task => task.stage === "failed")) setMessage(t("mods.submission.galleryUploadFailed"));
    } finally {
      if (gallery.finishWrite(request)) setGalleryUploading(false);
    }
  }

  function uploadGallery(files: File[]) {
    return processGallery(createOSSUploadBatchTasks<File, OSSFileRecord>(files, {
      capacity: Math.max(0, 32 - gallerySize),
      capacityError: t("uploadBatch.capacityReached"),
      identity: (file, index) => `${file.name}:${file.size}:${file.lastModified}:${index}`,
      validate: file => file.type.startsWith("image/") ? "" : t("uploadBatch.imageOnly"),
    }));
  }

  return { uploadIcon, iconPreviewUrl, setIconPreviewUrl, iconUploading, uploadGallery,
    galleryUploading, galleryUploadTasks, retryGalleryUpload: (key: string) => processGallery(galleryUploadTasks, key) };
}
