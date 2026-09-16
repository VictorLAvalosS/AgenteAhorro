import { useState, useEffect } from "react";
import robotImg from "@/imports/image.png";
import { supabase } from "./lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "inicio" | "gastos" | "hogar" | "prestamos" | "metas" | "asistente";
type Moneda = "Bs" | "USD";

interface Gasto {
  id: string;
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "gasto" | "ingreso";
  moneda: Moneda;
}

interface Prestamo {
  id: string;
  deudor: string;
  capital: number;
  interes: number;
  fechaInicio: string;
  cuotas: number;
  cuotasPagadas: number;
  estado: "activo" | "pagado";
  moneda: Moneda;
}

interface Meta {
  id: string;
  nombre: string;
  emoji: string;
  meta: number;
  ahorrado: number;
  color: string;
  moneda: Moneda;
}

interface GastoHogar {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: "limpieza" | "comida" | "mascotas" | "servicios" | "otro";
  dividir: boolean;
  hermanos: number;
  pagadoPor: string;
  moneda: Moneda;
}

interface ChatMsg {
  id: number;
  role: "user" | "bot";
  text: string;
}

interface Evento {
  id: number;
  dia: string;
  hora: string;
  titulo: string;
  tipo: "trabajo" | "estudio" | "salud" | "otro";
}

// ─── Initial Data ─────────────────────────────────────────────────────────────

