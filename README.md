# K-LEO CHIP V1.1.0

**Render 배포:** [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md)의 순서대로 GitHub에 올린 뒤
Render에서 **New → Blueprint**로 연결하세요. `render.yaml`이 Static Site 설정을 제공합니다.
수동 설정은 Build Command=`npm test && npm run build`, Publish Directory=`build`입니다.
Node.js 22 이상으로 빌드하며 외부 패키지 설치와 API 키가 필요하지 않습니다.
최신 소스 ZIP·오프라인 실행본은 빌드 때 자동 생성됩니다. [패키지 변경 내역](RENDER_RELEASE.md).

우주반도체·COTS 적용성 검토와 64비트 메모리 보호회로 설계를 위한 웹 시뮬레이터입니다.
비트 오류를 직접 주입해 SECDED·TMR·스크러빙 동작을 확인하고, 환경·부품·검증·비용을 비교합니다.
개발 범위·사용 예시·계산방법·확장 계획은 `PROJECT.md`에 정리되어 있습니다.

## 실행

**바로 실행:** `dist/kleo-chip-standalone.html`을 브라우저에서 열면 됩니다.
인터넷·Python·설치 없이 비트 조작·반복 실험·CSV·JSON 저장을 사용할 수 있습니다.
자료 출처 링크는 인터넷이 필요하며 PDF는 브라우저 인쇄 기능을 이용합니다.

**프로젝트 개발:** Python 3이 있다면 `python start.py`를 실행하세요.
브라우저가 열리고 localhost에서 동작합니다. 포트가 사용 중이면 `python start.py --port 8001`을 사용하세요.
또는 다음 명령으로 정적 파일을 제공할 수 있습니다.

```bash
python3 -m http.server 8000 --directory src
```

브라우저에서 `http://localhost:8000`을 여세요. 개발용 `src/index.html`은 ES 모듈을 사용하므로
로컬 HTTP 서버가 필요합니다. `dist/kleo-chip-standalone.html`은 별도로 묶은 독립 실행본입니다.
Python이 없다면 임의의 정적 웹 서버를 사용해도 됩니다. 정적 호스팅에는 `npm run build`로 만든 `build` 폴더를 올립니다.

## 실제 자료와 예시 자료

- 기본 세 궤도(500 km SSO / 888 km 42° / 1280 km 42°)의 환경·오류율은 **교육용 합성값**입니다.
- 500 km SSO 경사각 97.4°는 비교용 가정이며 실제 Space-MaCS 확정값이 아닙니다.
- 가상 메모리 3종의 성능·가격·전력은 예시입니다. 실제 부품으로 판매되는 모델이 아닙니다.
- UT8Q512E, UT8ER512K32, SMV512K32-SP는 공개 제조사 사양을 출처와 함께 제공하는 참고 부품입니다.
  목표 궤도별 오류율, 실제 단가·전력, 구매 로트 시험자료는 미확보로 둡니다.
- 제조사 사양은 구매 로트 시험결과나 최종 임무 적합성 승인이 아닙니다.

## 기능

- V1.1 설계 실험: 실제 비트 연산으로 (72,64) SECDED, TMR 다수결·불일치, 스크러빙 및 오류 전파를 확인.
- 반복 실험: 지정한 개수의 물리 비트 오류를 시드 기반으로 주입하고 정상/검출/미검출 손상 집계.
- V1.0 시나리오 JSON 불러오기 호환. V1.1 비트 상태·실험 설정 저장 및 결과 CSV·인쇄 지원.

기존 적용성 비교 기능:

1. 환경: 정확히 일치하는 궤도·차폐의 연간 TID를 이용한 누적선량·여유 비교.
2. 부품: 부품 추가·복제·삭제·사양·시험조건·로트·출처 편집.
3. 보호: 원시 SEU율을 이용한 ECC/스크러빙, 이상적 TMR/재동기화 비교.
4. 검증: TID, SEU, SEL/SEFI, 복구, 우주검증, 추적성 계획과 진행상태.
5. 비용: 수량, 예비품, 반도체·선별·보호·차폐 제작비와 시험·개발비 합산.
6. 자료 입출력: 시나리오 JSON, 정규화 환경 CSV, 결과 CSV, 검증계획 CSV, 보고서 인쇄/PDF.

