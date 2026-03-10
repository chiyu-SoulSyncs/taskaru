import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  ListTodo,
  RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading, refetch } = trpc.tasks.stats.useQuery();
  const triggerReminder = trpc.tasks.triggerReminder.useMutation({
    onSuccess: () => toast.success("リマインダーを送信しました"),
    onError: () => toast.error("送信に失敗しました"),
  });

  const statCards = [
    {
      label: "全タスク",
      value: stats?.total ?? 0,
      icon: ListTodo,
      gradient: "linear-gradient(135deg, oklch(0.58 0.20 275 / 0.80), oklch(0.65 0.17 225 / 0.80))",
      shadow: "oklch(0.50 0.20 275 / 0.25)",
    },
    {
      label: "未完了",
      value: (stats?.todo ?? 0) + (stats?.doing ?? 0),
      icon: Clock,
      gradient: "linear-gradient(135deg, oklch(0.60 0.18 220 / 0.80), oklch(0.68 0.15 195 / 0.80))",
      shadow: "oklch(0.50 0.18 220 / 0.25)",
    },
    {
      label: "完了済み",
      value: stats?.done ?? 0,
      icon: CheckCircle2,
      gradient: "linear-gradient(135deg, oklch(0.62 0.16 160 / 0.80), oklch(0.68 0.14 185 / 0.80))",
      shadow: "oklch(0.50 0.16 160 / 0.25)",
    },
    {
      label: "期限切れ",
      value: stats?.overdue ?? 0,
      icon: AlertTriangle,
      gradient: "linear-gradient(135deg, oklch(0.62 0.22 25 / 0.80), oklch(0.68 0.18 350 / 0.80))",
      shadow: "oklch(0.50 0.22 25 / 0.25)",
    },
    {
      label: "今日期限",
      value: stats?.dueToday ?? 0,
      icon: CalendarClock,
      gradient: "linear-gradient(135deg, oklch(0.70 0.18 80 / 0.80), oklch(0.72 0.16 55 / 0.80))",
      shadow: "oklch(0.55 0.18 80 / 0.25)",
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">ダッシュボード</h1>
            <p className="text-sm mt-0.5" style={{ color: "oklch(0.52 0.05 270)" }}>
              LINEタスク管理の概要
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-medium transition-all hover:bg-white/60"
            style={{ color: "oklch(0.40 0.08 270)" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />更新
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {statCards.map((card) => (
            <button
              key={card.label}
              onClick={() => setLocation("/tasks")}
              className="glass-card p-4 text-left group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium" style={{ color: "oklch(0.52 0.05 270)" }}>
                    {card.label}
                  </p>
                  <p
                    className="text-2xl font-bold mt-1"
                    style={{ color: "oklch(0.28 0.06 270)" }}
                  >
                    {isLoading ? "—" : card.value}
                  </p>
                </div>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: card.gradient,
                    boxShadow: `0 4px 12px ${card.shadow}`,
                  }}
                >
                  <card.icon className="h-4 w-4 text-white" />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Reminder */}
        <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, oklch(0.70 0.18 80 / 0.85), oklch(0.72 0.16 55 / 0.85))",
                }}
              >
                <Bell className="h-3.5 w-3.5 text-white" />
              </div>
              <h2 className="text-sm font-semibold" style={{ color: "oklch(0.28 0.06 270)" }}>
                リマインダー
              </h2>
            </div>
            <div
              className="rounded-xl p-3 space-y-2 mb-3"
              style={{ background: "oklch(1 0 0 / 0.40)" }}
            >
              {[
                { icon: Clock, text: "毎朝 8:00 JST に自動送信" },
                { icon: ListTodo, text: "未完了タスク最大10件" },
                { icon: AlertTriangle, text: "期限切れを優先表示" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "oklch(0.55 0.08 270)" }} />
                  <span className="text-sm" style={{ color: "oklch(0.45 0.05 270)" }}>{text}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => triggerReminder.mutate()}
              disabled={triggerReminder.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all glass hover:bg-white/60 disabled:opacity-50"
              style={{ color: "oklch(0.40 0.08 270)" }}
            >
              <Bell className="h-3.5 w-3.5" />
              {triggerReminder.isPending ? "送信中..." : "今すぐリマインダーを送信"}
            </button>
          </div>

        {/* CTA */}
        <div className="flex justify-center">
          <button
            onClick={() => setLocation("/tasks")}
            className="gradient-btn flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-white"
          >
            <ListTodo className="h-4 w-4" />
            タスク一覧を見る
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
