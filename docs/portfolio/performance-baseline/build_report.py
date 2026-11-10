"""Build the portfolio report from the preserved benchmark JSON (does not rerun tests).

Python dependencies: matplotlib; PDF option additionally requires playwright and Chromium.
  python3 docs/portfolio/performance-baseline/build_report.py
  python3 docs/portfolio/performance-baseline/build_report.py --pdf
"""
from pathlib import Path
import argparse
import base64
import html
import json
import os
import tempfile

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "fieldwork-matplotlib"))

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parents[1] / 'performance/2026-11-10'
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)
data = json.loads((SOURCE / 'baseline.json').read_text())
rows = {row['name']: row for row in data['results']}
no_photo = json.loads((SOURCE / 'renderer-without-photos.json').read_text())['results'][0]
FONT = Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
if not FONT.exists():
    raise SystemExit('Install Noto Sans CJK, or update FONT to a Korean-capable font.')
font_manager.fontManager.addfont(str(FONT))
plt.rcParams.update({'font.family': font_manager.FontProperties(fname=str(FONT)).get_name(),
                     'font.size': 11, 'axes.unicode_minus': False,
                     'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.spines.left': False, 'axes.labelcolor': '#516076',
                     'xtick.color': '#516076', 'ytick.color': '#16253d',
                     'figure.facecolor': 'white', 'axes.facecolor': 'white',
                     'svg.fonttype': 'path'})
BLUE, TEAL, INK, LIGHT = '#275bca', '#007f78', '#16253d', '#dce5f1'

def save(fig, stem):
    fig.savefig(ASSETS / f'{stem}.png', dpi=200, bbox_inches='tight', facecolor='white')
    fig.savefig(ASSETS / f'{stem}.svg', bbox_inches='tight', facecolor='white')
    svg = ASSETS / f'{stem}.svg'
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
    plt.close(fig)

# Same unit / same measurement scope: show p50 and p95 side by side.
keys = ['list_20_first_page', 'list_100_first_page', 'list_20_text_search',
        'dashboard_summary', 'map_cluster_20k', 'map_individual_small']
labels = ['목록 20건', '목록 100건', '검색 목록 20건', '대시보드 요약', '지도 2만 건 집계', '지도 좁은 영역']
fig, ax = plt.subplots(figsize=(10.5, 4.7))
y = list(range(len(keys)))
for offset, metric, color, label in [(-.17, 'p50Ms', BLUE, 'p50 · 중앙값'), (.17, 'p95Ms', TEAL, 'p95 · 참고치')]:
    values = [rows[k][metric] for k in keys]
    ax.barh([v+offset for v in y], values, height=.28, color=color, label=label)
    for pos, val in zip(y, values):
        ax.text(val+1, pos+offset, f'{val:.1f}', va='center', fontsize=10, color=INK)
ax.set_yticks(y, labels); ax.invert_yaxis(); ax.set_xlim(0, 118)
ax.set_xlabel('처리 시간 (ms) · 서비스/컨트롤러 + JSON 직렬화')
ax.grid(axis='x', alpha=.18); ax.set_axisbelow(True)
ax.legend(frameon=False, loc='lower right', ncol=2)
fig.tight_layout(); save(fig, '01-read-latency')

fig, ax = plt.subplots(figsize=(10.5, 4.2))
values = [rows[k]['jdbcExecutionsPerOperation'] for k in ['list_20_first_page','list_100_first_page']]
ax.barh(['목록 20건','목록 100건'], values, color=[BLUE, TEAL], height=.47)
for i, v in enumerate(values): ax.text(v+5, i, f'{int(v)}회', va='center', weight='bold', fontsize=17, color=INK)
ax.invert_yaxis(); ax.set_xlim(0,360); ax.set_xlabel('요청 1회당 JDBC execute 호출 수 (회)')
ax.grid(axis='x',alpha=.18); ax.set_axisbelow(True)
fig.tight_layout(); save(fig,'02-list-sql-count')

