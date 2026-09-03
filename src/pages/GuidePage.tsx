import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { X } from "lucide-react";

const GUIDE_PAGES = [
  { src: "/guide/1.webp", alt: "今日やることが一目でわかる" },
  { src: "/guide/2.webp", alt: "タップしてそのまま完了" },
  { src: "/guide/3.webp", alt: "家事の予定をかんたん登録" },
  { src: "/guide/4.webp", alt: "くり返しも暮らしに合わせて" },
  { src: "/guide/5.webp", alt: "スワイプで編集やパス" },
  { src: "/guide/6.webp", alt: "今月の家事を見渡せる" },
  { src: "/guide/7.webp", alt: "その日の家事をまとめて確認" },
  { src: "/guide/8.webp", alt: "写真やメモ付きで買うものを共有" }
] as const;

export function GuidePage({ onClose }: { onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const updateCurrentPage = (scroller: HTMLDivElement) => {
    const pageWidth = scroller.clientWidth;
    if (!pageWidth) return;
    const nextPage = Math.max(0, Math.min(
      GUIDE_PAGES.length - 1,
      Math.round(scroller.scrollLeft / pageWidth)
    ));
    if (nextPage === currentPageRef.current) return;
    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (frameRef.current !== null) return;
    const scroller = event.currentTarget;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateCurrentPage(scroller);
    });
  };

  const moveByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextPage = Math.max(0, Math.min(GUIDE_PAGES.length - 1, currentPageRef.current + direction));
    scroller.scrollTo({ left: nextPage * scroller.clientWidth, behavior: "smooth" });
  };

  return (
    <main className="guide-page" aria-label="使い方ガイド">
      <div
        ref={scrollerRef}
        className="guide-page__scroller"
        aria-label="使い方ガイドのページ。左右にスワイプして見られます"
        tabIndex={0}
        onKeyDown={moveByKeyboard}
        onScroll={handleScroll}
      >
        {GUIDE_PAGES.map((page, index) => (
          <section className="guide-page__slide" key={page.src} aria-label={`使い方 ${index + 1}ページ目`}>
            <img
              src={page.src}
              alt={page.alt}
              decoding="async"
              loading="eager"
              draggable={false}
            />
          </section>
        ))}
      </div>
      <button type="button" className="guide-page__close" aria-label="使い方を閉じる" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      <div className="guide-page__indicator" aria-hidden="true">
        {GUIDE_PAGES.map((page, index) => (
          <span
            className={`guide-page__dot${index === currentPage ? " is-active" : ""}`}
            key={page.src}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">現在のページ: {currentPage + 1}</p>
    </main>
  );
}
