import { ChevronLeft } from "lucide-react";

export function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="m5-settings-header">
      <button type="button" className="m5-settings-back" aria-label="戻る" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
        <span>戻る</span>
      </button>
      <h1>{title}</h1>
    </header>
  );
}
