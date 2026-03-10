import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Folder, CheckCircle2, Clock, PauseCircle, Trash2, ChevronRight, Calendar, Sparkles, Loader2, FileText, ListTodo, Target, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const COLOR_OPTIONS = [
  { value: "violet", label: "バイオレット", bg: "bg-violet-500" },
  { value: "blue", label: "ブルー", bg: "bg-blue-500" },
  { value: "green", label: "グリーン", bg: "bg-green-500" },
  { value: "orange", label: "オレンジ", bg: "bg-orange-500" },
  { value: "red", label: "レッド", bg: "bg-red-500" },
  { value: "pink", label: "ピンク", bg: "bg-pink-500" },
  { value: "teal", label: "ティール", bg: "bg-teal-500" },
  { value: "amber", label: "アンバー", bg: "bg-amber-500" },
];

const STATUS_CONFIG = {
  active: { label: "進行中", icon: Clock, color: "text-blue-600 bg-blue-50 border-blue-200" },
  completed: { label: "完了", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  on_hold: { label: "保留", icon: PauseCircle, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

function getColorBg(color: string) {
  const map: Record<string, string> = {
    violet: "bg-violet-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
    pink: "bg-pink-500",
    teal: "bg-teal-500",
    amber: "bg-amber-500",
  };
  return map[color] ?? "bg-violet-500";
}

function getColorLight(color: string) {
  const map: Record<string, string> = {
    violet: "bg-violet-50 border-violet-200",
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    orange: "bg-orange-50 border-orange-200",
    red: "bg-red-50 border-red-200",
    pink: "bg-pink-50 border-pink-200",
    teal: "bg-teal-50 border-teal-200",
    amber: "bg-amber-50 border-amber-200",
  };
  return map[color] ?? "bg-violet-50 border-violet-200";
}

// ─── AI Import Types ─────────────────────────────────────────────────────────

type ExtractedProject = {
  title: string;
  description: string;
  status: string;
  color: string;
};

type ExtractedTask = {
  title: string;
  priority: string;
  category: string;
  dueDate: string;
  projectIndex: number;
};

type ExtractedKpi = {
  title: string;
  unit: string;
  targetValue: number;
  currentValue: number;
  dueDate: string;
  note: string;
  projectIndex: number;
};

type ExtractedData = {
  projects: ExtractedProject[];
  tasks: ExtractedTask[];
  kpis: ExtractedKpi[];
};

// ─── AI Import Modal ──────────────────────────────────────────────────────────

function ImportModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [docText, setDocText] = useState("");
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);

  // 選択状態（デフォルト全選択）
  const [selectedProjects, setSelectedProjects] = useState<boolean[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<boolean[]>([]);
  const [selectedKpis, setSelectedKpis] = useState<boolean[]>([]);

  // セクション折りたたみ
  const [showTasks, setShowTasks] = useState(true);
  const [showKpis, setShowKpis] = useState(true);

  const extractMut = trpc.projects.extractFromDocument.useMutation({
    onSuccess: (data) => {
      setExtracted(data);
      setSelectedProjects(data.projects.map(() => true));
      setSelectedTasks(data.tasks.map(() => true));
      setSelectedKpis(data.kpis.map(() => true));
      setStep("confirm");
    },
    onError: () => toast.error("AI抽出に失敗しました。もう一度お試しください。"),
  });

  const bulkImportMut = trpc.projects.bulkImport.useMutation({
    onSuccess: (result) => {
      toast.success(`登録完了！プロジェクト${result.projectCount}件・タスク${result.taskCount}件・KPI${result.kpiCount}件を作成しました`);
      onSuccess();
      handleClose();
    },
    onError: () => toast.error("登録に失敗しました"),
  });

  const handleClose = () => {
    setStep("input");
    setDocText("");
    setExtracted(null);
    onClose();
  };

  const handleExtract = () => {
    if (!docText.trim()) return;
    extractMut.mutate({ text: docText.trim() });
  };

  const handleImport = () => {
    if (!extracted) return;
    const filteredProjects = extracted.projects.filter((_, i) => selectedProjects[i]);
    // projectIndexを再マッピング
    const projectIndexMap: Record<number, number> = {};
    let newIdx = 0;
    extracted.projects.forEach((_, oldIdx) => {
      if (selectedProjects[oldIdx]) {
        projectIndexMap[oldIdx] = newIdx++;
      }
    });

    const filteredTasks = extracted.tasks
      .filter((_, i) => selectedTasks[i])
      .map((t) => ({
        ...t,
        projectIndex: projectIndexMap[t.projectIndex] ?? 0,
        priority: (t.priority as "P1" | "P2" | "P3") ?? "P2",
      }));

    const filteredKpis = extracted.kpis
      .filter((_, i) => selectedKpis[i])
      .map((k) => ({
        ...k,
        projectIndex: projectIndexMap[k.projectIndex] ?? 0,
      }));

    bulkImportMut.mutate({
      projects: filteredProjects.map((p) => ({
        title: p.title,
        description: p.description,
        status: (p.status as "active" | "completed" | "on_hold") ?? "active",
        color: p.color ?? "violet",
      })),
      tasks: filteredTasks,
      kpis: filteredKpis,
    });
  };

  const priorityColor: Record<string, string> = {
    P1: "text-red-600 bg-red-50 border-red-200",
    P2: "text-amber-600 bg-amber-50 border-amber-200",
    P3: "text-slate-600 bg-slate-50 border-slate-200",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <Sparkles className="w-5 h-5 text-violet-500" />
            計画書から一括インポート
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <>
            <div className="flex-1 overflow-y-auto py-2 space-y-4">
              <p className="text-sm text-slate-600">
                事業計画書・プロジェクト計画書のテキストを貼り付けてください。AIがプロジェクト・タスク・KPIを自動で抽出します。
              </p>
              <Textarea
                placeholder="事業計画書のテキストをここに貼り付けてください..."
                value={docText}
                onChange={(e) => setDocText(e.target.value)}
                className="text-slate-800 resize-none text-sm"
                rows={14}
              />
              <p className="text-xs text-slate-400">最大20,000文字 · 現在: {docText.length.toLocaleString()}文字</p>
            </div>
            <DialogFooter className="flex-shrink-0">
              <Button variant="outline" onClick={handleClose} className="text-slate-700">
                キャンセル
              </Button>
              <Button
                onClick={handleExtract}
                disabled={!docText.trim() || extractMut.isPending}
                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                {extractMut.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI解析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AIで抽出
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && extracted && (
          <>
            <div className="flex-1 overflow-y-auto py-2 space-y-5 min-h-0">
              <p className="text-sm text-slate-600">
                抽出結果を確認して、登録する項目を選択してください。
              </p>

              {/* Projects */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-violet-500" />
                  <h3 className="text-sm font-semibold text-slate-700">プロジェクト ({extracted.projects.length}件)</h3>
                </div>
                <div className="space-y-2">
                  {extracted.projects.map((p, i) => (
                    <label key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-50">
                      <Checkbox
                        checked={selectedProjects[i] ?? true}
                        onCheckedChange={(v) => {
                          const next = [...selectedProjects];
                          next[i] = !!v;
                          setSelectedProjects(next);
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getColorBg(p.color)}`} />
                          <span className="text-sm font-medium text-slate-800">{p.title}</span>
                        </div>
                        {p.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* Tasks */}
              <section>
                <button
                  className="flex items-center gap-2 mb-2 w-full text-left"
                  onClick={() => setShowTasks(!showTasks)}
                >
                  <ListTodo className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-700">タスク ({extracted.tasks.length}件)</h3>
                  <span className="text-xs text-slate-400 ml-1">({selectedTasks.filter(Boolean).length}件選択)</span>
                  <div className="ml-auto">
                    {showTasks ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {showTasks && (
                  <>
                    <div className="flex gap-2 mb-2">
                      <button className="text-xs text-violet-600 hover:underline" onClick={() => setSelectedTasks(extracted.tasks.map(() => true))}>全選択</button>
                      <span className="text-xs text-slate-300">|</span>
                      <button className="text-xs text-slate-500 hover:underline" onClick={() => setSelectedTasks(extracted.tasks.map(() => false))}>全解除</button>
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {extracted.tasks.map((t, i) => (
                        <label key={i} className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-50">
                          <Checkbox
                            checked={selectedTasks[i] ?? true}
                            onCheckedChange={(v) => {
                              const next = [...selectedTasks];
                              next[i] = !!v;
                              setSelectedTasks(next);
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-slate-800">{t.title}</span>
                              <Badge variant="outline" className={`text-xs px-1.5 py-0 border ${priorityColor[t.priority] ?? priorityColor.P2}`}>
                                {t.priority}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                              <span>{t.category}</span>
                              {t.dueDate && <span>· {t.dueDate}</span>}
                              <span>· プロジェクト{t.projectIndex + 1}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* KPIs */}
              <section>
                <button
                  className="flex items-center gap-2 mb-2 w-full text-left"
                  onClick={() => setShowKpis(!showKpis)}
                >
                  <Target className="w-4 h-4 text-green-500" />
                  <h3 className="text-sm font-semibold text-slate-700">KPI ({extracted.kpis.length}件)</h3>
                  <span className="text-xs text-slate-400 ml-1">({selectedKpis.filter(Boolean).length}件選択)</span>
                  <div className="ml-auto">
                    {showKpis ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {showKpis && (
                  <>
                    <div className="flex gap-2 mb-2">
                      <button className="text-xs text-violet-600 hover:underline" onClick={() => setSelectedKpis(extracted.kpis.map(() => true))}>全選択</button>
                      <span className="text-xs text-slate-300">|</span>
                      <button className="text-xs text-slate-500 hover:underline" onClick={() => setSelectedKpis(extracted.kpis.map(() => false))}>全解除</button>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {extracted.kpis.map((k, i) => (
                        <label key={i} className="flex items-start gap-3 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-50">
                          <Checkbox
                            checked={selectedKpis[i] ?? true}
                            onCheckedChange={(v) => {
                              const next = [...selectedKpis];
                              next[i] = !!v;
                              setSelectedKpis(next);
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-slate-800">{k.title}</span>
                              <span className="text-xs text-slate-500">目標: {k.targetValue}{k.unit}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                              {k.dueDate && <span>期限: {k.dueDate}</span>}
                              <span>· プロジェクト{k.projectIndex + 1}</span>
                              {k.note && <span>· {k.note}</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>

            <DialogFooter className="flex-shrink-0 gap-2">
              <Button variant="outline" onClick={() => setStep("input")} className="text-slate-700">
                戻る
              </Button>
              <Button
                onClick={handleImport}
                disabled={bulkImportMut.isPending || selectedProjects.filter(Boolean).length === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                {bulkImportMut.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    登録中...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {selectedProjects.filter(Boolean).length}件のプロジェクトを登録
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Projects() {
  const utils = trpc.useUtils();

  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("violet");
  const [newStatus, setNewStatus] = useState<"active" | "completed" | "on_hold">("active");
  const [newDueDate, setNewDueDate] = useState("");

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setNewColor("violet");
      setNewStatus("active");
      setNewDueDate("");
      toast.success("プロジェクトを作成しました");
    },
    onError: () => toast.error("作成に失敗しました"),
  });

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("プロジェクトを削除しました");
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      color: newColor,
      status: newStatus,
      dueDate: newDueDate ? new Date(newDueDate) : null,
    });
  };

  const activeProjects = projects.filter((p) => p.status === "active");
  const onHoldProjects = projects.filter((p) => p.status === "on_hold");
  const completedProjects = projects.filter((p) => p.status === "completed");

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">プロジェクト</h1>
            <p className="text-sm text-slate-500 mt-0.5">大テーマを管理してタスクを整理</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowImport(true)}
              className="text-violet-700 border-violet-200 hover:bg-violet-50 gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              AIインポート
            </Button>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            >
              <Plus className="w-4 h-4" />
              新規
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <Folder className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">プロジェクトがまだありません</p>
            <p className="text-slate-400 text-sm mt-1">「新規」ボタンで大テーマを作成しましょう</p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowImport(true)}
                className="text-violet-700 border-violet-200 hover:bg-violet-50 gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                計画書からAIインポート
              </Button>
              <Button
                onClick={() => setShowCreate(true)}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                手動で作成
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Projects */}
            {activeProjects.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  進行中 ({activeProjects.length})
                </h2>
                <div className="space-y-3">
                  {activeProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={() => deleteMutation.mutate({ id: project.id })}
                      onStatusChange={(status) => updateMutation.mutate({ id: project.id, status })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* On Hold Projects */}
            {onHoldProjects.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  保留中 ({onHoldProjects.length})
                </h2>
                <div className="space-y-3">
                  {onHoldProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={() => deleteMutation.mutate({ id: project.id })}
                      onStatusChange={(status) => updateMutation.mutate({ id: project.id, status })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Projects */}
            {completedProjects.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  完了済み ({completedProjects.length})
                </h2>
                <div className="space-y-3 opacity-70">
                  {completedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={() => deleteMutation.mutate({ id: project.id })}
                      onStatusChange={(status) => updateMutation.mutate({ id: project.id, status })}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-800">新規プロジェクト</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">
                  プロジェクト名 <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="例: 事務所引越し"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="text-slate-800"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">説明（任意）</label>
                <Textarea
                  placeholder="このプロジェクトの概要や目標を書いてください"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="text-slate-800 resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">ステータス</label>
                  <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                    <SelectTrigger className="text-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">進行中</SelectItem>
                      <SelectItem value="on_hold">保留</SelectItem>
                      <SelectItem value="completed">完了</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">カラー</label>
                  <Select value={newColor} onValueChange={setNewColor}>
                    <SelectTrigger className="text-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${c.bg}`} />
                            {c.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">期限（任意）</label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="text-slate-800"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)} className="text-slate-700">
                キャンセル
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newTitle.trim() || createMutation.isPending}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {createMutation.isPending ? "作成中..." : "作成"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI Import Modal */}
        <ImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          onSuccess={() => utils.projects.list.invalidate()}
        />
      </div>
    </DashboardLayout>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

type ProjectWithProgress = {
  id: number;
  title: string;
  description?: string | null;
  status: "active" | "completed" | "on_hold";
  color: string;
  dueDate?: Date | string | null;
  total: number;
  done: number;
  percent: number;
};

function ProjectCard({
  project,
  onDelete,
  onStatusChange,
}: {
  project: ProjectWithProgress;
  onDelete: () => void;
  onStatusChange: (status: "active" | "completed" | "on_hold") => void;
}) {
  const statusCfg = STATUS_CONFIG[project.status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className={`rounded-xl border p-4 bg-white shadow-sm hover:shadow-md transition-shadow ${getColorLight(project.color)}`}>
      <div className="flex items-start gap-3">
        {/* Color dot */}
        <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${getColorBg(project.color)}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/projects/${project.id}`}>
              <span className="font-semibold text-slate-800 hover:text-violet-700 cursor-pointer">
                {project.title}
              </span>
            </Link>
            <Badge variant="outline" className={`text-xs px-2 py-0.5 border ${statusCfg.color}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusCfg.label}
            </Badge>
          </div>

          {project.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{project.description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>{project.done}/{project.total} タスク完了</span>
              <span>{project.percent}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getColorBg(project.color)}`}
                style={{ width: `${project.percent}%` }}
              />
            </div>
          </div>

          {/* Due date */}
          {project.dueDate && (
            <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
              <Calendar className="w-3 h-3" />
              <span>期限: {new Date(project.dueDate).toLocaleDateString("ja-JP")}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Select value={project.status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-7 w-24 text-xs border-0 bg-transparent text-slate-600 px-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">進行中</SelectItem>
              <SelectItem value="on_hold">保留</SelectItem>
              <SelectItem value="completed">完了</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-red-500"
            onClick={(e) => {
              e.preventDefault();
              if (confirm(`「${project.title}」を削除しますか？`)) onDelete();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Link href={`/projects/${project.id}`}>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-violet-600">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
