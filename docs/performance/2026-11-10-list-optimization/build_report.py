"""Render paired list-query results without rerunning a benchmark.
Requires matplotlib and Noto Sans CJK. --pdf additionally uses playwright and Chromium.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

os.environ.setdefault('MPLCONFIGDIR',str(Path(tempfile.gettempdir())/'fieldwork-matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

root=Path(__file__).resolve().parent
repo=root.parents[2]
font=Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
font_manager.fontManager.addfont(str(font))
plt.rcParams.update({'font.family':font_manager.FontProperties(fname=str(font)).get_name(),'font.size':11,'axes.unicode_minus':False,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False,'svg.fonttype':'path'})
before=json.loads((root/'before.json').read_text());after=json.loads((root/'after.json').read_text())
b={r['name']:r for r in before['results']};a={r['name']:r for r in after['results']}
for k,v in before['environment'].items():
    if k!='generatedAt':assert after['environment'][k]==v,(k,v,after['environment'][k])
keys=['list_20_first_page','list_100_first_page','list_20_last_page','list_20_text_search']
labels=['첫 페이지 20건','첫 페이지 100건','마지막 페이지 20건','문자열 검색 20건']
english=['First page · 20 rows','First page · 100 rows','Last page · 20 rows','Text search · 20 rows']
rows=[]
for k,label,en in zip(keys,labels,english):
    assert b[k]['samples']==a[k]['samples']
    rows.append({'name':k,'label':label,'labelEn':en,'samples':a[k]['samples'],
      'beforeSql':int(b[k]['jdbcExecutionsPerOperation']),'afterSql':int(a[k]['jdbcExecutionsPerOperation']),
      'beforeP50':b[k]['p50Ms'],'afterP50':a[k]['p50Ms'],'beforeP95':b[k]['p95Ms'],'afterP95':a[k]['p95Ms'],
      'p50ReductionPercent':(1-a[k]['p50Ms']/b[k]['p50Ms'])*100,
      'responseBytesEqual':b[k]['responseBytes']==a[k]['responseBytes']})
assert all(r['responseBytesEqual'] for r in rows)
c='list_20_concurrency_10'
result={'tests':json.loads((root/'regression.json').read_text())['tests'],'pullRequestUrl':'',
 'beforeCommit':'30e40ce','afterCommit':'6b1d766','harnessSha256':hashlib.sha256((repo/'backend/src/test/java/com/meter/fieldwork/performance/PerformanceBaselineTest.java').read_bytes()).hexdigest(),
 'beforeMeasuredAt':before['environment']['generatedAt'],'afterMeasuredAt':after['environment']['generatedAt'],
 'comparisons':rows,'concurrent':{'beforeP50':b[c]['p50Ms'],'afterP50':a[c]['p50Ms'],'beforeP95':b[c]['p95Ms'],'afterP95':a[c]['p95Ms'],'samples':100,'concurrency':10}}
(root/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
assets=root/'assets';assets.mkdir(exist_ok=True)
blue,teal='#275bca','#007f78'
def save(fig,name):
    fig.tight_layout();fig.savefig(assets/f'{name}.png',dpi=200,bbox_inches='tight',facecolor='white')
    svg=assets/f'{name}.svg';fig.savefig(svg,bbox_inches='tight',facecolor='white');svg.write_text('\n'.join(s.rstrip() for s in svg.read_text().splitlines())+'\n');plt.close(fig)
fig,ax=plt.subplots(figsize=(10,3.5))
for offset,vals,color,label in [(-.17,[r['beforeSql'] for r in rows[:2]],blue,'개선 전'),(.17,[r['afterSql'] for r in rows[:2]],teal,'개선 후')]:
    ax.barh([offset,1+offset],vals,height=.28,color=color,label=label)
    for i,v in enumerate(vals):ax.text(v+4,i+offset,f'{v}회',va='center')
ax.set_yticks([0,1],labels[:2]);ax.invert_yaxis();ax.set_xlim(0,345);ax.set_xlabel('요청당 JDBC execute 횟수');ax.legend(frameon=False);ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True);save(fig,'query-count')
fig,axs=plt.subplots(1,2,figsize=(11,4.5),sharey=True)
for ax,metric,title in zip(axs,['P50','P95'],['p50 · 중앙값','p95 · 소표본 참고치']):
    for off,prefix,color,label in [(-.17,'before',blue,'개선 전'),(.17,'after',teal,'개선 후')]:
        vals=[r[prefix+metric] for r in rows]
        ax.barh([i+off for i in range(4)],vals,height=.28,color=color,label=label)
        for i,v in enumerate(vals):ax.text(v+1,i+off,f'{v:.1f}',va='center',fontsize=9)
    ax.set_yticks(range(4),labels);ax.set_title(title);ax.set_xlabel('처리 시간 (ms)');ax.set_xlim(0,120);ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True)
axs[0].invert_yaxis();axs[1].legend(frameon=False);save(fig,'latency')
fig,ax=plt.subplots(figsize=(10,3.5));v=result['concurrent']
for off,prefix,color,label in [(-.17,'before',blue,'개선 전'),(.17,'after',teal,'개선 후')]:
    vals=[v[prefix+'P50'],v[prefix+'P95']];ax.barh([off,1+off],vals,height=.28,color=color,label=label)
    for i,val in enumerate(vals):ax.text(val+2,i+off,f'{val:.2f}',va='center')
ax.set_yticks([0,1],['p50','p95']);ax.invert_yaxis();ax.set_xlim(0,max(v['beforeP95'],v['afterP95'])*1.25);ax.set_xlabel('동시성 10 · 총 100회 목록 요청 / 지연(ms)');ax.legend(frameon=False);ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True);save(fig,'concurrency')

def img(name):return f'<img src="data:image/png;base64,{base64.b64encode((assets/f"{name}.png").read_bytes()).decode()}">'
def table():return '<table><tr><th>목록</th><th>SQL 전→후</th><th>p50 전→후(ms)</th><th>p95 전→후(ms)</th></tr>'+''.join(f'<tr><td>{r["label"]}</td><td>{r["beforeSql"]}→{r["afterSql"]}</td><td>{r["beforeP50"]:.2f}→{r["afterP50"]:.2f}</td><td>{r["beforeP95"]:.2f}→{r["afterP95"]:.2f}</td></tr>' for r in rows)+'</table>'
page1=f'''<div class="kicker">01 / RESULT · 2026.11.10</div><h1>목록의 반복 SQL을<br>페이지 단위 조회로 바꾸다</h1><aside>가상 수용가 2만 건 · 개선 전후 실측 · 운영 HTTP 성능과 구분</aside><p>수용가마다 기본정보·사진·검침을 재조회하던 구조를 제거했다. 목록 20건 SQL은 62→4회(93.5% 감소), 100건은 302→4회(98.7% 감소)로 줄었다. Redis·메시지 시스템·DB 스키마 변경 없이 적용했다.</p>{img('query-count')}{table()}<p>위 시간은 같은 환경·데이터·측정 코드로 전후 각 1회 실행한 결과다. 각 조회는 2~3회 예열 후 10~20회 표본을 기록했다. 표본이 작으므로 p95와 시간 개선율은 참고값이다. SQL 횟수 감소를 구조적 개선의 핵심 근거로 삼는다.</p>'''
page2=f'''<div class="kicker">02 / INTERPRETATION</div><h1>모든 조회가 같은 비율로<br>빨라지지는 않았다</h1>{img('latency')}<h2>첫 페이지와 검색의 차이</h2><p>20건 첫 페이지 p50은 {rows[0]['beforeP50']:.2f}→{rows[0]['afterP50']:.2f}ms, 100건은 {rows[1]['beforeP50']:.2f}→{rows[1]['afterP50']:.2f}ms였다. 각각 {rows[0]['p50ReductionPercent']:.1f}%, {rows[1]['p50ReductionPercent']:.1f}% 감소한 단일 전후 관측값이다.</p><p>문자열 검색 p50은 {rows[3]['beforeP50']:.2f}→{rows[3]['afterP50']:.2f}ms로 변화가 작았다. SQL 횟수는 62→4회로 줄었지만 부분 문자열 검색의 전체 스캔 비용은 그대로 남는다. 짧은 표본만으로 작은 시간 차이를 안정적인 성과로 확정하지 않았다.</p><h2>변경하지 않은 경로</h2><p>지도·대시보드·한글도 동일 측정 코드에서 실행됐으나 이번 변경 대상은 목록 조회다. 해당 경로의 시간 차이를 개선 성과로 주장하지 않는다. HWPX의 최초 생성/캐시 재사용 차이도 코드 최적화 전후 비교가 아니다.</p>'''
page3=f'''<div class="kicker">03 / METHOD</div><h1>같은 조건으로 측정하고<br>원시 결과를 보존했다</h1><table><tr><th>항목</th><th>조건</th></tr><tr><td>코드</td><td>전 30e40ce / 후 6b1d766</td></tr><tr><td>환경</td><td>Java21.0.13 / CPU 할당2 / 환경 메모리8GiB</td></tr><tr><td>JVM·DB</td><td>힙768MiB / PostgreSQL17 / 풀10</td></tr><tr><td>데이터</td><td>수용가20,000 / START10,000 / END5,000</td></tr><tr><td>범위</td><td>서비스·컨트롤러 + JSON 직렬화</td></tr><tr><td>제외</td><td>HTTP·인증필터·Cloudflare·브라우저·실제R2</td></tr></table>{img('concurrency')}<p>동시성10으로 목록20건을 총100회 요청했다. p50 {v['beforeP50']:.2f}→{v['afterP50']:.2f}ms, p95 {v['beforeP95']:.2f}→{v['afterP95']:.2f}ms다. 응답을 기다리며 반복한 제한된 실험이며 최대 RPS·사용자 수·운영 SLO를 계산하지 않았다.</p><p>원시 before.json / after.json, 실행 계획, 회귀 집계, 비교 JSON, 그래프 생성 스크립트를 함께 보관했다. 데이터는 모두 가상이며 원본 고객 Excel·주소·사진은 포함하지 않는다.</p>'''
page4=f'''<div class="kicker">04 / VALIDATION & NEXT</div><h1>속도와 함께<br>업무 계약을 지켰다</h1><h2>실패 재현 → 구현 → 검증</h2><ol><li>페이지 크기1·20·100에서 SQL 상한4회 테스트가 기존 구현에서 실패했다.</li><li>전체 건수, 페이지 기본정보, 사진 수 집계, 검침 일괄 조회의 네 단계로 바꿨다.</li><li>관리자/작업자 목록과 상세 값을 비교했다. 금액·정산 상태 비노출, 필터·정렬·페이지 보정·번호 미등록·빈 응답을 확인했다.</li><li>PostgreSQL 회귀 {result['tests']}개가 실패·오류·skip0으로 통과했고 실행 JAR를 빌드했다.</li><li>같은 측정 코드로 개선 후를 측정했다. 환경 메타데이터와 응답 바이트 수가 같은지도 확인했다. 바이트 수만으로 응답 호환성을 판단하지 않고 별도 동등성 테스트를 사용했다.</li></ol><h2>실행 명령</h2><pre>bash backend/gradlew -p backend test bootJar --no-daemon\nbash backend/gradlew -p backend performanceBaseline \\\n  --tests '*PerformanceBaselineTest.baseline' --no-daemon</pre><h2>다음 실험</h2><p>검색의 pg_trgm 후보와 실행 계획, 사진 포함 생성기의 프로파일, ZIP 재사용, 운영 환경의 요청·메모리·GC 관측은 별도 검토한다. 이번 작업에는 Redis/SQS 도입이나 운영 DB/AWS/R2 변경·배포가 없다.</p><h2>Codex 활용과 검토</h2><p>업무 정책과 배포 판단은 사용자가 결정하고, Codex가 구현·실행 검증·계측·리포트 정리를 지원했다. AI가 생성한 설명을 실행 결과와 구분하고 변경은 PR로 검토할 수 있도록 제공한다.</p>'''
style='''@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#16253d;font:10pt/1.65 "Noto Sans CJK KR","Noto Sans CJK JP",sans-serif}.page{width:210mm;height:297mm;padding:16mm 17mm 20mm;position:relative;break-after:page;overflow:hidden}.page:last-child{break-after:auto}.kicker{border-top:3px solid #275bca;padding-top:5mm;font-size:9pt;letter-spacing:1px;color:#007f78;font-weight:700}h1{font-size:25pt;line-height:1.3;margin:5mm 0 6mm;letter-spacing:-.7px}h2{font-size:12pt;color:#275bca;margin:5mm 0 2mm}p{margin:3mm 0}aside{background:#eef6f6;border-left:3px solid #007f78;padding:3mm 4mm;margin:4mm 0;color:#007f78;font-weight:700;font-size:9pt}img{display:block;width:100%;margin:4mm 0}table{border-collapse:collapse;width:100%;font-size:9pt;margin:4mm 0}th,td{padding:2.5mm 2mm;border-bottom:1px solid #dce5f1;text-align:left}th{background:#edf3fc;color:#275bca}ol{padding-left:5mm}li{margin:3mm 0}pre{white-space:pre-wrap;font-size:8.5pt;background:#edf3fc;padding:4mm}footer{position:absolute;left:17mm;right:17mm;bottom:8mm;display:flex;justify-content:space-between;border-top:1px solid #dce5f1;padding-top:2mm;font-size:8pt;color:#64748b}@media screen{body{background:#e9eef5}.page{background:white;margin:6mm auto}}'''
pages=[page1,page2,page3,page4]
html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Field Work Manager · 목록 성능 개선 결과</title><style>'+style+'</style></head><body>'+''.join(f'<section class="page">{p}<footer><span>FIELD WORK MANAGER · PERFORMANCE ITERATION 01</span><span>{i+1:02d} / 04</span></footer></section>' for i,p in enumerate(pages))+'</body></html>'
(root/'report.html').write_text(html)
md='''# 목록 조회 성능 개선 — 2026-11-10

첫 개선 범위는 목록의 행별 SQL 제거다. Redis/SQS·검색/지도 인덱스·문서 생성 최적화는 이번에 적용하지 않았다.

## 구현

기존은 전체 건수 + ID 목록 + 각 수용가의 기본정보·사진·검침(`2+3N`)이었다. 페이지 기본정보와 관련 ID의 사진 수·검침을 일괄 조회해 비어 있지 않은 페이지는 총4회, 빈 페이지는2회다. 상세와 공통 매핑을 사용하며 목록에는 사진 URL/메모를 추가하지 않는다. 필터·정렬·권한·날짜·금액·사용량·특이사항 응답 계약은 유지한다. Flyway 변경은 없다.

## 전후 결과

동일 가상 수용가2만 건, Java21.0.13/PostgreSQL17, CPU할당2개·환경메모리8GiB·JVM힙768MiB·풀10개 조건이다. 전30e40ce / 후6b1d766. 최초 보고서의 오래된 기준 대신 이번 최신 develop에서 개선 전을 다시 측정했다.

| 목록 | 표본 | SQL 전→후 | p50 전→후(ms) | p95 전→후(ms) |
| --- | ---: | ---: | ---: | ---: |
'''
for r in rows:md+=f'| {r["label"]} | {r["samples"]} | {r["beforeSql"]}→{r["afterSql"]} | {r["beforeP50"]:.2f}→{r["afterP50"]:.2f} | {r["beforeP95"]:.2f}→{r["afterP95"]:.2f} |\n'
md+='''
![SQL 횟수](assets/query-count.png)

![목록 지연](assets/latency.png)

'''+f'20건 SQL은93.5%,100건은98.7% 감소했다. 검색 중앙값은 {rows[3]["beforeP50"]:.2f}→{rows[3]["afterP50"]:.2f}ms로 변화가 작아 검색 전체 스캔 비용이 남아 있다. 작은 차이를 안정적인 성과로 확정하지 않았다.\n\n동시성10·100회 목록 요청 p50은{v["beforeP50"]:.2f}→{v["afterP50"]:.2f}ms, p95는{v["beforeP95"]:.2f}→{v["afterP95"]:.2f}ms다.\n\n'+'''![동시 조회](assets/concurrency.png)

## 검증과 제한

- 쿼리 상한 실패3개를 먼저 확인한 뒤 구현했다. 관리자/작업자 목록과 상세의 데이터 동등성, 금액·정산상태 공개 범위, 필터·정렬·마지막 페이지 보정·번호 미등록·빈 목록을 실제 PostgreSQL에서 검증했다.
- 전체 `test bootJar` 79개 통과(실패/오류/skip0). `performanceBaseline --tests '*PerformanceBaselineTest.baseline'` 전후 실행 성공. 측정 코드 해시는 comparison.json에 보관했다.
- 응답 바이트 수와 환경 메타데이터를 비교했고, 별도의 응답 동등성 회귀 테스트도 통과했다.
- 경과 시간은 서비스/컨트롤러 + JSON 직렬화다. HTTP/인증필터/브라우저/Cloudflare/실제R2는 제외했다. 읽기는2~3회 예열 후10~20회 측정한 전후 한 쌍이다. 장시간 부하·신뢰구간·운영 최대RPS·운영SLO는 측정하지 않았다.
- SQL count는 JDBC execute 호출수이며 batch는1회다. SQL횟수 감소와 처리시간의 변동을 구분한다.
- 수정하지 않은 지도/문서/요약의 시간 차이는 해당 기능의 개선 근거로 사용하지 않는다. 사진 포함 문서 생성은 향후 별도 최적화한다.
- 운영 배포·DB/AWS/R2 변경은 하지 않았다. 원시 데이터는 before.json/after.json, 실행 계획은 *-query-plans.json, 회귀 집계는 regression.json이다.

## 재현

Java21과Docker가 필요하다. 성능 테스트는 독립 Testcontainers DB와 가상 데이터만 사용한다.

```bash
bash backend/gradlew -p backend test bootJar --no-daemon
bash backend/gradlew -p backend performanceBaseline --tests '*PerformanceBaselineTest.baseline' --no-daemon
# 보존된 결과로 그래프·보고서 재생성 (matplotlib/Noto Sans CJK; PDF는 playwright/Chromium 추가)
python3 docs/performance/2026-11-10-list-optimization/build_report.py --pdf
```

[공유용 PDF](report.pdf) · [독립 HTML](report.html) · [비교 JSON](comparison.json)
'''
(root/'REPORT.md').write_text(md)
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--pdf',action='store_true');parser.add_argument('--portfolio',type=Path);args=parser.parse_args()
if args.pdf:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page();page.set_content(html,wait_until='load');page.evaluate('document.fonts.ready')
        for i,el in enumerate(page.locator('.page').all(),1):
            assert el.evaluate("el => Math.max(...[...el.children].filter(x=>x.tagName!=='FOOTER').map(x=>x.getBoundingClientRect().bottom)) < el.querySelector('footer').getBoundingClientRect().top-8"),f'Overflow page {i}'
        page.pdf(path=str(root/'report.pdf'),print_background=True,prefer_css_page_size=True);browser.close()
if args.portfolio:
    dest=args.portfolio/'public/fieldwork';dest.mkdir(parents=True,exist_ok=True)
    for f in ['report.pdf','REPORT.md','before.json','after.json','comparison.json']:
        shutil.copyfile(root/f,dest/f)
    for f in assets.glob('*'):shutil.copyfile(f,dest/f.name)
    model=args.portfolio/'src/pages/fieldwork/model';model.mkdir(parents=True,exist_ok=True)
    (model/'performance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
