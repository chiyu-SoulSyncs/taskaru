import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { CheckSquare, FileText, FolderKanban, LayoutDashboard, LogOut, MessageCircle, Menu, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "ダッシュボード", path: "/" },
  { icon: CheckSquare, label: "タスク一覧", path: "/tasks" },
  { icon: FileText, label: "メモ", path: "/notes" },
  { icon: FolderKanban, label: "プロジェクト", path: "/projects" },
  { icon: MessageCircle, label: "LINE設定", path: "/line-settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="relative flex items-center justify-center min-h-screen overflow-hidden">
        {/* Orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />

        <div className="relative z-10 glass-strong rounded-3xl p-10 max-w-sm w-full mx-4 flex flex-col items-center gap-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: "linear-gradient(135deg, oklch(0.58 0.20 275), oklch(0.65 0.17 225))",
                boxShadow: "0 8px 24px oklch(0.50 0.20 275 / 0.40)",
              }}
            >
              <MessageCircle className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center gradient-text">
              LINE Task Manager
            </h1>
            <p className="text-sm text-center leading-relaxed" style={{ color: "oklch(0.45 0.05 270)" }}>
              LINEと連携したAIタスク管理ダッシュボードです。ログインして利用を開始してください。
            </p>
          </div>

          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full gradient-btn rounded-xl h-12 text-base font-semibold"
          >
            ログインして始める
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />

      {/* Sidebar */}
      <SidebarNav
        user={user}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 glass border-b border-white/30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl hover:bg-white/30 transition-colors"
          >
            <Menu className="h-5 w-5" style={{ color: "oklch(0.40 0.08 270)" }} />
          </button>
          <span className="font-semibold text-sm gradient-text">LINE Tasks</span>
          <div className="w-9" />
        </div>

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  user,
  mobileOpen,
  setMobileOpen,
}: {
  user: { name?: string | null; email?: string | null };
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();

  const navigate = (path: string) => {
    setLocation(path);
    setMobileOpen(false);
  };

  return (
    <aside
      className={`
        fixed md:relative z-40 flex flex-col h-full w-64 glass-sidebar
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-white/25">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, oklch(0.58 0.20 275), oklch(0.65 0.17 225))",
              boxShadow: "0 4px 12px oklch(0.50 0.20 275 / 0.35)",
            }}
          >
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight gradient-text">LINE Tasks</span>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg hover:bg-white/30 transition-colors"
        >
          <X className="h-4 w-4" style={{ color: "oklch(0.45 0.05 270)" }} />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                transition-all duration-200
                ${isActive
                  ? "text-white shadow-lg"
                  : "hover:bg-white/30 transition-colors"
                }
              `}
              style={isActive ? {
                background: "linear-gradient(135deg, oklch(0.58 0.20 275 / 0.85), oklch(0.65 0.17 225 / 0.85))",
                boxShadow: "0 4px 16px oklch(0.50 0.20 275 / 0.30)",
                color: "white",
              } : {
                color: "oklch(0.35 0.06 270)",
              }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer / User */}
      <div className="p-3 border-t border-white/25">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/30 transition-colors text-left">
              <Avatar className="h-8 w-8 shrink-0 border border-white/50">
                <AvatarFallback
                  className="text-xs font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, oklch(0.58 0.20 275), oklch(0.65 0.17 225))" }}
                >
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "oklch(0.30 0.06 270)" }}>
                  {user?.name || "-"}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: "oklch(0.52 0.05 270)" }}>
                  {user?.email || "-"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 glass-strong border-white/50">
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>ログアウト</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
