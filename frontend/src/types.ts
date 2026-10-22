export type Phase = 'START'|'END';
export type Role = 'ADMIN'|'WORKER';
export type Site = {id:number; managementNo:string; zone:string; name:string; address:string; waterNo:string; industry:string; meterNo:string; sealed:boolean; latitude:number; longitude:number; note:string; photos:string[]; inspections:Partial<Record<Phase,{date:string;reading:number;workerId:number;workerName:string;fee:number;recordedAt:string}>>};
export type User = {id:number;name:string;role:Role};
export type FeeRule = {id:number;phase:Phase;startDate:string;endDate:string;amount:number;createdAt:string};
export type ApiResult<T>={success:boolean;code:string;message:string;data:T};
export const PHASE_LABEL:Record<Phase,string>={START:'시작 검침',END:'종료 검침'};
export const statusOf=(site:Site):'DONE'|'IN_PROGRESS'|'TODO'=>site.inspections.END?'DONE':site.inspections.START?'IN_PROGRESS':'TODO';
