import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Asset, AssetKind } from '@vtt/shared';
import { assetUrl, uploadAsset } from '../lib/api';
import { useGame } from '../lib/store';
import { t } from '../i18n';

export function useAssets(kind: AssetKind): Asset[] {
  const assets = useGame((s) => s.assets);
  return Object.values(assets).filter((a) => a.kind === kind);
}

/** Knopf, der einen Dateiauswahl-Dialog öffnet und hochlädt. */
export function UploadButton({
  accept,
  label,
  onUploaded,
}: {
  accept: string;
  label: string;
  onUploaded?: (asset: Asset) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const adventureId = useGame((s) => s.adventure?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (files: FileList | null) => {
    if (!files || !adventureId) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const asset = await uploadAsset(adventureId, f);
        onUploaded?.(asset);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <span className="upload">
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? t('loading') : label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => void onChange(e.target.files)}
      />
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}

/** Auswahl eines Bildes aus der Bibliothek (oder neu hochladen). */
export function ImagePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const images = useAssets('image');
  return (
    <div className="image-picker">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t('none')}</option>
        {images.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {value && <img src={assetUrl(value, true)} alt="" className="thumb-small" />}
      <UploadButton accept="image/*" label={t('uploadImage')} onUploaded={(a) => onChange(a.id)} />
    </div>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel-section">
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function confirmDelete(name: string): boolean {
  return window.confirm(t('confirmDelete', { name }));
}

export function Modal({
  onClose,
  children,
  title,
}: {
  onClose: () => void;
  children: ReactNode;
  title: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon" aria-label={t('close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