자료는 사용자 브라우저에서만 읽고 계산합니다. 서버 업로드·계정 DB·자동 저장은 없습니다.
작업을 보존하려면 '시나리오 저장'으로 JSON을 내려받으세요.

## 환경자료 가져오기

'자료·계산방법'에서 빈 CSV 양식을 내려받습니다. SPENVIS 원본 파일의 자동 파서는 아닙니다.
외부 도구에서 해석한 결과를 아래 단위로 정규화한 다음 가져옵니다.

| 열 | 의미 |
|---|---|
| orbit_id | sso500 / leo888 / leo1280 |
| altitude_km, inclination_deg | 환경자료의 고도와 경사각. 프리셋과 일치해야 계산 |
| shield_mm | Al 등가 차폐 mm. 형상·상세 재질은 model/source에 기록 |
| annual_tid_krad_si | 임무 평균을 연간 환산한 TID, krad(Si)/년 |
| part_id | 부품의 ID. 선량만 공통으로 입력할 때 * |
| seu_per_bit_day | 원시 SEU, 회/bit/일. 대상 부품·환경에 한정 |
| sefi_per_device_day | 회/소자/일 |
| sel_per_device_day | 회/소자/일. 복구 중단시간에는 합산하지 않음 |
| basis | synthetic / user / test |
| source | 원본 파일명, 문헌 또는 URL |
| model | 환경 모델, 차폐 형상과 가정 |
| epoch | 해석 시기, 태양활동과 기간 |
| rate_kind | raw / effective. effective는 보호모델에 재적용하지 않음 |

빈 수치는 미확보입니다. 0을 미확보의 대체값으로 쓰지 마세요.
동일한 궤도·차폐·부품은 한 행만 허용합니다. 같은 환경의 선량이 부품별로 달라서는 안 됩니다.
가져오기는 환경 표 전체를 교체하며 입력 검증에 실패하면 기존 시나리오를 유지합니다.
단위나 소자 응답의 정의가 맞지 않으면 외부 해석을 다시 확인하세요.

## 계산 범위

- 임무 선량 = 연간 평균 선량 × 임무기간. 태양활동의 시간 변화와 방사선 수송은 자체 계산하지 않습니다.
- TID 수치 여유 = 부품 근거값 / (임무 선량 × 설계 여유계수).
- SEU = 입력 원시 per-bit-day 오류율 × 소자 비트 수 × 논리 장비당 소자 수.
- ECC는 동일 워드·점검주기의 독립 포아송 다중오류와 입력한 동시 2-bit 사건을 합산합니다.
  노출 비트에는 SECDED 검사 비트가 포함됩니다. 예: 64-bit 워드는 72 bit 저장, 원시 오류 72/64배.
- TMR은 세 복제본 중 두 개 이상의 워드 오류와 공통원인 항을 합산합니다. 투표기 이상적·주기별 정상화 가정.
- 기능 영향과 검출·복구 성공률은 사용자 가정입니다. 복구 중단시간은 성공적으로 복구 가능한 SEU와
  입력된 SEFI에만 해당합니다. SEL, 영구고장, 부품 수명과 위성망 가용도를 포함하지 않습니다.
- 0건 관측 단측 95% 상한 = -ln(0.05)/(소자 수 × 관측일). 일정 사건율·완전검출·독립성 가정.
  다른 궤도에 직접 전용할 수 없습니다.
- 비용에는 반도체·보호·선별·차폐·검증·개발비를 포함합니다. 위성체 전체·발사·운용·교체비는 제외합니다.

