import { call } from '../../api/client';
import { Button } from '../ui/button';
import { useState } from 'react';
import { api } from '../../api';
import { useSaveAction } from '../../hooks/useSaveAction';
import type { Site } from '../../types';
import { Modal } from '../Modal';

export function NoteEditor({
  site,
  onClose,
  inline = false,
}: {
  site: Site;
  onClose: () => void;
  inline?: boolean;
}) {
  const [code, setCode] = useState(site.specialCondition?.code ?? 'NONE');
  const [description, setDescription] = useState(site.specialCondition?.description ?? '');
  const [note, setNote] = useState(site.note);
  const { busy, error, save } = useSaveAction();
  const form = (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await save(async () => {
            if (!__MOCKS_ENABLED__)
              await call(`/sites/${site.id}/special-condition`, {
                method: 'PATCH',
                body: JSON.stringify({ code, description }),
              });
            await api.note(site.id, note);
          }, '특이사항을 저장했습니다.')
        )
          onClose();
      }}
    >
      {!__MOCKS_ENABLED__ && (
        <>
          <label className="field">
            특이사항
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              {Object.entries({
                NONE: '해당 없음',
                HOPE: '호폐',
                LOCATION_UNKNOWN: '위치불명',
                STACKED: '적재',
                OTHER: '기타',
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {code === 'OTHER' && (
            <label className="field">
              상세 설명
              <textarea
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      <label className="field">
        현장 특이사항
        <textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="default" className="primary-btn full" disabled={busy} type="submit">
        저장
      </Button>
    </form>
  );
  return inline ? (
    form
  ) : (
    <Modal title="특이사항" onClose={onClose} busy={busy}>
      {form}
    </Modal>
  );
}
