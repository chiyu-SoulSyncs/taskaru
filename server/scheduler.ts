import cron from "node-cron";
import {
  getAllLineUsers,
  getPendingTasksForReminder,
  getRepeatableCompletedTasks,
  createTask,
  getAppSetting,
  setAppSetting,
} from "./db";
import { buildReminderMessage, buildTextMessage, pushMessage } from "./line";

let schedulerStarted = false;

// DB key for persisting last reminder date
const LAST_REMINDER_KEY = "last_reminder_date";

export function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Every day at 08:00 JST (= 23:00 UTC previous day)
  cron.schedule(
    "0 23 * * *",
    async () => {
      const jstDate = getJSTDateString();
      console.log(`[Scheduler] Running morning reminder job for ${jstDate}`);
      await setAppSetting(LAST_REMINDER_KEY, jstDate);
      await generateRepeatTasks();
      await sendMorningReminders();
    },
    { timezone: "UTC" }
  );

  console.log("[Scheduler] Morning reminder scheduled at 08:00 JST (23:00 UTC)");

  // サーバー起動時に当日8:00 JSTを過ぎていたら即座にリマインドを送信
  // （サンドボックスのハイバネートでcronが発火しなかった場合の補完）
  // DBから送信済み日付を読み込んで判定するため、再起動後も重複送信しない
  checkAndSendMissedReminder();
}

function getJSTDateString(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function checkAndSendMissedReminder() {
  try {
    const now = new Date();
    // JSTの現在時刻
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const jstHour = jstNow.getUTCHours();
    const jstDate = jstNow.toISOString().slice(0, 10);

    // DBから最後に送信した日付を取得
    const lastReminderDate = await getAppSetting(LAST_REMINDER_KEY);

    // 8:00〜23:59 JSTの間で、まだ当日のリマインドを送っていない場合
    if (jstHour >= 8 && lastReminderDate !== jstDate) {
      console.log(`[Scheduler] Missed reminder detected for ${jstDate} (JST hour: ${jstHour}). Sending now...`);
      await setAppSetting(LAST_REMINDER_KEY, jstDate);
      await generateRepeatTasks();
      await sendMorningReminders();
    } else {
      console.log(`[Scheduler] No missed reminder (JST hour: ${jstHour}, lastSent: ${lastReminderDate || 'never'})`);
    }
  } catch (e) {
    console.error("[Scheduler] Error in checkAndSendMissedReminder:", e);
  }
}

/**
 * 繰り返し設定のある完了済みタスクを次回分として自動生成する。
 * - daily: 毎日実行
 * - weekly: 今日の曜日が repeatDays に含まれる場合のみ生成
 * - monthly: 今日が元タスクの dueDate と同じ日付の場合のみ生成
 */
export async function generateRepeatTasks() {
  try {
    const repeatTasks = await getRepeatableCompletedTasks();
    if (repeatTasks.length === 0) return;

    const now = new Date();
    // JST = UTC+9
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayJST = jstNow.toISOString().slice(0, 10); // YYYY-MM-DD
    const todayWeekday = jstNow.getUTCDay(); // 0=Sun, 6=Sat
    const todayDayOfMonth = jstNow.getUTCDate();

    let generated = 0;

    for (const task of repeatTasks) {
      let shouldGenerate = false;

      if (task.repeatType === "daily") {
        shouldGenerate = true;
      } else if (task.repeatType === "weekly") {
        const days = Array.isArray(task.repeatDays) ? (task.repeatDays as number[]) : [];
        shouldGenerate = days.includes(todayWeekday);
      } else if (task.repeatType === "monthly") {
        // 元タスクの dueDate の日付と今日の日付が一致する場合
        const originalDay = task.dueDate
          ? new Date(String(task.dueDate)).getUTCDate()
          : null;
        shouldGenerate = originalDay !== null && originalDay === todayDayOfMonth;
      }

      if (!shouldGenerate) continue;

      // 次回の dueDate を計算
      let nextDueDate: Date | null = null;
      if (task.repeatType === "daily") {
        nextDueDate = new Date(todayJST);
      } else if (task.repeatType === "weekly") {
        nextDueDate = new Date(todayJST);
      } else if (task.repeatType === "monthly") {
        // 翌月同日
        const d = new Date(todayJST);
        d.setUTCMonth(d.getUTCMonth() + 1);
        nextDueDate = d;
      }

      await createTask({
        title: task.title,
        note: task.note,
        priority: task.priority,
        category: task.category,
        dueDate: nextDueDate,
        repeatType: task.repeatType,
        repeatDays: Array.isArray(task.repeatDays) ? (task.repeatDays as number[]) : null,
        lineUserId: task.lineUserId,
        appUserId: task.appUserId,
        sortOrder: task.sortOrder,
      });

      generated++;
      console.log(`[Scheduler] Generated repeat task: "${task.title}" (${task.repeatType})`);
    }

    if (generated > 0) {
      console.log(`[Scheduler] Generated ${generated} repeat task(s)`);
    }
  } catch (e) {
    console.error("[Scheduler] Error generating repeat tasks:", e);
  }
}

export async function sendMorningReminders() {
  try {
    const lineUsers = await getAllLineUsers();
    console.log(`[Scheduler] Sending reminders to ${lineUsers.length} LINE users`);

    for (const lineUser of lineUsers) {
      try {
        const pendingTasks = await getPendingTasksForReminder(lineUser.lineUserId);
        if (pendingTasks.length === 0) {
          console.log(`[Scheduler] No pending tasks for ${lineUser.lineUserId}`);
          continue;
        }

        const msg = buildReminderMessage(
          pendingTasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate ? String(t.dueDate) : null,
            priority: t.priority,
          }))
        );

        await pushMessage(lineUser.lineUserId, [buildTextMessage(msg)]);
        console.log(
          `[Scheduler] Sent reminder to ${lineUser.lineUserId} (${pendingTasks.length} tasks)`
        );
      } catch (e) {
        console.error(`[Scheduler] Error sending to ${lineUser.lineUserId}:`, e);
      }
    }
  } catch (e) {
    console.error("[Scheduler] Fatal error in reminder job:", e);
  }
}