임무 인증, 소자 TCAD, DDD 수명모델, 열해석, RTL 합성·타이밍·전력, FPGA 전체 기능해석은 현재 범위가 아닙니다.
설계 실험의 물리 저장 비트 오버헤드는 칩 면적·전력 증가율이 아닙니다.
반복 실험의 비율은 궤도 방사선 발생률·위성 신뢰도와 구분하며 기존 확률모델에 직접 대입하지 않습니다.
방사선 테스트와 소자·장비 설계 검증이 최종 적용 판단에 필요합니다.

## 검증

Node.js 22 이상에서 계산 및 자료처리 검증:

```bash
node --test tests/*.test.mjs
```

비트 단위·수량, 선량 여유, 자료 미확보 처리, 차폐 불일치, ECC/TMR 극한조건,
비용 산술, 0건 관측 상한, CSV 왕복·유효성 검사를 포함합니다.

반복 실험 속도(20,000회)는 기기 성능에 좌우되므로 테스트와 분리해 `npm run bench`로 확인합니다.
GitHub Actions(`.github/workflows/ci.yml`)가 PR과 main 푸시마다 테스트·빌드를 실행하고,
커밋된 `dist/kleo-chip-standalone.html`이 현재 소스로 만든 결과와 같은지 검사합니다.

## 구조

원본 소스는 `src/`에 있고, 빌드 없이 브라우저에서 ES 모듈로 바로 실행됩니다.
`dist/`에는 커밋되는 독립 실행본만 둡니다.

- `src/index.html`: 문서와 진입점
- `src/app.js`: 화면·입력·자료 입출력
- `src/lab-view.js`: 설계 실험 화면
- `src/fault-lab.js`: 비트 단위 SECDED·TMR·시드 기반 오류 주입 모델
- `src/model.js`: 독립 계산·검증 모듈
- `src/data.js`: 합성 시나리오·제조사 사양·출처
- `src/styles.css`: 반응형 화면·인쇄
- `dist/kleo-chip-standalone.html`: 인터넷·설치 없이 여는 실행본(자동 생성)
- `tests/fault-lab.test.mjs`: 단일/이중 오류 전수 검사, 공통원인, 재현성
- `tests/model.test.mjs`: 핵심 계산 검증
- `scripts/build-render.mjs`: Render 빌드·독립 실행본·소스 ZIP 생성
- `scripts/bench-campaign.mjs`: 반복 실험 속도 확인
- `start.py`: Python 표준 라이브러리로 로컬 실행
- `PROJECT.md`: 프로젝트 범위·사용법·개발계획
- `SCENARIO_SCHEMA.md`: 시나리오 JSON 필드·버전 관리(후속 kleo 연동 참고)

후속 `kleo` 연동은 JSON에 기록된 환경·부품·복구 모델의 명시된 범위를 유지한 채
장비 기능중단 시나리오로 연결하세요. 원시 비트 오류를 위성 고장률로 직접 전용하지 마세요.
시나리오 JSON의 필드·단위·버전 관리 규칙은 [SCENARIO_SCHEMA.md](SCENARIO_SCHEMA.md)에 정리했습니다.

## 실행본 재생성

JS/CSS 수정 후 Node.js와 Python이 있는 환경에서 다음을 실행하세요.

```bash
node --test tests/*.test.mjs
python3 scripts/package-source.py
```

생성된 실행본의 JavaScript 문법을 확인하고, 독립 실행본과 전체 소스 ZIP을 `dist`에 생성합니다.
독립 실행본은 모듈마다 별도 함수 범위로 묶이므로 `import { a, b } from './x.js'`와
`export const|function` 형식만 사용하세요(별칭·default export는 빌드에서 거부).
코드 형식은 `.prettierrc.json`을 따릅니다. 설치 없이 `npx prettier@3.9.9 --write "src/*.{js,css}" tests/*.mjs`로
맞출 수 있으며 CI가 같은 버전으로 검사합니다.
초기 배포·공유는 프로젝트 사용자가 결정하며, 소스 패키지에는 계정 정보·인증정보가 포함되지 않습니다.
