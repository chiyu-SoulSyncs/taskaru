import React, { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Folder, FolderPlus, FolderOpen, X as XIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  RefreshCw,
  Search,
  Filter,
  X,
  RepeatIcon,
  ChevronDown,
  ChevronUp,
  Plus,
  FolderKanban,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** DateオブジェクトまたはISO文字列を "YYYY-MM-DD" 形式に変換する */
function toDateStr(d: string | Date | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) {
    // JST offset (+9h) を考慮してローカル日付文字列を返す
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }
  const s = String(d);
  // ISO形式 "2026-03-17T..." → slice(0,10)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // その他の形式はDateコンストラクタで解析
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const jst = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }
  return "";
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Task = {
  id: number;
  title: string;
  note: string | null;
  status: "todo" | "doing" | "done";
  priority: "P1" | "P2" | "P3";
  category: string;
  dueDate: string | Date | null;
  sortOrder: number;
  repeatType: "none" | "daily" | "weekly" | "monthly";
  repeatDays: unknown;
  folderId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type FolderItem = {
  id: number;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectItem = {
  id: number;
  title: string;
  color: string;
  status: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIORITY_LABELS: Record<string, string> = { P1: "緊急", P2: "通常", P3: "低" };
const STATUS_LABELS: Record<string, string> = { todo: "未着手", doing: "進行中", done: "完了" };
const REPEAT_LABELS: Record<string, string> = {
  none: "繰り返しなし",
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// ─── Badge Components ─────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === "P1"
      ? "bg-rose-100 text-rose-600 border-rose-200"
      : priority === "P2"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "done"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : status === "doing"
      ? "bg-sky-100 text-sky-700 border-sky-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [category, setCategory] = useState(task.category);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? toDateStr(task.dueDate) : ""
  );
  const [repeatType, setRepeatType] = useState<"none" | "daily" | "weekly" | "monthly">(
    task.repeatType ?? "none"
  );
  const [repeatDays, setRepeatDays] = useState<number[]>(
    Array.isArray(task.repeatDays) ? (task.repeatDays as number[]) : []
  );

  const utils = trpc.useUtils();
  const updateMut = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.stats.invalidate();
      toast.success("タスクを更新しました");
      onSaved();
    },
    onError: () => toast.error("更新に失敗しました"),
  });
  const repeatMut = trpc.tasks.updateRepeat.useMutation();

  const handleSave = async () => {
    await updateMut.mutateAsync({
      id: task.id,
      title,
      note: note || null,
      status,
      priority,
      category,
      dueDate: dueDate || null,
    });
    await repeatMut.mutateAsync({ id: task.id, repeatType, repeatDays });
  };

  const toggleDay = (d: number) => {
    setRepeatDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const inputCls =
    "w-full px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white/70 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0.15 0.05 270 / 0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4"
        style={{ background: "oklch(1 0 0 / 0.92)", border: "1px solid oklch(1 0 0 / 0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-700">タスクを編集</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <div>
          <label className={labelCls}>タイトル</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {/* Note */}
        <div>
          <label className={labelCls}>メモ</label>
          <textarea
            className={inputCls}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Status / Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>ステータス</label>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="todo">未着手</option>
              <option value="doing">進行中</option>
              <option value="done">完了</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>優先度</label>
            <select
              className={inputCls}
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="P1">緊急</option>
              <option value="P2">通常</option>
              <option value="P3">低</option>
            </select>
          </div>
        </div>

        {/* Category / DueDate */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>カテゴリ</label>
            <input
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>期限</label>
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {/* Repeat */}
        <div>
          <label className={labelCls}>
            <RepeatIcon className="inline h-3 w-3 mr-1" />
            繰り返し
          </label>
          <select
            className={inputCls}
            value={repeatType}
            onChange={(e) => setRepeatType(e.target.value as typeof repeatType)}
          >
            <option value="none">繰り返しなし</option>
            <option value="daily">毎日</option>
            <option value="weekly">毎週（曜日指定）</option>
            <option value="monthly">毎月（同日）</option>
          </select>
          {repeatType === "weekly" && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-8 h-8 rounded-full text-xs font-semibold border transition-all ${
                    repeatDays.includes(i)
                      ? "bg-violet-500 text-white border-violet-500"
                      : "bg-white text-slate-500 border-slate-200 hover:border-violet-300"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-500 border border-slate-200 bg-white/60 hover:bg-white/80 transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={updateMut.isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, oklch(0.58 0.20 275), oklch(0.65 0.17 225))" }}
          >
            {updateMut.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Task Card ───────────────────────────────────────────────────────
function SortableTaskCard({
  task,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  isSelectMode,
}: {
  task: Task;
  selected: boolean;
  onSelect: (id: number) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
  isSelectMode: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const today = new Date().toISOString().slice(0, 10);
  const dueDateStr = task.dueDate ? toDateStr(task.dueDate) : null;
  const isOverdue = dueDateStr && dueDateStr < today && task.status !== "done";
  const isDueToday = dueDateStr && dueDateStr === today && task.status !== "done";
  const formatDate = (d: string) => {
    const [, m, day] = d.split("-");
    return `${parseInt(m)}/${parseInt(day)}`;
  };

  const repeatDaysArr = Array.isArray(task.repeatDays) ? (task.repeatDays as number[]) : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card p-4 transition-all ${
        selected ? "ring-2 ring-violet-400" : ""
      } ${isOverdue ? "border-l-4 border-rose-400" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Select checkbox or complete toggle */}
        {isSelectMode ? (
          <button
            onClick={() => onSelect(task.id)}
            className="mt-0.5 shrink-0"
          >
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                selected
                  ? "bg-violet-500 border-violet-500"
                  : "border-slate-300 bg-white/60"
              }`}
            >
              {selected && <span className="text-white text-xs">✓</span>}
            </div>
          </button>
        ) : (
          <button onClick={() => onToggle(task.id)} className="mt-0.5 shrink-0">
            {task.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Circle className="h-5 w-5 text-slate-300 hover:text-violet-400 transition-colors" />
            )}
          </button>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold leading-snug ${
              task.status === "done" ? "line-through text-slate-400" : "text-slate-700"
            }`}
          >
            {task.title}
          </p>
          {task.note && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.note}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5 items-center">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.category && task.category !== "その他" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600 border border-violet-100">
                {task.category}
              </span>
            )}
            {dueDateStr && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                  isOverdue
                    ? "bg-rose-100 text-rose-600 border-rose-200"
                    : isDueToday
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                📅 {formatDate(dueDateStr)}
                {isOverdue && " 期限切れ"}
                {isDueToday && " 今日"}
              </span>
            )}
            {task.repeatType && task.repeatType !== "none" && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                <RepeatIcon className="h-2.5 w-2.5" />
                {task.repeatType === "weekly" && repeatDaysArr.length > 0
                  ? repeatDaysArr.map((d) => WEEKDAYS[d]).join("・")
                  : REPEAT_LABELS[task.repeatType]}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isSelectMode && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(task)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-violet-50 transition-all"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Tasks() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"active" | "all" | "todo" | "doing" | "done">("active");
  const [filterPriority, setFilterPriority] = useState<"all" | "P1" | "P2" | "P3">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showFilter, setShowFilter] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null | "all">("all");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");

  const utils = trpc.useUtils();

  const { data: folders = [], refetch: refetchFolders } = trpc.folders.list.useQuery();
  const createFolderMut = trpc.folders.create.useMutation({
    onSuccess: () => {
      refetchFolders();
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success("フォルダーを作成しました");
    },
  });
  const deleteFolderMut = trpc.folders.delete.useMutation({
    onSuccess: () => { refetchFolders(); utils.tasks.list.invalidate(); },
  });
  const updateFolderMut = trpc.folders.update.useMutation({
    onSuccess: () => {
      refetchFolders();
      setRenamingFolderId(null);
      setRenameFolderName("");
      toast.success("フォルダー名を変更しました");
    },
    onError: () => toast.error("フォルダー名の変更に失敗しました"),
  });

  const { data: rawTasks = [], isLoading, refetch } = trpc.tasks.list.useQuery(
    {
      status: filterStatus === "active" ? undefined : filterStatus === "all" ? undefined : filterStatus as "todo" | "doing" | "done",
      priority: filterPriority !== "all" ? filterPriority : undefined,
      category: filterCategory !== "all" ? filterCategory : undefined,
      search: search || undefined,
    },
    { refetchInterval: 30000 }
  );

  // Filter out "done" tasks when filterStatus is "active", and apply folder filter
  const allTasks = useMemo(() => {
    let list = rawTasks as Task[];
    if (filterStatus === "active") {
      list = list.filter((t) => t.status !== "done");
    }
    if (selectedFolderId !== "all") {
      list = list.filter((t) => t.folderId === selectedFolderId);
    }
    return list;
  }, [rawTasks, filterStatus, selectedFolderId]);

  // Apply local drag order
  const tasks = useMemo(() => {
    if (!localOrder) return allTasks;
    const map = new Map(allTasks.map((t) => [t.id, t]));
    return localOrder.map((id) => map.get(id)).filter(Boolean) as Task[];
  }, [allTasks, localOrder]);

  // Categories for filter
  const categories = useMemo(() => {
    const cats = new Set((rawTasks as Task[]).map((t) => t.category).filter(Boolean));
    return Array.from(cats);
  }, [rawTasks]);

  const toggleMut = trpc.tasks.toggleComplete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.stats.invalidate();
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  const deleteMut = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.stats.invalidate();
      toast.success("削除しました");
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const deleteManyMut = trpc.tasks.deleteMany.useMutation({
    onSuccess: (data) => {
      utils.tasks.list.invalidate();
      utils.tasks.stats.invalidate();
      toast.success(`${data.count}件削除しました`);
      setSelectedIds(new Set());
      setIsSelectMode(false);
    },
    onError: () => toast.error("削除に失敗しました"),
  });

  const createMut = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.stats.invalidate();
      setNewTaskTitle("");
      setLocalOrder(null);
      toast.success("タスクを追加しました");
    },
    onError: () => toast.error("追加に失敗しました"),
  });

  const handleAddTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    createMut.mutate({
      title,
      folderId: selectedFolderId !== "all" ? selectedFolderId : null,
    });
  };

  const reorderMut = trpc.tasks.reorder.useMutation();

  const bulkMoveMut = trpc.tasks.bulkMoveToFolder.useMutation({
    onSuccess: (data: { success: boolean; count: number }) => {
      utils.tasks.list.invalidate();
      toast.success(`${data.count}件のフォルダーを変更しました`);
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setShowFolderPicker(false);
    },
    onError: () => toast.error("フォルダー移動に失敗しました"),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = tasks.map((t) => t.id);
      const oldIndex = ids.indexOf(active.id as number);
      const newIndex = ids.indexOf(over.id as number);
      const newOrder = arrayMove(ids, oldIndex, newIndex);
      setLocalOrder(newOrder);
      reorderMut.mutate({
        items: newOrder.map((id, i) => ({ id, sortOrder: i })),
      });
    },
    [tasks, reorderMut]
  );

  const handleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    deleteManyMut.mutate({ ids: Array.from(selectedIds) });
    setLocalOrder(null);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = (rawTasks as Task[]).filter(
    (t) => t.status !== "done" && t.dueDate && toDateStr(t.dueDate) < today
  ).length;

  return (
    <DashboardLayout>
      {editingTask && (
        <EditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            setLocalOrder(null);
          }}
        />
      )}

      <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto">
        {/* ─── Folder Sidebar ────────────────────────────────────────────────────── */}
        {/* ─── Folder Sidebar: desktop = vertical list, mobile = horizontal scroll tags ─── */}
        <div className="md:w-44 shrink-0">
          {/* Desktop header */}
          <div className="hidden md:flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">フォルダー</span>
            <button
              onClick={() => setShowNewFolder((v) => !v)}
              className="p-1 rounded-lg text-slate-400 hover:text-violet-500 hover:bg-violet-50 transition-all"
              title="フォルダーを追加"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* New folder input (both) */}
          {showNewFolder && (
            <div className="flex gap-1 mb-2">
              <input
                autoFocus
                className="flex-1 min-w-0 px-2 py-1 rounded-lg text-xs border border-slate-200 bg-white/70 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                placeholder="フォルダー名"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    createFolderMut.mutate({ name: newFolderName.trim() });
                  }
                  if (e.key === "Escape") setShowNewFolder(false);
                }}
              />
              <button
                onClick={() => newFolderName.trim() && createFolderMut.mutate({ name: newFolderName.trim() })}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-violet-500 text-white hover:bg-violet-600 transition-all"
              >
                追加
              </button>
            </div>
          )}

          {/* Mobile: horizontal scroll row */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedFolderId("all")}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedFolderId === "all" ? "bg-violet-500 text-white shadow-sm" : "bg-white/60 text-slate-600"
              }`}
            >
              <Folder className="h-3 w-3" />すべて
              <span className={`text-[10px] ${selectedFolderId === "all" ? "text-white/70" : "text-slate-400"}`}>
                {(rawTasks as Task[]).filter(t => t.status !== "done").length}
              </span>
            </button>
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedFolderId === null ? "bg-violet-500 text-white shadow-sm" : "bg-white/60 text-slate-600"
              }`}
            >
              <Folder className="h-3 w-3 opacity-40" />未分類
            </button>
            {(folders as FolderItem[]).map((folder) => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedFolderId === folder.id ? "bg-violet-500 text-white shadow-sm" : "bg-white/60 text-slate-600"
                }`}
              >
                <FolderOpen className="h-3 w-3" />{folder.name}
              </button>
            ))}
            <button
              onClick={() => setShowNewFolder((v) => !v)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-white/40 text-slate-400 hover:text-violet-500 transition-all"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          </div>

          {/* Desktop: vertical list */}
          <div className="hidden md:block space-y-1">
            <button
              onClick={() => setSelectedFolderId("all")}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                selectedFolderId === "all" ? "bg-violet-500 text-white shadow-sm" : "text-slate-600 hover:bg-white/60"
              }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">すべて</span>
              <span className={`ml-auto text-[10px] ${selectedFolderId === "all" ? "text-white/70" : "text-slate-400"}`}>
                {(rawTasks as Task[]).filter(t => t.status !== "done").length}
              </span>
            </button>
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                selectedFolderId === null ? "bg-violet-500 text-white shadow-sm" : "text-slate-600 hover:bg-white/60"
              }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0 opacity-40" />
              <span className="truncate">未分類</span>
            </button>
            {(folders as FolderItem[]).map((folder) => (
              <div key={folder.id} className="group relative">
                {renamingFolderId === folder.id ? (
                  <div className="flex gap-1 px-1 py-1">
                    <input
                      autoFocus
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg text-xs border border-violet-300 bg-white/70 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                      value={renameFolderName}
                      onChange={(e) => setRenameFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && renameFolderName.trim()) {
                          updateFolderMut.mutate({ id: folder.id, name: renameFolderName.trim() });
                        }
                        if (e.key === "Escape") setRenamingFolderId(null);
                      }}
                      onBlur={() => setRenamingFolderId(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedFolderId(folder.id)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      setRenamingFolderId(folder.id);
                      setRenameFolderName(folder.name);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      selectedFolderId === folder.id ? "bg-violet-500 text-white shadow-sm" : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate flex-1 text-left">{folder.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`「${folder.name}」を削除しますか？`)) {
                          deleteFolderMut.mutate({ id: folder.id });
                          if (selectedFolderId === folder.id) setSelectedFolderId("all");
                        }
                      }}
                      className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all ${
                        selectedFolderId === folder.id ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-rose-500"
                      }`}
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Main Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">タスク一覧</h1>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.52 0.05 270)" }}>
              {tasks.length}件
              {overdueCount > 0 && (
                <span className="ml-2 text-rose-500 font-semibold">⚠ 期限切れ {overdueCount}件</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {isSelectMode ? (
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white/60 text-slate-600 hover:bg-white/80 transition-all"
                >
                  {selectedIds.size === tasks.length ? "全解除" : "全選択"}
                </button>

                {/* フォルダー移動ボタン */}
                <div className="relative">
                  <button
                    onClick={() => setShowFolderPicker((v) => !v)}
                    disabled={selectedIds.size === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-40 transition-all"
                    style={{ background: "linear-gradient(135deg, oklch(0.55 0.18 250), oklch(0.62 0.15 200))" }}
                  >
                    <FolderKanban className="h-3.5 w-3.5" />
                    フォルダ移動
                  </button>

                  {/* フォルダー選択ポップアップ */}
                  {showFolderPicker && (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
                      style={{ background: "oklch(1 0 0 / 0.97)", minWidth: "180px" }}
                    >
                      <div className="px-3 py-2 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-500">{selectedIds.size}件を移動先に選択</p>
                      </div>
                      <div className="py-1 max-h-56 overflow-y-auto">
                        {/* フォルダなし */}
                        <button
                          onClick={() => {
                            bulkMoveMut.mutate({ ids: Array.from(selectedIds), folderId: null });
                          }}
                          disabled={bulkMoveMut.isPending}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          <Folder className="h-3.5 w-3.5 text-slate-300" />
                          フォルダーなし
                        </button>
                        {(folders as FolderItem[]).map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => {
                              bulkMoveMut.mutate({ ids: Array.from(selectedIds), folderId: folder.id });
                            }}
                            disabled={bulkMoveMut.isPending}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-violet-400" />
                            {folder.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0 || deleteManyMut.isPending}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-40 transition-all"
                >
                  {deleteManyMut.isPending ? "削除中..." : `${selectedIds.size}件削除`}
                </button>
                <button
                  onClick={() => { setIsSelectMode(false); setSelectedIds(new Set()); setShowFolderPicker(false); }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white/60 text-slate-600 hover:bg-white/80 transition-all"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowAddTask((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, oklch(0.58 0.20 275), oklch(0.65 0.17 225))" }}
                >
                  <Plus className="h-3.5 w-3.5" />追加
                </button>
                <button
                  onClick={() => setIsSelectMode(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white/60 text-slate-600 hover:bg-white/80 transition-all"
                >
                  選択
                </button>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-xs font-medium transition-all hover:bg-white/60"
                  style={{ color: "oklch(0.40 0.08 270)" }}
                >
                  <RefreshCw className="h-3 w-3" />更新
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="glass-card p-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                className="w-full pl-8 pr-3 py-2 rounded-xl text-sm border border-slate-200 bg-white/70 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
                placeholder="タスクを検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                showFilter
                  ? "bg-violet-500 text-white border-violet-500"
                  : "border-slate-200 bg-white/60 text-slate-600 hover:bg-white/80"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              フィルタ
              {showFilter ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>

          {showFilter && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">表示</label>
                <select
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-slate-200 bg-white/70 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as "active" | "all" | "todo" | "doing" | "done")}
                >
                  <option value="active">未完了のみ</option>
                  <option value="all">すべて</option>
                  <option value="todo">未着手</option>
                  <option value="doing">進行中</option>
                  <option value="done">完了のみ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">優先度</label>
                <select
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-slate-200 bg-white/70 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value as "all" | "P1" | "P2" | "P3")}
                >
                  <option value="all">すべて</option>
                  <option value="P1">緊急</option>
                  <option value="P2">通常</option>
                  <option value="P3">低</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">カテゴリ</label>
                <select
                  className="w-full px-2 py-1.5 rounded-lg text-xs border border-slate-200 bg-white/70 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">すべて</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Add Task Inline */}
        {showAddTask && (
          <div className="glass-card p-3">
            <div className="flex gap-2">
              <input
                autoFocus
                className="flex-1 px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white/70 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
                placeholder="タスクのタイトルを入力..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAddTask();
                  if (e.key === "Escape") { setShowAddTask(false); setNewTaskTitle(""); }
                }}
                disabled={createMut.isPending}
              />
              <button
                onClick={handleAddTask}
                disabled={!newTaskTitle.trim() || createMut.isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                style={{ background: "linear-gradient(135deg, oklch(0.58 0.20 275), oklch(0.65 0.17 225))" }}
              >
                {createMut.isPending ? "追加中..." : "追加"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
              Enterで追加 / 優先度・カテゴリ等は追加後に編集できます
            </p>
          </div>
        )}

        {/* Task List */}
        {isLoading ? (
          <div className="glass-card p-8 text-center">
            <div className="animate-spin h-6 w-6 rounded-full border-2 border-violet-400 border-t-transparent mx-auto" />
            <p className="text-sm text-slate-500 mt-3">読み込み中...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm font-semibold text-slate-600">タスクはありません</p>
            <p className="text-xs text-slate-400 mt-1">上の「追加」ボタンまたはLINEからタスクを追加できます</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {tasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    selected={selectedIds.has(task.id)}
                    onSelect={handleSelect}
                    onEdit={setEditingTask}
                    onDelete={(id) => {
                      deleteMut.mutate({ id });
                      setLocalOrder(null);
                    }}
                    onToggle={(id) => toggleMut.mutate({ id })}
                    isSelectMode={isSelectMode}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Status legend */}
        <div className="flex flex-wrap gap-3 justify-center py-2">
          {[
            { color: "bg-rose-400", label: "期限切れ" },
            { color: "bg-amber-400", label: "今日期限" },
            { color: "bg-violet-400", label: "ドラッグで並び替え" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
        </div>{/* end main content */}
      </div>{/* end flex container */}
    </DashboardLayout>
  );
}
