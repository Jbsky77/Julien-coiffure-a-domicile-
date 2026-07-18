import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MessageCircle, Plus, Send, Users, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Chat() {
  const [threads, setThreads] = useState([]);
  const [people, setPeople] = useState({ members: [], can_contact_platform_admin: false });
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", ids: [], all: false, admin: false });

  const load = async () => {
    const [t, p] = await Promise.all([api.get("/chat/conversations"), api.get("/chat/participants")]);
    setThreads(t.data); setPeople(p.data);
  };
  useEffect(() => { load(); const timer = setInterval(load, 8000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!active) return;
    const run = () => api.get(`/chat/conversations/${active.id}/messages`).then(r => setMessages(r.data));
    run(); const timer = setInterval(run, 4000); return () => clearInterval(timer);
  }, [active]);

  const create = async () => {
    if (!form.all && !form.admin && !form.ids.length) return toast.error("Choisissez au moins un destinataire");
    const r = await api.post("/chat/conversations", { title: form.title, participant_user_ids: form.ids, all_company: form.all, with_platform_admin: form.admin });
    setCreating(false); setForm({ title: "", ids: [], all: false, admin: false }); await load(); setActive(r.data);
  };
  const removeConversation = async () => {
    if (!active) return;
    if (!window.confirm(`Supprimer définitivement la conversation « ${active.title} » pour tous les participants ?`)) return;
    try {
      await api.delete(`/chat/conversations/${active.id}`);
      setActive(null);
      setMessages([]);
      await load();
      toast.success("Conversation supprimée pour tous les participants");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de supprimer la conversation");
    }
  };
  const send = async () => {
    if (!text.trim() || !active) return;
    await api.post(`/chat/conversations/${active.id}/messages`, { body: text.trim() });
    setText(""); const r = await api.get(`/chat/conversations/${active.id}/messages`); setMessages(r.data); load();
  };

  return <div className="space-y-6" data-testid="chat-page">
    <div className="flex items-end justify-between">
      <div><div className="text-[10px] tracking-[.3em] uppercase text-slate-500 mb-2">Communication</div><h1 className="font-serif text-4xl md:text-5xl">Messages</h1></div>
      <button onClick={() => setCreating(true)} className="bg-[#0A192F] text-white rounded-full px-5 py-3 flex gap-2 items-center"><Plus className="w-4 h-4"/> Nouvelle conversation</button>
    </div>
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 min-h-[620px]">
      <aside className="bg-white rounded-3xl border border-slate-100 p-3 space-y-2">
        {threads.length === 0 && <p className="text-sm text-slate-500 p-4">Aucune conversation.</p>}
        {threads.map(t => <button key={t.id} onClick={() => setActive(t)} className={`w-full text-left p-4 rounded-2xl border ${active?.id===t.id?"bg-violet-50 border-violet-200":"border-transparent hover:bg-slate-50"}`}>
          <div className="flex justify-between gap-2"><span className="font-medium truncate">{t.title}</span>{t.unread_count>0&&<span className="bg-violet-600 text-white text-xs min-w-5 h-5 rounded-full flex items-center justify-center">{t.unread_count}</span>}</div>
          <div className="text-xs text-slate-500 truncate mt-1">{t.last_message || "Nouvelle conversation"}</div>
        </button>)}
      </aside>
      <section className="bg-white rounded-3xl border border-slate-100 flex flex-col overflow-hidden">
        {!active ? <div className="flex-1 flex flex-col items-center justify-center text-slate-400"><MessageCircle className="w-12 h-12 mb-3"/><p>Choisissez une conversation</p></div> :
        <><header className="p-5 border-b border-slate-100 flex items-center justify-between gap-3"><h2 className="font-semibold">{active.title}</h2><button onClick={removeConversation} className="inline-flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 rounded-full px-3 py-2 transition" aria-label="Supprimer la conversation"><Trash2 className="w-4 h-4" /> Supprimer</button></header>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{messages.map(m=><div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.sender_type==="client"?"bg-pink-50":"bg-violet-50"}`}><div className="text-xs font-medium text-slate-500 mb-1">{m.sender_name}</div><div className="text-sm whitespace-pre-wrap">{m.body}</div></div>)}</div>
        <div className="p-4 border-t border-slate-100 flex gap-2"><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} rows={2} placeholder="Écrire un message…" className="flex-1 border rounded-2xl px-4 py-3 resize-none"/><button onClick={send} className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center"><Send className="w-4 h-4"/></button></div></>}
      </section>
    </div>
    {creating&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 w-full max-w-lg space-y-4">
      <div className="flex justify-between"><h2 className="font-serif text-2xl">Nouvelle conversation</h2><button onClick={()=>setCreating(false)}><X/></button></div>
      <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Titre de la conversation" className="w-full border rounded-xl px-4 py-3"/>
      <label className="flex gap-3 p-3 border rounded-xl"><input type="checkbox" checked={form.all} onChange={e=>setForm({...form,all:e.target.checked,admin:false,ids:[]})}/><Users className="w-5 h-5"/> Toute l’entreprise</label>
      {people.can_contact_platform_admin&&<label className="flex gap-3 p-3 border rounded-xl"><input type="checkbox" checked={form.admin} onChange={e=>setForm({...form,admin:e.target.checked,all:false,ids:[]})}/> Administrateur de la plateforme</label>}
      <div className="max-h-52 overflow-y-auto space-y-2">{people.members.map(p=><label key={p.id} className="flex gap-3 p-3 border rounded-xl"><input type="checkbox" disabled={form.all||form.admin} checked={form.ids.includes(p.id)} onChange={e=>setForm({...form,ids:e.target.checked?[...form.ids,p.id]:form.ids.filter(x=>x!==p.id)})}/><span>{p.name} <small className="text-slate-400">· {p.role}</small></span></label>)}</div>
      <button onClick={create} className="w-full bg-[#0A192F] text-white rounded-full py-3">Créer la conversation</button>
    </div></div>}
  </div>;
}
