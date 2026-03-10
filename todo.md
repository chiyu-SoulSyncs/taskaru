# Taskaru — Manus独立化 & リリース計画

## 全体像

```
Phase 1 (Manus除去)        ← 最初にやる、他に影響なし
  ├── Phase 2 (認証差替)    ← ユーザー関連の全てに必要
  │     ├── Phase 4 (セキュリティ) ← 認証が前提
  │     │     └── Phase 5 (マルチユーザー) ← セキュリティ+認証が前提
  │     └── Phase 6 (DB/デプロイ) ← Phase 4と並行可
  ├── Phase 3 (LLM差替)    ← Phase 2と並行可
  └── Phase 7 (コード品質)  ← いつでも可
```

**最小リリースに必要**: Phase 1 + 2 + 3 + 4.1 + 6.1

---

## Phase 1: Manus固有コードの除去（リスク低）

- [ ] **1.1** `vite.config.ts`: `vite-plugin-manus-runtime` と `vitePluginManusDebugCollector` 関数を削除、`allowedHosts` を `localhost` + `127.0.0.1` のみに
- [ ] **1.2** `package.json`: `vite-plugin-manus-runtime` を devDependencies から削除
- [ ] **1.3** `client/public/__manus__/` ディレクトリごと削除
- [ ] **1.4** `server/_core/dataApi.ts`: 削除（Manus `CallApi` 依存、未使用）
- [ ] **1.5** `server/_core/notification.ts`: Manus `SendNotification` 依存 → LINE push通知 or ログ出力に書き換え
- [ ] **1.6** `server/_core/systemRouter.ts`: `notifyOwner` を新しい通知方式に更新
- [ ] **1.7** `.env.example` を作成（全環境変数を文書化）

---

## Phase 2: 認証システムの差し替え（最重要・最大工数）

### 現状
- `server/_core/sdk.ts` → Manusの `WebDevAuthPublicService` でOAuth
- `server/_core/oauth.ts` → Manusのトークン交換
- `server/_core/types/manusTypes.ts` → Manus固有の型定義

### やること
- [ ] **2.1** `server/_core/env.ts`: Manus変数削除、Google OAuth変数追加
  - 削除: `appId`, `oAuthServerUrl`, `ownerOpenId`
  - 追加: `googleClientId`, `googleClientSecret`, `appUrl`
- [ ] **2.2** `server/_core/sdk.ts`: 全面書き換え
  - `OAuthService` / `SDKServer` クラス削除
  - JWT部分（`signSession`, `verifySession`）は流用可
  - `SessionPayload` から `appId` 削除 → `userId`(number) + `name`
  - `authenticateRequest` を簡素化（JWTからuser取得のみ）
  - `as any` キャスト全廃
- [ ] **2.3** `server/_core/oauth.ts`: Google OAuth直接実装
  - `GET /api/oauth/google` → Googleの認可URLへリダイレクト
  - `GET /api/oauth/callback` → コード交換→ユーザーupsert→JWTセッション発行→`/`へリダイレクト
- [ ] **2.4** `server/_core/types/manusTypes.ts`: 削除
- [ ] **2.5** `client/src/const.ts`: `getLoginUrl()` を `/api/oauth/google` に変更
- [ ] **2.6** `client/src/_core/hooks/useAuth.ts`: `useMemo` 内の `localStorage.setItem` を `useEffect` に移動、`manus-runtime-user-info` キー名変更
- [ ] **2.7** `server/_core/cookies.ts`: `sameSite: "none"` → `"lax"` に変更（同一オリジンデプロイ前提）、ドメイン制限のコメントアウト解除
- [ ] **2.8** `drizzle/schema.ts`: `users.openId` に `google:{googleId}` 形式で保存（スキーマ変更不要）

---

## Phase 3: LLM API差し替え（Phase 2と並行可）

### 現状
- `server/_core/llm.ts` → `forge.manus.im`（ManusのLLMプロキシ、OpenAI互換形式）
- モデル: `gemini-2.5-flash` ハードコード

### やること
- [ ] **3.1** `server/_core/env.ts`: `forgeApiUrl`/`forgeApiKey` → `llmApiUrl`/`llmApiKey`/`llmModel` にリネーム
- [ ] **3.2** `server/_core/llm.ts`:
  - `resolveApiUrl()`: `forge.manus.im` フォールバック削除 → `ENV.llmApiUrl` 必須に
  - モデル名: `"gemini-2.5-flash"` → `ENV.llmModel` に外出し
  - `thinking` フィールド（L300-302）: 削除 or 設定可能に（全プロバイダ非対応）
  - エラーメッセージ: APIレスポンス全文をthrowしない → サニタイズ
  - `assertApiKey()` のメッセージ: `OPENAI_API_KEY` → `LLM_API_KEY`

