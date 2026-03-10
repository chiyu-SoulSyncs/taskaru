import { useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  ChevronLeft,
  Plus,
  FileText,
  Trash2,
  Clock,
  Calendar,
  Tag,
  Pencil,
  Save,
  X,
  Target,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  CheckSquare,
  Square,
  GripVertical,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
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

const PRIORITY_CONFIG = {
  P1: { label: "緊急", color: "text-red-600 bg-red-50 border-red-200" },
  P2: { label: "通常", color: "text-amber-600 bg-amber-50 border-amber-200" },
  P3: { label: "低", color: "text-slate-500 bg-slate-50 border-slate-200" },
};

const STATUS_LABEL: Record<string, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
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

type TaskItem = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
  note?: string | null;
  sortOrder?: number;
  parentTaskId?: number | null;
};

// ─── Edit Task Modal ──────────────────────────────────────────────────────────
function EditTaskModal({
  task,
  open,
  onClose,
  onSave,
}: {
  task: TaskItem | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    id: number;
    title: string;
    priority: "P1" | "P2" | "P3";
    status: "todo" | "doing" | "done";
    dueDate: string | null;
    note: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"P1" | "P2" | "P3">("P2");
  const [status, setStatus] = useState<"todo" | "doing" | "done">("todo");
  const [dueDate, setDueDate] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open && task) {
      setTitle(task.title ?? "");
      setPriority((task.priority as "P1" | "P2" | "P3") ?? "P2");
      setStatus((task.status as "todo" | "doing" | "done") ?? "todo");
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "");
      setNote(task.note ?? "");
    }
  }, [open, task]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>タスクを編集</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">タイトル</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タスクのタイトル"
              className="text-slate-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">優先度</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "P1" | "P2" | "P3")}>
                <SelectTrigger className="text-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">緊急</SelectItem>
                  <SelectItem value="P2">通常</SelectItem>
                  <SelectItem value="P3">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">ステータス</label>
              <Select value={status} onValueChange={(v) => setStatus(v as "todo" | "doing" | "done")}>
                <SelectTrigger className="text-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">未着手</SelectItem>
                  <SelectItem value="doing">進行中</SelectItem>
                  <SelectItem value="done">完了</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">期限日</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-slate-700" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">メモ</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="タスクのメモ（任意）"
              rows={3}
              className="text-slate-700 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button
            onClick={() => {
              if (!task || !title.trim()) return;
              onSave({ id: task.id, title: title.trim(), priority, status, dueDate: dueDate || null, note: note.trim() || null });
            }}
            disabled={!title.trim()}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub Task Row ─────────────────────────────────────────────────────────────
