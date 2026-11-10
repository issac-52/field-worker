import { useState } from 'react';
import { api } from '../api';
import { useSaveAction } from '../hooks/useSaveAction';
import { Modal } from './Modal';
import { Button } from './ui/button';

export function ConsumerNumberEditor({ siteId, onClose }: { siteId: number; onClose: () => void }) {
  const [number, setNumber] = useState('');
  const { busy, error, save } = useSaveAction();
  return (
    <Modal title="수용가번호 등록" onClose={onClose} busy={busy}>
      <p>기존 사진·검침을 유지하며 이 수용가에 번호를 등록합니다.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await save(async () => {
              if (!number.trim()) throw new Error('수용가번호를 입력하세요.');
              await api.registerConsumerNumber(siteId, number.trim());
            }, '수용가번호를 등록했습니다.')
          )
            onClose();
        }}
      >
        <label className="field">
          수용가번호
          <input
            value={number}
            required
            maxLength={100}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setNumber(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <Button type="submit" className="primary-btn full" disabled={busy}>
          등록
        </Button>
      </form>
    </Modal>
  );
}
