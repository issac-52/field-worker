import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useSaveAction } from '../../hooks/useSaveAction';
import type { Site } from '../../types';
import { Modal } from '../Modal';

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
    reader.onabort = () => reject(new Error('사진 불러오기를 취소했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function PhotoEditor({ site, onClose }: { site: Site; onClose: () => void }) {
  const [images, setImages] = useState(site.photos);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const { busy, error, save } = useSaveAction();
  async function addFiles(files: FileList | null) {
    if (!files || reading) return;
    setReading(true);
    setFileError('');
    try {
      const selected = Array.from(files).slice(0, 4 - images.length);
      if (selected.some((file) => !file.type.startsWith('image/') || file.size > 10 * 1024 * 1024))
        throw new Error('사진은 한 장당 10MB 이하로 선택하세요.');
      const loaded = await Promise.all(selected.map(readImage));
      setImages((current) => [...current, ...loaded].slice(0, 4));
    } catch (error) {
      setFileError((error as Error).message);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
      if (cameraInput.current) cameraInput.current.value = '';
    }
  }
  return (
    <Modal title="현장 사진" onClose={onClose} busy={busy || reading}>
      <input
        type="file"
        ref={fileInput}
        hidden
        accept="image/*"
        multiple
        onChange={(event) => void addFiles(event.target.files)}
      />
      <input
        type="file"
        ref={cameraInput}
        hidden
        accept="image/*"
        capture="environment"
        onChange={(event) => void addFiles(event.target.files)}
      />
      <div className="photos-grid modal-photos">
        {[0, 1, 2, 3].map((index) => (
          <div className="photo-slot" key={index}>
            {images[index] ? (
              <>
                <img src={images[index]} alt={`현장 사진 ${index + 1}`} />
                <button
                  className="remove-photo"
                  aria-label={`사진 ${index + 1} 삭제`}
                  disabled={busy || reading}
                  onClick={() =>
                    setImages((current) => current.filter((_, position) => position !== index))
                  }
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : (
              <button
                className="photo-add"
                disabled={busy || reading}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={25} />
                <span>사진 {index + 1}</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="photo-actions">
        <button
          className="outline-btn"
          disabled={images.length >= 4 || busy || reading}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera size={17} />
          촬영
        </button>
        <button
          className="outline-btn"
          disabled={images.length >= 4 || busy || reading}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={17} />
          사진 선택
        </button>
      </div>
      {(fileError || error) && (
        <p className="form-error" role="alert">
          {fileError || error}
        </p>
      )}
      <button
        className="primary-btn full"
        disabled={busy || reading}
        onClick={async () => {
          if (await save(() => api.photos(site.id, images), '사진을 저장했습니다.')) onClose();
        }}
      >
        {reading ? '사진 불러오는 중...' : `사진 ${images.length}장 저장`}
      </button>
    </Modal>
  );
}
