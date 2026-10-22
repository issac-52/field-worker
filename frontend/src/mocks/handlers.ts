import {http,HttpResponse} from 'msw';
import {seedSites,seedRules,users} from './data';
import type {Site,FeeRule,Phase} from '../types';
let sites:Site[]=structuredClone(seedSites);
let feeRules:FeeRule[]=structuredClone(seedRules);
const ok=<T>(data:T)=>HttpResponse.json({success:true,code:'200',message:'요청이 성공적으로 처리되었습니다.',data});
const err=(message:string,status=400)=>HttpResponse.json({success:false,code:String(status),message,data:null},{status});
const feeFor=(phase:Phase,date:string)=>[...feeRules].reverse().find(x=>x.phase===phase&&x.startDate<=date&&x.endDate>=date)?.amount??0;
export const handlers=[
 http.get('/api/me',()=>ok(users[0])),
 http.get('/api/users',()=>ok(users)),
 http.get('/api/sites',()=>ok(sites)),
 http.get('/api/sites/:id',({params})=>{const x=sites.find(s=>s.id===Number(params.id));return x?ok(x):err('수용가를 찾을 수 없습니다.',404)}),
 http.patch('/api/sites/:id/note',async ({params,request})=>{const x=sites.find(s=>s.id===Number(params.id));if(!x)return err('수용가 없음',404);const b=await request.json() as {note:string};x.note=b.note;return ok(x)}),
 http.post('/api/sites/:id/measurements',async ({params,request})=>{const x=sites.find(s=>s.id===Number(params.id));if(!x)return err('수용가 없음',404);const b=await request.json() as {phase:Phase;date:string;reading:number;workerId:number};if(!['START','END'].includes(b.phase)||!b.date||!Number.isFinite(b.reading)||b.reading<0)return err('입력값을 확인하세요');if(x.inspections[b.phase])return err('이미 등록된 단계입니다. 수정은 관리자 기능으로 별도 처리해야 합니다.',409);if(b.phase==='END'&&!x.inspections.START)return err('시작 검침을 먼저 완료하세요');if(b.phase==='END'&&x.inspections.START&&b.date<x.inspections.START.date)return err('종료일은 시작일보다 빠를 수 없습니다');const worker=users.find(u=>u.id===b.workerId);if(!worker)return err('작업자를 찾을 수 없습니다');x.inspections[b.phase]={date:b.date,reading:b.reading,workerId:b.workerId,workerName:worker.name,fee:feeFor(b.phase,b.date),recordedAt:new Date().toISOString()};return ok(x)}),
 http.post('/api/sites/:id/photos',async({params,request})=>{const x=sites.find(s=>s.id===Number(params.id));if(!x)return err('수용가 없음',404);const b=await request.json() as {photos:string[]};if(b.photos.length>4)return err('사진은 최대 4장입니다');x.photos=b.photos;return ok(x)}),
 http.get('/api/fee-rules',()=>ok(feeRules)),
 http.post('/api/fee-rules',async({request})=>{const b=await request.json() as {phase:Phase;startDate:string;endDate:string;amount:number};if(!b.startDate||!b.endDate||b.startDate>b.endDate||!Number.isFinite(b.amount)||b.amount<0)return err('적용 기간 및 금액을 확인하세요');if(feeRules.some(x=>x.phase===b.phase&&x.startDate<=b.endDate&&b.startDate<=x.endDate))return err('같은 단계의 단가 적용 기간이 겹칩니다');const rule:FeeRule={...b,id:Date.now(),createdAt:new Date().toISOString()};feeRules.push(rule);return ok(rule)}),
 http.get('/api/settlements',()=>{const rows=sites.flatMap(s=>(['START','END'] as Phase[]).flatMap(phase=>{const v=s.inspections[phase];return v?[{siteId:s.id,managementNo:s.managementNo,zone:s.zone,phase,workerId:v.workerId,workerName:v.workerName,date:v.date,amount:v.fee,reading:v.reading}]:[]}));return ok(rows)}),
 http.post('/api/admin/fee-adjustments',async({request})=>{const b=await request.json() as {phase:Phase;startDate:string;endDate:string;amount:number};if(!b.startDate||!b.endDate||b.startDate>b.endDate||!Number.isFinite(b.amount)||b.amount<0)return err('변경 기간과 단가를 확인하세요');let count=0;sites=sites.map(s=>{const m=s.inspections[b.phase];if(m&&m.date>=b.startDate&&m.date<=b.endDate){count++;return {...s,inspections:{...s.inspections,[b.phase]:{...m,fee:b.amount}}}}return s});return ok({updatedCount:count,amount:b.amount})}),
];
