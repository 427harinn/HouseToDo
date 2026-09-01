import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDelayedBusyStatus } from "./useDelayedBusyStatus";

function Harness({ active }: { active: boolean }) {
  const visible = useDelayedBusyStatus(active, { delayMs: 500, minVisibleMs: 400 });
  return <p>{visible ? "visible" : "hidden"}</p>;
}

describe("useDelayedBusyStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show when active ends before the delay", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Harness active />);

    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.getByText("hidden")).toBeInTheDocument();
    rerender(<Harness active={false} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("shows after the delay while active", () => {
    vi.useFakeTimers();
    render(<Harness active />);

    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("keeps a visible status until the minimum duration elapses", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Harness active />);

    act(() => { vi.advanceTimersByTime(500); });
    rerender(<Harness active={false} />);
    act(() => { vi.advanceTimersByTime(399); });
    expect(screen.getByText("visible")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("cleans up a pending timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Harness active />);

    unmount();
    expect(() => act(() => { vi.advanceTimersByTime(1000); })).not.toThrow();
  });

  it("does not leave an orphaned timer across active changes", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Harness active />);

    act(() => { vi.advanceTimersByTime(200); });
    rerender(<Harness active={false} />);
    rerender(<Harness active />);
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.getByText("hidden")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(201); });
    expect(screen.getByText("visible")).toBeInTheDocument();
  });
});
