import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useNotify } from '../../context/NotificationContext';
import type { User } from '../../types';
import { Modal } from '../Modal';

export type InvestigatorAction =
  { mode: 'create' } | { mode: 'edit' | 'password' | 'status'; user: User };

export function InvestigatorEditor({
  action,
  onClose,
}: {
  action: InvestigatorAction;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const notify = useNotify();
  const [name, setName] = useState(action.mode === 'create' ? '' : action.user.name);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title =
    action.mode === 'create'
      ? '조사자 계정 생성'
      : action.mode === 'edit'
        ? '이름 수정'
        : action.mode === 'password'
          ? '비밀번호 재설정'
          : action.user.active
            ? '계정 비활성화'
            : '계정 활성화';
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let message = '';
      switch (action.mode) {
        case 'create':
          await api.createInvestigator({
            name: name.trim(),
            username: username.trim(),
            temporaryPassword: password,
          });
          message = '조사자 계정을 생성했습니다.';
          break;
        case 'edit':
          await api.updateInvestigator(action.user.id, { name: name.trim() });
          message = '이름을 수정했습니다.';
          break;
        case 'password':
          await api.resetInvestigatorPassword(action.user.id, password);
          message = '임시 비밀번호를 재설정했습니다.';
          break;
        case 'status':
          await api.updateInvestigator(action.user.id, {
            active: !action.user.active,
          });
          message = action.user.active ? '계정을 비활성화했습니다.' : '계정을 활성화했습니다.';
          break;
      }
      setPassword('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['investigators'] }),
        client.invalidateQueries({ queryKey: ['users'] }),
      ]);
      notify(message);
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {action.mode === 'create' && (
          <label className="field">
            아이디
            <Input
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_.-]+"
            />
            <small>영문, 숫자, 밑줄, 점, 하이픈 3~32자</small>
          </label>
        )}
        {(action.mode === 'create' || action.mode === 'edit') && (
          <label className="field">
            이름
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={40}
            />
          </label>
        )}
        {action.mode !== 'create' && (
          <p className="form-site">
            {action.user.name} · {action.user.username}
          </p>
        )}
        {(action.mode === 'create' || action.mode === 'password') && (
          <label className="field">
            임시 비밀번호
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={64}
            />
            <small>8~64자</small>
          </label>
        )}
        {action.mode === 'status' && (
          <p className="form-help">
            {action.user.active
              ? '비활성화하면 신규 검침을 등록할 수 없습니다. 기존 기록은 유지됩니다.'
              : '계정을 다시 사용할 수 있도록 활성화합니다.'}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="default" className="primary-btn full" type="submit" disabled={busy}>
          {busy ? '저장 중...' : action.mode === 'edit' ? '저장' : title.replace('조사자 ', '')}
        </Button>
      </form>
    </Modal>
  );
}
