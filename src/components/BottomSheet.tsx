import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode
} from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { MOTION_MS } from "../motion/constants";

type BottomSheetProps = {
  className?: string;
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function BottomSheet({ children, className, onClose, open, title }: BottomSheetProps) {
  const dragStartY = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const dismissTimer = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setDragOffset(0);
      dragOffsetRef.current = 0;
      setIsDragging(false);
      setIsDismissing(false);
    }
    return () => {
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const scrollContainers = Array.from(
      document.querySelectorAll<HTMLElement>(".app-shell, .app-shell__viewport")
    );
    const previousOverflow = scrollContainers.map((container) => container.style.overflowY);
    scrollContainers.forEach((container) => {
      container.style.overflowY = "hidden";
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      scrollContainers.forEach((container, index) => {
        container.style.overflowY = previousOverflow[index];
      });
    };
  }, [onClose, open]);

  if (!open) return null;

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (isDismissing) return;
    dragStartY.current = event.clientY;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const nextOffset = Math.max(0, Math.min(220, event.clientY - dragStartY.current));
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  };

  const handleDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const shouldDismiss = dragOffsetRef.current > 64;
    dragStartY.current = null;
    dragOffsetRef.current = 0;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsDragging(false);
    if (!shouldDismiss) {
      setDragOffset(0);
      return;
    }
    setIsDismissing(true);
    dismissTimer.current = window.setTimeout(
      onClose,
      prefersReducedMotion ? 0 : MOTION_MS.sheet
    );
  };

  return (
    <div className="bottom-sheet-layer">
      <button
        type="button"
        className={`bottom-sheet__backdrop${isDismissing ? " is-dismissing" : ""}`}
        aria-label="背景を閉じる"
        onClick={onClose}
      />
      <section
        className={["bottom-sheet", className, isDragging ? "is-dragging" : "", isDismissing ? "is-dismissing" : ""]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ "--sheet-drag-offset": `${dragOffset}px` } as CSSProperties}
      >
        <div
          className="bottom-sheet__handle"
          aria-hidden="true"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        />
        <div className="bottom-sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="bottom-sheet__close" onClick={onClose}>
            閉じる
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
