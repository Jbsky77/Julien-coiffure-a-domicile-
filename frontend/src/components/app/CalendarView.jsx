import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { money, fmtTime, genderClasses } from "@/lib/api";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday first
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return a.toDateString() === b.toDateString(); }

export default function CalendarView({ appointments, clientMap = {}, view, cursor, setCursor }) {
  const byDay = useMemo(() => {
    const map = {};
    appointments.forEach((r) => {
      try {
        const d = new Date(r.date);
        const k = d.toDateString();
        (map[k] ||= []).push({ ...r, _d: d });
      } catch {}
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a._d - b._d));
    return map;
  }, [appointments]);

  if (view === "week") {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setCursor(addDays(cursor, -7))} className="px-3 py-1.5 text-sm rounded-full border border-slate-200" data-testid="cal-prev">←</button>
          <div className="font-serif text-xl">{days[0].getDate()} – {days[6].getDate()} {MONTHS[days[6].getMonth()]} {days[6].getFullYear()}</div>
          <button onClick={() => setCursor(addDays(cursor, 7))} className="px-3 py-1.5 text-sm rounded-full border border-slate-200" data-testid="cal-next">→</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {days.map((d) => {
            const items = byDay[d.toDateString()] || [];
            const today = sameDay(d, new Date());
            return (
              <div key={d.toISOString()} className={`bg-white border rounded-2xl p-4 min-h-[160px] ${today ? "border-[#0A192F]" : "border-slate-100"}`}>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">{WEEKDAYS[(d.getDay()+6)%7]}</div>
                <div className={`font-serif text-2xl ${today ? "text-[#D4AF37]" : ""}`}>{d.getDate()}</div>
                <ul className="mt-3 space-y-1.5">
                  {items.map((r) => {
                    const cl = clientMap[r.client_id];
                    const gc = genderClasses(cl?.gender);
                    return (
                      <li key={r.id}>
                        <Link to={`/rdv/${r.id}`} className={`block text-xs p-2 rounded-lg ${gc.bg} border ${gc.border} hover:opacity-80`}>
                          <span className="font-medium">{fmtTime(r.date)}</span> · {r.client_name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Month view
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="px-3 py-1.5 text-sm rounded-full border border-slate-200" data-testid="cal-prev">←</button>
        <div className="font-serif text-xl capitalize">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="px-3 py-1.5 text-sm rounded-full border border-slate-200" data-testid="cal-next">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-widest text-slate-400">
        {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const items = byDay[d.toDateString()] || [];
          const today = sameDay(d, new Date());
          return (
            <div key={d.toISOString()} className={`bg-white border rounded-xl p-2 min-h-[92px] ${today ? "border-[#0A192F]" : "border-slate-100"} ${inMonth ? "" : "opacity-40"}`}>
              <div className={`text-sm font-medium ${today ? "text-[#D4AF37]" : ""}`}>{d.getDate()}</div>
              <ul className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((r) => {
                  const cl = clientMap[r.client_id];
                  const tint = cl?.gender === "F" ? "text-pink-700" : cl?.gender === "H" ? "text-blue-700" : "text-slate-600";
                  return (
                    <li key={r.id} className="truncate text-[10px]">
                      <Link to={`/rdv/${r.id}`} className={`${tint} hover:opacity-70`}>
                        <span className="text-[#1E3A8A]">{fmtTime(r.date)}</span> {r.client_name}
                      </Link>
                    </li>
                  );
                })}
                {items.length > 3 && <li className="text-[10px] text-slate-400">+{items.length - 3}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
