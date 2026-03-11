-- ============================================================================
-- Migration: Assign appUserId to all existing data
-- ============================================================================
-- 既存の appUserId = NULL のデータに所有者を設定する。
-- デプロイ前に YOUR_USER_ID を実際のユーザーIDに置換すること。
--
-- 手順:
-- 1. SELECT id, openId, name FROM users; で自分のIDを確認
-- 2. 下の @owner_id の値を自分のIDに変更
-- 3. 実行
-- ============================================================================

SET @owner_id = 1;  -- ← ここを自分の users.id に変更

UPDATE `tasks` SET `appUserId` = @owner_id WHERE `appUserId` IS NULL;
UPDATE `folders` SET `appUserId` = @owner_id WHERE `appUserId` IS NULL;
UPDATE `notes` SET `appUserId` = @owner_id WHERE `appUserId` IS NULL;
UPDATE `projects` SET `appUserId` = @owner_id WHERE `appUserId` IS NULL;
