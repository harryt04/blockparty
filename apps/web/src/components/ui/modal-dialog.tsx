"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { escapeDismisses, FOCUSABLE_SELECTOR, wrappedTabIndex } from "./modal-dialog-model";

type ModalDialogProps = {
  open: boolean;
  id?: string;
  titleId: string;
  describedBy?: string;
  dismissible?: boolean;
  className?: string;
  children: ReactNode;
  onClose: () => void;
};

/**
 * Portal-backed dialog/sheet shell. It owns focus capture, a keyboard trap,
 * Escape/backdrop dismissal, focus restoration, and an inert app background.
 * The caller owns the decision content and keeps it controlled by the server
 * projection, so an authoritative update does not close or reset the surface.
 */
export function ModalDialog({
  open,
  id,
  titleId,
  describedBy,
  dismissible = true,
  className,
  children,
  onClose,
}: ModalDialogProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dismissibleRef = useRef(dismissible);
  const onCloseRef = useRef(onClose);

  dismissibleRef.current = dismissible;
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return undefined;

    const dialog = dialogRef.current;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () =>
      dialog === null
        ? []
        : [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
            (element) => !element.hasAttribute("inert"),
          );
    const initial = controls()[0] ?? dialog;
    initial?.focus();

    const background = [...document.body.children].filter(
      (element) => element !== dialog?.closest<HTMLElement>("[data-modal-layer]") && element,
    );
    const backgroundAttributes = background.map((element) => ({
      element,
      hadInert: element.hasAttribute("inert"),
    }));
    background.forEach((element) => element.setAttribute("inert", ""));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (escapeDismisses(dismissibleRef.current, event.key)) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;
      const currentControls = controls();
      if (currentControls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const activeIndex = currentControls.indexOf(document.activeElement as HTMLElement);
      const wrapped = wrappedTabIndex(activeIndex, currentControls.length, event.shiftKey);
      if (wrapped !== undefined) {
        event.preventDefault();
        currentControls[wrapped]?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      backgroundAttributes.forEach(({ element, hadInert }) => {
        if (!hadInert) element.removeAttribute("inert");
      });
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore?.isConnected) restore.focus();
    };
  }, [mounted, open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      data-modal-layer
      className="fixed inset-0 z-50 flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(event) => {
        if (dismissibleRef.current && event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        id={id}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          "max-h-[min(90dvh,42rem)] w-full overflow-y-auto rounded-t-(--radius-lg) border border-line bg-surface-raised p-4 shadow-xl sm:max-w-lg sm:rounded-(--radius-lg)",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
