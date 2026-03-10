# LINE Task Manager - TODO

## Phase 1: DB設計・マイグレーション
- [x] tasks テーブル（id, userId, title, note, status, priority, category, dueDate, sourceMessageId, createdAt, updatedAt）
- [x] messages テーブル（id, userId, sourceMessageId, rawText, createdAt）
- [x] reply_contexts テーブル（id, userId, taskIds, createdAt）
- [x] line_users テーブル（id, lineUserId, appUserId, createdAt）
- [x] DB マイグレーション実行（pnpm db:push）

## Phase 2: バックエンドAPI
- [x] LINE Channel Secret / Access Token 環境変数設定
- [x] LINE Webhook エンドポイント（/api/line/webhook）実装
- [x] LINE 署名検証ミドルウェア実装
- [x] LLM タスク抽出（JSON固定スキーマ）実装
- [x] タスク CRUD tRPC ルーター実装
- [x] LINE 返信・プッシュ通知送信ヘルパー実装
- [x] done N / undo N / list コマンド処理実装
- [x] 毎朝9:00 JST リマインダースケジューラ（node-cron）実装
- [x] 重複メッセージ防止（sourceMessageId ユニーク制約）

## Phase 3: フロントエンド（Webダッシュボード）
- [x] DashboardLayout 適用・サイドバーナビゲーション設定
- [x] タスク一覧ページ（テーブル表示）実装
- [x] 検索・フィルタ（status / priority / category / dueDate）機能
- [x] ソート（期限近い順・優先度順）機能
- [x] タスク詳細編集モーダル実装
- [x] 一覧からワンクリック完了切替
- [x] 期限切れタスクを上部に表示・赤色ハイライト
- [x] モバイル対応レスポンシブデザイン
- [x] LINE設定ページ（lineUserId 紐付け確認）

## Phase 4: テスト・仕上げ
- [x] Vitest ユニットテスト（LLM抽出・署名検証・コマンド処理）
- [x] 環境変数ドキュメント整備
- [x] チェックポイント保存

## バグ修正

- [x] LINE Webhook 500エラー修正（rawBody ミドルウェアの stream encoding 競合を express.raw() で解決）
- [x] LINE返信メッセージの日付フォーマット修正（UTC文字列 → MM/DD形式）
- [x] 優先度表示を P1/P2 → 高/中/低 に変更
- [x] Glassmorphism デザイン全面適用（index.css グローバルテーマ）
- [x] サイドバーをすりガラス＋グラデーション背景に変更
- [x] ダッシュボードページをガラスカードデザインに変更
- [x] タスク一覧ページをガラスカードデザインに変更
- [x] ログインページをガラスカードデザインに変更
- [x] LINE「リマインド」コマンドで未完了タスクを即時送信
- [x] Glassmorphism デザイン全面適用（Tasks.tsx・LineSettings.tsx）
- [x] ダッシュボードのLINEコマンドカードを削除
- [x] タスク一覧の文字色・コントラストを改善（見やすく）
- [x] タスク一覧の白文字を全て濃い色に修正（ヘッダー・検索・フィルタ・凡例）
- [x] ドラッグ&ドロップでタスク並び替え（@dnd-kit使用）
- [x] タスクの繰り返し設定（毎日/毎週/毎月/曜日指定）
- [x] 複数選択して一括削除
- [x] 完了タスクを一覧から自動非表示（デフォルト）

## 新機能追加（2026-02-27）
- [ ] Webダッシュボードの「＋」ボタンでタスク直接登録（タイトル・メモ・優先度・カテゴリ・期限・繰り返し設定）
- [ ] 繰り返しタスクの自動生成（完了時 or 朝リマインダー時に次回分を自動作成）
- [x] 朝リマインド時刻を9時→8時（JST）に変更

## メモ機能 & タスクフォルダー（2026-02-27）
- [x] notesテーブル追加（id, title, rawText, formattedText, tags, sourceLineUserId, createdAt）
- [x] foldersテーブル追加（id, name, color, icon, sortOrder, createdAt）
- [x] tasksテーブルにfolderId列追加
- [x] DBマイグレーション実行
- [x] tRPC: notes.create（AI整形・タスク候補抽出）/ notes.list / notes.byId / notes.delete
- [x] tRPC: folders.list / folders.create / folders.update / folders.delete
- [x] tRPC: tasks.moveToFolder（タスクのフォルダー移動）
- [x] LINE Webhook: #メモ プレフィックスでメモとして保存・AI整形してLINE返信
- [x] メモ一覧ページ（Notes.tsx）
- [x] メモ詳細・新規作成ページ（入力→AI整形→タスク候補確認→保存）
- [x] Tasks.tsxにフォルダーサイドバー追加（フォルダー別フィルタ）
- [x] サイドバーナビゲーションにメモ・フォルダー追加

## バグ修正（2026-02-27）
- [x] スマホでフォルダーサイドバーとタスクカードが横並びになりレイアウト崩れ → モバイルは横スクロールタグ形式に修正
- [x] メモページの白文字を濃い色に修正（視認性改善）

