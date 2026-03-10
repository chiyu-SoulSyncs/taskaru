import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  CheckSquare,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Plus,
  Square,
  Sparkles,
  Tag,
  Trash2,
  X,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type TaskCandidate = {
  title: string;
  priority: "P1" | "P2" | "P3";
  category: string;
};

type PreviewResult = {
  title: string;
  formattedText: string;
  tags: string[];
  taskCandidates: TaskCandidate[];
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-rose-100 text-rose-700 border-rose-200",
  P2: "bg-amber-100 text-amber-700 border-amber-200",
  P3: "bg-slate-100 text-slate-600 border-slate-200",
};

const PRIORITY_LABEL: Record<string, string> = {
  P1: "緊急",
  P2: "通常",
  P3: "低",
};

// ─── Task Candidate Row ───────────────────────────────────────────────────────
function CandidateRow({
  candidate,
  index,
  selected,
  onToggle,
  onAdd,
  isAdding,
}: {
  candidate: TaskCandidate;
  index: number;
  selected: boolean;
  onToggle: (idx: number) => void;
  onAdd?: (idx: number) => void;
  isAdding?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
        selected
          ? "bg-sky-50 border-sky-200"
          : "bg-white/40 border-slate-200 opacity-60"
      }`}
    >
      <button
        onClick={() => onToggle(index)}
        className="shrink-0 focus:outline-none"
        aria-label={selected ? "選択解除" : "選択"}
      >
        {selected ? (
          <CheckSquare className="h-4 w-4 text-sky-500" />
        ) : (
          <Square className="h-4 w-4 text-slate-300" />
        )}
      </button>
      <span className="flex-1 text-sm text-slate-700">{candidate.title}</span>
      <span
        className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${PRIORITY_COLORS[candidate.priority]}`}
      >
        {PRIORITY_LABEL[candidate.priority] ?? candidate.priority}
      </span>
      <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{candidate.category}</span>
      {onAdd && (
        <button
          onClick={() => onAdd(index)}
          disabled={isAdding}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, oklch(0.55 0.18 250), oklch(0.62 0.15 200))" }}
          aria-label="タスクに追加"
        >
          {isAdding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Plus className="h-3 w-3" />
              追加
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Note Detail Task Candidates Section ─────────────────────────────────────
function NoteDetailCandidates({
  noteId,
  candidates,
  onUpdated,
}: {
  noteId: number;
  candidates: TaskCandidate[];
  onUpdated: () => void;
}) {
  const utils = trpc.useUtils();
  const [addingIdx, setAddingIdx] = useState<number | null>(null);

  const addMut = trpc.notes.addTaskFromCandidate.useMutation({
    onSuccess: () => {
      toast.success("タスクを追加しました");
      utils.notes.list.invalidate();
      utils.notes.byId.invalidate({ id: noteId });
      onUpdated();
    },
    onError: () => toast.error("タスクの追加に失敗しました"),
    onSettled: () => setAddingIdx(null),
  });

  if (candidates.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, oklch(0.55 0.18 250), oklch(0.62 0.15 200))" }}
        >
          <ListChecks className="h-3.5 w-3.5 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-slate-700">タスク候補</h3>
        <span className="text-xs text-slate-400 ml-auto">{candidates.length}件</span>
      </div>
      <p className="text-xs text-slate-400">
        「追加」ボタンを押すとタスク一覧に登録されます
      </p>
      <div className="space-y-2">
        {candidates.map((c, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white/50 transition-all hover:bg-white/70"
          >
            <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            <span className="flex-1 text-sm text-slate-700">{c.title}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${PRIORITY_COLORS[c.priority as string]}`}
            >
              {PRIORITY_LABEL[c.priority as string] ?? c.priority}
            </span>
            <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{c.category}</span>
            <button
              onClick={() => {
                setAddingIdx(idx);
                addMut.mutate({
                  noteId,
                  candidateIndex: idx,
                  title: c.title,
                  priority: c.priority,
                  category: c.category,
                });
              }}
              disabled={addMut.isPending && addingIdx === idx}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, oklch(0.55 0.18 250), oklch(0.62 0.15 200))" }}
            >
              {addMut.isPending && addingIdx === idx ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  追加
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Notes() {
  const { data: notes = [], isLoading, refetch } = trpc.notes.list.useQuery();
  const previewMutation = trpc.notes.preview.useMutation();
  const createMutation = trpc.notes.create.useMutation({
    onSuccess: () => {
      toast.success("メモを保存しました");
      refetch();
      resetForm();
    },
    onError: () => toast.error("保存に失敗しました"),
  });
  const deleteMutation = trpc.notes.delete.useMutation({
    onSuccess: () => {
      toast.success("メモを削除しました");
      refetch();
    },
  });

  const [mode, setMode] = useState<"list" | "new" | "preview" | "detail">("list");
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState<number[]>([]);
  const [selectedNote, setSelectedNote] = useState<(typeof notes)[0] | null>(null);

  // Refresh selected note from list when updated
  function refreshSelectedNote() {
    refetch().then((res) => {
      if (selectedNote && res.data) {
        const updated = res.data.find((n) => n.id === selectedNote.id);
        if (updated) setSelectedNote(updated);
      }
    });
  }

  function resetForm() {
    setMode("list");
    setRawText("");
    setPreview(null);
    setSelectedTaskIndices([]);
  }

  async function handlePreview() {
    if (!rawText.trim()) return;
    try {
      const result = await previewMutation.mutateAsync({ rawText });
      setPreview(result);
      setSelectedTaskIndices(result.taskCandidates.map((_, i) => i));
      setMode("preview");
    } catch {
      toast.error("AI整形に失敗しました");
    }
  }

  async function handleSave() {
    if (!rawText.trim()) return;
    await createMutation.mutateAsync({ rawText, selectedTaskIndices });
  }

  function toggleTaskCandidate(idx: number) {
    setSelectedTaskIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">メモ</h1>
            <p className="text-sm mt-0.5" style={{ color: "oklch(0.52 0.05 270)" }}>
              思いついたことをAIが整理・タスク化
            </p>
          </div>
          {mode === "list" && (
            <Button
              onClick={() => setMode("new")}
              className="gap-2 gradient-btn text-white border-0"
            >
              <Plus className="h-4 w-4" />
              新規メモ
            </Button>
          )}
          {mode !== "list" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetForm}
              className="gap-1.5 text-slate-500 hover:text-slate-700 hover:bg-white/40"
            >
              <X className="h-4 w-4" />
              キャンセル
            </Button>
          )}
        </div>

        {/* ── New Memo Input ── */}
        {mode === "new" && (
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-base font-semibold text-slate-700">メモを入力</h2>
            </div>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="思いついたことをそのまま書いてください。AIが整理してタスク候補を提案します。&#10;&#10;例: 来週のプレゼに向けて資料をまとめる必要がある。まずデータを集めて、グラフを作成して、最後にスライドにまとめる。デザインはシンプルにして見やすくすることを意識する。"
              className="min-h-[200px] bg-white/60 border-slate-200 text-slate-700 placeholder:text-slate-400 resize-none focus:border-violet-400 focus:ring-violet-400/20"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                LINEから送る場合は「#メモ 内容...」と入力してください
              </p>
              <Button
                onClick={handlePreview}
                disabled={!rawText.trim() || previewMutation.isPending}
                className="gap-2 gradient-btn text-white border-0"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AIで整形する
              </Button>
            </div>
          </div>
        )}

        {/* ── AI Preview & Confirm ── */}
        {mode === "preview" && preview && (
          <div className="space-y-4">
            {/* Formatted result */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-700">整形結果</h2>
              </div>
              <h3 className="text-lg font-bold text-slate-800">{preview.title}</h3>
              {preview.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed">
                <Streamdown>{preview.formattedText}</Streamdown>
              </div>
            </div>

            {/* Task candidates */}
            {preview.taskCandidates.length > 0 && (
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
                      <CheckSquare className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-base font-semibold text-slate-700">タスク候補</h2>
                  </div>
                  <span className="text-xs text-slate-400">
                    {selectedTaskIndices.length}/{preview.taskCandidates.length} 件選択
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  保存時にタスクとして登録するものにチェックを入れてください（未選択は後でメモ詳細から追加できます）
                </p>
                <div className="space-y-2">
                  {preview.taskCandidates.map((candidate, idx) => (
                    <CandidateRow
                      key={idx}
                      candidate={candidate}
                      index={idx}
                      selected={selectedTaskIndices.includes(idx)}
                      onToggle={toggleTaskCandidate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={() => setMode("new")}
                className="text-slate-500 hover:text-slate-700 hover:bg-white/40"
              >
                編集に戻る
              </Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending}
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BookOpen className="h-4 w-4" />
                )}
                保存する
                {selectedTaskIndices.length > 0 &&
                  `（タスク ${selectedTaskIndices.length} 件も登録）`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Note Detail ── */}
        {mode === "detail" && selectedNote && (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">{selectedNote.title}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {new Date(selectedNote.createdAt).toLocaleDateString("ja-JP")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      deleteMutation.mutate({ id: selectedNote.id });
                      setMode("list");
                    }}
                    className="h-7 w-7 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {Array.isArray(selectedNote.tags) && (selectedNote.tags as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(selectedNote.tags as string[]).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed">
                <Streamdown>{selectedNote.formattedText}</Streamdown>
              </div>
              {Array.isArray(selectedNote.extractedTaskIds) &&
                (selectedNote.extractedTaskIds as number[]).length > 0 && (
                  <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
                    ✅ タスク {(selectedNote.extractedTaskIds as number[]).length} 件を登録済み
                  </p>
                )}
            </div>

            {/* Task candidates section */}
            {Array.isArray(selectedNote.taskCandidates) &&
              (selectedNote.taskCandidates as TaskCandidate[]).length > 0 && (
                <div className="glass-card rounded-2xl p-6">
                  <NoteDetailCandidates
                    noteId={selectedNote.id}
                    candidates={selectedNote.taskCandidates as TaskCandidate[]}
                    onUpdated={refreshSelectedNote}
                  />
                </div>
              )}
          </div>
        )}

        {/* ── Notes List ── */}
        {mode === "list" && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-20">
                <FileText className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 text-sm">まだメモがありません</p>
                <p className="text-slate-300 text-xs mt-1">
                  「新規メモ」ボタンから追加するか、LINEで「#メモ 内容...」と送ってください
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => {
                  const candidateCount = Array.isArray(note.taskCandidates)
                    ? (note.taskCandidates as TaskCandidate[]).length
                    : 0;
                  return (
                    <button
                      key={note.id}
                      onClick={() => {
                        setSelectedNote(note);
                        setMode("detail");
                      }}
                      className="w-full glass-card rounded-2xl p-4 text-left hover:bg-white/60 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm font-semibold text-slate-700 truncate">{note.title}</p>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {note.rawText}
                          </p>
                          <div className="flex items-center gap-3 pt-0.5">
                            {Array.isArray(note.tags) && (note.tags as string[]).length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {(note.tags as string[]).slice(0, 3).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 border-violet-200 text-violet-600 bg-violet-50"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {candidateCount > 0 && (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200">
                                <ListChecks className="h-2.5 w-2.5" />
                                候補 {candidateCount}件
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[10px] text-slate-400 ml-auto shrink-0">
                              <Clock className="h-2.5 w-2.5" />
                              {new Date(note.createdAt).toLocaleDateString("ja-JP")}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0 mt-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
