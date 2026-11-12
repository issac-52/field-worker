"""Build figures/HTML/PDF from recorded synthetic runs, without rerunning workloads.
Requires matplotlib, Noto Sans CJK; --pdf also requires Playwright/Chromium.
"""
import argparse, base64, hashlib, json, os, tempfile
from pathlib import Path
os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "fieldwork-matplotlib"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
root=Path(__file__).resolve().parent
repo=root.parents[2]
font=Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
font_manager.fontManager.addfont(str(font))
plt.rcParams.update({"font.family":font_manager.FontProperties(fname=str(font)).get_name(),"font.size":11,"axes.spines.top":False,"axes.spines.right":False,"axes.unicode_minus":False})
before=json.loads((root/"before.json").read_text());after=json.loads((root/"after.json").read_text());matrix=json.loads((root/"batch-matrix.json").read_text())
for key in before["environment"]:
 if key!="generatedAt": assert before["environment"][key]==after["environment"][key],key
b={r["name"]:r for r in before["results"]};a={r["name"]:r for r in after["results"]}
keys=["hwpx_100_first_generation_3photos","hwpx_100_repeat_cached"]
comparisons=[{"name":k,"beforeSeconds":b[k]["meanMs"]/1000,"afterSeconds":a[k]["meanMs"]/1000,"reductionPercent":100*(1-a[k]["meanMs"]/b[k]["meanMs"])} for k in keys]
(root/"comparison.json").write_text(json.dumps({"baseCommit":"95ed14d","implementationCommit":"86ad189","pairedHarnessSha256":hashlib.sha256((repo/"backend/src/test/java/com/meter/fieldwork/performance/PerformanceBaselineTest.java").read_bytes()).hexdigest(),"comparisons":comparisons},indent=2)+"\n")
assets=root/"assets";assets.mkdir(exist_ok=True)
def save(fig,name):
 fig.tight_layout();fig.savefig(assets/(name+".png"),dpi=170,bbox_inches="tight",facecolor="white");plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(10,3.4))
for ax,r,title in zip(axes,comparisons,["최초 생성 · 사진 3장 × 100건","재요청 · 개별 캐시 재사용 100건"]):
 bars=ax.bar(["개선 전","개선 후"],[r["beforeSeconds"],r["afterSeconds"]],color=["#9aaec8","#007f78"],width=.55)
 ax.set(title=title,ylabel="경과 시간 (초)");ax.set_ylim(0,r["beforeSeconds"]*1.25)
 for bar in bars:ax.text(bar.get_x()+bar.get_width()/2,bar.get_height()+r["beforeSeconds"]*.025,f"{bar.get_height():.2f}s",ha="center")
save(fig,"paired")
rows=matrix["results"]
labels=["50 / 1 / 6","200 / 1 / 6","1000 / 1 / 6","200 / 2 / 0","1000 / 2 / 0"]
fig,axes=plt.subplots(1,2,figsize=(10,3.9))
for ax,phase,title in zip(axes,["first","cached"],["최초 생성 1,000건","캐시 재사용 1,000건"]):
 values=[r["elapsedMs"]/1000 for r in rows if r["phase"]==phase]
 bars=ax.bar(labels,values,color=["#9aaec8"]*3+["#007f78"]*2)
 ax.tick_params(axis="x",rotation=30);ax.set(title=title,ylabel="측정 시간 (초)",xlabel="묶음 건수 / 동시 수 / ZIP 압축 강도")
 ax.set_ylim(0,max(values)*1.22)
 for bar in bars:ax.text(bar.get_x()+bar.get_width()/2,bar.get_height()+max(values)*.025,f"{bar.get_height():.1f}",ha="center",fontsize=9)
