# 시나리오 JSON 계약 (kleo 연동 참고)

이 문서는 `src/data.js`의 `createProject()`가 만들고 `src/model.js`의
`validateProject()`가 검증하는 시나리오 JSON의 필드를 정리합니다. 저장(`시나리오 저장`)·
불러오기(`시나리오 불러오기`) 버튼이 그대로 이 형식을 읽고 씁니다. README에 적힌
후속 `kleo`(궤도 설계 도구) 연동은 여기 적힌 필드와 단위를 그대로 유지한 채,
장비 기능중단 시나리오 쪽으로 값을 넘겨 받는 것을 전제로 합니다.

**이 문서는 계약을 설명할 뿐 실제 kleo 연동을 구현하지 않습니다.** 연동 코드는
이 문서의 범위 밖입니다.

## 버전 관리

- `schemaVersion` 필드는 `src/data.js`가 export하는 `SCENARIO_SCHEMA_VERSION` 상수
  하나로 관리합니다(현재 `1`). `src/model.js`의 `validateProject()`는 같은 상수와
  정확히 일치하는 값만 통과시킵니다 — 문자열 `"1"`이나 다른 정수는 거부됩니다.
- V1.0 → V1.1 확장(설계 실험 상태 `lab` 필드 추가)은 `schemaVersion`을 올리지 않고
  **선택 필드 추가**로 처리했습니다. `lab`이 없는 V1.0 파일을 불러오면
  `src/app.js`(불러오기)와 `render()`가 `p.lab ??= createLab()`으로 기본값을 채웁니다.
  스키마를 확장할 때 우선 고려할 패턴입니다: 기존 필드의 의미·단위를 바꾸지 않고
  새 필드를 선택(optional)으로 추가할 수 있다면 `schemaVersion`을 유지하고,
  기존 필드의 의미·단위·필수 여부가 바뀌면 `SCENARIO_SCHEMA_VERSION`을 올리고
  `validateProject()`에 이전 버전 변환(migration) 경로를 추가하세요.
- 이 파일과 `src/model.js`의 `validateProject()`, `src/data.js`의
  `SCENARIO_SCHEMA_VERSION`은 함께 갱신해야 합니다. 하나만 바꾸면 저장 파일과
  검증기가 어긋납니다.
- 검증기는 알 수 없는 최상위 필드를 거부하지 않습니다(추가 전용 확장에 안전).
  다만 알려진 필드의 타입·범위·필수 여부는 엄격히 검사합니다 — 스키마 문서에
  없는 필드에 의존하는 외부 도구는 없는 값으로 취급될 수 있음을 감안하세요.

## 최상위 구조

| 필드 | 타입 | 설명 |
|---|---|---|
| `schemaVersion` | number | 정확히 `SCENARIO_SCHEMA_VERSION`(현재 1) |
| `title` | string | 시나리오 제목 (1~120자) |
| `lab` | object | 설계 실험(비트 상태·시드·시행수) 상태. `fault-lab.js`의 `validateLab()` 참고. 없으면 불러오기 시 기본값 생성 |
| `parts` | Part[] | 1~100개, `id` 중복 불가 |
| `environments` | EnvironmentRow[] | 최대 3,000행 |
| `selectedPartId` | string | `parts[].id` 중 하나 |
| `mission` | object | 궤도 ID, 차폐, 수명, 여유계수, 장비·위성 수량 |
| `protection` | object | 보호모드(`none`/`ecc`/`tmr`), 워드 길이, 점검주기, 오류 가정 |
| `cost` | object | 제작·시험·개발비 가정 |
| `flight` | object | Space-MaCS 관측기간·소자 수·사건유형별 관측 건수 |
| `taskStatus` | object | 검증 작업 ID → `계획`/`진행`/`완료` |

정확한 숫자 범위·필수 여부는 `src/model.js`의 `validateProject()`가 유일한 진실
소스(source of truth)입니다. 이 표는 요약이며 코드와 어긋나면 코드가 우선합니다.

## kleo 연동 시 특히 주의할 점 (README 발췌)

- 환경(`environments`)·부품(`parts`)·복구 모델(`protection`, `cost.*`)에 **명시된
  범위**를 유지한 채 장비 기능중단 시나리오로 연결해야 합니다. 예를 들어
  `environments[].rateKind`가 `raw`인 행만 `softErrorModel()`의 원시 비트 오류율
  입력으로 유효하며, `effective`(보호 후 출력율)는 그대로 재적용하면 이중 보정이 됩니다.
- `environments[].basis`가 `synthetic`이면 교육용 합성값입니다. kleo가 실제 위성
  설계 판단에 값을 사용하기 전에 `synthetic` 행을 걸러내거나 사용자에게 표시해야 합니다.
- 비트 오류율(`soft.*`, `sefi`, `sel`)은 위성/장비 고장률이 아닙니다. kleo 쪽에서
  장비 기능중단 확률로 환산하려면 `protection.functionalFraction`,
  `protection.coverage`, `recoverySec` 등 이 도구가 이미 분리해 둔 가정을 그대로
  전달하고, 새로운 가정을 암묵적으로 섞지 마세요.
- `part.lot`이 `'미확인'`이거나 `tidBasis`가 `'synthetic'`이면 구매 로트 근거가
  없다는 뜻입니다 — `evaluate()`가 반환하는 `reasons` 배열에 근거 공백 목록이 있으니
  이를 그대로 kleo 쪽 경고로 전달하는 것을 권장합니다.
