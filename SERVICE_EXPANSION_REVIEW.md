# 서비스 확장 검토

`dist/model.js`, `dist/fault-lab.js`, `dist/data.js`, `dist/app.js`의 시나리오 JSON
저장/불러오기 경로를 검토했습니다. 목적은 (a) README에 적힌 후속 `kleo`(궤도 설계 도구)
JSON 연동을 위한 마찰 감소, (b) 브라우저 단독 앱이 시나리오·부품 자료 증가 시 겪을 수
있는 실제 견고성·확장성 문제 확인입니다. 실제 kleo 연동 구현은 범위 밖입니다.

## 검토 결과 요약

1. **반복 오류 주입 실험의 성능 문제(실제 버그)** — `runCampaign()`은 매 시행마다
   ①`resetMemory()`를 통해 `createLab(hex)`(hex 파싱 + SECDED 인코딩)를 다시 실행하고,
   ②`inspectLab()`을 통해 `validateLab()`(hex 재파싱 포함 전체 검증)을 다시 실행했습니다.
   기준 데이터와 실험 구조는 한 캠페인 내내 바뀌지 않는데도 시행마다 다시 계산한
   것입니다. 최대 허용 시행수(20,000회) 기준 측정 결과 **653ms → 118ms (약 5.5배)**로
   개선했습니다. 브라우저에서 이 계산은 메인 스레드를 동기적으로 막으므로, 버튼 클릭마다
   0.6초 가까이 화면이 멈추던 것이 실측상 사라집니다. 후속 계획(V1.2, 시간 누적·인터리빙
   실험)에서 시행수 요구가 늘어날수록 이 문제는 선형으로 악화되므로 지금 고치는 것이
   맞다고 판단했습니다.
2. **시나리오 스키마 버전의 단일 진실 소스 부재(kleo 연동 마찰)** — `schemaVersion`의
   값 `1`이 `dist/data.js`(생성)와 `dist/model.js`(검증) 두 곳에 매직 리터럴로 중복돼
   있었습니다. 향후 kleo 연동을 위해 스키마를 확장/버전업할 때 한쪽만 바꾸면 저장 파일과
   검증기가 어긋나는 사고가 나기 쉬운 구조였습니다. `SCENARIO_SCHEMA_VERSION` 상수를
   `dist/data.js`에서 export하고 `dist/model.js`가 그 값을 import해 검증하도록
   일원화했습니다.
3. **시나리오 JSON 계약 문서 부재(kleo 연동 마찰)** — 시나리오 JSON의 필드·단위·버전
   관리 규칙이 코드에만 흩어져 있어, 외부 도구(kleo) 개발자가 계약을 파악하려면
   축약(minify)되지 않은 `dist/*.js` 전체를 읽어야 했습니다. `SCENARIO_SCHEMA.md`를
   새로 작성해 최상위 필드 표, 버전 관리 규칙(선택 필드 추가 vs. 버전업 필요 시점),
   그리고 README에 이미 적혀 있던 "raw/effective 오류율 혼용 금지", "synthetic 자료
   구분", "비트 오류율 ≠ 위성 고장률" 같은 연동 시 주의사항을 한 곳에 정리했습니다.

## 변경 내역

- `dist/fault-lab.js`: `runCampaign()`이 매 시행 `createLab()`/`validateLab()`을 다시
  호출하던 부분을 제거. 기준 데이터 클론과 golden 비트·분류 로직(`classifyAgainst`)을
  루프 밖에서 한 번만 계산하도록 리팩터링. 공개 API(`inspectLab`, `resetMemory` 등)의
  동작·반환값은 그대로 유지.
- `dist/data.js`: `SCENARIO_SCHEMA_VERSION` 상수 추가 및 export, `createProject()`에서
  사용.
- `dist/model.js`: `SCENARIO_SCHEMA_VERSION`을 `data.js`에서 import해 재사용 및
  재export. 오류 메시지에 실제로 읽힌 `schemaVersion` 값을 포함하도록 개선.
- `SCENARIO_SCHEMA.md` (신규): 시나리오 JSON 계약 문서.
- `README.md`: 구조 목록과 kleo 연동 문단에 `SCENARIO_SCHEMA.md` 링크 추가.
- `tests/fault-lab.test.mjs`: 20,000회 캠페인이 400ms 미만에 끝나는지 확인하는
  성능 회귀 가드 추가(느슨한 상한선으로 설정해 느린 CI에서도 안정적으로 통과하도록 함).
- `tests/model.test.mjs`: `SCENARIO_SCHEMA_VERSION`이 `data.js`/`model.js` 양쪽에서
  같은 값인지, 다른 값이나 문자열 스키마 버전이 거부되는지 확인하는 테스트 추가.
- `dist/kleo-chip-standalone.html`: `scripts/package-source.py` 재실행으로 재생성.

## 검증

- `node --test tests/*.test.mjs` — 28개 테스트 모두 통과(기존 26개 + 신규 2개).
- `python3 scripts/package-source.py` 재실행 완료(독립 실행본·소스 ZIP 재생성).

## 확인했지만 손대지 않은 부분(보류 사유 포함)

- **부품/환경자료 규모에 따른 `evaluate()` 반복 호출 비용**: `partsPage`/`costPage`는
  렌더링마다 부품별로 `evaluate()`를 호출하고, 그 안에서 `findEnvironment()`가
  `project.environments`를 선형 탐색합니다. 현재 허용 상한(부품 100개, 환경자료
  3,000행)에서 실측하면 부품 100개 전체 평가에 약 5ms 수준으로, 사용자 입력 반응성에
  체감될 정도는 아니었습니다. `validateProject()`가 이미 두 배열 크기에 명시적 상한을
  두고 있어 당장 고칠 만한 실제 병목은 아니라고 판단해 보류했습니다. 다만 향후 상한을
  올리거나 kleo 연동으로 환경자료가 크게 늘어난다면, `findEnvironment()`를
  `(orbitId, shieldMm, partId)` 키의 Map 인덱스로 바꾸는 것을 우선 검토할 만합니다.
- **실제 kleo 연동 구현**: 요청 범위 밖이라 구현하지 않았습니다. `SCENARIO_SCHEMA.md`가
  연동 시 참고할 계약과 주의사항을 정리해 둔 시작점입니다.
