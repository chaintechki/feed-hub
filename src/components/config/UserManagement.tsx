import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, Plus, Trash2, Unlock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordRules } from "@/components/auth/PasswordRules";
import { DataTable, type Column } from "@/components/common/DataTable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/providers/AuthProvider";
import { USERNAME_RE, passwordValid } from "../../../supabase/functions/_shared/auth-core.ts";

type ManagedUser = {
  id: string;
  username: string;
  role: AppRole;
  banned: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

const ROLES: AppRole[] = ["admin", "trader", "viewer"];

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return data as T;
}

export function UserManagement() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "trader" as AppRole });
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [nameState, setNameState] = useState<"idle" | "checking" | "free" | "taken" | "invalid">("idle");

  useEffect(() => {
    const u = form.username.trim().toLowerCase();
    if (!u) return setNameState("idle");
    if (!USERNAME_RE.test(u)) return setNameState("invalid");
    setNameState("checking");
    const id = window.setTimeout(() => {
      call<{ available: boolean }>({ action: "check_username", username: u })
        .then((r) => setNameState(r.available ? "free" : "taken"))
        .catch(() => setNameState("idle"));
    }, 350);
    return () => window.clearTimeout(id);
  }, [form.username]);

  const createValid = nameState === "free" && passwordValid(form.password) && form.password === confirmPw;
  const resetValid = passwordValid(newPw) && newPw === newPw2;

  const list = useQuery({
    queryKey: ["admin_users"],
    queryFn: () => call<{ users: ManagedUser[] }>({ action: "list" }).then((r) => r.users),
  });

  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => call(body),
    onSuccess: () => {
      toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["admin_users"] });
      void qc.invalidateQueries({ queryKey: ["audit_log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<ManagedUser>[] = [
    { key: "username", header: t("auth.username"), render: (r) => <span className="font-semibold">{r.username}</span> },
    {
      key: "role",
      header: t("users.role"),
      render: (r) => (
        <Select
          value={r.role}
          disabled={r.id === user?.id}
          onValueChange={(v) => run.mutate({ action: "set_role", user_id: r.id, role: v })}
        >
          <SelectTrigger className="h-7 w-28 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((ro) => (
              <SelectItem key={ro} value={ro} className="text-[11px]">
                {ro}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      render: (r) => (
        <span className={r.banned ? "font-semibold text-danger" : "font-semibold text-success"}>
          {r.banned ? t("users.banned") : t("users.active")}
        </span>
      ),
    },
    { key: "created", header: t("users.created"), render: (r) => new Date(r.created_at).toLocaleDateString() },
    {
      key: "last",
      header: t("users.lastLogin"),
      render: (r) => (r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString() : "—"),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (r) => {
        const self = r.id === user?.id;
        return (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" title={t("users.resetPassword")} onClick={() => { setNewPw(""); setNewPw2(""); setResetFor(r); }}>
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={self}
              title={r.banned ? t("users.unban") : t("users.ban")}
              onClick={() => run.mutate({ action: r.banned ? "unban" : "ban", user_id: r.id })}
            >
              {r.banned ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" disabled={self} title={t("users.delete")} onClick={() => setDeleteFor(r)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("users.title")}</h2>
        <Button size="sm" className="h-7 text-[11px] uppercase" onClick={() => { setForm({ username: "", password: "", role: "trader" }); setConfirmPw(""); setCreateOpen(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t("users.create")}
        </Button>
      </div>
      <DataTable columns={columns} rows={list.data ?? []} isLoading={list.isLoading} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("users.create")}</DialogTitle>
          </DialogHeader>
          <form
            id="create-user"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!createValid) return;
              run.mutate(
                { action: "create", ...form, username: form.username.trim().toLowerCase() },
                { onSuccess: () => setCreateOpen(false) },
              );
            }}
          >
            <div className="space-y-1">
              <Label className="text-[11px] uppercase">{t("auth.username")}</Label>
              <Input required autoComplete="off" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="h-9" />
              {nameState !== "idle" && (
                <p data-testid="username-state" className={nameState === "free" ? "text-[11px] text-success" : nameState === "checking" ? "text-[11px] text-muted-foreground" : "text-[11px] text-danger"}>
                  {t(`users.name.${nameState}`)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase">{t("auth.password")}</Label>
              <PasswordInput required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase">{t("pw.confirm")}</Label>
              <PasswordInput required autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="h-9" />
            </div>
            <PasswordRules password={form.password} confirm={confirmPw} />
            <div className="space-y-1">
              <Label className="text-[11px] uppercase">{t("users.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((ro) => <SelectItem key={ro} value={ro}>{ro}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="create-user" disabled={run.isPending || !createValid}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("users.resetPassword")}: {resetFor?.username}</DialogTitle>
          </DialogHeader>
          <form
            id="reset-pw"
            onSubmit={(e) => {
              e.preventDefault();
              if (resetFor && resetValid) run.mutate({ action: "reset_password", user_id: resetFor.id, password: newPw }, { onSuccess: () => setResetFor(null) });
            }}
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("users.newPassword")}</Label>
                <PasswordInput required autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("pw.confirm")}</Label>
                <PasswordInput required autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className="h-9" />
              </div>
              <PasswordRules password={newPw} confirm={newPw2} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetFor(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="reset-pw" disabled={run.isPending || !resetValid}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.delete")}: {deleteFor?.username}</AlertDialogTitle>
            <AlertDialogDescription>{t("users.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFor && run.mutate({ action: "delete", user_id: deleteFor.id })}>
              {t("users.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
