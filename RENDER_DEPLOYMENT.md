# K-LEO CHIP — Render 배포 안내

기존 V1.1.0의 설계 실험실·환경·부품·보호·검증·비용·자료 입출력 기능을 유지한 Render용 소스입니다.
모든 계산은 브라우저에서 수행하며 API 서버, DB, API 키, 외부 JavaScript 패키지가 필요하지 않습니다.
Render 서비스 종류는 **Static Site**입니다.

## 1. GitHub에 코드 올리기

1. ZIP 압축을 풉니다.
2. GitHub에서 새 저장소(예: `kleo-chip`)를 만듭니다. 저장소 공개/비공개는 선택할 수 있습니다.
3. 압축 내부 `kleo-chip-v1.1.0` 폴더 안의 파일과 `src`, `dist`, `scripts`, `tests`, `.github` 폴더를 올립니다.
4. 저장소 첫 화면에 `render.yaml`과 `package.json`이 바로 보여야 합니다. ZIP 파일 자체만 올리면 배포되지 않습니다.

GitHub의 Add file → Upload files를 이용해도 됩니다. `.node-version`, `.gitignore`도 포함하면 좋습니다.
Node 버전은 `render.yaml`에도 지정되어 있어 점으로 시작하는 두 파일이 누락되어도 Blueprint 배포가 가능합니다.

Git 명령을 사용하는 경우에는 압축 내부 프로젝트 폴더에서 실행합니다.
아래 마지막 URL은 실제로 만든 저장소 주소로 바꿉니다.

```bash
git init
git add .
git commit -m "Prepare K-LEO CHIP for Render"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/kleo-chip.git
git push -u origin main
```

## 2. Render Blueprint로 배포하기

1. [Render Dashboard](https://dashboard.render.com/)에 로그인합니다.
2. **New → Blueprint**를 선택하고 위 GitHub 저장소를 연결합니다.
3. 배포할 브랜치(예: `main`)와 Blueprint 파일 `render.yaml`을 확인합니다.
4. `kleo-chip` Static Site 생성 내용을 확인하고 배포를 실행합니다.
5. 완료되면 Render가 발급한 `https://…onrender.com` 주소를 엽니다.

별도 Start Command나 포트 설정이 필요하지 않습니다. 서비스 이름이 이미 사용 중이면 YAML의 `name`을 바꿉니다.

## 3. 수동으로 Static Site를 만들 경우

Render의 **New → Static Site**에서 저장소를 연결하고 아래 값을 입력합니다.

| 항목 | 입력값 |
|---|---|
| Name | `kleo-chip` 또는 원하는 이름 |
| Branch | 실제 코드가 올라간 브랜치, 예: `main` |
| Root Directory | 저장소 루트에 코드가 있으면 비움 |
| Build Command | `npm test && npm run build` |
| Publish Directory | `build` |
| Environment Variable | `NODE_VERSION` = `22` |
| Environment Variable | `SKIP_INSTALL_DEPS` = `true` |

코드를 저장소의 하위 폴더에 올렸다면 Root Directory에 그 폴더 경로를 입력합니다.
위 표는 수동 설정용이며 Blueprint 사용 시 `render.yaml`이 설정합니다.
메뉴는 한 페이지 내부에서 전환되므로 SPA용 전체 경로 rewrite가 필요하지 않습니다.

## 4. 배포 후 확인

- 첫 화면에서 **설계 실험실**과 비트 조작 화면이 열리는지 확인합니다.
- 1-bit 오류를 주입하고 SECDED 정정 및 TMR 다수결 결과를 확인합니다.
- 분석 대시보드에서 궤도를 바꾸고 환경·비용 결과가 갱신되는지 확인합니다.
- 시나리오 JSON 저장/불러오기와 CSV 다운로드를 확인합니다.
- 하단 **소스 코드 다운로드**가 ZIP을 내려받는지 확인합니다.

빌드 시 최신 코드의 다운로드 ZIP과 `kleo-chip-standalone.html`을 자동 생성합니다.
이후 GitHub에 수정 코드를 push하면 Render의 연결 브랜치 자동 배포 설정에 따라 갱신됩니다.

## 5. 로컬 실행 및 재배포

**설치 없이 열기:** `dist/kleo-chip-standalone.html`을 브라우저에서 엽니다.

**개발 화면:** Python 3이 설치되어 있으면 다음을 실행합니다.

```bash
python start.py
```

**배포와 같은 빌드:** Node.js 22 이상이 필요합니다. npm install은 필요 없습니다.

```bash
npm test
npm run build
```

결과는 `build/`에 생성됩니다. `npm run preview`는 Python 3을 이용해 `http://127.0.0.1:8000`에서 이 폴더를 제공합니다.
Windows에서 python3 명령이 없다면 `python -m http.server 8000 --bind 127.0.0.1 --directory build`를 사용합니다.
`dist`의 오프라인 실행본도 최신으로 갱신하려면 `python scripts/package-source.py`를 실행합니다.

## 운영 특성

- Render에 배포하는 이 패키지는 공개 웹 페이지입니다. 기존 ChatGPT Site의 소유자 전용 접근 설정은 이전되지 않습니다.
- 입력한 시나리오는 사용자 브라우저 메모리에 있으며 서버에 저장되지 않습니다. 새로고침 전 JSON으로 저장하세요.
- 하단 소스 다운로드 기능을 유지하므로 배포된 앱 방문자는 소스 ZIP도 내려받을 수 있습니다.
- 기본 환경·오류율·가상 부품값은 교육용 예시입니다. 제조사 참고 사양과 구분 표시는 기존 화면에 유지됩니다.
- Render Static Sites는 무료 배포를 지원하며 대역폭·빌드 사용량은 계정별 한도의 적용을 받습니다. 실제 비용은 Render 설정에서 확인합니다.

## 문제 해결

| 증상 | 확인할 사항 |
|---|---|
| package.json을 찾지 못함 | 저장소 루트 또는 Root Directory가 맞는지 확인 |
| Web Service가 포트를 기다림 | 이 패키지는 Static Site로 생성 |
| 첫 화면이 404 | 빌드 성공 여부와 Publish Directory=`build` 확인 |
| 분석 화면 준비 중에 멈춤 | JavaScript 활성화, app.js와 다른 JS 파일의 업로드 여부 확인 |
| 다운로드 ZIP이 404 | `npm run build`를 실행한 `build`를 게시했는지 확인 |
| 수정된 내용이 반영되지 않음 | 연결 브랜치, 최신 배포 결과, 브라우저 새로고침 확인 |

## 공식 문서

확인일: 2026-09-11.

- [Render Static Sites](https://render.com/docs/static-sites)
- [Render Blueprints](https://render.com/docs/infrastructure-as-code)
- [render.yaml 명세](https://render.com/docs/blueprint-spec)
- [Node.js 버전 지정](https://render.com/docs/node-version)
