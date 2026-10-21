import { useParams } from 'react-router-dom';

export function WorkDetailPage() {
  const { id } = useParams();
  return <section className="panel"><h1>작업 상세</h1><p>대상: {id}</p>
    <p>샘플 요구사항을 받은 다음 상세 입력 폼, 사진 네 장, 임시저장/완료를 구현합니다.</p>
  </section>;
}
