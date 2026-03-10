import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Users, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function LineSettings() {
  const { data: lineUsers = [], isLoading, refetch } = trpc.tasks.lineUsers.useQuery();
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/line/webhook`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      toast.success("コピーしました");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">LINE設定</h1>
          <p className="text-sm text-slate-500 mt-0.5">LINE Messaging API との連携設定</p>
        </div>

        {/* Webhook URL */}
        <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Webhook URL</h2>
          </div>

          <p className="text-sm text-slate-600">
            LINE Developers Console の「Messaging API」タブで以下のURLをWebhook URLとして設定してください。
          </p>

          <div className="flex gap-2">
            <Input
              value={webhookUrl}
              readOnly
              className="font-mono text-sm text-slate-700 flex-1 bg-slate-50"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={copyWebhookUrl}
              className="shrink-0 gap-1.5 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "コピー済み" : "コピー"}
            </Button>
          </div>

          {/* Setup steps */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-amber-700">設定手順</p>
            <ol className="space-y-1 text-xs text-amber-700/80">
              <li className="flex gap-2"><span className="text-amber-600 font-bold shrink-0">1.</span>LINE Developers Console にアクセス</li>
              <li className="flex gap-2"><span className="text-amber-600 font-bold shrink-0">2.</span>チャネル → Messaging API タブを開く</li>
              <li className="flex gap-2"><span className="text-amber-600 font-bold shrink-0">3.</span>Webhook URL に上記URLを貼り付け</li>
              <li className="flex gap-2"><span className="text-amber-600 font-bold shrink-0">4.</span>「Webhookの利用」をオンにする</li>
              <li className="flex gap-2"><span className="text-amber-600 font-bold shrink-0">5.</span>「検証」ボタンで接続確認</li>
            </ol>
          </div>

          <a
            href="https://developers.line.biz/console/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            LINE Developers Console を開く
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* LINE Commands Guide */}
        <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">使えるコマンド</h2>
          </div>

          <div className="space-y-2">
            {[
              { cmd: "（自由文）", desc: "AIがタスクに分割して登録", color: "from-violet-50 to-pink-50 border-violet-200 text-violet-700" },
              { cmd: "done N", desc: "番号Nのタスクを完了にする", color: "from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700" },
              { cmd: "undo N", desc: "番号Nのタスクを未完了に戻す", color: "from-sky-50 to-blue-50 border-sky-200 text-sky-700" },
              { cmd: "list", desc: "未完了タスクの一覧を表示", color: "from-amber-50 to-orange-50 border-amber-200 text-amber-700" },
              { cmd: "リマインド", desc: "残っているタスクを今すぐ確認", color: "from-rose-50 to-pink-50 border-rose-200 text-rose-700" },
              { cmd: "delete N", desc: "番号Nのタスクを削除する", color: "from-slate-50 to-gray-50 border-slate-200 text-slate-600" },
            ].map(({ cmd, desc, color }) => (
              <div key={cmd} className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${color} border`}>
                <code className="text-sm font-mono font-semibold shrink-0 min-w-[100px]">{cmd}</code>
                <span className="text-sm text-slate-600">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* LINE Users */}
        <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
                <Users className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-base font-semibold text-slate-800">LINEユーザー一覧</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 h-8 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              更新
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
            </div>
          ) : lineUsers.length === 0 ? (
            <div className="text-center py-10">
              <MessageCircle className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-500">まだLINEユーザーがいません</p>
              <p className="text-xs text-slate-400 mt-1">
                LINEからメッセージを送ると自動的に登録されます
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {lineUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shrink-0">
                      <MessageCircle className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {user.displayName ?? "（名前未取得）"}
                      </p>
                      <p className="text-xs text-slate-400 font-mono truncate">
                        {user.lineUserId}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border ${
                      user.appUserId
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {user.appUserId ? "連携済み" : "未連携"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Environment Variables Guide */}
        <div className="rounded-2xl border bg-white shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">環境変数の設定</h2>
          <p className="text-sm text-slate-600">
            LINE連携に必要な環境変数は管理画面の「Settings → Secrets」から設定できます。
          </p>
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
            <div className="flex items-start gap-3">
              <code className="text-emerald-600 font-semibold text-xs shrink-0">LINE_CHANNEL_SECRET</code>
              <span className="text-xs text-slate-500">チャネルシークレット（署名検証用）</span>
            </div>
            <div className="w-full h-px bg-slate-200" />
            <div className="flex items-start gap-3">
              <code className="text-emerald-600 font-semibold text-xs shrink-0">LINE_CHANNEL_ACCESS_TOKEN</code>
              <span className="text-xs text-slate-500">チャネルアクセストークン（送信用）</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