## プロジェクト管理機能（2026-02-27）
- [ ] DBにprojectsテーブル追加（id, title, description, status, dueDate, color, sortOrder, createdAt）
- [ ] tasks・notesテーブルにprojectId列追加（folderId廃止）
- [ ] DBマイグレーション実行
- [ ] tRPC: projects.list / projects.create / projects.update / projects.delete / projects.getById（進捗付き）
- [ ] tasks.tsルーターにprojectIdフィルター追加
- [ ] LINE Webhook: #プロジェクト名 タスク内容 でプロジェクトにタスク追加
- [ ] プロジェクト一覧ページ（Projects.tsx）：カード形式・進捗バー・ステータス
- [ ] プロジェクト詳細ページ（ProjectDetail.tsx）：タスク一覧＋メモ一覧
- [ ] Tasks.tsxのフォルダーサイドバーをプロジェクトフィルターに変更
- [ ] Notes.tsxにプロジェクト紐付け追加
- [ ] DashboardLayoutにプロジェクトページリンク追加
- [ ] App.tsxにプロジェクトルート追加

## 追加機能（2026-03-02）
- [ ] タスク新規作成モーダルにプロジェクト選択ドロップダウンを追加
- [ ] 朝リマインドにプロジェクト別進捗（進行中プロジェクトの完了率）を追加

## 一括フォルダ移動機能（2026-03-02）
- [x] Tasks.tsxの選択モードに「フォルダへ移動」ボタンを追加
- [x] フォルダ選択ポップアップ（インライン）を実装
- [x] server/routers/tasks.tsにbulkMoveToFolder APIを追加
- [x] server/db.tsにbulkMoveToFolderヘルパーを追加

## メモ詳細タスク候補UI（2026-03-02）
- [x] DBスキーマのnotesTableにtaskCandidatesカラムを追加
- [x] lineWebhook.tsでタスク候補をDBに保存する
- [x] server/routers/notes.tsにタスク候補取得・タスク追加APIを追加
- [x] Notes.tsxのメモ詳細にタスク候補UIを実装

## UI・機能改善（2026-03-02 その2）
- [x] LINE設定ページの文字色を修正（白文字→見やすい色）
- [x] プロジェクト詳細のタスク編集機能を追加
- [x] プロジェクトの備考を後から編集できる機能を追加
- [x] KPI管理機能をDBスキーマ・サーバー・UIに実装

## KPI AI自動入力機能（2026-03-02）
- [x] kpis.tsルーターにextractKpisFromText（AI抽出）とbulkCreate APIを追加
- [x] ProjectDetail.tsxのKPIセクションに「AIで入力」ボタンとテキスト入力モーダルを追加

## バグ修正（2026-03-02 その3）
- [x] プロジェクト詳細のタスク編集機能が動作しないバグを修正

## バグ修正（2026-03-02 その4）
- [x] KPI AI入力モーダルのテキストエリアが拡大してボタンが隠れるバグを修正

## 機能追加（2026-03-02 その5）
- [x] プロジェクト詳細でプロジェクト名をインライン編集できる機能を追加

## 事業計画書一括インポート機能（2026-03-03）
- [x] チェックポイント保存（実装前）
- [x] server/routers/projects.tsにextractFromDocument APIを追加（AI一括抽出）
- [x] server/routers/projects.tsにbulkImport APIを追加（一括DB登録）
- [x] Projects.tsxに「AIインポート」ボタンとモーダルUIを実装（テキスト入力→AI抽出→確認・選択→一括登録）

## バグ修正（2026-03-03）
- [x] 朝のリマインドがLINEに届かない問題を調査・修正（getPendingTasksForReminderにWebタスクを含める修正 + サーバー起動時に当日リマインド未送信なら即座に送信するロジックを追加）

## エラーチェック修正（2026-03-03）
- [x] Google Fontsの@importをindex.cssからindex.htmlの<link>タグに移動（PostCSS警告解消）
- [x] LSP tscウォッチのキャッシュ問題（tsBuildInfoFile）を解消
- [x] タスク一覧の日付表示がNaN/NaNになる問題を修正（toDateStr関数でDateオブジェクト・ISO文字列両対応）

## 大タスク・小タスク階層管理 + 並び替え（2026-03-04）
- [x] DBスキーマに parentTaskId カラムを追加しマイグレーション実行
- [x] db.tsに子タスク取得・作成・並び替えヘルパーを追加
- [x] routers/tasks.tsに子タスク・並び替えAPIを追加（allByProject・reorderーcreateにparentTaskId対応）
- [x] ProjectDetail.tsxに大タスク・小タスクの階層UIを実装（折りたたみ・小タスク追加ボタン）
- [x] ProjectDetail.tsxにドラッグ&ドロップ並び替えを実装（大タスク間・小タスク間内並び替え）
## バグ修正（2026-03-04）
- [x] アプリを開くと2回ux LINEメッセージが届くバグを修正（app_settingsテーブルで送信済み日付をDB永続化、サーバー再起動後も重複送信しないよう修正）