const eventosIniciales: Evento[] = [
  { id: 1, dia: "Lunes", hora: "08:00", titulo: "Taller — turno mañana", tipo: "trabajo" },
  { id: 2, dia: "Lunes", hora: "18:00", titulo: "Clases — Matemáticas", tipo: "estudio" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATS_GASTO = ["Taller", "Comida", "Transporte", "Estudios", "Salud", "Préstamo", "Antojo", "Ropa", "Servicios", "Otro"];

function fmt(n: number, mon: Moneda = "Bs") {
  const symbol = mon === "Bs" ? "Bs" : "$";
  return symbol + " " + n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function cuotaConInteres(capital: number, interesPct: number) {
  return capital + (capital * interesPct) / 100;
}

function catEmoji(cat: string): string {
  const map: Record<string, string> = {
    Taller: "🔧", Comida: "🍽️", Transporte: "🚌", Estudios: "📚",
    Salud: "💊", Préstamo: "🤝", Antojo: "🍕", Ropa: "👕", Servicios: "💡", Otro: "📦",
    limpieza: "🧴", comida: "🛒", mascotas: "🐕", servicios: "💡", otro: "📦",
  };
  return map[cat] ?? "💰";
}

// ─── Robot SVG Avatar ─────────────────────────────────────────────────────────

function RobotAvatar({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="38" fill="#f59e0b" opacity="0.08" />
      <line x1="50" y1="14" x2="50" y2="22" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="11" r="4" fill="#f59e0b" />
      <rect x="26" y="22" width="48" height="36" rx="12" fill="#1f2937" stroke="#30363d" strokeWidth="1.5" />
      <circle cx="38" cy="38" r="7" fill="#0d1117" />
      <circle cx="62" cy="38" r="7" fill="#0d1117" />
      <circle cx="38" cy="38" r="4" fill="#f59e0b" opacity="0.9" />
      <circle cx="62" cy="38" r="4" fill="#f59e0b" opacity="0.9" />
      <circle cx="39.5" cy="36.5" r="1.5" fill="white" />
      <circle cx="63.5" cy="36.5" r="1.5" fill="white" />
      <path d="M40 48 Q50 54 60 48" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="44" y="58" width="12" height="6" rx="3" fill="#1f2937" stroke="#30363d" strokeWidth="1" />
      <rect x="22" y="64" width="56" height="28" rx="12" fill="#161b22" stroke="#30363d" strokeWidth="1.5" />
      <circle cx="50" cy="75" r="5" fill="#f59e0b" opacity="0.3" />
      <circle cx="50" cy="75" r="3" fill="#f59e0b" opacity="0.7" />
      <rect x="10" y="66" width="12" height="20" rx="6" fill="#1f2937" stroke="#30363d" strokeWidth="1.5" />
      <rect x="78" y="66" width="12" height="20" rx="6" fill="#1f2937" stroke="#30363d" strokeWidth="1.5" />
      <circle cx="35" cy="77" r="2.5" fill="#14b8a6" opacity="0.8" />
      <circle cx="65" cy="77" r="2.5" fill="#a855f7" opacity="0.8" />
    </svg>
  );
}

// ─── Components ───────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="h-2 rounded-full bg-[#30363d] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (usuario: { id: string, nombre: string, email: string }) => void }) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !nombre.trim()) return;
    setLoading(true);
    
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email.trim())
      .single();

    if (existingUser) {
      onLogin(existingUser);
    } else {
      // Create new user
      const { data: newUser, error } = await supabase
        .from('usuarios')
        .insert([{ nombre: nombre.trim(), email: email.trim() }])
        .select()
        .single();
        
      if (newUser) onLogin(newUser);
      else console.error(error);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-6">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-10" style={{ background: "#f59e0b", filter: "blur(80px)" }} />
      {step === "intro" ? (
        <div className="relative flex flex-col items-center text-center max-w-xs">
          <div className="mb-6 relative">
            <RobotAvatar size={120} />
            <div className="absolute inset-0 rounded-full border-2 border-[#f59e0b] opacity-20 animate-ping" style={{ animationDuration: "2s" }} />
          </div>
          <h1 className="font-display font-extrabold text-3xl text-[#e6edf3] mb-2 tracking-tight">
            Hola! Soy <span className="text-[#f59e0b]">AHORRO</span>
          </h1>
          <p className="text-[#8b949e] text-sm leading-relaxed mb-8">
            Tu agente personal de finanzas. Te ayudo a organizar tu plata, tus préstamos, tus gastos de casa y mucho más.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button onClick={() => setStep("form")} className="w-full py-4 rounded-2xl bg-[#f59e0b] text-[#0d1117] font-display font-bold text-base hover:bg-[#fbbf24] transition-all shadow-lg">
              Empezar →
            </button>
          </div>
        </div>
      ) : (
        <div className="relative w-full max-w-xs">
          <div className="flex justify-center mb-6"><RobotAvatar size={80} /></div>
          <h2 className="font-display font-bold text-xl text-[#e6edf3] text-center mb-1">¿Cómo te llamo?</h2>
          <div className="space-y-3 mt-4">
            <input type="text" placeholder="Ej: Lucas" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b]" />
            <input type="email" placeholder="tucorreo@gmail.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b]" />
            <button onClick={handleLogin} disabled={loading || !email.trim() || !nombre.trim()} className="w-full py-4 rounded-2xl bg-[#f59e0b] text-[#0d1117] font-display font-bold text-sm hover:bg-[#fbbf24] transition-all disabled:opacity-40 mt-2">
              {loading ? "Cargando..." : "Ingresar al agente ✓"}
            </button>
            <button onClick={() => setStep("intro")} className="w-full py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors">← Volver</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── INICIO ───────────────────────────────────────────────────────────────────

function Inicio({ gastos, prestamos, metas, hogar, nombre }: {
  gastos: Gasto[]; prestamos: Prestamo[]; metas: Meta[]; hogar: GastoHogar[]; nombre: string;
}) {
  const calc = (moneda: Moneda) => {
    const ingresos = gastos.filter(g => g.tipo === "ingreso" && g.moneda === moneda).reduce((s, g) => s + g.monto, 0);
    const egresos = gastos.filter(g => g.tipo === "gasto" && g.moneda === moneda).reduce((s, g) => s + g.monto, 0);
    const balance = ingresos - egresos;
    
    const prestamosActivos = prestamos.filter(p => p.estado === "activo" && p.moneda === moneda);
    const porCobrar = prestamosActivos.reduce((s, p) => {
      const total = cuotaConInteres(p.capital, p.interes);
      const cuota = total / p.cuotas;
      return s + cuota * (p.cuotas - p.cuotasPagadas);
    }, 0);
    
    const debeHermanos = hogar.filter(g => g.dividir && g.moneda === moneda).reduce((s, g) => s + (g.monto / (g.hermanos + 1)) * g.hermanos, 0);
    return { ingresos, egresos, balance, porCobrar, debeHermanos };
  };

  const bs = calc("Bs");
  const usd = calc("USD");

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <RobotAvatar size={44} />
        <div>
          <p className="font-display font-bold text-[#e6edf3]">¡Hola, {nombre}! 👋</p>
          <p className="text-xs text-[#8b949e]">Miércoles 16 de septiembre</p>
        </div>
      </div>

      <div className="rounded-2xl p-5 bg-gradient-to-br from-[#1f2937] to-[#161b22] border border-[#30363d] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-5" style={{ background: "#f59e0b", filter: "blur(40px)" }} />
        <p className="text-xs text-[#8b949e] font-display uppercase tracking-widest mb-1">Balance General</p>
        <p className="font-mono text-3xl font-bold text-[#f59e0b] mb-1">{fmt(bs.balance, "Bs")}</p>
        <p className="font-mono text-xl font-bold text-[#f59e0b] opacity-80">{fmt(usd.balance, "USD")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 bg-[#14532d]/40 border border-[#22c55e]/20">
          <p className="text-xs text-[#8b949e] font-display uppercase mb-1">Ingresos</p>
          <p className="font-mono text-md font-bold text-[#22c55e]">{fmt(bs.ingresos, "Bs")}</p>
          <p className="font-mono text-xs text-[#22c55e]/80">{fmt(usd.ingresos, "USD")}</p>
        </div>
        <div className="rounded-xl p-4 bg-[#7f1d1d]/40 border border-[#ef4444]/20">
          <p className="text-xs text-[#8b949e] font-display uppercase mb-1">Gastos</p>
          <p className="font-mono text-md font-bold text-[#ef4444]">{fmt(bs.egresos, "Bs")}</p>
          <p className="font-mono text-xs text-[#ef4444]/80">{fmt(usd.egresos, "USD")}</p>
        </div>
        <div className="rounded-xl p-4 bg-[#134e4a]/40 border border-[#14b8a6]/20">
          <p className="text-xs text-[#8b949e] font-display uppercase mb-1">Por cobrar</p>
          <p className="font-mono text-md font-bold text-[#14b8a6]">{fmt(bs.porCobrar, "Bs")}</p>
          <p className="font-mono text-xs text-[#14b8a6]/80">{fmt(usd.porCobrar, "USD")}</p>
        </div>
        <div className="rounded-xl p-4 bg-[#4a1d96]/40 border border-[#a855f7]/20">
          <p className="text-xs text-[#8b949e] font-display uppercase mb-1">Me deben (Hogar)</p>
          <p className="font-mono text-md font-bold text-[#a855f7]">{fmt(bs.debeHermanos, "Bs")}</p>
          <p className="font-mono text-xs text-[#a855f7]/80">{fmt(usd.debeHermanos, "USD")}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-display font-semibold text-[#e6edf3] mb-3">Progreso de metas</p>
        <div className="space-y-3">
          {metas.map(m => (
            <div key={m.id} className="rounded-xl p-4 bg-[#161b22] border border-[#30363d]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-[#e6edf3]">{m.emoji} {m.nombre}</span>
                <span className="font-mono text-xs" style={{ color: m.color }}>{m.meta > 0 ? ((m.ahorrado / m.meta) * 100).toFixed(0) : 0}%</span>
              </div>
              <ProgressBar value={m.ahorrado} max={m.meta} color={m.color} />
              <div className="flex justify-between mt-1">
                <span className="font-mono text-xs text-[#8b949e]">{fmt(m.ahorrado, m.moneda)}</span>
                <span className="font-mono text-xs text-[#8b949e]">{fmt(m.meta, m.moneda)}</span>
              </div>
            </div>
          ))}
          {metas.length === 0 && <p className="text-xs text-[#8b949e]">No tenés metas configuradas.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── GASTOS ───────────────────────────────────────────────────────────────────

function Gastos({ gastos, onAdd, onDelete }: { gastos: Gasto[]; onAdd: (g: Partial<Gasto>) => void; onDelete: (id: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "gasto" | "ingreso">("todos");
  const [form, setForm] = useState({ descripcion: "", monto: "", categoria: "Comida", tipo: "gasto" as "gasto" | "ingreso", fecha: new Date().toISOString().slice(0, 10), moneda: "Bs" as Moneda });

  const lista = gastos.filter(g => filtro === "todos" || g.tipo === filtro).sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  function agregar() {
    if (!form.descripcion || !form.monto) return;
    onAdd({ ...form, monto: parseFloat(form.monto) });
    setForm({ ...form, descripcion: "", monto: "" });
    setShowForm(false);
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex gap-2">
        {(["todos", "ingreso", "gasto"] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} className={`flex-1 py-2 rounded-lg text-xs font-display font-semibold uppercase tracking-wide transition-all ${filtro === f ? "bg-[#f59e0b] text-[#0d1117]" : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"}`}>
            {f}
          </button>
        ))}
      </div>

      <button onClick={() => setShowForm(!showForm)} className="w-full py-3 rounded-xl bg-[#f59e0b] text-[#0d1117] font-display font-bold text-sm hover:bg-[#fbbf24] transition-colors">
        {showForm ? "✕ Cancelar" : "+ Registrar movimiento"}
      </button>

      {showForm && (
        <div className="rounded-xl p-4 bg-[#161b22] border border-[#30363d] space-y-3">
          <div className="flex gap-2">
            {(["gasto", "ingreso"] as const).map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t }))} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${form.tipo === t ? (t === "ingreso" ? "bg-[#22c55e] text-[#0d1117]" : "bg-[#ef4444] text-white") : "bg-[#1f2937] text-[#8b949e]"}`}>
                {t === "ingreso" ? "Ingreso ↑" : "Gasto ↓"}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Descripción" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b]" />
          <div className="flex gap-2">
             <input type="number" placeholder="Monto" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b]" />
             <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as Moneda }))} className="w-24 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#f59e0b]">
                <option value="Bs">Bs</option>
                <option value="USD">USD</option>
             </select>
          </div>
          <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#f59e0b]">
            {CATS_GASTO.map(c => <option key={c} value={c}>{catEmoji(c)} {c}</option>)}
          </select>
          <button onClick={agregar} className="w-full py-2.5 rounded-lg bg-[#f59e0b] text-[#0d1117] font-display font-bold text-sm hover:bg-[#fbbf24] transition-colors">Guardar</button>
        </div>
      )}

      <div className="space-y-2">
        {lista.map(g => (
          <div key={g.id} className="flex items-center justify-between rounded-xl p-3 bg-[#161b22] border border-[#30363d]">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xl flex-shrink-0">{catEmoji(g.categoria)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#e6edf3] truncate">{g.descripcion}</p>
                <p className="text-xs text-[#8b949e]">{g.categoria} · {g.fecha.slice(5).replace("-", "/")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm font-semibold flex-shrink-0 ${g.tipo === "ingreso" ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                {g.tipo === "ingreso" ? "+" : "-"}{fmt(g.monto, g.moneda)}
              </span>
              <button onClick={() => onDelete(g.id)} className="text-[#8b949e] hover:text-red-500 text-xs">✕</button>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-xs text-center text-[#8b949e] mt-4">No hay movimientos.</p>}
      </div>
    </div>
  );
}

// ─── HOGAR ────────────────────────────────────────────────────────────────────

const CATS_HOGAR: { val: GastoHogar["categoria"]; label: string }[] = [
  { val: "limpieza", label: "Limpieza" },
  { val: "comida", label: "Alimentos" },
  { val: "mascotas", label: "Mascotas 🐕" },
  { val: "servicios", label: "Servicios" },
  { val: "otro", label: "Otro" },
];

function Hogar({ hogar, onAdd, onDelete }: { hogar: GastoHogar[]; onAdd: (g: Partial<GastoHogar>) => void; onDelete: (id: string) => void }) {
  const [seccion, setSeccion] = useState<"todos" | "mascotas" | "divididos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    descripcion: string; monto: string; categoria: GastoHogar["categoria"];
    dividir: boolean; hermanos: number; fecha: string; moneda: Moneda;
  }>({ descripcion: "", monto: "", categoria: "comida", dividir: true, hermanos: 2, fecha: new Date().toISOString().slice(0, 10), moneda: "Bs" });

  const lista = hogar.filter(g => seccion === "todos" ? true : seccion === "mascotas" ? g.categoria === "mascotas" : g.dividir).sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  function agregar() {
    if (!form.descripcion || !form.monto) return;
    onAdd({ ...form, monto: parseFloat(form.monto), pagadoPor: "Yo" });
    setForm({ ...form, descripcion: "", monto: "" });
    setShowForm(false);
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex gap-2">
        {([ { val: "todos", label: "Todos" }, { val: "divididos", label: "Con hermanos" }, { val: "mascotas", label: "🐕 Perritos" } ] as const).map(f => (
          <button key={f.val} onClick={() => setSeccion(f.val)} className={`flex-1 py-2 rounded-lg text-xs font-display font-semibold transition-all ${seccion === f.val ? "bg-[#f59e0b] text-[#0d1117]" : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <button onClick={() => setShowForm(!showForm)} className="w-full py-3 rounded-xl bg-[#a855f7] text-white font-display font-bold text-sm hover:bg-[#c084fc] transition-colors">
        {showForm ? "✕ Cancelar" : "+ Agregar compra del hogar"}
      </button>

      {showForm && (
        <div className="rounded-xl p-4 bg-[#161b22] border border-[#30363d] space-y-3">
          <p className="text-sm font-display font-semibold text-[#e6edf3]">Nueva compra del hogar</p>
          <input type="text" placeholder="Ej: Arroz 5kg, Shampú..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]" />
          <div className="flex gap-2">
            <input type="number" placeholder="Monto total" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]" />
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as Moneda }))} className="w-24 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#a855f7]">
                <option value="Bs">Bs</option>
                <option value="USD">USD</option>
             </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CATS_HOGAR.map(c => (
              <button key={c.val} onClick={() => setForm(f => ({ ...f, categoria: c.val }))} className={`py-2 rounded-lg text-xs font-semibold transition-all ${form.categoria === c.val ? "bg-[#a855f7] text-white" : "bg-[#0d1117] border border-[#30363d] text-[#8b949e]"}`}>
                {catEmoji(c.val)} {c.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl p-3 bg-[#0d1117] border border-[#30363d] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#e6edf3]">¿Dividir con hermanos?</p>
              </div>
              <button onClick={() => setForm(f => ({ ...f, dividir: !f.dividir }))} className={`w-12 h-6 rounded-full transition-all relative ${form.dividir ? "bg-[#a855f7]" : "bg-[#30363d]"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.dividir ? "left-6" : "left-0.5"}`} />
              </button>
            </div>
            {form.dividir && (
              <div>
                <p className="text-xs text-[#8b949e] mb-2">¿Cuántos hermanos comparten?</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} onClick={() => setForm(f => ({ ...f, hermanos: n }))} className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all ${form.hermanos === n ? "bg-[#a855f7] text-white" : "bg-[#161b22] border border-[#30363d] text-[#8b949e]"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={agregar} className="w-full py-2.5 rounded-lg bg-[#a855f7] text-white font-display font-bold text-sm hover:bg-[#c084fc] transition-colors">Guardar compra</button>
        </div>
      )}

      <div className="space-y-2">
        {lista.map(g => {
          const miParte = g.dividir ? g.monto / (g.hermanos + 1) : g.monto;
          const debenEllos = g.dividir ? (g.monto / (g.hermanos + 1)) * g.hermanos : 0;
          return (
            <div key={g.id} className="rounded-xl p-4 bg-[#161b22] border border-[#30363d]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-lg flex-shrink-0">{catEmoji(g.categoria)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e6edf3] truncate">{g.descripcion}</p>
                    <p className="text-xs text-[#8b949e]">{CATS_HOGAR.find(c => c.val === g.categoria)?.label} · {g.fecha.slice(5).replace("-", "/")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-sm font-bold text-[#e6edf3]">{fmt(g.monto, g.moneda)}</span>
                  <button onClick={() => onDelete(g.id)} className="text-[#30363d] hover:text-[#ef4444] transition-colors">✕</button>
                </div>
              </div>
              {g.dividir ? (
                <div className="flex gap-2 mt-2">
                  <span className="text-xs px-2 py-1 rounded-lg bg-[#78350f]/40 border border-[#f59e0b]/20 text-[#f59e0b] font-mono">
                    Yo: {fmt(miParte, g.moneda)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-lg bg-[#4a1d96]/40 border border-[#a855f7]/20 text-[#a855f7] font-mono">
                    {g.hermanos} herm. deben: {fmt(debenEllos, g.moneda)}
                  </span>
                </div>
              ) : (
                <span className="text-xs px-2 py-1 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e]">Solo mío</span>
              )}
            </div>
          );
        })}
        {lista.length === 0 && <p className="text-xs text-center text-[#8b949e] mt-4">No hay gastos del hogar.</p>}
      </div>
    </div>
  );
}

// ─── PRÉSTAMOS ────────────────────────────────────────────────────────────────

function Prestamos({ prestamos, onAdd, onUpdate, onDelete }: { prestamos: Prestamo[]; onAdd: (g: Partial<Prestamo>) => void; onUpdate: (id: string, updates: Partial<Prestamo>) => void; onDelete: (id: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ deudor: "", capital: "", interes: "8", cuotas: "2", fechaInicio: new Date().toISOString().slice(0, 10), moneda: "Bs" as Moneda });

  function agregar() {
    if (!form.deudor || !form.capital) return;
    onAdd({
      deudor: form.deudor, capital: parseFloat(form.capital), interes: parseFloat(form.interes),
      fechaInicio: form.fechaInicio, cuotas: parseInt(form.cuotas), cuotasPagadas: 0, estado: "activo", moneda: form.moneda
    });
    setForm({ ...form, deudor: "", capital: "" });
    setShowForm(false);
  }

  function pagarCuota(p: Prestamo) {
    const nuevas = p.cuotasPagadas + 1;
    onUpdate(p.id, { cuotasPagadas: nuevas, estado: nuevas >= p.cuotas ? "pagado" : "activo" });
  }

  const activos = prestamos.filter(p => p.estado === "activo");
  const pagados = prestamos.filter(p => p.estado === "pagado");

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => setShowForm(!showForm)} className="w-full py-3 rounded-xl bg-[#14b8a6] text-[#0d1117] font-display font-bold text-sm hover:bg-[#2dd4bf] transition-colors">
        {showForm ? "✕ Cancelar" : "+ Nuevo préstamo"}
      </button>

      {showForm && (
        <div className="rounded-xl p-4 bg-[#161b22] border border-[#30363d] space-y-3">
          <input type="text" placeholder="Nombre del deudor" value={form.deudor} onChange={e => setForm(f => ({ ...f, deudor: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#14b8a6]" />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" placeholder="Capital" value={form.capital} onChange={e => setForm(f => ({ ...f, capital: e.target.value }))} className="col-span-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#14b8a6]" />
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as Moneda }))} className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#14b8a6]">
                <option value="Bs">Bs</option>
                <option value="USD">USD</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="Interés %" value={form.interes} onChange={e => setForm(f => ({ ...f, interes: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#14b8a6]" />
            <select value={form.cuotas} onChange={e => setForm(f => ({ ...f, cuotas: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none">
                {[1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n} cuota{n > 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <button onClick={agregar} className="w-full py-2.5 rounded-lg bg-[#14b8a6] text-[#0d1117] font-display font-bold text-sm hover:bg-[#2dd4bf] transition-colors">Guardar préstamo</button>
        </div>
      )}

      {activos.length > 0 && (
        <div>
          <p className="text-xs font-display font-semibold text-[#8b949e] uppercase tracking-wider mb-2">Activos</p>
          <div className="space-y-3">
            {activos.map(p => {
              const total = cuotaConInteres(p.capital, p.interes);
              const cuotaVal = total / p.cuotas;
              return (
                <div key={p.id} className="rounded-xl p-4 bg-[#161b22] border border-[#30363d]">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-display font-semibold text-[#e6edf3]">{p.deudor}</p>
                      <p className="text-xs text-[#8b949e]">Capital: {fmt(p.capital, p.moneda)} · {p.interes}% int.</p>
                    </div>
                    <button onClick={() => onDelete(p.id)} className="text-[#30363d] hover:text-red-500 text-xs">✕</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="rounded-lg p-2 bg-[#0d1117]">
                      <p className="font-mono text-xs text-[#14b8a6] font-semibold">{fmt(cuotaVal, p.moneda)}</p>
                      <p className="text-[10px] text-[#8b949e]">por cuota</p>
                    </div>
                    <div className="rounded-lg p-2 bg-[#0d1117]">
                      <p className="font-mono text-xs text-[#f59e0b] font-semibold">{p.cuotasPagadas}/{p.cuotas}</p>
                      <p className="text-[10px] text-[#8b949e]">pagadas</p>
                    </div>
                  </div>
                  <ProgressBar value={p.cuotasPagadas} max={p.cuotas} color="#14b8a6" />
                  <button onClick={() => pagarCuota(p)} className="w-full mt-3 py-2 rounded-lg bg-[#134e4a] text-[#14b8a6] text-xs font-semibold hover:bg-[#14b8a6] hover:text-[#0d1117] transition-all">
                    Registrar cuota pagada ✓
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activos.length === 0 && pagados.length === 0 && <p className="text-xs text-center text-[#8b949e] mt-4">No hay préstamos activos.</p>}
    </div>
  );
}

// ─── METAS ────────────────────────────────────────────────────────────────────

function Metas({ metas, onAdd, onUpdate, onDelete }: { metas: Meta[]; onAdd: (g: Partial<Meta>) => void; onUpdate: (id: string, updates: Partial<Meta>) => void; onDelete: (id: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [abonoId, setAbonoId] = useState<string | null>(null);
  const [abono, setAbono] = useState("");
  const [form, setForm] = useState({ nombre: "", emoji: "🎯", meta: "", color: "#f59e0b", moneda: "Bs" as Moneda });

  const EMOJIS = ["🏍️", "🏥", "🎓", "🏠", "💻", "✈️", "🛡️", "🎯", "🚗", "📱"];
  const COLORS = ["#f59e0b", "#14b8a6", "#a855f7", "#ef4444", "#22c55e", "#3b82f6"];

  function agregar() {
    if (!form.nombre || !form.meta) return;
    onAdd({ nombre: form.nombre, emoji: form.emoji, meta: parseFloat(form.meta), ahorrado: 0, color: form.color, moneda: form.moneda });
    setForm({ ...form, nombre: "", meta: "" });
    setShowForm(false);
  }

  function abonar(m: Meta) {
    if (!abono) return;
    onUpdate(m.id, { ahorrado: Math.min(m.meta, m.ahorrado + parseFloat(abono)) });
    setAbono(""); setAbonoId(null);
  }

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => setShowForm(!showForm)} className="w-full py-3 rounded-xl bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#a855f7] font-display font-bold text-sm hover:bg-[#a855f7]/30 transition-colors">
        {showForm ? "✕ Cancelar" : "+ Nueva meta de ahorro"}
      </button>

      {showForm && (
        <div className="rounded-xl p-4 bg-[#161b22] border border-[#30363d] space-y-3">
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map(e => <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))} className={`text-xl p-1.5 rounded-lg transition-all ${form.emoji === e ? "bg-[#30363d]" : "hover:bg-[#1f2937]"}`}>{e}</button>)}
          </div>
          <input type="text" placeholder="Nombre de la meta" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]" />
          <div className="flex gap-2">
            <input type="number" placeholder="Monto objetivo" value={form.meta} onChange={e => setForm(f => ({ ...f, meta: e.target.value }))} className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]" />
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value as Moneda }))} className="w-24 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#a855f7]">
                <option value="Bs">Bs</option>
                <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex gap-2">
            {COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-8 h-8 rounded-full transition-all ${form.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#161b22]" : ""}`} style={{ backgroundColor: c }} />)}
          </div>
          <button onClick={agregar} className="w-full py-2.5 rounded-lg bg-[#a855f7] text-white font-display font-bold text-sm hover:bg-[#c084fc] transition-colors">Crear meta</button>
        </div>
      )}

      <div className="space-y-4">
        {metas.map(m => {
          const pct = Math.min(100, m.meta > 0 ? (m.ahorrado / m.meta) * 100 : 0);
          return (
            <div key={m.id} className="rounded-xl p-5 bg-[#161b22] border border-[#30363d]">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{m.emoji}</span>
                  <div>
                    <p className="font-display font-bold text-[#e6edf3]">{m.nombre}</p>
                    <p className="text-xs text-[#8b949e]">Falta: {fmt(m.meta - m.ahorrado, m.moneda)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                   <span className="font-mono text-sm font-bold" style={{ color: m.color }}>{pct.toFixed(0)}%</span>
                   <button onClick={() => onDelete(m.id)} className="text-[#30363d] hover:text-red-500 text-xs mt-1">✕</button>
                </div>
              </div>
              <ProgressBar value={m.ahorrado} max={m.meta} color={m.color} />
              <div className="flex justify-between mt-2 mb-4">
                <span className="font-mono text-xs text-[#8b949e]">{fmt(m.ahorrado, m.moneda)}</span>
                <span className="font-mono text-xs text-[#8b949e]">{fmt(m.meta, m.moneda)}</span>
              </div>
              {abonoId === m.id ? (
                <div className="flex gap-2">
                  <input type="number" placeholder="Monto a abonar" value={abono} onChange={e => setAbono(e.target.value)} className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none" />
                  <button onClick={() => abonar(m)} className="px-4 py-2 rounded-lg text-sm font-semibold text-[#0d1117]" style={{ backgroundColor: m.color }}>✓</button>
                  <button onClick={() => setAbonoId(null)} className="px-3 py-2 rounded-lg text-sm text-[#8b949e] bg-[#1f2937]">✕</button>
                </div>
              ) : (
                <button onClick={() => setAbonoId(m.id)} className="w-full py-2 rounded-lg text-xs font-semibold transition-all border" style={{ borderColor: m.color + "60", color: m.color, backgroundColor: m.color + "15" }}>+ Abonar a esta meta</button>
              )}
            </div>
          );
        })}
        {metas.length === 0 && <p className="text-xs text-center text-[#8b949e] mt-4">No hay metas.</p>}
      </div>
    </div>
  );
}

// ─── ASISTENTE ────────────────────────────────────────────────────────────────

function Asistente({ nombre, gastos, prestamos, metas, hogar }: {
  nombre: string; gastos: Gasto[]; prestamos: Prestamo[]; metas: Meta[]; hogar: GastoHogar[];
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      id: 0, role: "bot",
      text: `¡Hola ${nombre}! 👋 Soy AHORRO, tu agente personal. Estoy conectado a la IA de Gemini. Preguntame lo que quieras sobre tus finanzas en Bs y Dólares.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function enviar() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMsg = { id: Date.now(), role: "user", text: input.trim() };
    setMsgs(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("No API Key");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const contexto = `
        Eres AHORRO, el agente financiero personal de ${nombre}. Sé amable, conciso, usa emojis y tono informal argentino/boliviano.
        Aquí están los datos financieros actuales de ${nombre}:
        Gastos/Ingresos: ${JSON.stringify(gastos)}
        Préstamos: ${JSON.stringify(prestamos)}
        Metas: ${JSON.stringify(metas)}
        Hogar: ${JSON.stringify(hogar)}
        Responde a la siguiente consulta del usuario: "${input.trim()}"
      `;

      const result = await model.generateContent(contexto);
      const response = await result.response;
      const text = response.text();

      setMsgs(prev => [...prev, { id: Date.now() + 1, role: "bot", text }]);
    } catch (error) {
      console.error(error);
      setMsgs(prev => [...prev, { id: Date.now() + 1, role: "bot", text: "Ups, tuve un problema conectándome a Gemini. Avisale a soporte." }]);
    }
    setLoading(false);
  }

  const SUGERENCIAS = ["¿Cómo va mi balance?", "¿Cuánto me deben en Bs?", "Mis metas en dólares", "Dame un consejo financiero"];

  return (
    <div className="flex flex-col h-[70vh] pb-4">
      <div className="flex items-center gap-3 mb-4 p-4 rounded-2xl bg-[#161b22] border border-[#30363d]">
        <div className="relative"><RobotAvatar size={52} /><span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22c55e] border-2 border-[#161b22]" /></div>
        <div>
          <p className="font-display font-bold text-[#e6edf3]">AHORRO (Gemini AI)</p>
          <p className="text-xs text-[#22c55e]">● En línea · Tu agente inteligente</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {SUGERENCIAS.map(s => (
          <button key={s} onClick={() => { setInput(s); }} className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-[#1f2937] border border-[#30363d] text-[#8b949e] hover:border-[#f59e0b] hover:text-[#f59e0b] transition-all">{s}</button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto mb-4 min-h-0">
        {msgs.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {m.role === "bot" && <div className="flex-shrink-0 mt-1"><RobotAvatar size={32} /></div>}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
              m.role === "bot" ? "bg-[#161b22] border border-[#30363d] text-[#e6edf3] rounded-tl-sm" : "bg-[#f59e0b] text-[#0d1117] font-medium rounded-tr-sm"
            }`}>
              {m.text.replace(/\*\*(.*?)\*\*/g, "$1")}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
             <div className="flex-shrink-0 mt-1"><RobotAvatar size={32} /></div>
             <div className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">Escribiendo...</div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <input type="text" placeholder="Preguntame algo..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} className="flex-1 bg-[#161b22] border border-[#30363d] rounded-2xl px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b] transition-colors" />
        <button onClick={enviar} disabled={loading} className="w-12 h-12 rounded-2xl bg-[#f59e0b] text-[#0d1117] font-bold text-lg hover:bg-[#fbbf24] transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-50">↑</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [usuario, setUsuario] = useState<{ id: string; nombre: string; email: string } | null>(() => {
    const saved = localStorage.getItem('ahorro_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");
  
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [hogar, setHogar] = useState<GastoHogar[]>([]);

  // Cargar datos al iniciar sesión
  useEffect(() => {
    if (usuario) {
      localStorage.setItem('ahorro_user', JSON.stringify(usuario));
    } else {
      localStorage.removeItem('ahorro_user');
    }
    
    if (!usuario) return;
    
    async function loadData() {
      const { data: g } = await supabase.from('gastos').select('*').eq('usuario_id', usuario!.id);
      if (g) setGastos(g as Gasto[]);
      
      const { data: p } = await supabase.from('prestamos').select('*').eq('usuario_id', usuario!.id);
      if (p) {
        // map db to snake_case if needed, but our schema is snake_case and UI uses camelCase
        const mappedP = p.map(row => ({
          ...row, fechaInicio: row.fecha_inicio, cuotasPagadas: row.cuotas_pagadas
        })) as Prestamo[];
        setPrestamos(mappedP);
      }

      const { data: m } = await supabase.from('metas').select('*').eq('usuario_id', usuario!.id);
      if (m) setMetas(m as Meta[]);

      const { data: h } = await supabase.from('hogar').select('*').eq('usuario_id', usuario!.id);
      if (h) {
         const mappedH = h.map(row => ({ ...row, pagadoPor: row.pagado_por })) as GastoHogar[];
         setHogar(mappedH);
      }
    }
    loadData();
  }, [usuario]);

  // Wrappers para Operaciones CRUD en Supabase
  const addGasto = async (g: Partial<Gasto>) => {
    const { data } = await supabase.from('gastos').insert([{ ...g, usuario_id: usuario!.id }]).select().single();
    if (data) setGastos(prev => [...prev, data as Gasto]);
  };
  const delGasto = async (id: string) => {
    await supabase.from('gastos').delete().eq('id', id);
    setGastos(prev => prev.filter(x => x.id !== id));
  };

  const addPrestamo = async (p: Partial<Prestamo>) => {
    const dbPayload = { ...p, fecha_inicio: p.fechaInicio, cuotas_pagadas: p.cuotasPagadas, usuario_id: usuario!.id };
    delete dbPayload.fechaInicio; delete dbPayload.cuotasPagadas;
    const { data } = await supabase.from('prestamos').insert([dbPayload]).select().single();
    if (data) setPrestamos(prev => [...prev, { ...data, fechaInicio: data.fecha_inicio, cuotasPagadas: data.cuotas_pagadas } as Prestamo]);
  };
  const updatePrestamo = async (id: string, updates: Partial<Prestamo>) => {
    const dbUpdates: any = { ...updates };
    if (updates.cuotasPagadas !== undefined) { dbUpdates.cuotas_pagadas = updates.cuotasPagadas; delete dbUpdates.cuotasPagadas; }
    await supabase.from('prestamos').update(dbUpdates).eq('id', id);
    setPrestamos(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
  };
  const delPrestamo = async (id: string) => {
    await supabase.from('prestamos').delete().eq('id', id);
    setPrestamos(prev => prev.filter(x => x.id !== id));
  };

  const addMeta = async (m: Partial<Meta>) => {
    const { data } = await supabase.from('metas').insert([{ ...m, usuario_id: usuario!.id }]).select().single();
    if (data) setMetas(prev => [...prev, data as Meta]);
  };
  const updateMeta = async (id: string, updates: Partial<Meta>) => {
    await supabase.from('metas').update(updates).eq('id', id);
    setMetas(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
  };
  const delMeta = async (id: string) => {
    await supabase.from('metas').delete().eq('id', id);
    setMetas(prev => prev.filter(x => x.id !== id));
  };

  const addHogar = async (h: Partial<GastoHogar>) => {
    const dbPayload = { ...h, pagado_por: h.pagadoPor, usuario_id: usuario!.id };
    delete dbPayload.pagadoPor;
    const { data } = await supabase.from('hogar').insert([dbPayload]).select().single();
    if (data) setHogar(prev => [...prev, { ...data, pagadoPor: data.pagado_por } as GastoHogar]);
  };
  const delHogar = async (id: string) => {
    await supabase.from('hogar').delete().eq('id', id);
    setHogar(prev => prev.filter(x => x.id !== id));
  };

  if (!usuario) {
    return <Login onLogin={setUsuario} />;
  }

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: "inicio", label: "Inicio", emoji: "🏠" },
    { id: "gastos", label: "Gastos", emoji: "💸" },
    { id: "hogar", label: "Hogar", emoji: "🏡" },
    { id: "prestamos", label: "Préstamos", emoji: "🤝" },
    { id: "metas", label: "Metas", emoji: "🎯" },
    { id: "asistente", label: "AHORRO", emoji: "🤖" },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] flex justify-center">
      <div className="w-full max-w-md flex flex-col min-h-screen">
        <div className="flex items-center justify-between px-4 pt-6 pb-4 flex-shrink-0">
          <div>
            <h1 className="font-display font-extrabold text-xl text-[#e6edf3] tracking-tight">
              Agente <span className="text-[#f59e0b]">AHORRO-MES</span>
            </h1>
            <p className="text-xs text-[#8b949e] font-mono mt-0.5">{usuario.nombre} · Sep 2026</p>
          </div>
          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-10 h-10 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center hover:border-[#f59e0b] transition-colors relative">
              <RobotAvatar size={28} />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#30363d]">
                  <p className="text-sm font-semibold text-[#e6edf3] truncate">{usuario.nombre}</p>
                  <p className="text-xs text-[#8b949e] truncate">{usuario.email}</p>
                </div>
                <button onClick={() => { setUsuario(null); setShowUserMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-[#ef4444] font-semibold hover:bg-[#ef4444]/10 transition-colors">
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1.5 px-4 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-display font-semibold transition-all ${tab === t.id ? "bg-[#f59e0b] text-[#0d1117]" : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"}`}>
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {tab === "inicio" && <Inicio gastos={gastos} prestamos={prestamos} metas={metas} hogar={hogar} nombre={usuario.nombre} />}
          {tab === "gastos" && <Gastos gastos={gastos} onAdd={addGasto} onDelete={delGasto} />}
          {tab === "hogar" && <Hogar hogar={hogar} onAdd={addHogar} onDelete={delHogar} />}
          {tab === "prestamos" && <Prestamos prestamos={prestamos} onAdd={addPrestamo} onUpdate={updatePrestamo} onDelete={delPrestamo} />}
          {tab === "metas" && <Metas metas={metas} onAdd={addMeta} onUpdate={updateMeta} onDelete={delMeta} />}
          {tab === "asistente" && <Asistente nombre={usuario.nombre} gastos={gastos} prestamos={prestamos} metas={metas} hogar={hogar} />}
        </div>
      </div>
    </div>
  );
}