first=rows['hwpx_100_first_generation_3photos']; cached=rows['hwpx_100_repeat_cached']
fig, axs=plt.subplots(1,2,figsize=(11,4.2),gridspec_kw={'width_ratios':[1.15,1]})
ax=axs[0]; vals=[first['meanMs']/1000,cached['meanMs']/1000]
ax.bar(['최초 생성','캐시 재사용'],vals,color=[BLUE,TEAL],width=.55)
for x,v in enumerate(vals): ax.text(x,v+1,f'{v:.2f}초',ha='center',weight='bold',color=INK,fontsize=15)
ax.set_ylim(0,58);ax.set_ylabel('100건 작업 경과 시간 (초)');ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True)
ax.set_title('동일 100건 · 사진 각 3장',pad=15,fontsize=12)
ax=axs[1]; renderer=first['renderMs']/1000; other=vals[0]-renderer
ax.barh(['최초 작업'],[renderer],color=BLUE,label='생성기 내부')
ax.barh(['최초 작업'],[other],left=[renderer],color=LIGHT,label='생성기 외')
ax.text(renderer/2,0,f'{renderer:.2f}초\n약 {renderer/vals[0]*100:.0f}%',ha='center',va='center',color='white',weight='bold',fontsize=16)
ax.set_xlim(0,55);ax.set_xlabel('경과 시간 (초)');ax.grid(axis='x',alpha=.18);ax.set_axisbelow(True)
ax.set_title('최초 작업에서 생성기 시간 비중',pad=15,fontsize=12)
ax.legend(frameon=False,loc='lower center',bbox_to_anchor=(.5,-.36),ncol=2)
fig.tight_layout();save(fig,'03-hwpx-generation')

# Architecture is a code-derived schematic, not a production screenshot.
fig,ax=plt.subplots(figsize=(11,3.4));ax.set_xlim(0,11);ax.set_ylim(0,3.4);ax.axis('off')
def box(x,y,w,h,title,sub,color=BLUE):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=.09,rounding_size=.12',facecolor='#f2f6fc',edgecolor=LIGHT))
    ax.text(x+w/2,y+h*.65,title,ha='center',va='center',weight='bold',color=color,fontsize=12)
    ax.text(x+w/2,y+h*.29,sub,ha='center',va='center',color=INK,fontsize=9)
def arrow(x,y,xx,yy): ax.annotate('',xy=(xx,yy),xytext=(x,y),arrowprops={'arrowstyle':'->','color':'#7f90a8','lw':1.6})
box(.15,1.65,2.3,1.2,'React · Vite','현장 입력 / 관리자 화면')
box(3.05,1.65,2.3,1.2,'Cloudflare Workers','정적 자산 / API 프록시')
box(6,1.65,2.3,1.2,'Spring Boot · EC2','인증 / 검침 / 문서 작업')
box(8.95,1.65,1.8,1.2,'PostgreSQL 17','업무 데이터',TEAL)
box(6,.1,2.3,1.05,'Cloudflare R2','사진 / HWPX / ZIP',TEAL)
box(8.95,.1,1.8,1.05,'NAVER API','지도 / 지오코딩',TEAL)
arrow(2.5,2.25,2.95,2.25);arrow(5.4,2.25,5.9,2.25);arrow(8.4,2.25,8.85,2.25)
arrow(7.15,1.6,7.15,1.25);arrow(8.3,1.7,9,.95)
fig.tight_layout();save(fig,'00-architecture')

