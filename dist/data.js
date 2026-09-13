import {createLab} from './fault-lab.js';

// Scenario JSON contract version (see SCENARIO_SCHEMA.md). Bump only alongside
// validateProject() in model.js and the compatibility notes in that document —
// a planned `kleo` orbit-designer integration reads this field to decide whether
// it understands a saved scenario file.
export const SCENARIO_SCHEMA_VERSION = 1;
export const SOURCES = [
 {name:'SPENVIS · 환경·선량 모델',url:'https://www.spenvis.oma.be/models.php',note:'환경 및 차폐별 선량을 외부 계산한 뒤 정규화 표로 가져옵니다.'},
 {name:'SPENVIS · 단일사건오류 계산',url:'https://www.spenvis.oma.be/help/models/longupset.html',note:'부품 반응자료와 환경 스펙트럼이 모두 필요합니다. V1.0은 외부 계산된 부품·환경별 오류율을 사용합니다.'},
 {name:'NASA NEPP · 방사선 시험결과',url:'https://nepp.nasa.gov/radhome/papers/2022-Topper-NSREC-SEE-TID-Compendium-Paper-20220011454.pdf',note:'시험조건과 적용 범위를 함께 확인해야 합니다.'},
 {name:'NASA · FPGA 오류정정과 복구',url:'https://nepp.nasa.gov/files/28706/NEPP-CP-2017-Berg-SEE-MAPLD-FPGA-Presentation-TN42793.pdf',note:'메모리 오류 수정과 기능 상태 복구를 구분합니다.'},
 {name:'Frontgrade · UT8Q512E',url:'https://www.frontgrade.com/product/ut8q512e',note:'4Mb, 100 krad(Si) 제품 사양. 구매 로트 시험자료가 아닙니다.'},
 {name:'Frontgrade · UT8ER512K32',url:'https://www.frontgrade.com/product/ut8er512k32',note:'16Mb, EDAC, 100 krad(Si) 사양표. 본문 표기와 시험조건을 데이터시트로 재확인해야 합니다.'},
 {name:'Texas Instruments · SMV512K32-SP',url:'https://www.ti.com/lit/gpn/SMV512K32-SP',note:'16Mb SRAM. 300 krad(Si) 특성평가 사양이며 구매 등급·로트 조건 확인이 필요합니다.'}
];
export const ORBITS = [
 {id:'sso500',name:'Space-MaCS 검토궤도',altitudeKm:500,inclinationDeg:97.4,label:'500 km · SSO',note:'비교용 SSO 경사각 97.4° 가정. 실제 검증위성 궤도·시기는 확정자료로 교체하세요.'},
 {id:'leo888',name:'K-LEO 후보 A',altitudeKm:888,inclinationDeg:42,label:'888 km · 42°',note:'검토용 후보 궤도'},
 {id:'leo1280',name:'K-LEO 후보 B',altitudeKm:1280,inclinationDeg:42,label:'1,280 km · 42°',note:'검토용 후보 궤도'}
];
const demoSource='교육용 합성 시나리오 · 실제 궤도·부품 예측값 아님';
const partBase={densityBits:16777216,voltage:3.3,lot:'미확인',temperatureC:85,tidBasis:'synthetic',tidSource:demoSource,source:demoSource,notes:'실제 판매 부품이 아닌 계산 흐름 확인용 가상 메모리입니다.',unitCostKrw:80000,powerW:0.4};
export function createProject(){
 const parts=[
  {...partBase,id:'demo-a',name:'예시 A · COTS SRAM',vendor:'가상 부품',grade:'COTS 예시',tidKrad:30},
  {...partBase,id:'demo-b',name:'예시 B · 내방사선 SRAM',vendor:'가상 부품',grade:'내방사선 예시',tidKrad:100,unitCostKrw:600000,powerW:0.55},
  {...partBase,id:'demo-c',name:'예시 C · 고내성 SRAM',vendor:'가상 부품',grade:'고내성 예시',tidKrad:300,unitCostKrw:2400000,powerW:0.7},
  {...partBase,id:'ut8q512e',name:'UT8Q512E',vendor:'Frontgrade',grade:'QCOTS SRAM',densityBits:4194304,tidKrad:100,tidBasis:'spec',tidSource:SOURCES[4].url,source:SOURCES[4].url,unitCostKrw:null,powerW:null,temperatureC:null,notes:'제조사 제품 사양 100 krad(Si). SEL 관련 LET 표기는 시험조건 검토가 필요하며 SEU 곡선으로 사용하지 않습니다.'},
  {...partBase,id:'ut8er512k32',name:'UT8ER512K32',vendor:'Frontgrade',grade:'EDAC SRAM',tidKrad:100,tidBasis:'spec',tidSource:SOURCES[5].url,source:SOURCES[5].url,unitCostKrw:null,powerW:null,temperatureC:null,notes:'제조사 사양표 100 krad(Si). 내장 EDAC 이후의 오류율과 원시 비트 오류율을 혼용하지 마세요. 홈페이지 오류율은 목표궤도 계산에 사용하지 않습니다.'},
  {...partBase,id:'smv512k32',name:'SMV512K32-SP',vendor:'Texas Instruments',grade:'EDAC SRAM',tidKrad:300,tidBasis:'spec',tidSource:SOURCES[6].url,source:SOURCES[6].url,unitCostKrw:null,powerW:null,temperatureC:null,notes:'300 krad(Si)는 특성평가 사양입니다. 내장 EDAC가 있어 외부 오류정정 모델과 중복 계산하지 않도록 원시율/출력율을 확인해야 합니다.'}
 ];
 const rows=[];
 const doses=[[7,4,2.8],[15,8,5.5],[32,18,12]];
 const rates=[[5e-8,3e-8,2.4e-8],[1.1e-7,7e-8,5e-8],[2.4e-7,1.6e-7,1.1e-7]];
 ORBITS.forEach((o,i)=>[1,2,3].forEach((shield,j)=>['demo-a','demo-b','demo-c'].forEach((part,k)=>rows.push({orbitId:o.id,altitudeKm:o.altitudeKm,inclinationDeg:o.inclinationDeg,shieldMm:shield,annualTidKrad:doses[i][j],partId:part,seuPerBitDay:rates[i][j]*[1,.06,.002][k],sefiPerDeviceDay:[.001,.0002,.00002][k]*(i+1),selPerDeviceDay:null,basis:'synthetic',source:demoSource,model:'합성 시나리오',epoch:'태양활동 조건을 가정한 교육용 자료',rateKind:'raw',notes:'표의 고도별 차이와 차폐 효과는 임의의 교육용 수치이며 실제 우주환경 분석 결과가 아닙니다.'}))));
 return {schemaVersion:SCENARIO_SCHEMA_VERSION,lab:createLab(),title:'K-LEO 메모리 적용성 비교',mission:{orbitId:'leo888',shieldMm:2,years:5,doseMargin:2,devicesPerBoard:2,satellites:256,boardsPerSatellite:1},selectedPartId:'demo-a',parts,environments:rows,protection:{mode:'ecc',wordBits:64,scrubSec:60,mbuFraction:.01,commonFraction:.01,functionalFraction:.1,recoverySec:5,coverage:.95},cost:{protectionPerBoard:20000,shieldPerBoard:30000,screeningPerDevice:10000,qualificationNre:30000000,engineeringNre:20000000,sparesPercent:10,protectionPowerW:.15},flight:{months:6,devices:2,events:{seu:0,sel:0,sefi:0}},taskStatus:{}};
}
export const BASIS_LABELS={synthetic:'예시·가정',spec:'제조사 사양',test:'시험자료 입력',user:'사용자 자료'};
