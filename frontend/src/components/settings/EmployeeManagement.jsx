import React, { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, PauseCircle, Pencil, PlayCircle, Save, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ROLE_LABELS = { owner: "Propriétaire", admin: "Administrateur", employee: "Employé", reception: "Accueil" };
const DEFAULT_PERMISSIONS = { appointments_own: true, clients: true, product_usage: true, history: true };
const PERMISSIONS = [
  ["appointments_own", "Ses rendez-vous"], ["appointments_all", "Agenda global"],
  ["clients", "Clients"], ["stock", "Stock"], ["product_usage", "Utilisation produits"],
  ["history", "Historique"], ["orders", "Commandes"],
];

export default function EmployeeManagement() {
  const { activeCompany, user } = useAuth();
  const canManage = ["owner", "admin"].includes(activeCompany?.role);
  const companyId = activeCompany?.id;
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", phone: "", password: "", role: "employee", permissions: DEFAULT_PERMISSIONS });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!canManage || !companyId) return;
    setLoading(true);
    try {
      const response = await api.get("/company/members");
      setMembers(response.data.members || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de charger l'équipe");
    } finally { setLoading(false); }
  }, [canManage, companyId]);

  useEffect(() => { load(); }, [load]);

  const createEmployee = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await api.post("/company/members/create", { ...form, email: form.email.trim().toLowerCase() });
      toast.success(response.data.message);
      setForm({ email: "", first_name: "", last_name: "", phone: "", password: "", role: "employee", permissions: DEFAULT_PERMISSIONS });
      setShowPassword(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Création impossible");
    } finally { setCreating(false); }
  };

  const patchMember = async (member, changes) => {
    try {
      await api.patch("/company/members/" + member.user_id, changes);
      await load();
      toast.success("Employé mis à jour");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Modification impossible");
      return false;
    }
  };

  const startEditing = (member) => {
    const nameParts = (member.name || "").trim().split(/\s+/);
    setEditing({
      user_id: member.user_id,
      first_name: member.first_name || nameParts[0] || "",
      last_name: member.last_name || nameParts.slice(1).join(" "),
      email: member.email || "",
      phone: member.phone || "",
      role: member.role,
      permissions: { ...(member.permissions || {}) },
    });
  };

  const saveEditing = async (member) => {
    const ok = await patchMember(member, {
      first_name: editing.first_name.trim(),
      last_name: editing.last_name.trim(),
      email: editing.email.trim().toLowerCase(),
      phone: editing.phone.trim(),
      role: editing.role,
      permissions: editing.permissions,
    });
    if (ok) setEditing(null);
  };

  const remove = async (member) => {
    if (!window.confirm("Retirer l'accès de " + member.email + " tout en conservant son historique ?")) return;
    try { await api.delete("/company/members/" + member.user_id); await load(); toast.success("Accès retiré, historique conservé"); }
    catch (error) { toast.error(error.response?.data?.detail || "Suppression impossible"); }
  };

  if (!canManage) return <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">Vous n'avez pas la permission de gérer l'équipe.</div>;

  return <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
    <div className="flex gap-3 mb-5"><Users className="w-6 h-6 text-[#8A6A1F]" /><div><h2 className="font-serif text-2xl">Employés et accès</h2><p className="text-sm text-slate-500">Créez directement le compte et choisissez ses accès pour {activeCompany?.name}.</p></div></div>
    <form onSubmit={createEmployee} className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <input required placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="bg-white border rounded-xl px-4 py-3" />
        <input required placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="bg-white border rounded-xl px-4 py-3" />
        <input type="email" required placeholder="employe@exemple.fr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-white border rounded-xl px-4 py-3" />
        <input type="tel" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-white border rounded-xl px-4 py-3" />
        <div className="relative"><input type={showPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full bg-white border rounded-xl pl-4 pr-11 py-3" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-white border rounded-xl px-4 py-3"><option value="employee">Employé</option><option value="reception">Accueil / réception</option>{activeCompany?.role === "owner" && <option value="admin">Administrateur</option>}</select>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{PERMISSIONS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs bg-white border rounded-xl px-3 py-2"><input type="checkbox" checked={Boolean(form.permissions[key])} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })} />{label}</label>)}</div>
      <p className="text-xs text-slate-500">Le compte est actif immédiatement. Communiquez le mot de passe à l'employé de manière confidentielle.</p>
      <button disabled={creating} className="bg-[#0A192F] text-white rounded-full px-6 py-3 flex items-center gap-2"><UserPlus className="w-4 h-4" />{creating ? "Création…" : "Créer l'employé"}</button>
    </form>
    <div className="divide-y">{loading && <div className="py-4">Chargement…</div>}{members.map((member) => {
      const protectedMember = member.role === "owner" || member.is_current_user || (activeCompany?.role === "admin" && member.role === "admin");
      const isEditing = editing?.user_id === member.user_id;
      return <div key={member.user_id} className="py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">{(member.name || "E")[0].toUpperCase()}</div>
          <div className="flex-1 min-w-[180px]"><div className="font-medium truncate">{member.name}</div><div className="text-xs text-slate-500">{member.email}</div></div>
          <div className="text-right"><div className="text-xs font-medium">{ROLE_LABELS[member.role] || member.role}</div><div className="text-[10px] text-slate-500">{member.status}{member.email === user?.email ? " · votre compte" : ""}</div></div>
          {!protectedMember && <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => startEditing(member)} className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50"><Pencil className="w-4 h-4" />Modifier</button>
            <button type="button" onClick={() => patchMember(member, { status: member.status === "active" ? "suspended" : "active" })} className="inline-flex items-center gap-2 rounded-full border border-amber-300 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50">{member.status === "active" ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}{member.status === "active" ? "Suspendre" : "Réactiver"}</button>
            <button type="button" onClick={() => remove(member)} className="inline-flex items-center gap-2 rounded-full border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" />Supprimer</button>
          </div>}
        </div>
        {isEditing && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-medium">Modifier {member.name}</h3><button type="button" onClick={() => setEditing(null)} aria-label="Fermer"><X className="w-4 h-4" /></button></div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm">Prénom<input required value={editing.first_name} onChange={(e) => setEditing({ ...editing, first_name: e.target.value })} className="mt-1 w-full bg-white border rounded-xl px-4 py-3" /></label>
            <label className="text-sm">Nom<input required value={editing.last_name} onChange={(e) => setEditing({ ...editing, last_name: e.target.value })} className="mt-1 w-full bg-white border rounded-xl px-4 py-3" /></label>
            <label className="text-sm">Adresse e-mail<input type="email" required value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="mt-1 w-full bg-white border rounded-xl px-4 py-3" /></label>
            <label className="text-sm">Téléphone<input type="tel" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="mt-1 w-full bg-white border rounded-xl px-4 py-3" /></label>
          </div>
          <label className="block text-sm">Rôle
            <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className="mt-1 w-full bg-white border rounded-xl px-4 py-3">
              <option value="employee">Employé</option><option value="reception">Accueil / réception</option>{activeCompany?.role === "owner" && <option value="admin">Administrateur</option>}
            </select>
          </label>
          <div><div className="text-sm mb-2">Autorisations</div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{PERMISSIONS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs bg-white border rounded-xl px-3 py-2"><input type="checkbox" checked={Boolean(editing.permissions[key])} onChange={(e) => setEditing({ ...editing, permissions: { ...editing.permissions, [key]: e.target.checked } })} />{label}</label>)}</div></div>
          <div className="flex gap-2"><button type="button" onClick={() => saveEditing(member)} className="inline-flex items-center gap-2 rounded-full bg-[#0A192F] text-white px-5 py-2.5"><Save className="w-4 h-4" />Enregistrer</button><button type="button" onClick={() => setEditing(null)} className="rounded-full border px-5 py-2.5">Annuler</button></div>
        </div>}
      </div>;
    })}</div>
  </section>;
}
