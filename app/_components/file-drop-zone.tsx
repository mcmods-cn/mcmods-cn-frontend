"use client";

import { type DragEvent, useState } from "react";

export function FileDropZone({
  accept,
  className = "min-h-40 p-6",
  disabled = false,
  hint,
  multiple = false,
  onFiles,
  title,
}: {
  accept: string;
  className?: string;
  disabled?: boolean;
  hint: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
}) {
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;

  function containsFiles(event: DragEvent<HTMLLabelElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function emitFiles(files: Iterable<File>) {
    const accepted = Array.from(files).filter((file) => fileMatchesAccept(file, accept));
    if (accepted.length) onFiles(multiple ? accepted : accepted.slice(0, 1));
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled && containsFiles(event)) setDragDepth((current) => current + 1);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragDepth((current) => Math.max(0, current - 1));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragDepth(0);
    if (!disabled) emitFiles(event.dataTransfer.files);
  }

  return (
    <label
      aria-disabled={disabled}
      className={`grid place-items-center rounded-xl border border-dashed text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)] ${className} ${disabled ? "cursor-not-allowed border-[var(--line)] bg-[var(--panel-subtle)] opacity-60" : dragging ? "cursor-copy border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "cursor-pointer border-[var(--line)] bg-[var(--panel-subtle)] hover:border-[var(--accent)]"}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        accept={accept}
        className="sr-only"
        disabled={disabled}
        multiple={multiple}
        type="file"
        onChange={(event) => {
          emitFiles(event.currentTarget.files || []);
          event.currentTarget.value = "";
        }}
      />
      <span>
        <strong className="block text-lg">{title}</strong>
        <small className="mt-2 block text-[var(--muted)]">{hint}</small>
      </span>
    </label>
  );
}

function fileMatchesAccept(file: File, accept: string) {
  const rules = accept.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}
