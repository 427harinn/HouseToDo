import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";
import { BottomNavigation } from "./ui";

const pointerEvent = (target: Element, type: string, clientY: number, pointerId: number) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  target.dispatchEvent(event);
};

describe("shared navigation foundation", () => {
  it("renders the five-slot icon-only navigation in the final order", () => {
    const onNavigate = vi.fn();
    const onAdd = vi.fn();
    const { container } = render(
      <BottomNavigation
        current="/settings/members"
        onAdd={onAdd}
        onNavigate={onNavigate}
      />
    );

    expect(
      Array.from(container.querySelectorAll(".bottom-nav__button")).map((button) =>
        button.getAttribute("aria-label")
      )
    ).toEqual(["ホーム", "カレンダー", "追加", "買い物", "その他"]);
    expect(screen.queryByText("ホーム")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "その他" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "追加" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("closes from backdrop and Escape, while internal controls do not start a drag", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="追加">
        <button type="button" onClick={() => undefined}>
          家事
        </button>
      </BottomSheet>
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "家事" }), {
      clientY: 10,
      pointerId: 1
    });
    fireEvent.pointerMove(screen.getByRole("button", { name: "家事" }), {
      clientY: 160,
      pointerId: 1
    });
    expect(document.querySelector(".bottom-sheet")).not.toHaveClass("is-dismissing");

    fireEvent.click(screen.getByRole("button", { name: "背景を閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("snaps back below the threshold and dismisses after a handle drag", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(
      <BottomSheet open onClose={onClose} title="追加">
        <button type="button">家事</button>
      </BottomSheet>
    );
    const handle = document.querySelector(".bottom-sheet__handle")!;
    const sheet = document.querySelector(".bottom-sheet")!;

    act(() => pointerEvent(handle, "pointerdown", 100, 1));
    act(() => pointerEvent(handle, "pointermove", 140, 1));
    expect(sheet).toHaveStyle({ "--sheet-drag-offset": "40px" });
    act(() => pointerEvent(handle, "pointerup", 140, 1));
    expect(sheet).not.toHaveClass("is-dismissing");
    expect(sheet).toHaveStyle({ "--sheet-drag-offset": "0px" });

    unmount();
    render(
      <BottomSheet open onClose={onClose} title="追加">
        <button type="button">家事</button>
      </BottomSheet>
    );
    const dismissHandle = document.querySelector(".bottom-sheet__handle")!;
    const dismissSheet = document.querySelector(".bottom-sheet")!;
    act(() => pointerEvent(dismissHandle, "pointerdown", 100, 2));
    act(() => pointerEvent(dismissHandle, "pointermove", 180, 2));
    act(() => pointerEvent(dismissHandle, "pointerup", 180, 2));
    expect(dismissSheet).toHaveClass("is-dismissing");
    vi.advanceTimersByTime(240);
    expect(onClose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("reaches the dismissed final state immediately when reduced motion is enabled", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    );
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="追加">
        <button type="button">家事</button>
      </BottomSheet>
    );
    const handle = document.querySelector(".bottom-sheet__handle")!;
    act(() => pointerEvent(handle, "pointerdown", 100, 3));
    act(() => pointerEvent(handle, "pointermove", 180, 3));
    act(() => pointerEvent(handle, "pointerup", 180, 3));
    expect(document.querySelector(".bottom-sheet")).toHaveClass("is-dismissing");
    await act(() => {
      vi.runAllTimers();
      return Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledOnce();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
