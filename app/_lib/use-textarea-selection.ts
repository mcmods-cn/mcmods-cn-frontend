"use client";

import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

type TextSelection = {
  input: HTMLTextAreaElement;
  value: string;
  start: number;
  end: number;
};

function selectText({ input, start, end }: TextSelection) {
  input.focus();
  input.setSelectionRange(start, end);
}

// Apply a toolbar selection when React commits the matching value, before
// another keyboard or pointer event can make a newer selection.
export function useTextareaSelection(inputRef: RefObject<HTMLTextAreaElement | null>) {
  const pending = useRef<TextSelection | null>(null);

  useLayoutEffect(() => {
    const selection = pending.current;
    pending.current = null;
    if (selection && selection.input === inputRef.current && selection.input.value === selection.value) {
      selectText(selection);
    }
  });

  return useCallback((value: string, start: number, end = start) => {
    const input = inputRef.current;
    pending.current = null;
    if (!input) return;
    const selection = { input, value, start, end };
    if (input.value === value) selectText(selection);
    else pending.current = selection;
  }, [inputRef]);
}