# Shared content blocks produce both an editable Markdown and a print HTML.
sections=[]
def para(text): return ('<p>'+html.escape(text)+'</p>',text+'\n')
def heading(text):return ('<h3>'+html.escape(text)+'</h3>','### '+text+'\n')
def bullets(items):return ('<ul>'+''.join('<li>'+html.escape(s)+'</li>' for s in items)+'</ul>','\n'.join('- '+s for s in items)+'\n')
def table(headers, items):
    esc=lambda s:html.escape(str(s))
    h='<table><thead><tr>'+''.join('<th>'+esc(x)+'</th>' for x in headers)+'</tr></thead><tbody>'
    h+=''.join('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in row)+'</tr>' for row in items)+'</tbody></table>'
    m='| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'
    m+=''.join('| '+' | '.join(str(x) for x in row)+' |\n' for row in items)
    return h,m
def image(stem, caption):
    raw=base64.b64encode((ASSETS/f'{stem}.png').read_bytes()).decode()
    return (f'<figure><img src="data:image/png;base64,{raw}" alt="{html.escape(caption)}"><figcaption>{html.escape(caption)}</figcaption></figure>',f'![{caption}](assets/{stem}.png)\n\n{caption}\n')
def callout(title,text):
    return ('<aside><b>'+html.escape(title)+'</b><p>'+html.escape(text)+'</p></aside>','> **'+title+'**\n> '+text+'\n')
def section(kicker,title,blocks):sections.append((kicker,title,blocks))

section('01 / PROJECT OVERVIEW','수도 검침 업무의 디지털화와 성능 기준 수립',[
    para('Field Work Manager · 약 2만 수용가의 현장 검침·사진·지도·정산·문서 출력을 연결하는 업무 시스템'),
    callout('이번 기록의 범위 — 개선 전 기준선', '2026년 11월 10일, 가상 수용가 20,000건으로 실제 코드를 실행해 조회와 문서 생성 비용을 측정했다. 성능 개선은 아직 적용하지 않았으며, 이후 개선 결과를 비교할 기준을 보존했다.'),
    heading('업무와 기술 구성'),
    para('관리자가 Excel로 대상 수용가를 등록하고 주소를 좌표로 변환한다. 조사자는 지도·목록에서 현장을 찾아 START/END 검침, 사진, 특이사항을 기록한다. 관리자는 이력·실적·정산을 확인하고 수용가별 HWPX와 ZIP을 내려받는다. 예상 사용자는 약 20명이다.'),
    image('00-architecture','그림 1. 현재 코드와 배포 구성을 요약한 구조도. 실제 운영 화면 캡처가 아니다.'),
    table(['구분','구성'],[
        ['프론트엔드','React / TypeScript / Vite / Cloudflare Workers'],
        ['백엔드·DB','Java 21 / Spring Boot / PostgreSQL 17 / Flyway'],
        ['파일·외부 연동','비공개 R2 / NAVER 지도·지오코딩 / HWPX'],
        ['배포·검증','GitHub Actions → AWS EC2 / JUnit 5 + Testcontainers'],
    ]),
    heading('측정 질문'),
    para('사용자가 체감하는 대량 문서 생성 지연과 조회 비용을 설명할 수 있는가? Redis나 메시지 시스템 도입 전에, 현재 구조에서 실제로 비용이 발생하는 위치를 확인하고자 했다.'),
])
section('02 / MEASUREMENT DESIGN','운영 데이터 없이 재현 가능한 측정',[
    table(['항목','조건'],[
        ['대상 코드','develop · 4768ab313d2e814baf20f200263071db2441db97'],
        ['실행 환경','Java 21.0.13 / CPU 할당 2개 / 환경 메모리 한도 8GiB'],
        ['JVM·DB','힙 최대 768MiB / PostgreSQL 17-alpine / Hikari 풀 10개'],
        ['가상 데이터','수용가 20,000 / START 10,000 / END 5,000'],
        ['사진 시나리오','100개 현장 × 3장 / JPEG 1600×1200 / 장당 362,834바이트'],
        ['파일 저장소','로컬 파일 / 추가 지연 0 / 실제 R2 호출 없음'],
    ]),
    heading('측정 절차'),
    bullets(['독립 Testcontainers PostgreSQL에 기존 Flyway를 적용하고 가상 데이터를 생성했다.',
             '목록·요약은 읽기 트랜잭션으로 실행하고, 지도 컨트롤러와 JSON 직렬화까지 계측했다.',
             '조회별 2~3회 예열 후 10~20회 측정했다. JDBC execute 횟수와 경과 시간을 기록했다.',
             '문서 100건의 최초 생성과 동일 조건 재요청을 각각 1회 측정했다. 사진 없는 생성기는 별도로 100회 측정했다.',
             '일반 회귀 테스트 64개가 실패·오류 없이 통과했다. 측정 후 임시 DB와 생성 파일을 정리했다.']),
    callout('운영 응답시간 또는 최대 처리량을 의미하지 않는다', 'HTTP·인증 필터·Cloudflare·브라우저·실제 R2/NAVER를 제외한 개발 환경 실험이다. 짧은 표본의 p95는 참고치이며, 운영 SLO나 최대 RPS로 사용하지 않는다. CPU 사용률·최대 RSS·GC 프로파일도 이번에는 수집하지 않았다.'),
    heading('재현 가능한 증거'),
    para('측정 코드, 원시 JSON, 실행 계획을 함께 보관했다. 다음 개선에서는 같은 데이터·예열·반복 횟수·환경으로 비교한다. 결과가 달라지면 측정 조건 변경과 코드 변경을 구분해 기록한다.'),
])
section('03 / READ PATH','목록의 행별 추가 조회를 확인하다',[
    image('01-read-latency','그림 2. 조회별 처리 시간. 10~20회 표본의 p50/p95이며 운영 HTTP 지연은 제외했다.'),
    table(['시나리오','표본','p50 / p95','SQL/요청'],[
        [label,rows[k]['samples'],f"{rows[k]['p50Ms']:.2f} / {rows[k]['p95Ms']:.2f} ms",int(rows[k]['jdbcExecutionsPerOperation'])]
        for label,k in zip(labels,keys)
    ]),
    heading('조회 시간이 짧아도 쿼리 증가 구조는 남아 있다'),
    para('목록 20건에서 62회, 100건에서 302회의 JDBC 실행이 관측됐다. 코드를 확인하면 전체 건수와 ID 목록 조회 이후 각 현장의 기본정보·사진·검침을 다시 조회한다. 측정한 목록 경로에서 SQL 수는 2 + 3 × 반환 건수로 증가한다.'),
    para('동시성 10으로 목록 20건을 총 100회 호출했을 때 요청 p50은 100.67ms, p95는 195.96ms였다. 단일 요청보다 지연이 커졌지만, 이 제한된 실험만으로 운영에서 수용 가능한 사용자 수를 판단하지 않는다.'),
])
section('04 / QUERY EVIDENCE','캐시 도입에 앞서 조회 구조를 점검하다',[
    image('02-list-sql-count','그림 3. 목록 반환 건수가 5배 증가하면 JDBC 실행 수는 62회에서 302회로 증가한다.'),
    table(['실행 계획 대상','관측','단회 실행 시간'],[
        ['목록 첫 20개 ID','관리번호 인덱스 Index Only Scan','0.033ms'],
        ['네 열 부분 문자열 검색 count','Seq Scan / 20,000행 검사','24.593ms'],
        ['전체 영역 지도 집계','Seq Scan / 20,000행 처리','22.144ms'],
        ['좁은 영역 지도 ID','Seq Scan + 정렬 / 일치 25행','3.422ms'],
    ]),
    para('실행 계획 시간은 단회 EXPLAIN ANALYZE 값이며 서비스 p50/p95와 다른 측정이다. 좁은 영역 지도 계획은 검침 상태 하위 쿼리를 제외한 좌표·정렬 부분만 측정했다. 좌표는 규칙적으로 분포한 합성 데이터다.'),
    heading('현재 근거로 세운 개선 가설 — 아직 미적용'),
    bullets(['목록 전용 projection 또는 관련 정보 일괄 조회로 행별 추가 SQL을 줄이면 DB 왕복과 동시 조회 비용을 낮출 수 있다.',
             '부분 문자열 검색은 pg_trgm, 좌표 조회는 적절한 좌표·공간 인덱스를 후보로 검증할 수 있다. 전체 스캔이라는 이유만으로 인덱스가 항상 유리한 것은 아니다.',
             '지도 캐시는 화면 좌표 그대로보다 재사용 가능한 타일·격자 키를 먼저 검토한다. 캐시 무효화와 오래된 상태의 노출도 함께 설계해야 한다.']),
])
section('05 / DOCUMENT PIPELINE','사진 처리와 캐시 재사용을 분리해서 측정하다',[
    image('03-hwpx-generation','그림 4. 동일 문서 100건 최초 생성과 기존 HWPX 캐시 재사용 비교. 각각 1회 측정이며 개선 전후 비교가 아니다.'),
    table(['측정 항목','최초 생성','동일 조건 재요청'],[
        ['100건 전체 경과','48.47초','2.03초'],
        ['생성기 호출 / 합산 시간','100회 / 45.61초','0회 / 0초'],
        ['저장소 GET / PUT','300 / 105회','100 / 5회'],
        ['JDBC execute','800회','600회'],
    ]),
    para('최초 작업 시간의 약 94%가 생성기 내부에서 관측됐다. 이 시간은 이미지 처리, 문서 XML 구성, 압축 등을 포함한다. 이미지 축소만이 원인이라고 확정하지 않았다. 로컬 파일 I/O와 실제 R2 지연은 다르다.'),
    para('재요청에서 생성기 호출이 0회인 것으로 기존 문서 캐시의 재사용을 확인했다. 캐시 키는 문서 생성기 버전·제목·데이터 스냅샷의 해시를 사용한다. 재요청에도 캐시 파일 읽기와 ZIP 생성, DB 작업은 발생했다.'),
    callout('사진 없는 문서는 별도 실험', f"사진 없는 생성기만 5회 예열 후 100회 측정했을 때 건당 p50 {no_photo['p50Ms']:.2f}ms, p95 {no_photo['p95Ms']:.2f}ms였다. DB·저장소·ZIP이 제외된 값이므로 위 100건 작업과 직접 비교하거나 19,000건 완료 시간으로 환산하지 않는다."),
    para('문서 작업은 tick을 연속 호출했다. 실제 1초 스케줄러 대기, 기존 작업 대기열, 최종 다운로드 전송은 제외했다. 100건 작업 각각의 단일 관측값을 p95나 안정적인 평균으로 표현하지 않는다.'),
])
section('06 / NEXT EXPERIMENT','개선 전후를 같은 기준으로 남기는 방법',[
    table(['우선순위','후속 실험','검증할 지표'],[
        ['1 · 목록','상세 재조회 → 목록 전용/일괄 조회','SQL/요청, p50/p95, 동시 조회 지연'],
        ['2 · 문서','생성기 프로파일링·중복 작업/ZIP 재사용','전체 시간, 생성기 시간, GET/PUT, 최대 메모리'],
        ['3 · 검색·지도','인덱스 후보 비교와 실행 계획 확인','읽은 행/버퍼, 조회 시간, 쓰기 비용'],
        ['4 · 인프라','필요가 확인되면 Redis·작업 워커 분리','캐시 적중률, 무효화, 큐 지연·복구'],
    ]),
    para('메시지 시스템은 재시도·작업 지속성·자원 분리에 도움이 될 수 있으나 생성기 연산을 자체적으로 빠르게 하지는 않는다. 현재 측정만으로 Redis나 SQS를 필수로 결정하지 않았다.'),
    heading('후속 개선 비교표'),
    table(['지표','현재 기준','개선 후'],[
        ['목록 20건 · SQL/요청','62회','미측정'],
        ['목록 20건 · p50/p95','24.20 / 42.74ms','미측정'],
        ['목록 100건 · SQL/요청','302회','미측정'],
        ['사진 포함 최초 100건','48.47초 · 1회 관측','미측정'],
        ['동일 조건 재요청 100건','2.03초 · 1회 관측','미측정'],
    ]),
    heading('포트폴리오에 사용할 수 있는 요약'),
    para('약 2만 수용가를 관리하는 현장 검침 시스템에서 가상 데이터와 독립 PostgreSQL을 사용한 성능 기준을 수립했다. 응답시간뿐 아니라 JDBC 실행 수와 문서 생성·저장소 비용을 분리해 측정했다. 목록의 행별 추가 조회와 사진 포함 문서 생성기의 비용을 확인하고, 캐시 재사용 효과와 미측정 운영 조건을 구분해 후속 개선의 우선순위를 정했다.'),
    heading('증거와 후속 기록'),
    para('상세 측정 보고서: docs/PERFORMANCE_BASELINE_2026-11-10.md · 원시 결과: docs/performance/2026-11-10/ · 측정 코드: backend/src/test/java/com/meter/fieldwork/performance/PerformanceBaselineTest.java'),
    para('후속 기록은 IMPROVEMENT_LOG.md를 사용한다. 개선 커밋, 동일 조건 여부, 실행 명령, 원시 결과, 회귀 테스트, 전후 그래프를 함께 남기고 현재 기준 파일은 보존한다. 운영 R2·HTTP 전체 경로·19,000건 생성·장시간 부하는 아직 측정하지 않았다.'),
])

style='''
@page {size:A4; margin:0;} *{box-sizing:border-box;} body{margin:0;color:#16253d;background:#e9eef5;font-family:"Noto Sans CJK KR","Noto Sans CJK JP",sans-serif;font-size:10pt;line-height:1.62;}
.page{width:210mm;height:297mm;padding:15mm 17mm 17mm;background:white;position:relative;break-after:page;overflow:hidden;}
.page:last-child{break-after:auto;} .kicker{color:#007f78;font-size:9pt;font-weight:700;letter-spacing:1.4px;border-top:3px solid #275bca;padding-top:5mm;}
h1{font-size:22pt;line-height:1.32;letter-spacing:-.6px;margin:4mm 0 6mm;max-width:168mm;} h3{font-size:11pt;margin:4mm 0 1.8mm;color:#275bca;}
p{margin:2.3mm 0;} ul{margin:2mm 0;padding-left:5mm;} li{margin:1.7mm 0;} table{border-collapse:collapse;width:100%;font-size:9pt;margin:4mm 0;table-layout:auto;}
th{background:#edf3fc;text-align:left;color:#275bca;font-weight:700;} th,td{padding:2.1mm 2.5mm;border-bottom:1px solid #dce5f1;vertical-align:top;overflow-wrap:anywhere;}
figure{margin:4mm 0;} figure img{width:100%;display:block;} figcaption{color:#52627a;font-size:8pt;margin-top:1.5mm;line-height:1.45;} aside{background:#eef6f6;border-left:3px solid #007f78;padding:3mm 4mm;margin:4mm 0;} aside b{color:#007f78;} aside p{font-size:9pt;line-height:1.55;}
footer{position:absolute;bottom:8mm;left:17mm;right:17mm;border-top:1px solid #dce5f1;padding-top:2mm;font-size:8pt;color:#64748b;display:flex;justify-content:space-between;}
@media screen{.page{margin:8mm auto;box-shadow:0 4px 20px #16253d16;}} @media print{body{background:white;} .page{margin:0;box-shadow:none;}}
'''
html_pages=[];md=['# Field Work Manager — 프로젝트 개요와 성능 기준 측정\n',
                 '측정일: 2026-11-10 · 상태: 개선 전 기준선 · 모든 데이터는 가상 데이터\n']
for i,(kicker,title,blocks) in enumerate(sections,1):
    html_pages.append('<section class="page"><div class="kicker">'+kicker+'</div><h1>'+title+'</h1>'+''.join(b[0] for b in blocks)+f'<footer><span>FIELD WORK MANAGER · BASELINE 2026.11.10</span><span>{i:02d} / {len(sections):02d}</span></footer></section>')
    md+=['## '+kicker+' — '+title+'\n']+[b[1] for b in blocks]
(ROOT/'PORTFOLIO.md').write_text('\n'.join(md).rstrip()+'\n')
(ROOT/'fieldwork-performance-baseline.html').write_text('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Field Work Manager | 성능 기준 측정</title><style>'+style+'</style></head><body>'+''.join(html_pages)+'</body></html>')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pdf', action='store_true')
args = parser.parse_args()
if args.pdf:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1000,'height':1200})
        page.set_content((ROOT/'fieldwork-performance-baseline.html').read_text(), wait_until='load')
        page.evaluate('document.fonts.ready')
        # Check that content stays above each page footer, not merely inside overflow:hidden.
        for n, section_el in enumerate(page.locator('.page').all(),1):
            fit=section_el.evaluate('''el => {const f=el.querySelector('footer').getBoundingClientRect(); const cs=[...el.children].filter(x=>x.tagName!=='FOOTER'); return Math.max(...cs.map(x=>x.getBoundingClientRect().bottom)) < f.top-8;}''')
            if not fit: raise RuntimeError(f'Page {n} content overlaps footer; adjust layout')
        page.pdf(path=str(ROOT/'fieldwork-performance-baseline.pdf'),print_background=True,prefer_css_page_size=True)
        page.locator('.page').first.screenshot(path=str(ASSETS/'report-preview.png'))
        browser.close()
print('Generated charts, PORTFOLIO.md and standalone HTML'+(' / PDF' if args.pdf else ''))
