# 포트폴리오용 성능 측정 자료

- [공유·인쇄용 PDF](fieldwork-performance-baseline.pdf) — A4 6페이지
- [편집 가능한 Markdown](PORTFOLIO.md) — 프로젝트 개요·측정 방법·분석·후속 비교 기준
- [독립 HTML](fieldwork-performance-baseline.html) — 그래프 포함, 별도 서버 없이 열기 가능
- [후속 개선 기록 양식](IMPROVEMENT_LOG.md)
- [상세 기술 보고서](../../PERFORMANCE_BASELINE_2026-11-10.md)
- [원시 결과](../../performance/2026-11-10/)

`assets/`에는 구조도와 그래프가 PNG(문서 삽입용)·SVG(크기 변경용)로 들어 있다. 운영 화면 캡처나 사용자 사진은 포함하지 않았다. 문서의 현재 상태는 **개선 전 기준선**이며 최초 생성과 캐시 재사용을 코드 개선 전후 성과로 표현하지 않는다.

## 문서 재생성

Java 성능 테스트를 다시 실행하지 않고 보존한 JSON을 읽어 그림과 문서를 재생성한다.

```bash
# Python: matplotlib / 한국어 글꼴: Noto Sans CJK
python3 docs/portfolio/performance-baseline/build_report.py

# 추가 의존성: playwright / /usr/bin/chromium
python3 docs/portfolio/performance-baseline/build_report.py --pdf
```

글꼴/Chromium 설치 위치가 다르면 스크립트의 경로를 조정한다. PDF 생성 시 각 페이지 내용이 바닥글과 겹치지 않는지도 검사한다. 원본 데이터는 `docs/performance/2026-11-10/`에 보존한다. 개선 후에는 새로운 날짜/커밋의 측정 결과를 보관하고 비교 자료를 추가한다.
