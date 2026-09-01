import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  AVATAR_CROP_VIEWPORT,
  createCropSource,
  processCroppedAvatar,
  type AvatarCrop,
  type CropSource,
  type ProcessedImage
} from "../lib/image-processing";
import { BottomSheet } from "./BottomSheet";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const imageErrorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : "";
  if (code === "unsupported-image-type") return "この画像形式は使用できません。JPEG、PNG、WebPを選択してください。";
  if (code === "source-image-too-large") return "画像が大きすぎます。10MB以下の画像を選択してください。";
  if (code === "processed-image-too-large") return "画像を1MB以下にできませんでした。別の画像を選択してください。";
  return "画像を読み込めませんでした。別の画像を選択してください。";
};

type ProfileImagePickerProps = {
  id: string;
  image: ProcessedImage | null;
  label?: string;
  disabled?: boolean;
  onImageChange: (image: ProcessedImage | null) => void | Promise<void>;
  onProcessingChange?: (busy: boolean) => void;
};

export function ProfileImagePicker({
  id,
  image,
  label = "プロフィール画像を選択",
  disabled = false,
  onImageChange,
  onProcessingChange
}: ProfileImagePickerProps) {
  const [source, setSource] = useState<CropSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectionId = useRef(0);
  const previewUrl = useMemo(() => (image ? URL.createObjectURL(image.blob) : ""), [image]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const setProcessing = (next: boolean) => {
    setBusy(next);
    onProcessingChange?.(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    const currentSelection = selectionId.current + 1;
    selectionId.current = currentSelection;
    setError("");
    setProcessing(true);
    try {
      const nextSource = await createCropSource(file);
      if (selectionId.current !== currentSelection) {
        URL.revokeObjectURL(nextSource.url);
        return;
      }
      setSource(nextSource);
    } catch (nextError) {
      if (selectionId.current === currentSelection) setError(imageErrorMessage(nextError));
    } finally {
      if (selectionId.current === currentSelection) setProcessing(false);
    }
  };

  const closeCrop = () => {
    selectionId.current += 1;
    if (source) URL.revokeObjectURL(source.url);
    setSource(null);
    setProcessing(false);
  };

  const confirmCrop = async (crop: AvatarCrop) => {
    if (!source || busy) return;
    setProcessing(true);
    setError("");
    try {
      const result = await processCroppedAvatar(source, crop);
      await onImageChange(result);
      closeCrop();
    } catch (nextError) {
      setError(imageErrorMessage(nextError));
      setProcessing(false);
    }
  };

  return (
    <div className="profile-image-picker-v2" aria-busy={busy}>
      <input
        id={id}
        className="m5-account-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void handleFile(file);
        }}
      />
      <button
        type="button"
        className="m5-secondary-action profile-image-picker-v2__button"
        disabled={disabled || busy}
        onClick={() => document.getElementById(id)?.click()}
      >
        {busy ? "画像を準備しています…" : label}
      </button>
      {image && previewUrl ? (
        <img className="profile-image-picker-v2__preview" src={previewUrl} alt="選択したプロフィール画像のプレビュー" />
      ) : null}
      {error ? <p className="m5-error" role="alert">{error}</p> : null}
      <BottomSheet
        className="bottom-sheet--profile-image-crop"
        open={Boolean(source)}
        title="プロフィール画像を調整"
        onClose={closeCrop}
      >
        {source ? <ProfileImageCropSheet source={source} disabled={busy} onCancel={closeCrop} onConfirm={(crop) => void confirmCrop(crop)} /> : null}
      </BottomSheet>
    </div>
  );
}

function ProfileImageCropSheet({
  source,
  disabled,
  onCancel,
  onConfirm
}: {
  source: CropSource;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: (crop: AvatarCrop) => void;
}) {
  const [crop, setCrop] = useState<AvatarCrop>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const imageScale = Math.max(
    AVATAR_CROP_VIEWPORT / source.width,
    AVATAR_CROP_VIEWPORT / source.height
  ) * crop.zoom;
  const renderedWidth = source.width * imageScale;
  const renderedHeight = source.height * imageScale;
  const maxOffsetX = Math.max(0, (renderedWidth - AVATAR_CROP_VIEWPORT) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - AVATAR_CROP_VIEWPORT) / 2);
  const imageStyle = {
    width: renderedWidth,
    height: renderedHeight,
    transform: `translate(calc(-50% + ${crop.offsetX}px), calc(-50% + ${crop.offsetY}px))`
  };

  const pointerDistance = () => {
    const values = [...pointers.current.values()];
    if (values.length < 2) return null;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, offsetX: crop.offsetX, offsetY: crop.offsetY };
    } else if (pointers.current.size === 2) {
      const distance = pointerDistance();
      if (distance) pinchStart.current = { distance, zoom: crop.zoom };
      dragStart.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinchStart.current) {
      const distance = pointerDistance();
      if (distance) {
        const nextZoom = clamp(pinchStart.current.zoom * distance / pinchStart.current.distance, 1, 3);
        const nextScale = Math.max(AVATAR_CROP_VIEWPORT / source.width, AVATAR_CROP_VIEWPORT / source.height) * nextZoom;
        const nextMaxX = Math.max(0, (source.width * nextScale - AVATAR_CROP_VIEWPORT) / 2);
        const nextMaxY = Math.max(0, (source.height * nextScale - AVATAR_CROP_VIEWPORT) / 2);
        setCrop((current) => ({
          zoom: nextZoom,
          offsetX: clamp(current.offsetX, -nextMaxX, nextMaxX),
          offsetY: clamp(current.offsetY, -nextMaxY, nextMaxY)
        }));
      }
      return;
    }
    if (!dragStart.current) return;
    const nextX = dragStart.current.offsetX + event.clientX - dragStart.current.x;
    const nextY = dragStart.current.offsetY + event.clientY - dragStart.current.y;
    setCrop((current) => ({
      ...current,
      offsetX: clamp(nextX, -maxOffsetX, maxOffsetX),
      offsetY: clamp(nextY, -maxOffsetY, maxOffsetY)
    }));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };

  return (
    <div className="profile-image-crop-sheet">
      <p className="profile-image-crop-sheet__hint">写真を指で移動し、円の中に使いたい範囲を合わせてください。</p>
      <div
        className="profile-image-crop"
        aria-label="プロフィール画像の切り抜き範囲"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img src={source.url} alt="" draggable={false} style={imageStyle} />
        <div className="profile-image-crop__guide" aria-hidden="true" />
      </div>
      <label className="profile-image-crop__zoom">
        <span>拡大・縮小</span>
        <input
          aria-label="プロフィール画像の拡大縮小"
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={crop.zoom}
          disabled={disabled}
          onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value), offsetX: 0, offsetY: 0 }))}
        />
      </label>
      <div className="profile-image-crop__actions">
        <button type="button" className="m5-secondary-action" disabled={disabled} onClick={onCancel}>キャンセル</button>
        <button type="button" className="m5-primary-action" disabled={disabled} onClick={() => onConfirm(crop)}>決定</button>
      </div>
    </div>
  );
}