function SubTaskRow({
  task,
  onToggle,
  onDelete,
  onEdit,
}: {
  task: TaskItem;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isDone = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-lg border bg-slate-50 px-3 py-2 ml-6 ${isDone ? "opacity-60" : ""}`}
    >
      <button {...attributes} {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 flex-shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button onClick={onToggle} className="mt-0.5 flex-shrink-0">
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className="w-4 h-4 text-slate-300 hover:text-violet-400 transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium text-slate-600 ${isDone ? "line-through" : ""}`}>{task.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {task.dueDate && (
            <span className="flex items-center gap-0.5 text-xs text-slate-400">
              <Clock className="w-2.5 h-2.5" />
              {new Date(task.dueDate).toLocaleDateString("ja-JP")}
            </span>
          )}
          <span className="text-xs text-slate-400">{STATUS_LABEL[task.status] ?? task.status}</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-violet-500" onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Parent Task Row ──────────────────────────────────────────────────────────
function ParentTaskRow({
  task,
  subTasks,
  onToggle,
  onDelete,
  onEdit,
  onAddSubTask,
  onToggleSubTask,
  onDeleteSubTask,
  onEditSubTask,
  onReorderSubTasks,
}: {
  task: TaskItem;
  subTasks: TaskItem[];
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onAddSubTask: (title: string) => void;
  onToggleSubTask: (id: number) => void;
  onDeleteSubTask: (id: number) => void;
  onEditSubTask: (task: TaskItem) => void;
  onReorderSubTasks: (items: { id: number; sortOrder: number }[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isDone = task.status === "done";
  const priorityCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG];

  const [expanded, setExpanded] = useState(true);
  const [addingSubTask, setAddingSubTask] = useState(false);
  const [subTaskTitle, setSubTaskTitle] = useState("");

  const pendingSubTasks = subTasks.filter((t) => t.status !== "done");
  const doneSubTasks = subTasks.filter((t) => t.status === "done");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSubDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = pendingSubTasks.findIndex((t) => t.id === active.id);
    const newIdx = pendingSubTasks.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(pendingSubTasks, oldIdx, newIdx);
    onReorderSubTasks(reordered.map((t, i) => ({ id: t.id, sortOrder: i })));
  };

  const handleAddSubTask = () => {
    if (!subTaskTitle.trim()) return;
    onAddSubTask(subTaskTitle.trim());
    setSubTaskTitle("");
    setAddingSubTask(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border bg-white shadow-sm ${isDone ? "opacity-60" : ""}`}>
      {/* Parent task header */}
      <div className="flex items-start gap-2 p-3">
        <button {...attributes} {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </button>
        <button onClick={onToggle} className="mt-0.5 flex-shrink-0">
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className="w-5 h-5 text-slate-300 hover:text-violet-400 transition-colors" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold text-slate-700 ${isDone ? "line-through" : ""}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {priorityCfg && (
              <Badge variant="outline" className={`text-xs px-1.5 py-0 border ${priorityCfg.color}`}>
                {priorityCfg.label}
              </Badge>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-0.5 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                {new Date(task.dueDate).toLocaleDateString("ja-JP")}
              </span>
            )}
            <span className="text-xs text-slate-400">{STATUS_LABEL[task.status] ?? task.status}</span>
            {subTasks.length > 0 && (
              <span className="text-xs text-slate-400">
                小タスク {subTasks.filter((t) => t.status === "done").length}/{subTasks.length}
              </span>
            )}
          </div>
          {task.note && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.note}</p>}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-violet-500" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-500" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-600"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Sub-tasks */}
      {expanded && (
        <div className="pb-2 space-y-1.5">
          {/* Pending sub-tasks (sortable) */}
          {pendingSubTasks.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubDragEnd}>
              <SortableContext items={pendingSubTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {pendingSubTasks.map((sub) => (
                    <SubTaskRow
                      key={sub.id}
                      task={sub}
                      onToggle={() => onToggleSubTask(sub.id)}
                      onDelete={() => onDeleteSubTask(sub.id)}
                      onEdit={() => onEditSubTask(sub)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Done sub-tasks */}
          {doneSubTasks.length > 0 && (
            <div className="space-y-1.5 opacity-60">
              {doneSubTasks.map((sub) => (
                <SubTaskRow
                  key={sub.id}
                  task={sub}
                  onToggle={() => onToggleSubTask(sub.id)}
                  onDelete={() => onDeleteSubTask(sub.id)}
                  onEdit={() => onEditSubTask(sub)}
                />
              ))}
            </div>
          )}

          {/* Add sub-task */}
          {addingSubTask ? (
            <div className="flex gap-2 ml-6 pr-3">
              <Input
                autoFocus
                value={subTaskTitle}
                onChange={(e) => setSubTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSubTask();
                  if (e.key === "Escape") { setAddingSubTask(false); setSubTaskTitle(""); }
                }}
                placeholder="小タスクのタイトル..."
                className="text-xs h-7 text-slate-700"
              />
              <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0" onClick={handleAddSubTask}>
                追加
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs flex-shrink-0" onClick={() => { setAddingSubTask(false); setSubTaskTitle(""); }}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1 ml-6 text-xs text-slate-400 hover:text-violet-500 transition-colors py-0.5"
              onClick={() => setAddingSubTask(true)}
            >
              <Plus className="w-3 h-3" />
              小タスクを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task Section ─────────────────────────────────────────────────────────────
function TaskSection({
  projectId,
  projectTitle,
  onInvalidate,
}: {
  projectId: number;
  projectTitle: string;
  onInvalidate: () => void;
}) {
  const utils = trpc.useUtils();

  // Fetch all tasks for this project (parent + children)
  const { data: allTasks = [], isLoading } = trpc.tasks.allByProject.useQuery({ projectId });

  // Local state for optimistic reordering
  const [parentOrder, setParentOrder] = useState<number[]>([]);

  const parentTasks = allTasks.filter((t) => !t.parentTaskId);
  const subTaskMap: Record<number, typeof allTasks> = {};
  allTasks.filter((t) => t.parentTaskId).forEach((t) => {
    const pid = t.parentTaskId!;
    if (!subTaskMap[pid]) subTaskMap[pid] = [];
    subTaskMap[pid].push(t);
  });

  // Sync parentOrder when data loads
  useEffect(() => {
    setParentOrder(parentTasks.map((t) => t.id));
  }, [allTasks.length]);

  const orderedParents = parentOrder
    .map((id) => parentTasks.find((t) => t.id === id))
    .filter(Boolean) as typeof parentTasks;

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  const invalidateAll = useCallback(() => {
    utils.tasks.allByProject.invalidate({ projectId });
    onInvalidate();
  }, [utils, projectId, onInvalidate]);

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => { invalidateAll(); setNewTaskTitle(""); toast.success("タスクを追加しました"); },
    onError: () => toast.error("タスクの追加に失敗しました"),
  });

  const updateMutation = trpc.tasks.update.useMutation({
    onSuccess: () => { invalidateAll(); setEditingTask(null); toast.success("タスクを更新しました"); },
    onError: () => toast.error("タスクの更新に失敗しました"),
  });

  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("タスクを削除しました"); },
  });

  const reorderMutation = trpc.tasks.reorder.useMutation({
    onError: () => { utils.tasks.allByProject.invalidate({ projectId }); },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleParentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedParents.findIndex((t) => t.id === active.id);
    const newIdx = orderedParents.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(orderedParents, oldIdx, newIdx);
    setParentOrder(reordered.map((t) => t.id));
    reorderMutation.mutate({ items: reordered.map((t, i) => ({ id: t.id, sortOrder: i })) });
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    createMutation.mutate({ title: newTaskTitle.trim(), projectId, category: projectTitle });
  };

  const handleAddSubTask = (parentId: number, title: string) => {
    const siblings = subTaskMap[parentId] ?? [];
    createMutation.mutate({
      title,
      projectId,
      parentTaskId: parentId,
      category: projectTitle,
      sortOrder: siblings.length,
    });
  };

  const handleReorderSubTasks = (items: { id: number; sortOrder: number }[]) => {
    reorderMutation.mutate({ items });
  };

  const pendingParents = orderedParents.filter((t) => t.status !== "done");
  const doneParents = orderedParents.filter((t) => t.status === "done");

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add parent task input */}
      <div className="flex gap-2">
        <Input
          placeholder="新しい大タスクを追加..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
          className="text-slate-700"
        />
        <Button
          onClick={handleAddTask}
          disabled={!newTaskTitle.trim() || createMutation.isPending}
          className="bg-violet-600 hover:bg-violet-700 text-white flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Empty state */}
      {allTasks.length === 0 ? (
        <div className="text-center py-10">
          <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">タスクがまだありません</p>
          <p className="text-xs text-slate-400 mt-1">上の入力欄から大タスクを追加してください</p>
        </div>
      ) : (
        <>
          {/* Pending parent tasks (sortable) */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleParentDragEnd}>
            <SortableContext items={pendingParents.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {pendingParents.map((task) => (
                  <ParentTaskRow
                    key={task.id}
                    task={task}
                    subTasks={subTaskMap[task.id] ?? []}
                    onToggle={() => updateMutation.mutate({ id: task.id, status: task.status === "done" ? "todo" : "done" })}
                    onDelete={() => deleteMutation.mutate({ id: task.id })}
                    onEdit={() => setEditingTask(task)}
                    onAddSubTask={(title) => handleAddSubTask(task.id, title)}
                    onToggleSubTask={(id) => {
                      const sub = allTasks.find((t) => t.id === id);
                      if (sub) updateMutation.mutate({ id, status: sub.status === "done" ? "todo" : "done" });
                    }}
                    onDeleteSubTask={(id) => deleteMutation.mutate({ id })}
                    onEditSubTask={(t) => setEditingTask(t)}
                    onReorderSubTasks={handleReorderSubTasks}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Done parent tasks */}
          {doneParents.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                完了済み ({doneParents.length})
              </p>
              <div className="space-y-2 opacity-60">
                {doneParents.map((task) => (
                  <ParentTaskRow
                    key={task.id}
                    task={task}
                    subTasks={subTaskMap[task.id] ?? []}
                    onToggle={() => updateMutation.mutate({ id: task.id, status: "todo" })}
                    onDelete={() => deleteMutation.mutate({ id: task.id })}
                    onEdit={() => setEditingTask(task)}
                    onAddSubTask={(title) => handleAddSubTask(task.id, title)}
                    onToggleSubTask={(id) => {
                      const sub = allTasks.find((t) => t.id === id);
                      if (sub) updateMutation.mutate({ id, status: sub.status === "done" ? "todo" : "done" });
                    }}
                    onDeleteSubTask={(id) => deleteMutation.mutate({ id })}
                    onEditSubTask={(t) => setEditingTask(t)}
                    onReorderSubTasks={handleReorderSubTasks}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Task Modal */}
      <EditTaskModal
        task={editingTask}
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        onSave={(data) => updateMutation.mutate(data)}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? parseInt(params.id) : 0;
  const utils = trpc.useUtils();

  const { data: project, isLoading } = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: projectId > 0 }
  );

  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "notes">("tasks");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId });
      utils.projects.list.invalidate();
      setEditingDescription(false);
      toast.success("更新しました");
    },
    onError: () => toast.error("更新に失敗しました"),
  });

  const startEditDescription = () => { setDescriptionDraft(project?.description ?? ""); setEditingDescription(true); };
  const saveDescription = () => {
    if (!project) return;
    updateProjectMutation.mutate({ id: project.id, description: descriptionDraft.trim() || null });
  };
  const startEditTitle = () => { setTitleDraft(project?.title ?? ""); setEditingTitle(true); };
  const saveTitle = () => {
    if (!project || !titleDraft.trim()) return;
    updateProjectMutation.mutate({ id: project.id, title: titleDraft.trim() }, {
      onSuccess: () => { setEditingTitle(false); toast.success("プロジェクト名を更新しました"); },
    });
  };

  const invalidateProject = useCallback(() => {
    utils.projects.getById.invalidate({ id: projectId });
  }, [utils, projectId]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          <div className="h-8 bg-slate-100 rounded animate-pulse w-48" />
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-slate-500">プロジェクトが見つかりません</p>
          <Link href="/projects">
            <Button className="mt-4" variant="outline">
              <ChevronLeft className="w-4 h-4 mr-1" />
              一覧に戻る
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        {/* Back button */}
        <Link href="/projects">
          <Button variant="ghost" className="text-slate-500 hover:text-slate-700 -ml-2 mb-4 gap-1">
            <ChevronLeft className="w-4 h-4" />
            プロジェクト一覧
          </Button>
        </Link>

        {/* Project Header */}
        <div className="rounded-xl border bg-white shadow-sm p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className={`w-4 h-4 rounded-full mt-1 flex-shrink-0 ${getColorBg(project.color)}`} />
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                    className="text-xl font-bold text-slate-800 h-9 border-violet-300 focus-visible:ring-violet-400"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={saveTitle} disabled={updateProjectMutation.isPending}>
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-600" onClick={() => setEditingTitle(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-xl font-bold text-slate-800">{project.title}</h1>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-300 hover:text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={startEditTitle}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <Select
                  value={project.status}
                  onValueChange={(v) => updateProjectMutation.mutate({ id: project.id, status: v as "active" | "completed" | "on_hold" })}
                >
                  <SelectTrigger className="h-7 w-28 text-xs text-slate-600 border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">進行中</SelectItem>
                    <SelectItem value="on_hold">保留</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                  </SelectContent>
                </Select>
                {project.dueDate && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {new Date(project.dueDate).toLocaleDateString("ja-JP")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{project.done}/{project.total} タスク完了</span>
              <span className="font-medium">{project.percent}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getColorBg(project.color)}`}
                style={{ width: `${project.percent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1">
          {(["overview", "tasks", "notes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "overview" ? "概要" : tab === "tasks" ? `タスク (${project.total})` : `メモ (${project.notes?.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-white shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-700">備考・説明</h2>
                {!editingDescription && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-500 hover:text-violet-600" onClick={startEditDescription}>
                    <Pencil className="w-3.5 h-3.5" />
                    編集
                  </Button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-3">
                  <Textarea
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="プロジェクトの備考・説明を入力..."
                    rows={5}
                    className="text-slate-700 resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditingDescription(false)}>
                      <X className="w-3.5 h-3.5" />キャンセル
                    </Button>
                    <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white" onClick={saveDescription} disabled={updateProjectMutation.isPending}>
                      <Save className="w-3.5 h-3.5" />保存
                    </Button>
                  </div>
                </div>
              ) : project.description ? (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{project.description}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">備考がまだありません。「編集」ボタンから追加できます。</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-white shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{project.total}</p>
                <p className="text-xs text-slate-500 mt-0.5">総タスク数</p>
              </div>
              <div className="rounded-xl border bg-white shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{project.done}</p>
                <p className="text-xs text-slate-500 mt-0.5">完了</p>
              </div>
              <div className="rounded-xl border bg-white shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-violet-600">{project.percent}%</p>
                <p className="text-xs text-slate-500 mt-0.5">進捗率</p>
              </div>
            </div>

            <KpiSection projectId={projectId} />
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <TaskSection
            projectId={projectId}
            projectTitle={project.title}
            onInvalidate={invalidateProject}
          />
        )}

        {/* Notes Tab */}
        {activeTab === "notes" && (
          <div className="space-y-3">
            {!project.notes || project.notes.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">メモがまだありません</p>
                <Link href="/notes">
                  <Button variant="outline" className="mt-3 text-slate-600 text-sm">メモを作成する</Button>
                </Link>
              </div>
            ) : (
              project.notes.map((note) => (
                <div key={note.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-800 text-sm">{note.title}</h3>
                  {Array.isArray(note.tags) && note.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {(note.tags as string[]).map((tag) => (
                        <span key={tag} className="flex items-center gap-0.5 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          <Tag className="w-2.5 h-2.5" />{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">{new Date(note.createdAt).toLocaleDateString("ja-JP")}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── KPI Section ──────────────────────────────────────────────────────────────

type KpiRow = {
  id: number;
  projectId: number;
  title: string;
  unit: string;
  targetValue: number;
  currentValue: number;
  dueDate?: Date | string | null;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type KpiCandidate = {
  title: string;
  unit: string;
  targetValue: number;
  currentValue: number;
  dueDate: string | null;
  note: string | null;
  selected: boolean;
};

function KpiSection({ projectId }: { projectId: number }) {
  const utils = trpc.useUtils();
  const { data: kpiList = [], isLoading } = trpc.kpis.listByProject.useQuery({ projectId });

  const [showForm, setShowForm] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KpiRow | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiCandidates, setAiCandidates] = useState<KpiCandidate[]>([]);
  const [aiStep, setAiStep] = useState<"input" | "confirm">("input");
  const [newTitle, setNewTitle] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newCurrent, setNewCurrent] = useState("0");
  const [newDueDate, setNewDueDate] = useState("");
  const [newNote, setNewNote] = useState("");

  const extractMutation = trpc.kpis.extractFromText.useMutation({
    onSuccess: (data) => { setAiCandidates(data.kpis.map((k) => ({ ...k, selected: true }))); setAiStep("confirm"); },
    onError: () => toast.error("AI抽出に失敗しました"),
  });

  const bulkCreateMutation = trpc.kpis.bulkCreate.useMutation({
    onSuccess: (data) => {
      utils.kpis.listByProject.invalidate({ projectId });
      setShowAiModal(false); setAiText(""); setAiCandidates([]); setAiStep("input");
      toast.success(`${data.count}件のKPIを登録しました`);
    },
    onError: () => toast.error("KPIの一括登録に失敗しました"),
  });

  const createMutation = trpc.kpis.create.useMutation({
    onSuccess: () => {
      utils.kpis.listByProject.invalidate({ projectId });
      setShowForm(false);
      setNewTitle(""); setNewUnit(""); setNewTarget(""); setNewCurrent("0"); setNewDueDate(""); setNewNote("");
      toast.success("KPIを追加しました");
    },
    onError: () => toast.error("KPIの追加に失敗しました"),
  });

  const updateMutation = trpc.kpis.update.useMutation({
    onSuccess: () => { utils.kpis.listByProject.invalidate({ projectId }); setEditingKpi(null); toast.success("KPIを更新しました"); },
    onError: () => toast.error("KPIの更新に失敗しました"),
  });

  const deleteMutation = trpc.kpis.delete.useMutation({
    onSuccess: () => { utils.kpis.listByProject.invalidate({ projectId }); toast.success("KPIを削除しました"); },
  });

  const handleCreate = () => {
    const target = parseFloat(newTarget);
    if (!newTitle.trim() || isNaN(target)) return;
    createMutation.mutate({ projectId, title: newTitle.trim(), unit: newUnit.trim(), targetValue: target, currentValue: parseFloat(newCurrent) || 0, dueDate: newDueDate || null, note: newNote.trim() || null });
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm p-5">
      {/* AI KPI Import Modal */}
      <Dialog open={showAiModal} onOpenChange={(open) => { if (!open) { setShowAiModal(false); setAiStep("input"); setAiText(""); setAiCandidates([]); } }}>
        <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              AIでKPIを自動入力
            </DialogTitle>
          </DialogHeader>
          {aiStep === "input" ? (
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              <p className="text-sm text-slate-500 flex-shrink-0">プロジェクトの設計書・戦略文書・目標テキストを貼り付けてください。AIがKPIを自動で抽出します。</p>
              <Textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="例: 今期の目標は月間売上500万円、新規顧客獲得20件..." className="flex-1 min-h-[150px] text-sm text-slate-700 resize-none" />
              <DialogFooter className="flex-shrink-0">
                <Button variant="outline" onClick={() => setShowAiModal(false)}>キャンセル</Button>
                <Button onClick={() => extractMutation.mutate({ text: aiText })} disabled={!aiText.trim() || extractMutation.isPending} className="gap-2" style={{ background: "linear-gradient(135deg, oklch(0.55 0.18 290), oklch(0.62 0.15 250))" }}>
                  {extractMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />抽出中...</> : <><Sparkles className="w-4 h-4" />KPIを抽出</>}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              <p className="text-sm text-slate-500 flex-shrink-0">{aiCandidates.length}件のKPIが抽出されました。登録するKPIにチェックを入れてください。</p>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {aiCandidates.map((c, idx) => (
                  <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${c.selected ? "bg-violet-50 border-violet-200" : "bg-slate-50 border-slate-200 opacity-60"}`}
                    onClick={() => setAiCandidates((prev) => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item))}>
                    <button className="shrink-0 mt-0.5 focus:outline-none">
                      {c.selected ? <CheckSquare className="w-4 h-4 text-violet-500" /> : <Square className="w-4 h-4 text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-700">{c.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-600">{c.unit}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>目標: <strong className="text-slate-700">{c.targetValue.toLocaleString()}</strong></span>
                        <span>現在: <strong className="text-slate-700">{c.currentValue.toLocaleString()}</strong></span>
                        {c.dueDate && <span>期限: {c.dueDate}</span>}
                      </div>
                      {c.note && <p className="text-xs text-slate-400 mt-1 truncate">{c.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter className="gap-2 flex-shrink-0">
                <Button variant="outline" onClick={() => setAiStep("input")}>← 戻る</Button>
                <Button onClick={() => bulkCreateMutation.mutate({ projectId, kpis: aiCandidates.filter((c) => c.selected) })} disabled={aiCandidates.filter((c) => c.selected).length === 0 || bulkCreateMutation.isPending} className="gap-2 text-white" style={{ background: "linear-gradient(135deg, oklch(0.55 0.18 290), oklch(0.62 0.15 250))" }}>
                  {bulkCreateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />登録中...</> : <>{aiCandidates.filter((c) => c.selected).length}件を登録</>}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-slate-700">KPI管理</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-violet-500 hover:text-violet-700 hover:bg-violet-50" onClick={() => { setShowAiModal(true); setAiStep("input"); }}>
            <Sparkles className="w-3.5 h-3.5" />AIで入力
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-500 hover:text-violet-600" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3.5 h-3.5" />追加
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <p className="text-xs font-medium text-slate-600">新しいKPI</p>
          <Input placeholder="KPIタイトル（例：月間売上、新規顧客数）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="text-slate-700 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs text-slate-500 mb-1 block">目標値</label><Input type="number" placeholder="100" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="text-slate-700 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">現在値</label><Input type="number" placeholder="0" value={newCurrent} onChange={(e) => setNewCurrent(e.target.value)} className="text-slate-700 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">単位</label><Input placeholder="件・%・万円" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="text-slate-700 text-sm" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-slate-500 mb-1 block">期限日</label><Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="text-slate-700 text-sm" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">メモ</label><Input placeholder="補足メモ（任意）" value={newNote} onChange={(e) => setNewNote(e.target.value)} className="text-slate-700 text-sm" /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>キャンセル</Button>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={handleCreate} disabled={!newTitle.trim() || !newTarget || createMutation.isPending}>追加</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : kpiList.length === 0 ? (
        <div className="text-center py-6">
          <TrendingUp className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">KPIがまだありません</p>
          <p className="text-xs text-slate-400 mt-0.5">「追加」ボタンから目標を設定しましょう</p>
        </div>
      ) : (
        <div className="space-y-3">
          {kpiList.map((kpi) => {
            const pct = kpi.targetValue > 0 ? Math.min(100, Math.round((kpi.currentValue / kpi.targetValue) * 100)) : 0;
            const isEditing = editingKpi?.id === kpi.id;
            return (
              <div key={kpi.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                {isEditing ? (
                  <KpiEditForm kpi={editingKpi!} onSave={(data) => updateMutation.mutate({ id: kpi.id, ...data })} onCancel={() => setEditingKpi(null)} isPending={updateMutation.isPending} />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">{kpi.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500">{kpi.currentValue.toLocaleString()}{kpi.unit} / {kpi.targetValue.toLocaleString()}{kpi.unit}</span>
                          {kpi.dueDate && (
                            <span className="flex items-center gap-0.5 text-xs text-slate-400">
                              <Calendar className="w-3 h-3" />
                              {new Date(kpi.dueDate).toLocaleDateString("ja-JP")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-sm font-bold ${pct >= 100 ? "text-green-600" : pct >= 60 ? "text-violet-600" : "text-amber-600"}`}>{pct}%</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-violet-500" onClick={() => setEditingKpi(kpi as KpiRow)}><Pencil className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => deleteMutation.mutate({ id: kpi.id })}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-violet-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    {kpi.note && <p className="text-xs text-slate-400 mt-1.5">{kpi.note}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── KPI Edit Form ────────────────────────────────────────────────────────────
function KpiEditForm({ kpi, onSave, onCancel, isPending }: {
  kpi: KpiRow;
  onSave: (data: { title?: string; unit?: string; targetValue?: number; currentValue?: number; dueDate?: string | null; note?: string | null }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(kpi.title);
  const [unit, setUnit] = useState(kpi.unit);
  const [target, setTarget] = useState(String(kpi.targetValue));
  const [current, setCurrent] = useState(String(kpi.currentValue));
  const [dueDate, setDueDate] = useState(kpi.dueDate ? new Date(kpi.dueDate).toISOString().slice(0, 10) : "");
  const [note, setNote] = useState(kpi.note ?? "");

  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="KPIタイトル" className="text-slate-700 text-sm" />
      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-xs text-slate-500 mb-1 block">目標値</label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="text-slate-700 text-sm" /></div>
        <div><label className="text-xs text-slate-500 mb-1 block">現在値</label><Input type="number" value={current} onChange={(e) => setCurrent(e.target.value)} className="text-slate-700 text-sm" /></div>
        <div><label className="text-xs text-slate-500 mb-1 block">単位</label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="件・%・万円" className="text-slate-700 text-sm" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-xs text-slate-500 mb-1 block">期限日</label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-slate-700 text-sm" /></div>
        <div><label className="text-xs text-slate-500 mb-1 block">メモ</label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足メモ" className="text-slate-700 text-sm" /></div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>キャンセル</Button>
        <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" disabled={!title.trim() || isPending}
          onClick={() => onSave({ title: title.trim(), unit: unit.trim(), targetValue: parseFloat(target) || 0, currentValue: parseFloat(current) || 0, dueDate: dueDate || null, note: note.trim() || null })}>
          <Save className="w-3.5 h-3.5 mr-1" />保存
        </Button>
      </div>
    </div>
  );
}
