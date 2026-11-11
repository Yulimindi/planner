# My Archive

개인용 메모 · 정보 관리 웹앱 (React + TypeScript + Vite + Tailwind CSS v4 + Dexie.js)
계정(회원가입/로그인), 카테고리 공유(편집/보기 권한), 공유 페이지 실시간 동기화·마우스 커서 표시를 지원합니다.

## 실행

PowerShell에서 `npm` 실행이 막혀 있으면 `npm.cmd`를 사용하세요.

```bash
npm install
npm run dev        # API 서버(3001) + 화면(5173) 동시 실행 → http://localhost:5173
npm run build      # 타입 검사(클라이언트·서버) + 프로덕션 빌드 (dist/)
npm start          # 빌드 결과까지 서버 하나로 제공 → http://localhost:3001
```

- DB: libSQL(`@libsql/client`). 로컬은 `server/data/archive.db` 파일, 배포 시 `TURSO_DATABASE_URL`·`TURSO_AUTH_TOKEN`이 있으면 Turso에 연결합니다.
- 배포(Render 무료 + Turso 무료): [DEPLOY.md](DEPLOY.md) 참고.

## 서버 구조 (`server/`)

| 파일 | 역할 |
|---|---|
| index.ts | Express API: 가입/로그인/로그아웃, 동기화, 변경 적용, 이미지, 공유 관리 |
| auth.ts | scrypt 비밀번호 해시, HttpOnly 쿠키 세션 (30일) |
| docs.ts | 문서 저장소와 권한 판단 (소유자 / 편집 / 보기), 실시간 전송 대상 계산 |
| realtime.ts | WebSocket: 다른 사람의 변경 전달, 같은 페이지 접속자·마우스 위치 중계 |
| db.ts | libSQL 연결(로컬 파일/Turso), 스키마, 쓰기 트랜잭션 직렬화 |

동기화 방식: 브라우저의 Dexie(IndexedDB)를 화면용 캐시로 쓰고, Dexie 훅으로 잡은 변경을
`/api/ops`로 보냅니다. 서버는 권한을 확인한 뒤 적용하고, 그 카테고리를 볼 수 있는 사람들에게
WebSocket으로 전달합니다. 표 셀은 셀 단위로 저장되어 두 사람이 같은 행의 다른 셀을 동시에 고쳐도 둘 다 유지됩니다.
같은 셀을 동시에 고치면 나중에 저장한 값이 남습니다.

## 폴더 구조

```
src/
  db/          types.ts(데이터 타입) · db.ts(Dexie 스키마) · seed.ts(기본 카테고리)
               repo.ts(CRUD) · backup.ts(JSON 내보내기/가져오기/초기화)
  lib/         hooks.ts(라이브 쿼리·드래그 정렬 등) · utils.ts · colors.ts · icons.tsx
  components/
    ui/        Button, Input, Select, Modal, Segmented ... / Feedback(토스트·확인창)
    layout/    AppLayout(사이드바·모바일 드로어)
    category/  카테고리 카드·폼·보관/삭제 액션
    memo/      메모 카드·편집 부품·빠른 메모·카테고리 이동·일반/갤러리 목록
    table/     표 뷰(Table/List/Gallery)·셀 편집·열 설정·필터
    checklist/ 체크리스트 뷰
  pages/       Home, QuickMemo, Favorites, Search, Categories, Archive, Settings, Category, Memo
```

## 데이터 모델 (IndexedDB `my-archive`)

| 테이블 | 내용 |
|---|---|
| categories | 이름·설명·아이콘·색상·형식(note/table/checklist/gallery)·순서·보관·마지막 보기 방식 |
| memos | 일반 메모 / 갤러리 카드 / 빠른 메모(categoryId = null) 공용 |
| columns | 표의 열 구조 (유형, 선택지, 계산 방식) |
| rows | 표의 행 (`cells[columnId]`) |
| checklist | 체크리스트 항목 (완료, 목표 날짜, 순서) |
| images | 첨부 이미지 Blob |
| settings | 앱 이름·테마·사이드바 상태·카테고리별 보기 방식 (사용자별) |
| access | 카테고리별 내 권한과 공유 멤버 (서버에서 받는 로컬 전용) |

기록은 계정(서버)에 저장되며, 설정 > JSON 내보내기로 내 데이터를 따로 백업할 수 있습니다 (공유받은 페이지 제외).
