# Taskaru — Manus独立化 & リリース計画

## 全体像

```
Phase 1 (Manus除去)        ← 完了
  ├── Phase 2 (認証差替)    ← 完了
  │     ├── Phase 4 (セキュリティ) ← 完了
  │     │     └── Phase 5 (マルチユーザー) ← 完了
  │     └── Phase 6 (DB/デプロイ) ← 一部残り
  ├── Phase 3 (LLM差替)    ← 完了
  └── Phase 7 (コード品質)  ← 完了
```

**最小リリースに必要**: Phase 1 + 2 + 3 + 4.1 + 6.1

---

## Phase 1: Manus固有コードの除去（リスク低） ✅ 完了

- [x] **1.1** `vite.config.ts`: Manusプラグイン削除
- [x] **1.2** `package.json`: Manusプラグイン削除
- [x] **1.3** `client/public/__manus__/` 削除
- [x] **1.4** `server/_core/dataApi.ts` 削除
- [x] **1.5** `server/_core/notification.ts`: LINE push通知に書き換え
- [x] **1.6** `server/_core/systemRouter.ts`: 新通知方式に更新
- [x] **1.7** `.env.example` 作成

---

## Phase 2: 認証システムの差し替え ✅ 完了

- [x] **2.1** 環境変数をGoogle OAuth用に変更
- [x] **2.2** `server/_core/sdk.ts` 全面書き換え
- [x] **2.3** `server/_core/oauth.ts` Google OAuth直接実装
- [x] **2.4** Manus型定義削除
- [x] **2.5** クライアント側ログインURL変更
- [x] **2.6** `useAuth.ts` 修正
- [x] **2.7** Cookie設定修正
- [x] **2.8** スキーマ対応

---

## Phase 3: LLM API差し替え ✅ 完了

- [x] **3.1** 環境変数リネーム
- [x] **3.2** `server/_core/llm.ts` 書き換え

---

## Phase 4: セキュリティ強化 ✅ 完了

### 4.1 データのユーザー分離
- [x] `drizzle/schema.ts`: folders, notes, projects に appUserId カラム追加
- [x] 全 `getAll*` 関数に appUserId フィルタ追加
- [x] update/delete系に所有権チェック追加
- [x] 全ルーターで `ctx.user.id` をDB関数に渡す

### 4.2 LINE署名検証
- [x] `LINE_CHANNEL_SECRET` 未設定時はリクエスト拒否（return false）
- [x] timing-safe comparison で検証

### 4.3 レート制限
- [x] カスタム sliding window 実装（express-rate-limit不使用）
- [x] OAuth: 10 req/min, LINE: 30 req/min, tRPC: 100 req/min

### 4.4 その他
- [x] ボディサイズ 1mb に制限
- [x] helmet によるセキュリティヘッダー
- [x] trust proxy 設定

---

## Phase 5: マルチユーザー & LINE連携 ✅ 完了

### 5.1 LINE-Webユーザー紐づけ
- [x] `line.generateLinkCode` → ユニークなリンクコード生成（5分有効）
- [x] LINEコマンド: `link <コード>` で紐づけ
- [x] Webアプリ: LINE連携画面にコード表示
- [x] 紐づけ時に既存データをバックフィル

### 5.2 LINEタスクのユーザー紐づけ
- [x] タスク作成時に `lineUser.appUserId` をセット
- [x] リマインダーをユーザー別に送信

---

## Phase 6: DB・デプロイ — 🔧 残り作業あり

### 6.1 データベース
- [x] DB接続リトライロジック追加（3回リトライ、指数バックオフ）
- [x] deleteFolder / deleteProject / linkLineUser にトランザクション追加
- [ ] 本番DB用意（PlanetScale / Neon / Supabase / Railway MySQL等）

### 6.2 タイムゾーン
- [x] scheduler.ts: JST (UTC+9) オフセット計算で対応済み

### 6.3 デプロイ
- [x] `Dockerfile` 作成済み
- [ ] Railway / Fly.io / VPS にデプロイ
- [ ] LINE Webhook URLを本番URLに変更
- [ ] Google OAuth のリダイレクトURIを本番URLに追加

---

## Phase 7: コード品質 ✅ 完了

- [x] `server/db.ts`: `as any` キャスト全廃 → `ResultSetHeader` 型付きヘルパー関数に
- [x] 未使用Manusモジュール削除済み（imageGeneration, map, voiceTranscription）
- [x] 入力バリデーション: 全ルーターでZod使用
- [x] `systemRouter.ts` のTODO解消（admin's linked LINE userId を渡すように修正）
- [x] テスト修正: LINE署名検証テスト、notes.addTaskFromCandidateテスト

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