save(fig,"batch-matrix")
md="""# HWPX 대량 생성 성능 개선 — 2026-11-12

기본 처리 방식을 **50건 순차 → 200건·동시2건**으로 변경했다. 활성 묶음 사이 대기는 1초에서 100ms로 줄이고 유휴 DB 확인은 최대 초당1회로 유지했다. HWPX 안의 JPEG와 HWPX를 담는 ZIP에 불필요한 재압축을 줄였다. 큰 원본 사진은 축소 디코딩한 뒤 최대1280px로 출력한다.

[공유용 PDF](report.pdf) · [단독 HTML](report.html) · [전후 원시 결과](before.json) / [후](after.json) · [설정 비교 원시 결과](batch-matrix.json) · [실행 검증](regression.json)

## 1. 실제 기존 코드와 개선 코드 비교

기준 develop `95ed14d`, 구현 `86ad189`. 같은 PerformanceBaselineTest를 수정하지 않고 전후 각1회 실행했다. 수용가2만 건, START1만/END5천 건을 가진 임시 PostgreSQL17에서 사진 있는100건을 생성했다. 한 건당 합성 JPEG3장(각1600×1200, 362,834바이트), 총300장이다. CPU할당2개/메모리8GiB/Java21.0.13/힙768MiB/풀10개. 실제 사진·운영 DB·R2는 사용하지 않았다.

| 작업 | 개선 전 | 개선 후 | 경과 시간 감소 |
| --- | ---: | ---: | ---: |
"""
for label,r in zip(["최초 생성100건·사진300장","동일 내용 재요청100건"],comparisons):
 md+=f'| {label} | {r["beforeSeconds"]:.2f}초 | {r["afterSeconds"]:.2f}초 | {r["reductionPercent"]:.1f}% |\n'
md+='''
![같은 사진 포함100건 전후 측정](assets/paired.png)

수치는 요청 생성부터 연속 tick 호출로 READY까지의 서비스 실행 시간이다. 실제 스케줄 대기, HTTP/인증/Cloudflare, 대기열·다운로드는 제외한다. 표본은 작업당1회이므로 통계적 p95/평균 성과로 주장하지 않는다. 원시 JSON의 단일 표본 p50/p95는 단일 실행값일 뿐이다. 렌더 시간은 병렬 작업의 시간 합이라 경과 시간과 직접 비율을 비교하지 않는다. 이 결과는 여러 변경을 함께 적용한 효과이며 각각의 기여도를 분리한 실험은 아니다.

전후 모두 신규 렌더100회/사진 읽기300회/객체 저장105회이며, 재요청은 렌더0회다. 기존 개별 HWPX 재사용을 유지한다. 사진 있는 묶음은 약16MiB에서 분할되어 건수 상한200을 모두 채우지 않을 수 있다.

## 2. 50 / 200 / 1,000건 비교

아래는 **모든 설정에 개선 후 렌더러를 공통 사용한 설정 비교**다. 기존 코드 자체와의 전후 비교가 아니다. 사진 없는 합성1,000건, 별도 임시 PostgreSQL17, 파일 저장소 GET/PUT마다 인위적10ms 지연을 넣었다. 실제 R2 지연 분포·네트워크·대역폭은 재현하지 않는다. 워밍업50건 후 설정별 최초/캐시 재요청을 각1회 실행했다. 설정별 사업명을 달리하여 최초 생성 캐시를 분리했다. 순서가 고정되어 JIT/GC/공유 환경 부하가 영향을 줄 수 있다.

| 건수 / 동시 / ZIP 강도 | 단계 | 실제 측정 | 내부 묶음 수 | 추가 저장량 | 스케줄 대기 모델(측정 아님) |
| --- | --- | ---: | ---: | ---: | ---: |
'''
for r in rows:
 md+=f'| {r["batchSize"]} / {r["parallelism"]} / {r["zipLevel"]} | {"최초" if r["phase"]=="first" else "캐시"} | {r["elapsedMs"]/1000:.2f}초 | {r["ticks"]} | {r["newStoredBytes"]/1048576:.2f}MiB | +{r["modeledSchedulerWaitMs"]/1000:.1f}초 |\n'
