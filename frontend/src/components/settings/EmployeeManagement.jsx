import React, { useEffect, useState } from "react";
import { Mail, PauseCircle, PlayCircle, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ROLE_LABELS = { owner: "Propriétaire", admin: "Administrateur", employee: "Employé", reception: "Accueil" };
const PERMISSIONS = [
  ["appointments_own", "Ses rendez-vous"], ["appointments_all", "Agenda global"],
  ["clients", "Clients"], ["stock", "Stock"], ["product_usage", "Utilisation produits"],
  ["history", "Historique"], ["orders", "Commandes"],
];

export default function EmployeeManagement() {
  const { activeCompany, user } = useAuth();
  const canManage = ["owner", "admin"].includes(activeCompany?.role);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    email: "", name: "", role: "employee",
    permissions: { appointments_own: true, clients: true, product_usage: true, history: true },
  });
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const response = await api.get("/company/members");
      setMembers(response.data.members || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de charger l'équipe");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeCompany?.id, canManage]);
  if (!canManage) return <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">Vous n'avez pas la permission de gérer l'équipe.</div>;

  const invite = async (event) => {
    event.preventDefault();
    setInviting(true);
    try {
      const response = await api.post("/company/members/invite", { ...form, email: form.email.trim().toLowerCase() });
      toast.success(response.data.message);
      setForm({ email: "", name: "", role: "employee", permissions: { appointments_own: true, clients: true, product_usage: true, history: true } });
      await load();
    } catch (error) { toast.error(error.response?.data?.detail || "Invitation impossible"); }
    finally { setInviting(false); }
  };

  const patchMember = async (member, changes) => {
    try { await api.patch(`/company/members/${member.user_id}`, changes); await load(); toast.success("Accès mis à jour"); }
    catch (error) { toast.error(error.response?.data?.detail || "Modification impossible"); }
  };
  const remove = async (member) => {
    if (!window.confirm(`Retirer l'accès de ${member.email} tout en conservant son historique ?`)) return;
    try { await api.delete(`/company/members/${member.user_id}`); await load(); toast.success("Accès retiré, historique conservé"); }
    catch (error) { toast.error(error.response?.data?.detail || "Suppression impossible"); }
  };
  const resend = async (member) => {
    try { const response = await api.post(`/company/members/${member.user_id}/resend`); await load(); toast.success(response.data.message); }
    catch (error) { toast.error(error.response?.data?.detail || "Renvoi impossible"); }
  };
  const revoke = async (member) => {
    if (!window.confirm(`Révoquer l'invitation de ${member.email} ?`)) return;
    try { await api.post(`/company/members/${member.user_id}/revoke`); await load(); toast.success("Invitation révoquée"); }
    catch (error) { toast.error(error.response?.data?.detail || "Révocation impossible"); }
  };

  return <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
    <div className="flex gap-3 mb-5"><Users className="w-6 h-6 text-[#8A6A1F]" /><div><h2 className="font-serif text-2xl">Employés et accès</h2><p className="text-sm text-slate-500">Invitations sécurisées et permissions pour {activeCompany?.name}.</p></div></div>
    <form onSubmit={invite} className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <input type="email" required placeholder="employe@exemple.fr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-white border rounded-xl px-4 py-3" />
        <input required placeholder="Prénom et nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white border rounded-xl px-4 py-3" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-white border rounded-xl px-4 py-3"><option value="employee">Employé</option><option value="reception">Accueil / réception</option>{activeCompany?.role === "owner" && <option value="admin">Administrateur</option>}</select>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{PERMISSIONS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs bg-white border rounded-xl px-3 py-2"><input type="checkbox" checked={Boolean(form.permissions[key])} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })} />{label}</label>)}</div>
      <p className="text-xs text-slate-500">Le lien personnel est à usage unique et expire après une heure.</p>
      <button disabled={inviting} className="bg-[#0A192F] text-white rounded-full px-6 py-3 flex items-center gap-2"><UserPlus className="w-4 h-4" />{inviting ? "Envoi…" : "Envoyer l'invitation"}</button>
    </form>
    <div className="divide-y">{loading && <div className="py-4">Chargement…</div>}{members.map((member) => {
      const protectedMember = member.role === "owner" || member.is_current_user || (activeCompany?.role === "admin" && member.role === "admin");
      return <div key={member.user_id} className="py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">{(member.name || "E")[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0"><div className="font-medium truncate">{member.name}</div><div className="text-xs text-slate-500">{member.email}</div></div>
        <div className="text-right"><div className="text-xs font-medium">{ROLE_LABELS[member.role] || member.role}</div><div className="text-[10px] text-slate-500">{member.status}{member.email === user?.email ? " · votre compte" : ""}</div></div>
        {member.status === "invited" ? <><button onClick={() => resend(member)} title="Renvoyer l'invitation"><Mail className="w-4 h-4 text-blue-700" /></button><button onClick={() => revoke(member)} title="Révoquer l'invitation"><XCircle className="w-4 h-4 text-red-700" /></button></> : !protectedMember && <><button onClick={() => patchMember(member, { status: member.status === "active" ? "suspended" : "active" })} title={member.status === "active" ? "Suspendre" : "Réactiver"}>{member.status === "active" ? <PauseCircle className="w-4 h-4 text-amber-700" /> : <PlayCircle className="w-4 h-4 text-green-700" />}</button><button onClick={() => remove(member)} title="Retirer"><Trash2 className="w-4 h-4 text-red-700" /></button></>}
      </div>;
    })}</div>
  </section>;
}
