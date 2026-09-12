import { ORBITS } from './data.js';
import {validateLab} from './fault-lab.js';

export const DAYS_PER_YEAR=365.25;
const valid=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function atLeastTwoPoisson(mu){
 if(!valid(mu))throw Error('유효한 사건 강도가 필요합니다.');
 if(mu<1e-4)return mu*mu/2-mu*mu*mu/3+mu**4/8;
 return Math.max(0,1-Math.exp(-mu)*(1+mu));
}
// Rows sharing an orbit and shield thickness must share the same annualTidKrad (enforced by
// validateProject), so distinct (shieldMm, dose) points describe one dose-depth curve per orbit,
// independent of partId. Builds that curve for interpolation when no exact-thickness row exists.
function doseCurve(matches){
 const points=new Map();
 for(const x of matches){
  if(!valid(x.annualTidKrad)||points.has(x.shieldMm))continue;
  points.set(x.shieldMm,x);
 }
 return [...points.values()].sort((a,b)=>a.shieldMm-b.shieldMm);
}
// TID attenuates roughly exponentially with Al-equivalent thickness, so interpolate in log-dose
// space between the nearest thinner/thicker points rather than linearly. Never extrapolates
// beyond the available thickness range: outside it, the nearest single point is used as-is and
// flagged, since guessing a trend past the last measured point is not justified.
function interpolateDose(curve,targetMm){
 if(!curve.length)return null;
 const exact=curve.find(x=>Math.abs(x.shieldMm-targetMm)<1e-8);
 if(exact)return {row:exact,annualTidKrad:exact.annualTidKrad,interpolated:false,nearestOnly:false};
 const below=curve.filter(x=>x.shieldMm<targetMm).at(-1);
 const above=curve.find(x=>x.shieldMm>targetMm);
 if(below&&above){
  const frac=(targetMm-below.shieldMm)/(above.shieldMm-below.shieldMm);
  const logBelow=Math.log(Math.max(below.annualTidKrad,1e-12)),logAbove=Math.log(Math.max(above.annualTidKrad,1e-12));
  return {row:below,annualTidKrad:Math.exp(logBelow+(logAbove-logBelow)*frac),interpolated:true,nearestOnly:false,bracket:[below.shieldMm,above.shieldMm]};
 }
 const nearest=curve.reduce((a,b)=>Math.abs(b.shieldMm-targetMm)<Math.abs(a.shieldMm-targetMm)?b:a);
 return {row:nearest,annualTidKrad:nearest.annualTidKrad,interpolated:false,nearestOnly:true};
}
export function findEnvironment(project,partId,orbitId=project.mission.orbitId){
 const orbit=ORBITS.find(x=>x.id===orbitId);
 const targetMm=project.mission.shieldMm;
 const matches=project.environments.filter(x=>x.orbitId===orbitId&&Math.abs(x.altitudeKm-orbit.altitudeKm)<.01&&Math.abs(x.inclinationDeg-orbit.inclinationDeg)<.01);
 const exactShield=matches.filter(x=>Math.abs(x.shieldMm-targetMm)<1e-8);
 const exact=exactShield.find(x=>x.partId===partId);
 const doseExactRow=exact||exactShield.find(x=>x.partId==='*')||exactShield[0];
 if(doseExactRow)return {dose:doseExactRow,rate:exact||null,doseInterpolated:false,doseNearestOnly:false,doseBracket:null};
 const interp=interpolateDose(doseCurve(matches),targetMm);
 if(!interp)return {dose:null,rate:exact||null,doseInterpolated:false,doseNearestOnly:false,doseBracket:null};
 return {
  dose:{...interp.row,shieldMm:targetMm,annualTidKrad:interp.annualTidKrad},
  rate:exact||null,
  doseInterpolated:interp.interpolated,
  doseNearestOnly:interp.nearestOnly,
  doseBracket:interp.bracket||null,
 };
}
export function softErrorModel(rate,bits,devices,p){
 if(rate===null||rate===undefined)return null;
 const logicalBits=bits*devices,raw=rate*logicalBits,replicas=p.mode==='tmr'?3:1;
 const words=Math.ceil(logicalBits/p.wordBits),cycles=86400/p.scrubSec;
 let uncorrectable=raw;
 if(p.mode==='ecc'){
  const mu=rate*(1-p.mbuFraction)*p.wordBits/cycles;
  uncorrectable=words*cycles*atLeastTwoPoisson(mu)+raw*p.mbuFraction/2;
 }
 if(p.mode==='tmr'){
  const q=-Math.expm1(-rate*(1-p.commonFraction)*p.wordBits/cycles);
  uncorrectable=words*cycles*(3*q*q-2*q*q*q)+raw*p.commonFraction;
 }
 return {rawPerDay:raw,physicalRawPerDay:raw*replicas,uncorrectablePerDay:uncorrectable,replicas};
}
export function evaluate(project,partId=project.selectedPartId,orbitId=project.mission.orbitId){
 const part=project.parts.find(x=>x.id===partId);if(!part)throw Error('부품을 찾을 수 없습니다.');
 const {dose,rate,doseInterpolated,doseNearestOnly,doseBracket}=findEnvironment(project,partId,orbitId),m=project.mission,p=project.protection;
 const missionDose=dose&&valid(dose.annualTidKrad)?dose.annualTidKrad*m.years:null;
 const requiredDose=missionDose===null?null:missionDose*m.doseMargin;
 const tidRatio=requiredDose===null||!valid(part.tidKrad)?null:requiredDose===0?Infinity:part.tidKrad/requiredDose;
 const rawCompatible=rate?.rateKind==='raw';
 const soft=rawCompatible?softErrorModel(rate.seuPerBitDay,part.densityBits,m.devicesPerBoard,p):null;
 const replicas=p.mode==='tmr'?3:1;
 const sefi=valid(rate?.sefiPerDeviceDay)?rate.sefiPerDeviceDay*m.devicesPerBoard*replicas:null;
 const sel=valid(rate?.selPerDeviceDay)?rate.selPerDeviceDay*m.devicesPerBoard*replicas:null;
 const functional=soft?soft.uncorrectablePerDay*p.functionalFraction+(sefi??0):null;
 const recoverable=functional===null?null:functional*p.coverage;
 const downtime=recoverable===null?null:86400*(-Math.expm1(-recoverable*p.recoverySec/86400));
 const unhandled=functional===null?null:functional*(1-p.coverage);
 const synthetic=part.tidBasis==='synthetic'||dose?.basis==='synthetic'||rate?.basis==='synthetic';
 const reasons=[];
 if(!dose)reasons.push('일치하는 궤도·차폐의 환경자료');
 else if(doseNearestOnly)reasons.push('차폐두께가 보유 자료 범위를 벗어나 가장 가까운 두께의 선량을 그대로 사용 (외삽 아님)');
 else if(doseInterpolated)reasons.push(`차폐 ${doseBracket[0]}–${doseBracket[1]} mm 자료 사이의 로그선형 보간 선량 (실측 아님)`);
 if(!valid(part.tidKrad))reasons.push('부품 TID 근거');
 if(!rate||!valid(rate.seuPerBitDay))reasons.push('부품·궤도별 SEU 계산자료');
 else if(!rawCompatible)reasons.push('원시 비트 SEU율 (현재 자료는 보호 후 출력율)');
 if(sefi===null)reasons.push('SEFI 시험·발생률');
 if(sel===null)reasons.push('SEL/파괴성 효과 검토');
 if(!part.lot||part.lot==='미확인')reasons.push('구매 로트 및 시험조건');
 return {part,dose,rate,missionDose,requiredDose,tidRatio,soft,sefi,sel,functional,recoverable,downtime,unhandled,synthetic,reasons,doseInterpolated,doseNearestOnly,doseBracket,cost:costModel(project,part)};
}
export function costModel(project,part,mode=project.protection.mode){
 const {mission:m,cost:c}=project,replicas=mode==='tmr'?3:1;
 const boards=Math.ceil(m.satellites*m.boardsPerSatellite*(1+c.sparesPercent/100));
 const chips=m.devicesPerBoard*replicas;
 const protection=mode==='none'?0:c.protectionPerBoard;
 const bom=valid(part.unitCostKrw)?chips*(part.unitCostKrw+c.screeningPerDevice)+protection+c.shieldPerBoard:null;
 const recurring=bom===null?null:bom*boards;
 return {boards,chips,replicas,bom,recurring,nre:c.qualificationNre+c.engineeringNre,total:recurring===null?null:recurring+c.qualificationNre+c.engineeringNre,powerW:valid(part.powerW)?part.powerW*chips+(mode==='none'?0:c.protectionPowerW):null};
}
export function zeroEventUpperRate(months,devices){
 if(!valid(months)||months<=0||!Number.isInteger(devices)||devices<1)throw Error('양수 관측기간과 소자 수가 필요합니다.');
 return -Math.log(.05)/(months*DAYS_PER_YEAR/12*devices);
}
export function verificationTasks(result,project){
 const r=result;
 return [
 {id:'env',category:'환경',title:'목표 궤도·차폐 환경자료 확정',priority:!r.dose||r.dose.basis==='synthetic'?'높음':'보통',detail:r.dose?.basis==='synthetic'?'현재 합성 환경자료입니다. 태양활동·분석기간·차폐 재질·형상을 명시한 SPENVIS 등의 결과로 교체하세요.':'자료의 궤도, 차폐, 시기 및 단위를 검토하고 원본 해석결과를 연결하세요.'},
 {id:'tid',category:'TID',title:'구매 부품·로트의 누적선량 근거 확보',priority:r.tidRatio===null||r.tidRatio<1?'높음':'보통',detail:r.requiredDose===null?'목표 누적선량 계산자료가 없습니다.':`설계 여유계수를 적용한 요구량 ${r.requiredDose.toFixed(2)} krad(Si). 선량률·바이어스·온도·어닐링·기능 판정기준을 함께 확인하세요.`},
 {id:'seu',category:'SEU',title:'소자별 SEU 반응과 궤도 오류율 연결',priority:r.soft?'보통':'높음',detail:'양성자 에너지별·중이온 LET별 반응자료와 목표 환경을 연결하세요. per bit / per device, 원시율 / EDAC 후 출력율을 확인하세요.'},
 {id:'sel',category:'SEL·SEFI',title:'기능정지·래치업·파괴성 효과 분리 검증',priority:'높음',detail:'복구 가능한 기능정지와 영구 손상을 구분합니다. 최대 전압·온도, 전류 차단과 복구 시간을 시험하세요. 미관측은 면역성 판정이 아닙니다.'},
 {id:'recovery',category:'보호설계',title:'오류정정과 기능 상태 복구 검증',priority:'보통',detail:'단일/다중 비트 오류를 주입해 검출, 복구 성공률, 상태 복원, 처리 지연을 측정하세요. TMR은 투표기·공유 클록과 공통원인을 별도 평가하세요.'},
 {id:'flight',category:'우주검증',title:'Space-MaCS 검증결과의 적용 범위 정의',priority:'높음',detail:'500 km SSO와 목표궤도의 입자 스펙트럼·선량·열조건이 다릅니다. 검증기간 비례 환산만으로 목표 임무를 인증하지 않습니다.'},
 {id:'lot',category:'추적성',title:'부품 버전·로트·자료 출처 고정',priority:r.part.lot==='미확인'?'높음':'보통',detail:'시험품과 양산품의 제조공정·리비전·로트·패키지 및 동작조건의 일치 여부를 확인하고 변경관리를 기록하세요.'}
 ].map(t=>({...t,status:project.taskStatus[t.id]||'계획'}));
}

