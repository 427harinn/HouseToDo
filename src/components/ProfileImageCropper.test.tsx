import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileImagePicker } from "./ProfileImageCropper";
import type { CropSource, ProcessedImage } from "../lib/image-processing";

const { createCropSource, processCroppedAvatar } = vi.hoisted(() => ({
  createCropSource: vi.fn(),
  processCroppedAvatar: vi.fn()
}));

vi.mock("../lib/image-processing", async () => {
  const actual = await vi.importActual<typeof import("../lib/image-processing")>("../lib/image-processing");
  return { ...actual, createCropSource, processCroppedAvatar };
});

const source: CropSource = {
  file: new File(["image"], "portrait.jpg", { type: "image/jpeg" }),
  url: "blob:portrait",
  width: 900,
  height: 1200
};

const result: ProcessedImage = {
  blob: new Blob(["avatar"], { type: "image/webp" }),
  width: 512,
  height: 512,
  contentType: "image/webp",
  size: 6
};

describe("ProfileImagePicker", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("opens the crop UI, preserves the previous image on cancel, and applies on confirm", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    createCropSource.mockResolvedValue(source);
    processCroppedAvatar.mockResolvedValue(result);
    const onImageChange = vi.fn();

    render(<ProfileImagePicker id="profile-image" image={null} onImageChange={onImageChange} />);
    fireEvent.change(screen.getByLabelText("プロフィール画像を選択"), {
      target: { files: [source.file] }
    });
    expect(await screen.findByRole("dialog", { name: "写真を調整" })).toBeVisible();
    expect(screen.getByLabelText("プロフィール画像の切り抜き範囲")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onImageChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("プロフィール画像を選択"), {
      target: { files: [source.file] }
    });
    await screen.findByRole("dialog", { name: "写真を調整" });
    fireEvent.change(screen.getByLabelText("プロフィール画像の拡大縮小"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "完了" }));

    await waitFor(() => expect(onImageChange).toHaveBeenCalledWith(result));
    expect(processCroppedAvatar).toHaveBeenCalledWith(source, expect.objectContaining({ zoom: 2 }));
  });

  it("shows a clear unsupported-image error and prevents submission while decoding", async () => {
    createCropSource.mockRejectedValue(new Error("unsupported-image-type"));
    const onProcessingChange = vi.fn();
    render(<ProfileImagePicker id="profile-image-error" image={null} onImageChange={vi.fn()} onProcessingChange={onProcessingChange} />);
    fireEvent.change(screen.getByLabelText("プロフィール画像を選択"), {
      target: { files: [new File(["gif"], "image.gif", { type: "image/gif" })] }
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("この画像形式は使用できません");
    expect(onProcessingChange).toHaveBeenCalledWith(true);
    expect(onProcessingChange).toHaveBeenCalledWith(false);
  });
});
