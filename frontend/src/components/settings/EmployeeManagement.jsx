import React, { useEffect, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ROLE_LABELS = {
  owner: "Propriétaire",
  admin: "Administrateur",
  employee: "Employé",
};

export default function EmployeeManagement() {
  const { activeCompany, user } = useAuth();
  const canManage = ["owner", "admin"].includes(activeCompany?.role);
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const response = await api.get("/company/members");
      setMembers(response.data.members || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de charger les employés");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // The active company controls the member list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, canManage]);

  if (!canManage) return null;

  const invite = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return toast.error("Adresse e-mail requise");
    setInviting(true);
    try {
      const response = await api.post("/company/members/invite", { email: normalizedEmail, password, role });
      toast.success(response.data.message || "Employé ajouté");
      setEmail("");
      setPassword("");
      setRole("employee");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible d'ajouter cet employé");
    } finally {
      setInviting(false);
    }
  };

  const remove = async (member) => {
    if (!window.confirm(`Retirer l'accès de ${member.email} ?`)) return;
    try {
      await api.delete(`/company/members/${member.user_id}`);
      toast.success("Accès retiré");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de retirer cet accès");
    }
  };

  return (
    <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="employees-section">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-[#8A6A1F]" />
        </div>
        <div>
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Équipe</div>
          <h2 className="font-serif text-2xl">Employés et accès</h2>
          <p className="text-sm text-slate-500 mt-1">Créez un accès immédiatement utilisable pour {activeCompany?.name}.</p>
        </div>
      </div>

      <form onSubmit={invite} className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-4" data-testid="employee-invite-form">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_190px] gap-4">
          <label className="text-sm">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Adresse e-mail professionnelle</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employe@exemple.fr"
              className="mt-2 w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#0A192F]"
              data-testid="employee-email"
            />
          </label>
          <label className="text-sm">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Mot de passe initial</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8 caractères minimum"
              autoComplete="new-password"
              className="mt-2 w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#0A192F]"
              data-testid="employee-password"
            />
          </label>
          <label className="text-sm">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Rôle</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="mt-2 w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#0A192F]"
              data-testid="employee-role"
            >
              <option value="employee">Employé</option>
              {activeCompany?.role === "owner" && <option value="admin">Administrateur</option>}
            </select>
          </label>
        </div>
        <div className="text-xs text-slate-500">
          Le compte sera actif immédiatement, sans confirmation par e-mail. Transmettez ces identifiants à l’employé par un moyen sûr.
        </div>
        <button
          type="submit"
          disabled={inviting}
          className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2 disabled:opacity-50"
          data-testid="employee-invite-button"
        >
          <UserPlus className="w-4 h-4" />
          {inviting ? "Création en cours…" : "Créer le compte employé"}
        </button>
      </form>

      <div className="divide-y divide-slate-100">
        {loading && <div className="py-4 text-sm text-slate-500">Chargement de l'équipe…</div>}
        {!loading && members.map((member) => {
          const protectedMember = member.role === "owner"
            || member.is_current_user
            || (activeCompany?.role === "admin" && member.role === "admin");
          return (
            <div key={member.user_id} className="py-4 flex items-center gap-3" data-testid={`employee-row-${member.user_id}`}>
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-medium text-slate-600">
                {(member.name || member.email || "E").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{member.name || member.email}</div>
                <div className="text-xs text-slate-500 truncate">{member.email}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium">{ROLE_LABELS[member.role] || member.role}</div>
                {member.invitation_pending && <div className="text-[10px] text-amber-700">Invitation envoyée</div>}
                {member.email === user?.email && <div className="text-[10px] text-slate-400">Votre compte</div>}
              </div>
              {!protectedMember && (
                <button
                  type="button"
                  onClick={() => remove(member)}
                  className="p-2 rounded-full text-[#991B1B] hover:bg-red-50"
                  title="Retirer l'accès"
                  data-testid={`employee-remove-${member.user_id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