### LLM選択肢
| プロバイダ | URL | 備考 |
|-----------|-----|------|
| Google Gemini (OpenAI互換) | `https://generativelanguage.googleapis.com/v1beta/openai` | 最小変更で移行可 |
| OpenAI | `https://api.openai.com/v1` | そのまま使える |
| OpenRouter | `https://openrouter.ai/api/v1` | 複数モデル切替可 |

---

## Phase 4: セキュリティ強化（本番公開前に必須）

### 4.1 データのユーザー分離（最重要）
- [ ] `drizzle/schema.ts`: `folders`, `notes`, `projects` に `appUserId` カラム追加（`tasks` は既存だが未使用）
- [ ] `server/db.ts`: 全 `getAll*` 関数に `appUserId` フィルタ追加
  - `getAllTasks()`, `getAllFolders()`, `getAllNotes()`, `getAllProjects()`
  - `createTask()`: `appUserId` を認証コンテキストから設定
  - `update`/`delete` 系: 操作前に所有権チェック
- [ ] 全ルーター: `ctx.user.id` をDB関数に渡す

### 4.2 LINE署名検証の修正
- [ ] `server/line.ts` (L29-31): `LINE_CHANNEL_SECRET` 未設定時の `return true` 削除 → エラーにする
- [ ] 開発用: `SKIP_LINE_SIGNATURE=true` 環境変数で明示的にスキップ

### 4.3 レート制限の追加
- [ ] `express-rate-limit` をインストール
- [ ] `server/_core/index.ts` に追加:
  - グローバル: 100 req/min per IP
  - `/api/line/webhook`: 30 req/min
  - `/api/oauth/*`: 10 req/min per IP

### 4.4 その他
- [ ] `server/_core/index.ts`: ボディサイズ `50mb` → `1mb` に縮小
- [ ] CORS設定追加（デプロイドメイン限定）
- [ ] `helmet` ミドルウェア追加
- [ ] 全ルーター: `throw new Error()` → `throw new TRPCError()` に統一

---

## Phase 5: マルチユーザー & LINE連携

### 5.1 LINE-Webユーザー紐づけ
- [ ] 新エンドポイント: `line.generateLinkCode` → ユニークなリンクコード生成
- [ ] LINEコマンド追加: `link <コード>` → `lineUsers.appUserId` を設定
- [ ] Webアプリ: LINE連携画面にコード表示

### 5.2 LINEタスクのユーザー紐づけ
- [ ] `server/lineWebhook.ts`: タスク作成時に `lineUser.appUserId` をセット
- [ ] `server/scheduler.ts`: リマインダーをユーザー別に送信

---

## Phase 6: DB・デプロイ

### 6.1 データベース
- [ ] 本番DB用意（PlanetScale / Neon / Supabase / Railway MySQL等）
- [ ] `server/db.ts` (L24-34): 接続リトライロジック追加
- [ ] バルク操作にトランザクション追加（`insertTasks`, `deleteProject`, `deleteFolder`）

### 6.2 タイムゾーン修正
- [ ] `server/scheduler.ts`: 手動JST計算 → `node-cron` の `timezone: "Asia/Tokyo"` オプション使用

### 6.3 デプロイ
- [ ] `Dockerfile` 作成
- [ ] Railway / Fly.io / VPS にデプロイ
- [ ] LINE Webhook URLを本番URLに変更
- [ ] Google OAuth のリダイレクトURIを本番URLに追加
- [ ] `trust proxy` 設定（リバースプロキシ対応）

---

## Phase 7: コード品質（随時）

- [ ] `server/db.ts`: `(result as any)[0]?.insertId` → 型付きヘルパー関数に
- [ ] 未使用Manusモジュール削除: `imageGeneration.ts`, `map.ts`, `voiceTranscription.ts`（要import確認）
- [ ] 入力バリデーション強化（Zodでtrim・max length）
- [ ] 監査ログ追加

---

## 環境変数（最終形）

| 変数 | 必須 | 説明 |
|------|------|------|
| `DATABASE_URL` | Yes | MySQL接続文字列 |
| `JWT_SECRET` | Yes | セッションJWT署名用シークレット |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth クライアントID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth クライアントシークレット |
| `APP_URL` | Yes | アプリのベースURL（OAuth callback用） |
| `LLM_API_KEY` | Yes | Gemini / OpenAI APIキー |
| `LLM_API_URL` | Yes | LLM APIベースURL |
| `LLM_MODEL` | No | モデル名（デフォルト: gemini-2.5-flash） |
| `LINE_CHANNEL_SECRET` | Yes* | LINE署名検証 |
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes* | LINE Messaging API |
| `PORT` | No | サーバーポート（デフォルト: 3000） |
| `NODE_ENV` | No | development / production |

*LINE連携を使う場合に必須

---

## 新規依存パッケージ

| パッケージ | 用途 |
|-----------|------|
| `googleapis` or `passport-google-oauth20` | Google OAuth |
| `express-rate-limit` | レート制限 |
| `helmet` | セキュリティヘッダー |
| `cors` | CORS設定 |