md+='''
![묶음 및 동시 처리 설정 비교](assets/batch-matrix.png)

대기 모델은 `(묶음 수−1)×대기`이며, 순차 설정은1초, 동시2건 설정은0.1초를 가정한다. 최초 기동·유휴 확인·큐 대기·정리 비용은 포함하지 않았다. 측정 시간에 이 모델을 섞어 실측 개선률로 표시하지 않는다. 추가 저장량은 해당 요청이 새로 만든 개별 캐시와 ZIP의 합이며 원본 사진 용량은 아니다. 재요청도 요청별 ZIP은 새로 보관한다. ZIP 무압축은 CPU 시간을 줄이는 대신 특히 사진 없는 문서의 저장량이 늘어난다.

## 3. 1,000건을 기본으로 하지 않은 이유

건수를 늘려도 개별 문서의 사진 읽기·변환·저장 횟수는 줄지 않는다. 특히 사진이 있는 문서는 건수 상한보다 약16MiB ZIP 임계값에 먼저 도달한다. 따라서 단순1,000건보다 제한된 동시 처리와 사진/압축 비용 감소를 먼저 적용했다. 기본200건은 완료 상태 저장 주기·재시작 시 다시 묶을 범위·메모리와 처리량 사이의 절충이다. 환경에 따라 최대1,000까지 조정할 수 있다. 이 측정으로 모든 운영 환경에서200이 최적이라고 주장하지 않는다.

## 4. 동작 보존과 운영 설정

- 전체 ZIP 하나 다운로드, 수용가 순서, 최대1280px/EXIF 방향, 기존 양식·사진 슬롯은 유지한다. 원본 사진은 변경하지 않는다.
- 기존 card-2 캐시는 유효하여 버전을 올리지 않았다. DB 스냅샷·사진 키·사업명·양식 버전 기반 해시와 다운로드 직전 변경 검사는 유지한다.
- 동시 실행은 기본2건/최대4건이며 전체1,000건을 동시에 제출하지 않는다. 작업 간 DB advisory lock은 유지한다. 취소/삭제 시 진행 중 작업 완료를 기다린 후 잠금을 해제하여 늦은 업로드와 정리의 경쟁을 막는다.
- 완료 묶음 이후 재개, 만료·공유 캐시 보존, ADMIN/CSRF/소유자 권한은 기존 정책을 유지한다. Redis/SQS 및 새 인프라/마이그레이션은 없다.
- `DOCUMENT_BATCH_SIZE=200`, `DOCUMENT_PARALLELISM=2`, `DOCUMENT_ZIP_COMPRESSION_LEVEL=0`, `DOCUMENT_WORKER_DELAY_MS=100`이 기본이다. 기존 처리량 설정은50/1/6/1000. 새 JAR 배포 시 기본값 적용, 선택 설정 변경 시 서비스 재시작이 필요하다.
- 작은 EC2는 동시1건부터 확인하고 CPU·힙·GC·R2 제한을 관측한다. `HWPX batch` 로그의 생성/캐시 적중/읽기/렌더/업로드/ZIP 시간으로 운영 병목을 분리할 수 있다. WorkerMs는 병렬 시간 합이다.

## 5. 검증과 남은 한계

신규 동작 테스트3개를 기존 구현에서 실패시킨 뒤 최소 구현·리팩터링했다. 최종 `test bootJar`는94개 실패/오류/skip0이며, 별도 performanceBaseline 전후 및1,000건 설정 비교가 통과했다. 51건 초과 기본 처리·동시 실행·취소 후 늦은 쓰기 방지·약16MiB 분할·순서·ZIP/JPEG 형식·큰 이미지 축소 디코딩·유휴 폴링을 검증했다. 기존 hwpxlib 독립 읽기 및 보안/변경/정리 회귀도 포함한다.

실제18,000건 전체 생성, 운영 R2 속도·비용/EC2 메모리, 한글 프로그램 인쇄, 대용량 Cloudflare 다운로드는 이번에 실행하지 않았다. 로컬100건/사진 없는1,000건으로 운영 완료 시간을 선형 환산하지 않는다. 저장량 표는 합성 자료의 결과이며 운영 저장비 추정치가 아니다. 최초 전후1쌍·설정당1회이므로 반복 실험 및 운영 관측이 후속 과제다.

## 재현과 협업 기록

Java21·Docker 사용 가능 환경에서 다음 명령을 각각 실행한다(테스트는 임시 PostgreSQL과 합성 자료만 사용).

```bash
bash backend/gradlew -p backend test bootJar --no-daemon
bash backend/gradlew -p backend performanceBaseline --tests '*PerformanceBaselineTest.baseline' --no-daemon
bash backend/gradlew -p backend performanceBaseline --tests '*DocumentBatchPerformanceTest*' --no-daemon
python docs/performance/2026-11-12-hwpx/build_report.py --pdf
```

각 성능 태스크는 `backend/build/performance/`에 결과를 만든다. 전후 결과는 각 커밋에서 실행 후 before.json/after.json으로 복사하고 설정 비교 결과는 document-batches/results.json에서 batch-matrix.json으로 복사한다. 테스트 실행에는 해당 환경의 JAVA_HOME/DOCKER_HOST/Gradle 캐시 설정이 필요할 수 있다. 보고서 재생성 스크립트는 보관된 JSON을 읽으며 성능 테스트를 다시 실행하지 않는다.

사용자가 성능 개선 목표·업무 정책을 결정했고 Codex가 코드 검토, 실패 테스트, 구현, 합성 계측, 문서 정리를 지원했다. 측정값과 예측을 구분하고 PR로 검토할 수 있게 제공한다.
'''
(root/"REPORT.md").write_text(md)
def img(name):return '<img src="data:image/png;base64,'+base64.b64encode((assets/(name+'.png')).read_bytes()).decode()+'">'
def table(headers,data):return '<table><tr>'+''.join('<th>'+str(h)+'</th>' for h in headers)+'</tr>'+''.join('<tr>'+''.join('<td>'+str(v)+'</td>' for v in row)+'</tr>' for row in data)+'</table>'
pages=[]
pages.append('<div class="kicker">FIELD WORK MANAGER · PERFORMANCE 02 · 2026.11.12</div><h1>HWPX 대량 생성<br>성능 개선</h1><p class="lead">사진 포함100건 최초 생성 '+f'{comparisons[0]["beforeSeconds"]:.2f} → {comparisons[0]["afterSeconds"]:.2f}초'+'</p><p>50건 순차에서 기본200건·동시2건으로 전환하고 JPEG/HWPX 재압축 비용을 줄였다. 원본 사진·업무 규칙·캐시·취소·다운로드 계약은 유지한다.</p>'+img('paired')+table(['작업','전','후','시간 감소'],[[label,f'{r["beforeSeconds"]:.2f}s',f'{r["afterSeconds"]:.2f}s',f'{r["reductionPercent"]:.1f}%'] for label,r in zip(['사진 포함100건','캐시 재요청100건'],comparisons)])+'<aside>로컬 합성 실험의 단일 실행값이다. 운영18,000건 완료 시간이나 p95 성과로 일반화하지 않는다.</aside><h2>같은 기준으로 전후 비교</h2><p>develop95ed14d / 구현86ad189, 변경하지 않은 계측 코드. Java21.0.13, PostgreSQL17, CPU2개, 환경 메모리8GiB, 힙768MiB. 수용가2만/START1만/END5천 중 사진100건×3장(1600×1200)을 생성했다. 실제 R2 대신 로컬 파일 저장소를 사용했다.</p><p>요청 생성부터 연속 tick 호출로 READY까지 측정. 스케줄 대기·HTTP/인증·Cloudflare·다운로드는 제외했다. 신규 렌더100회/캐시 재요청 렌더0회를 확인했다.</p>')
pages.append('<div class="kicker">BATCH SIZE · CONTROLLED STORAGE LATENCY</div><h1>1,000건이면<br>항상 더 빠를까?</h1><p>사진 없는 합성1,000건. GET/PUT마다 인위적10ms 지연. 모든 모드에 개선 후 렌더러를 사용한 설정 비교다. 기존 코드 자체와의 전후 비교가 아니다.</p>'+img('batch-matrix')+table(['건수/동시/ZIP','최초','캐시','묶음'],[[labels[i],f'{rows[i*2]["elapsedMs"]/1000:.2f}s',f'{rows[i*2+1]["elapsedMs"]/1000:.2f}s',rows[i*2]["ticks"]] for i in range(5)])+'<h2>기본200건·동시2건을 선택</h2><p>묶음 수를 늘려도 개별 사진 처리와 저장 횟수는 줄지 않는다. 사진이 큰 문서는 약16MiB에서 먼저 나뉜다. 기본200건은 처리량·완료 저장 주기·재시작 비용의 절충이며 최대1,000까지 설정할 수 있다.</p><aside>차트는 실제 스케줄 대기를 제외한 실측이다. 인위적10ms는 실제 R2가 아니다. 각 설정/단계1회, 고정 순서라 JIT/GC 영향을 배제하지 못한다.</aside><p>ZIP 무압축은 처리 시간을 줄이는 대신 저장량이 늘어난다. 요청마다 ZIP은 새로 만들고 개별 HWPX는 해시가 같으면 재사용한다. 저장량과 대기 모델은 원시 결과/Markdown에 별도로 기록했다.</p>')
pages.append('<div class="kicker">IMPLEMENTATION · VALIDATION · LIMITS</div><h1>기능을 보존하며<br>동시 처리를 제한</h1><h2>핵심 변경</h2><p>동시에 기본2건만 준비하고 순서대로 ZIP에 넣는다. 원본 변경 검사, 작업 간 DB 잠금, 완료 묶음 이후 재개를 유지한다. 취소하면 실행 중 저장/렌더링이 끝난 뒤 잠금을 풀어 삭제와 늦은 쓰기가 겹치지 않게 한다.</p><p>큰 사진은 축소 디코딩 후 최대1280px·EXIF 방향을 반영한다. JPEG를 HWPX 안에서 재압축하지 않고 외부 ZIP 기본 압축 강도를0으로 낮춘다. 원본 사진/양식과 기존 card-2 캐시는 유효하다.</p><h2>선택 환경설정</h2>'+table(['환경변수','기본'],[['DOCUMENT_BATCH_SIZE','200 (1~1000)'],['DOCUMENT_PARALLELISM','2 (1~4)'],['DOCUMENT_ZIP_COMPRESSION_LEVEL','0 (0~9)'],['DOCUMENT_WORKER_DELAY_MS','100ms']])+'<p>새 JAR만 배포해도 기본값 적용. 유휴 DB 확인은 최대 초당1회. 작은 EC2는 동시1건부터 확인한다. 기존 처리량 설정50/1/6/1000으로 복귀 가능하다. 신규 인프라·DB 마이그레이션은 없다.</p><h2>실제로 실행한 검증</h2><p>기존 코드에서 신규 테스트3개 실패 확인 → 구현·리팩터링 → 최종 회귀94개 성공. 51건 초과 처리, 동시 실행/취소/정리, 용량 분할/문서 순서, ZIP/JPEG, 축소 디코딩, 유휴 폴링과 기존 권한/캐시/변경 검사를 검증했다. 별도 전후/설정 성능 테스트도 실행했다.</p><h2>남은 검증</h2><p>운영18,000건/R2·EC2 메모리·한글 인쇄·대용량 다운로드는 미실행이다. Redis/SQS는 도입하지 않았다. HWPX batch 로그의 작업별 생성/캐시/렌더/읽기/업로드/ZIP 시간을 통해 운영 병목을 다음에 확인한다. 병렬 작업 시간 합은 경과 시간보다 클 수 있다.</p><aside>사용자가 목표·정책을 결정하고 Codex가 구현·실행 검증·계측·문서화를 지원했다. 모든 수치는 합성 자료이며 변경은 PR로 검토한다.</aside><p>상세 재현 명령·원시 JSON·그래프·검증 집계는 같은 디렉터리 REPORT.md와 regression.json에 보관한다.</p>')
style='@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font:10pt/1.65 "Noto Sans CJK KR","Noto Sans CJK JP",sans-serif;color:#17304b}.page{width:210mm;height:297mm;padding:16mm 17mm 19mm;position:relative;break-after:page}.page:last-child{break-after:auto}.kicker{font-size:8pt;color:#007f78;border-top:3px solid #007f78;padding-top:4mm;font-weight:bold}h1{font-size:27pt;line-height:1.3;margin:6mm 0}h2{font-size:12pt;color:#007f78;margin:4mm 0 2mm}p{margin:3mm 0}.lead{font-size:15pt;font-weight:bold}img{width:100%;display:block;margin:4mm 0}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{padding:2mm;border-bottom:1px solid #dbe4ec;text-align:left}th{background:#edf3f5}aside{background:#edf6f4;border-left:3px solid #007f78;padding:3mm;margin:4mm 0;font-size:9pt}footer{position:absolute;bottom:8mm;left:17mm;right:17mm;border-top:1px solid #dbe4ec;font-size:8pt;color:#60758b;padding-top:2mm}'
html='<!doctype html><html lang="ko"><meta charset="utf-8"><title>HWPX 대량 생성 성능 개선</title><style>'+style+'</style><body>'+''.join('<section class="page">'+s+f'<footer>FIELD WORK MANAGER · SYNTHETIC MEASUREMENT　 |　 {i+1} / 3</footer></section>' for i,s in enumerate(pages))+'</body></html>'
(root/'report.html').write_text(html)
if argparse.ArgumentParser().parse_known_args()[1]==['--pdf']:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page();page.set_content(html,wait_until='load');page.evaluate('document.fonts.ready');
  for i,el in enumerate(page.locator('.page').all(),1):
   assert el.evaluate("el => Math.max(...[...el.children].filter(x=>x.tagName!=='FOOTER').map(x=>x.getBoundingClientRect().bottom)) < el.querySelector('footer').getBoundingClientRect().top-8"),f'Overflow page {i}'
  page.pdf(path=str(root/'report.pdf'),print_background=True,prefer_css_page_size=True);browser.close()
