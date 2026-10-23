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
  const [note, setNote] = useState(site.note);
  const { busy, error, save } = useSaveAction();
  const form = (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (await save(() => api.note(site.id, note), '특이사항을 저장했습니다.')) onClose();
      }}
    >
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