function number(v,path,min=0,max=1e15,nullable=false){if(nullable&&v===null)return;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${path}: ${min}~${max} 범위의 숫자가 필요합니다.`);}
function str(v,path,max=2000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`${path}: 비어 있지 않은 텍스트가 필요합니다.`);}
export function validateProject(p){
 if(!p||p.schemaVersion!==1)throw Error('schemaVersion 1 프로젝트 파일이 필요합니다.');
 if(p.lab!==undefined)validateLab(p.lab);
 str(p.title,'시나리오 제목',120);
 if(!Array.isArray(p.parts)||p.parts.length<1||p.parts.length>100)throw Error('부품은 1~100개까지 지원합니다.');
 if(!Array.isArray(p.environments)||p.environments.length>3000)throw Error('환경자료는 최대 3,000행입니다.');
 const ids=new Set();
 p.parts.forEach(x=>{str(x.id,'부품 ID',80);if(ids.has(x.id))throw Error('부품 ID가 중복됩니다.');ids.add(x.id);str(x.name,'부품명',120);str(x.vendor,'제조사',120);str(x.grade,'분류',120);str(x.source,'부품 출처');str(x.tidSource,'TID 출처');str(x.notes,'부품 설명');str(x.lot,'로트',200);if(!['synthetic','spec','test','user'].includes(x.tidBasis))throw Error('부품 근거 유형이 잘못되었습니다.');number(x.densityBits,'메모리 비트 수',1,1e13);if(!Number.isInteger(x.densityBits))throw Error('메모리 비트 수는 정수입니다.');number(x.tidKrad,'TID',0,1e7,true);number(x.unitCostKrw,'단가',0,1e12,true);number(x.powerW,'전력',0,1e5,true);});
 if(!ids.has(p.selectedPartId))throw Error('선택 부품 ID를 확인하세요.');
 const m=p.mission;if(!m||!ORBITS.some(o=>o.id===m.orbitId))throw Error('궤도 ID를 확인하세요.');
 number(m.shieldMm,'차폐 두께',.01,100);number(m.years,'임무 수명',.01,50);number(m.doseMargin,'선량 여유계수',1,20);number(m.devicesPerBoard,'장비당 소자 수',1,10000);number(m.satellites,'위성 수',1,100000);number(m.boardsPerSatellite,'위성당 장비 수',1,1000);
 for(const k of ['devicesPerBoard','satellites','boardsPerSatellite'])if(!Number.isInteger(m[k]))throw Error('장비·위성·소자 수는 정수여야 합니다.');
 const q=p.protection;if(!q||!['none','ecc','tmr'].includes(q.mode))throw Error('보호설계 모드를 확인하세요.');
 number(q.wordBits,'워드 길이',8,4096);if(!Number.isInteger(q.wordBits))throw Error('워드 길이는 정수입니다.');number(q.scrubSec,'복구 주기',.01,86400);number(q.recoverySec,'재시작 시간',0,86400);for(const k of ['mbuFraction','commonFraction','functionalFraction','coverage'])number(q[k],k,0,1);
 const c=p.cost;if(!c)throw Error('비용 입력이 필요합니다.');for(const k of ['protectionPerBoard','shieldPerBoard','screeningPerDevice','qualificationNre','engineeringNre','protectionPowerW'])number(c[k],k,0,1e15);number(c.sparesPercent,'예비품 비율',0,200);
 if(!p.flight)throw Error('우주검증 입력이 필요합니다.');number(p.flight.months,'검증 개월',.01,120);number(p.flight.devices,'검증 소자 수',1,100000);if(!Number.isInteger(p.flight.devices))throw Error('관측 소자 수는 정수여야 합니다.');
 if(!p.flight.events||typeof p.flight.events!=='object'||Array.isArray(p.flight.events))throw Error('관측 사건은 사건유형별(SEU/SEL/SEFI)로 분리해 기록합니다.');
 for(const k of ['seu','sel','sefi']){number(p.flight.events[k],`관측 사건(${k})`,0,1e9);if(!Number.isInteger(p.flight.events[k]))throw Error('관측 사건 수는 정수여야 합니다.');}
 if(!p.taskStatus||typeof p.taskStatus!=='object'||Array.isArray(p.taskStatus))throw Error('검증 상태 형식 오류');for(const v of Object.values(p.taskStatus))if(!['계획','진행','완료'].includes(v))throw Error('검증 상태 값 오류');
 const keys=new Set();p.environments.forEach(x=>{if(!ORBITS.some(o=>o.id===x.orbitId))throw Error('환경자료 궤도 ID 오류');if(x.partId!=='*'&&!ids.has(x.partId))throw Error(`환경자료에 없는 부품 ID: ${x.partId}`);number(x.altitudeKm,'고도',100,3000);number(x.inclinationDeg,'경사각',0,180);number(x.shieldMm,'차폐',.01,100);number(x.annualTidKrad,'연간 선량',0,1e7,true);for(const k of ['seuPerBitDay','sefiPerDeviceDay','selPerDeviceDay'])number(x[k],k,0,1e6,true);if(!['synthetic','user','test'].includes(x.basis))throw Error('환경 근거 유형 오류');if(!['raw','effective'].includes(x.rateKind))throw Error('rate_kind는 raw 또는 effective여야 합니다.');for(const k of ['source','model','epoch'])str(x[k],k);const key=[x.orbitId,x.shieldMm,x.partId].join('|');if(keys.has(key))throw Error('같은 궤도·차폐·부품의 자료가 중복됩니다.');keys.add(key);});
 // Shared environmental dose must agree across device-specific rows.
 const doses=new Map();p.environments.forEach(x=>{const k=[x.orbitId,x.shieldMm].join('|');if(x.annualTidKrad!==null){if(doses.has(k)&&Math.abs(doses.get(k)-x.annualTidKrad)>1e-8)throw Error('동일 궤도·차폐의 연간 선량이 부품별로 다릅니다.');doses.set(k,x.annualTidKrad);}});
 return p;
}
export function parseCsv(text){
 if(text.length>2e6)throw Error('CSV는 2 MB 이하로 올려주세요.');
 const rows=[];let row=[],field='',quote=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.trim()))rows.push(row);row=[];field='';}else field+=c;}
 if(quote)throw Error('CSV 따옴표가 닫히지 않았습니다.');row.push(field);if(row.some(s=>s.trim()))rows.push(row);return rows;
}
const columns=['orbit_id','altitude_km','inclination_deg','shield_mm','annual_tid_krad_si','part_id','seu_per_bit_day','sefi_per_device_day','sel_per_device_day','basis','source','model','epoch','rate_kind'];
export const CSV_COLUMNS=columns;
export function importEnvironmentCsv(project,text){
 const [headers,...rows]=parseCsv(text);if(!headers)throw Error('빈 CSV입니다.');for(const c of columns)if(!headers.includes(c))throw Error(`필수 열 없음: ${c}`);
 const toNumber=s=>s.trim()===''?null:Number(s);
 const result=rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`CSV ${i+2}행 열 수가 다릅니다.`);const v=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));return {orbitId:v.orbit_id,altitudeKm:toNumber(v.altitude_km),inclinationDeg:toNumber(v.inclination_deg),shieldMm:toNumber(v.shield_mm),annualTidKrad:toNumber(v.annual_tid_krad_si),partId:v.part_id,seuPerBitDay:toNumber(v.seu_per_bit_day),sefiPerDeviceDay:toNumber(v.sefi_per_device_day),selPerDeviceDay:toNumber(v.sel_per_device_day),basis:v.basis,source:v.source,model:v.model,epoch:v.epoch,rateKind:v.rate_kind,notes:'CSV에서 가져온 자료'};});
 if(!result.length)throw Error('가져올 자료 행이 없습니다.');
 const p=structuredClone(project);p.environments=result;validateProject(p);return p;
}
export function csvCell(v){let s=v===null||v===undefined?'':String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function toCsv(rows){return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
export function environmentCsv(project){return toCsv([columns,...project.environments.map(x=>[x.orbitId,x.altitudeKm,x.inclinationDeg,x.shieldMm,x.annualTidKrad,x.partId,x.seuPerBitDay,x.sefiPerDeviceDay,x.selPerDeviceDay,x.basis,x.source,x.model,x.epoch,x.rateKind])]);}
