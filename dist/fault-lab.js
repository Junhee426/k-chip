// Bit-accurate behavioral fault injection. No orbital event-rate assumptions.
export const PARITY_POSITIONS = [1, 2, 4, 8, 16, 32, 64];
export const DATA_POSITIONS = Array.from({length:71}, (_,i)=>i+1).filter(p=>!PARITY_POSITIONS.includes(p));
export const PATTERNS = {
  single: '독립 1-bit 오류',
  double: '독립 2-bit 오류',
  triple: '독립 3-bit 오류',
  common: '상관 2-bit 오류'
};
export const ARCHITECTURES = {raw:'보호 없음', ecc:'SECDED (72,64)', tmr:'TMR + 불일치 검출'};
const bitsOK = (a,n)=>Array.isArray(a)&&a.length===n&&a.every(x=>x===0||x===1);
const same = (a,b)=>a.every((x,i)=>x===b[i]);
export function hexToBits(hex) {
  if(typeof hex!=='string'||!/^[0-9a-fA-F]{16}$/.test(hex))throw Error('데이터는 정확히 16자리의 16진수로 입력하세요.');
  const n=BigInt('0x'+hex);
  return Array.from({length:64},(_,i)=>Number((n>>BigInt(i))&1n));
}
export function bitsToHex(bits) {
  if(!bitsOK(bits,64))throw Error('64개의 이진 비트가 필요합니다.');
  return bits.reduce((n,b,i)=>n|(BigInt(b)<<BigInt(i)),0n).toString(16).toUpperCase().padStart(16,'0');
}
export function encode64(data) {
  if(!bitsOK(data,64))throw Error('64비트 데이터가 필요합니다.');
  const code=Array(72).fill(0);
  DATA_POSITIONS.forEach((p,i)=>code[p-1]=data[i]);
  for(const p of PARITY_POSITIONS) {
    let parity=0;
    for(let j=1;j<=71;j++)if(j&p)parity^=code[j-1];
    code[p-1]=parity;
  }
  code[71]=code.slice(0,71).reduce((a,b)=>a^b,0);
  return code;
}
export function decode72(input) {
  if(!bitsOK(input,72))throw Error('72비트 SECDED 코드워드가 필요합니다.');
  const code=[...input];let syndrome=0;
  for(let p=1;p<=71;p++)if(code[p-1])syndrome^=p;
  const odd=code.reduce((a,b)=>a^b,0);
  let flag='clean',correctedPosition=null;
  if(odd) {
    if(syndrome<=71) {
      correctedPosition=syndrome||72;
      code[correctedPosition-1]^=1;
      flag='corrected';
    } else flag='uncorrectable';
  } else if(syndrome)flag='uncorrectable';
  return {code,data:DATA_POSITIONS.map(p=>code[p-1]),flag,syndrome,odd,correctedPosition};
}
export function vote64(replicas) {
  if(!Array.isArray(replicas)||replicas.length!==3||!replicas.every(a=>bitsOK(a,64)))throw Error('64비트 복제본 3개가 필요합니다.');
  const data=replicas[0].map((_,i)=>Number(replicas[0][i]+replicas[1][i]+replicas[2][i]>=2));
  const disagreements=data.map((_,i)=>replicas[0][i]!==replicas[1][i]||replicas[1][i]!==replicas[2][i]);
  return {data,disagreementBits:disagreements.filter(Boolean).length};
}
export function createLab(hex='0123456789ABCDEF') {
  const data=hexToBits(hex);
  return {version:1,hex:hex.toUpperCase(),view:'ecc',raw:[...data],ecc:encode64(data),tmr:[...Array(3)].map(()=>[...data]),seed:426,trials:2000,pattern:'double'};
}
export function validateLab(lab) {
  if(!lab||lab.version!==1)throw Error('지원하지 않는 설계 실험 형식입니다.');
  hexToBits(lab.hex);
  if(!Object.hasOwn(ARCHITECTURES,lab.view)||!Object.hasOwn(PATTERNS,lab.pattern))throw Error('실험 방식 또는 오류 유형을 확인하세요.');
  if(!bitsOK(lab.raw,64)||!bitsOK(lab.ecc,72)||!Array.isArray(lab.tmr)||lab.tmr.length!==3||!lab.tmr.every(a=>bitsOK(a,64)))throw Error('저장된 메모리 비트 형식을 확인하세요.');
  if(!Number.isInteger(lab.seed)||lab.seed<0||lab.seed>4294967295)throw Error('시드는 0~4294967295 정수입니다.');
  if(!Number.isInteger(lab.trials)||lab.trials<1||lab.trials>20000)throw Error('반복 횟수는 1~20,000 정수입니다.');
  return lab;
}
export function resetMemory(lab,hex=lab.hex) {
  const fresh=createLab(hex);
  return {...lab,hex:fresh.hex,raw:fresh.raw,ecc:fresh.ecc,tmr:fresh.tmr};
}
// Split out of inspectLab so runCampaign's per-trial loop can skip validateLab and
// re-deriving `golden` from lab.hex (both invariant across a campaign's trials) and
// pass the already-computed golden bits straight through, up to 20,000 times per run.
function analyzeMemory(lab,golden) {
  const decoded=decode72(lab.ecc),vote=vote64(lab.tmr);
  const rawCorrect=same(golden,lab.raw),eccCorrect=same(golden,decoded.data),tmrCorrect=same(golden,vote.data);
  const mismatch=a=>a.reduce((n,b,i)=>n+Number(b!==golden[i]),0);
  return {
    raw:{data:lab.raw,hex:bitsToHex(lab.raw),mismatch:mismatch(lab.raw),status:rawCorrect?'correct':'silent',flag:'검출회로 없음',physicalBits:64},
    ecc:{...decoded,hex:bitsToHex(decoded.data),mismatch:mismatch(decoded.data),status:decoded.flag==='uncorrectable'?'detected':eccCorrect?'correct':'silent',physicalBits:72},
    tmr:{...vote,hex:bitsToHex(vote.data),mismatch:mismatch(vote.data),status:tmrCorrect?'correct':vote.disagreementBits?'detected':'silent',physicalBits:192}
  };
}
export function inspectLab(lab) {
  validateLab(lab);
  return analyzeMemory(lab,hexToBits(lab.hex));
}
export function flipBit(lab,bank,index,replica=0) {
  validateLab(lab);
  if(!Object.hasOwn(ARCHITECTURES,bank)||!Number.isInteger(index)||index<0||index>=(bank==='ecc'?72:64)||!Number.isInteger(replica)||replica<0||replica>2)throw Error('비트 위치를 확인하세요.');
  const next=structuredClone(lab);
  if(bank==='tmr')next.tmr[replica][index]^=1;else next[bank][index]^=1;
  return next;
}
export function injectPreset(lab,preset) {
  if(!['single','double','common','triple'].includes(preset))throw Error('오류 예시를 확인하세요.');
  const next=resetMemory(lab);
  const n=preset==='single'?1:preset==='triple'?3:2;
  for(let i=0;i<n;i++){next.raw[i]^=1;next.ecc[DATA_POSITIONS[i]-1]^=1;}
  if(preset==='common'||preset==='triple')for(let i=0;i<n;i++)next.tmr[i][0]^=1;
  else for(let i=0;i<n;i++)next.tmr[0][i]^=1;
  return next;
}
export function scrubMemory(lab) {
  const next=structuredClone(lab);
  // Never restore from the golden reference: hardware cannot know it.
  if(lab.view==='ecc') {
    const d=decode72(lab.ecc);
    if(d.flag!=='uncorrectable')next.ecc=d.code;
  } else if(lab.view==='tmr') {
    const {data}=vote64(lab.tmr);
    next.tmr=Array.from({length:3},()=>[...data]);
  }
  return next;
}
export function seededRandom(seed) {
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function positions(n,k,rng) {
  const result=[];while(result.length<k){const p=Math.floor(rng()*n);if(!result.includes(p))result.push(p);}return result;
}
// Copies baseline's already-computed raw/ecc/tmr instead of recreating them via
// resetMemory->createLab (hexToBits + SECDED encode), which runCampaign would
// otherwise repeat on every one of up to 20,000 trials.
function cloneMemory(lab) {
  return {...lab,raw:[...lab.raw],ecc:[...lab.ecc],tmr:lab.tmr.map(replica=>[...replica])};
}
export function runCampaign(lab) {
  validateLab(lab);
  const rng=seededRandom(lab.seed),baseline=createLab(lab.hex),golden=hexToBits(lab.hex);
  const counts=Object.fromEntries(Object.keys(ARCHITECTURES).map(k=>[k,{correct:0,detected:0,silent:0}]));
  const flips=lab.pattern==='single'?1:lab.pattern==='triple'?3:2;
  for(let trial=0;trial<lab.trials;trial++) {
    const memory=cloneMemory(baseline);
    for(const bank of ['raw','ecc','tmr']) {
      if(bank==='tmr'&&lab.pattern==='common') {
        const bit=Math.floor(rng()*64);
        for(const copy of positions(3,2,rng))memory.tmr[copy][bit]^=1;
      } else {
        const n=bank==='ecc'?72:bank==='tmr'?192:64;
        for(const pos of positions(n,flips,rng)) {
          if(bank==='tmr')memory.tmr[Math.floor(pos/64)][pos%64]^=1;else memory[bank][pos]^=1;
        }
      }
    }
    const outcomes=analyzeMemory(memory,golden);
    for(const bank of Object.keys(counts))counts[bank][outcomes[bank].status]++;
  }
  return {model:'bit-fault-campaign-v1',hex:lab.hex,pattern:lab.pattern,seed:lab.seed,trials:lab.trials,counts,scope:'각 시행마다 초기화, 구조별 같은 수의 물리 비트 반전, 궤도 발생률·위성 신뢰도 아님; TMR 투표기·불일치 검출기는 이상적'};
}
