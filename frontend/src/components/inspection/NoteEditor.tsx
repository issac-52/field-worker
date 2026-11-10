import { Button } from '../ui/button';
import { useState } from 'react';
import { api } from '../../api';
import { useSaveAction } from '../../hooks/useSaveAction';
import type { Site } from '../../types';
import { Modal } from '../Modal';
import { SPECIAL_CONDITIONS, conditionPayload } from '../../lib/specialCondition';

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
  const { busy, error, save } = useSaveAction();
  const form = (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await save(async () => {
            await api.condition(site.id, conditionPayload(code, description));
          }, '특이사항을 저장했습니다.')
        )
          onClose();
      }}
    >
      <label className="field">
        특이사항
        <select
          value={code}
          disabled={busy}
          onChange={(event) => {
            setCode(event.target.value);
            if (event.target.value !== 'OTHER') setDescription('');
          }}
        >
          {Object.entries(SPECIAL_CONDITIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {code === 'OTHER' && (
        <label className="field">
          기타 내용
          <textarea
            rows={5}
            required
            maxLength={2000}
            disabled={busy}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      )}
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
