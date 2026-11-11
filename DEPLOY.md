# 배포 가이드 — Render(무료) + Turso(무료)

- **Render**: 앱 서버(화면 + API + 실시간 연결)를 실행합니다.
- **Turso**: 계정·기록·이미지를 저장하는 DB입니다. Render 무료 플랜은 재시작할 때 디스크가 초기화되므로 데이터는 Turso에 둡니다.

> 두 서비스의 무료 조건(용량·지역 등)은 바뀔 수 있으니 가입할 때 확인하세요.

---

## 1. Turso DB 만들기

1. https://turso.tech 에서 GitHub 계정으로 가입합니다.
2. 대시보드에서 **Create Database**를 누릅니다.
   - 이름: 예) `my-archive`
   - 지역(Location): **AWS us-west-2 (Oregon)** 권장 — 아래 Render 지역(Oregon)과 맞추면 DB 응답이 빨라집니다.
3. 만든 DB에서 다음 두 값을 복사해 둡니다.
   - **Database URL**: `libsql://my-archive-<아이디>.turso.io` 형태
   - **Token**: *Create Token*(또는 Generate Token) → 권한 *Read & Write*, 만료 *Never*

테이블은 서버가 처음 시작할 때 자동으로 만들어집니다. 따로 할 일은 없습니다.

## 2. GitHub에 올리기

저장소 루트에 `package.json`, `render.yaml`이 있어야 합니다.
`.gitignore`에 `node_modules`, `dist`, `server/data`(로컬 DB), `.env`가 이미 제외되어 있습니다.

## 3. Render에 배포

1. https://render.com 에 GitHub 계정으로 가입합니다.
2. **New → Blueprint**를 누르고 이 저장소를 선택합니다. `render.yaml`을 읽어 설정이 자동으로 채워집니다.
   - 이름 `my-archive`, Free 플랜, Oregon
   - Build: `npm ci --include=dev && npm run build`
   - Start: `npm start`
   - Health check: `/api/health`
3. 환경변수 입력 칸이 나오면 1단계에서 복사한 값을 넣습니다.
   - `TURSO_DATABASE_URL` = Database URL
   - `TURSO_AUTH_TOKEN` = Token
4. **Apply**를 누르면 빌드와 배포가 시작됩니다(몇 분 걸림).
5. 완료되면 `https://my-archive-xxxx.onrender.com` 주소가 생깁니다. 접속해서 회원가입하면 됩니다.

> Blueprint 대신 **New → Web Service**로 만들어도 됩니다. 이때는 위 Build/Start 명령과 환경변수를 직접 입력하세요.
> Node 버전은 저장소의 `.node-version`(24)을 따릅니다.

이후 GitHub에 push하면 자동으로 다시 배포됩니다. 데이터는 Turso에 있으므로 재배포해도 유지됩니다.

---

## 무료 플랜에서 알아둘 점

- **잠자기**: 15분 동안 접속이 없으면 서버가 잠듭니다. 다음 첫 접속은 30초~1분쯤 걸리고, 그 뒤로는 빠릅니다.
  - 잠든 동안 열려 있던 화면은 "오프라인" 표시가 되었다가 서버가 깨어나면 자동으로 다시 연결되고, 그 사이 고친 내용도 저장됩니다.
- **실시간 연결**: 서로의 마우스 표시와 실시간 반영은 서버가 깨어 있는 동안 정상적으로 동작합니다.
- **이미지**: 이미지도 Turso에 저장되므로 Turso 무료 용량 안에서 사용하세요. (첨부할 때 큰 사진은 자동으로 줄여서 저장합니다.)
- **백업**: 설정 → *JSON 내보내기*로 가끔 백업해 두면 안전합니다.

## 로컬 개발

```bash
npm.cmd install
npm.cmd run dev      # http://localhost:5173  (DB: server/data/archive.db)
```

로컬에서 Turso에 직접 붙어보고 싶다면 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 환경변수를 설정한 뒤 실행하면 됩니다(`.env.example` 참고).
배포와 같은 방식으로 실행해 보려면 다음과 같이 합니다.

```bash
npm.cmd run build
npm.cmd start        # http://localhost:3001
```

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 배포 로그에 `URL_INVALID` / `SERVER_ERROR` / 401 | `TURSO_DATABASE_URL`이 `libsql://`로 시작하는지, 토큰이 올바르고 만료되지 않았는지 |
| 로그인 직후 다시 로그인 화면 | 주소가 `https://`인지 확인 (쿠키는 HTTPS에서만 저장됩니다) |
| 첫 접속이 오래 걸림 | 무료 플랜 잠자기에서 깨어나는 중입니다. 1분 정도 기다리세요. |
| 빌드 실패 `tsc: not found` 등 | Build 명령에 `--include=dev`가 있는지 확인 |
