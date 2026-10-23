import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useSaveAction } from '../../hooks/useSaveAction';
import type { PhotoSlot, Site, SitePhoto } from '../../types';
import { PHOTO_LABEL, PHOTO_SLOTS } from '../../types';
import { preparePhoto, photoDataUrl } from '../../lib/photos';
import { Modal } from '../Modal';

type DraftPhoto = SitePhoto & { blob?: Blob };
export function PhotoEditor({ site, onClose }: { site: Site; onClose: () => void }) {
  const [images, setImages] = useState<DraftPhoto[]>(site.photos);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const selectedSlot = useRef<PhotoSlot>('DISTANT');
  const previewUrls = useRef(new Set<string>());
  const mounted = useRef(true);
  const processing = useRef(false);
  const { busy, error, save } = useSaveAction();
  useEffect(() => {
    mounted.current = true;
    const urls = previewUrls.current;
    return () => {
      mounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  function release(url?: string) {
    if (url && previewUrls.current.delete(url)) URL.revokeObjectURL(url);
  }
  async function addFile(file?: File) {
    if (!file || processing.current) return;
    const slot = selectedSlot.current;
    processing.current = true;
    setReading(true);
    setFileError('');
    try {
      const blob = await preparePhoto(file);
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      previewUrls.current.add(url);
      release(images.find((image) => image.slot === slot)?.url);
      setImages((current) => [
        ...current.filter((image) => image.slot !== slot),
        { slot, url, blob },
      ]);
    } catch (reason) {
      if (mounted.current)
        setFileError(reason instanceof Error ? reason.message : '이미지를 불러오지 못했습니다.');
    } finally {
      processing.current = false;
      if (mounted.current) setReading(false);
      if (fileInput.current) fileInput.current.value = '';
      if (cameraInput.current) cameraInput.current.value = '';
    }
  }
  function choose(slot: PhotoSlot, camera: boolean) {
    selectedSlot.current = slot;
    (camera ? cameraInput : fileInput).current?.click();
  }
  return (
    <Modal title="사진·위치도 관리" onClose={onClose} busy={busy || reading}>
      <p className="form-help">
        시연용 이미지입니다. R2 업로드는 하지 않으며 새로고침하면 초기화됩니다. JPG·PNG·WebP, 한
        장당 10MB 이하. 미리보기는 최대 1600px로 축소됩니다.
      </p>
      <input
        type="file"
        ref={fileInput}
        hidden
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void addFile(event.target.files?.[0])}
      />
      <input
        type="file"
        ref={cameraInput}
        hidden
        accept="image/*"
        capture="environment"
        onChange={(event) => void addFile(event.target.files?.[0])}
      />
      <div className="photo-editor-grid">
        {PHOTO_SLOTS.map((slot) => {
          const image = images.find((value) => value.slot === slot);
          return (
            <section className="photo-editor-slot" key={slot}>
              <h3>{PHOTO_LABEL[slot]}</h3>
              <div className="photo-slot">
                {image ? (
                  <img src={image.url} alt={PHOTO_LABEL[slot]} />
                ) : (
                  <span>
                    {slot === 'LOCATION_MAP' ? '지도 이미지 · 촬영 필수 아님' : '선택한 사진 없음'}
                  </span>
                )}
              </div>
              <div className="photo-slot-actions">
                {slot !== 'LOCATION_MAP' && (
                  <button
                    className="outline-btn"
                    aria-label={`${PHOTO_LABEL[slot]} 촬영`}
                    disabled={busy || reading}
                    onClick={() => choose(slot, true)}
                  >
                    <Camera size={16} />
                    촬영
                  </button>
                )}
                <button
                  className="outline-btn"
                  aria-label={`${PHOTO_LABEL[slot]} ${image ? '교체' : '선택'}`}
                  disabled={busy || reading}
                  onClick={() => choose(slot, false)}
                >
                  <ImagePlus size={16} />
                  {image ? '교체' : '선택'}
                </button>
                {image && (
                  <button
                    className="outline-btn"
                    aria-label={`${PHOTO_LABEL[slot]} 삭제`}
                    disabled={busy || reading}
                    onClick={() => {
                      release(image.url);
                      setImages((current) => current.filter((value) => value.slot !== slot));
                    }}
                  >
                    <Trash2 size={16} />
                    삭제
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {(fileError || error) && (
        <p className="form-error" role="alert">
          {fileError || error}
        </p>
      )}
      <button
        className="primary-btn full modal-save"
        disabled={busy || reading}
        onClick={async () => {
          const success = await save(async () => {
            const photos: SitePhoto[] = [];
            for (const image of images)
              photos.push({
                slot: image.slot,
                url: image.blob ? await photoDataUrl(image.blob) : image.url,
              });
            await api.photos(site.id, photos);
          }, '시연 이미지를 저장했습니다. 새로고침하면 초기화됩니다.');
          if (success) onClose();
        }}
      >
        {reading
          ? '이미지 준비 중…'
          : busy
            ? '시연 저장 중…'
            : `이미지 ${images.length}개 시연 저장`}
      </button>
    </Modal>
  );
}
