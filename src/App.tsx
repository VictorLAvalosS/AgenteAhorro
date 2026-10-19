import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Tab, Moneda, Gasto, Prestamo, Meta, GastoHogar, ChatMsg } from "./lib/types";
import { Hermano, HERMANOS_DEFAULT, calcularCuotaDivision, formatearMontoDivision } from "./lib/hermanos";
import { calcularDetallesPrestamo } from "./lib/prestamos";
import HogarTab from "./components/HogarTab";
import PrestamosTab from "./components/PrestamosTab";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATS_GASTO = [
  "Taller / Mecánica",
  "Ventas / Tienda",
  "Trabajo / Sueldo",
  "Comida",
  "Transporte",
  "Estudios",
  "Salud",
  "Préstamo",
  "Antojo",
  "Ropa",
  "Servicios",
  "Otro",
];

function fmt(n: number, mon: Moneda = "Bs") {
  const symbol = mon === "Bs" ? "Bs" : "$";
  return symbol + " " + n.toLocaleString("es-BO", { maximumFractionDigits: 2 });
}

function catEmoji(cat: string): string {
  const map: Record<string, string> = {
    "Taller / Mecánica": "🔧",
    Taller: "🔧",
    "Ventas / Tienda": "🏪",
    Ventas: "🏪",
    "Trabajo / Sueldo": "💼",
    Sueldo: "💼",
    Comida: "🍽️",
    Transporte: "🚌",
    Estudios: "📚",
    Salud: "💊",
    Préstamo: "🤝",
    Antojo: "🍕",
    Ropa: "👕",
    Servicios: "💡",
    Otro: "📦",
    limpieza: "🧴",
    comida: "🛒",
    mascotas: "🐕",
    internet: "📶",
    streaming: "📺",
    servicios: "💡",
    otro: "📦",
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

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="h-2 rounded-full bg-[#30363d] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (usuario: { id: string; nombre: string; email: string }) => void }) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !nombre.trim()) return;
    setLoading(true);

    const { data: existingUser } = await supabase
      .from("usuarios")
      .select("*")
      .eq("email", email.trim())
      .single();

    if (existingUser) {
      onLogin(existingUser);
    } else {
      const { data: newUser, error } = await supabase
        .from("usuarios")
        .insert([{ nombre: nombre.trim(), email: email.trim() }])
        .select()
        .single();

      if (newUser) onLogin(newUser);
      else console.error(error);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-6 text-center">
      {step === "intro" ? (
        <div className="flex flex-col items-center max-w-sm">
          <div className="mb-6 animate-pulse">
            <RobotAvatar size={100} />
          </div>
          <h1 className="font-display font-extrabold text-3xl text-[#e6edf3] mb-2 tracking-tight">
            Agente <span className="text-[#f59e0b]">AHORRO</span>
          </h1>
          <p className="text-sm text-[#8b949e] mb-8 leading-relaxed">
            Tu agente personal de finanzas. Te ayudo a organizar tus ingresos, gastos diarios, préstamos con intereses y gastos de casa con tus hermanos.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => setStep("form")}
              className="w-full py-4 rounded-2xl bg-[#f59e0b] text-[#0d1117] font-display font-bold text-base hover:bg-[#fbbf24] transition-all shadow-lg"
            >
              Empezar →
            </button>
          </div>
        </div>
      ) : (
        <div className="relative w-full max-w-xs">
          <div className="flex justify-center mb-6">
            <RobotAvatar size={80} />
          </div>
          <h2 className="font-display font-bold text-xl text-[#e6edf3] text-center mb-1">¿Cómo te llamo?</h2>
          <div className="space-y-3 mt-4">
            <input
              type="text"
              placeholder="Ej: Lucas o Víctor"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b]"
            />
            <input
              type="email"
              placeholder="tucorreo@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b]"
            />
            <button
              onClick={handleLogin}
              disabled={loading || !email.trim() || !nombre.trim()}
              className="w-full py-4 rounded-2xl bg-[#f59e0b] text-[#0d1117] font-display font-bold text-sm hover:bg-[#fbbf24] transition-all disabled:opacity-40 mt-2"
            >
              {loading ? "Cargando..." : "Ingresar al agente ✓"}
            </button>
            <button
              onClick={() => setStep("intro")}
              className="w-full py-2 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            >
              ← Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── INICIO ───────────────────────────────────────────────────────────────────

function Inicio({
  gastos,
  prestamos,
  metas,
  hogar,
  hermanos,
  nombre,
  onNavigateTab,
}: {
  gastos: Gasto[];
  prestamos: Prestamo[];
  metas: Meta[];
  hogar: GastoHogar[];
  hermanos: Hermano[];
  nombre: string;
  onNavigateTab: (tab: Tab) => void;
}) {
  const calc = (moneda: Moneda) => {
    const ingresos = gastos.filter((g) => g.tipo === "ingreso" && g.moneda === moneda).reduce((s, g) => s + g.monto, 0);
    const egresos = gastos.filter((g) => g.tipo === "gasto" && g.moneda === moneda).reduce((s, g) => s + g.monto, 0);
    const balance = ingresos - egresos;

    // Por cobrar préstamos (calculado con intereses y penalizaciones pendientes)
    const prestamosActivos = prestamos.filter((p) => p.estado === "activo" && p.moneda === moneda);
    const porCobrar = prestamosActivos.reduce((s, p) => {
      const det = calcularDetallesPrestamo(p);
      return s + det.saldoPendiente;
    }, 0);

    // Cálculo exacto de deudas de hermanos
    const debeHermanos = hogar
      .filter((g) => {
        if (!g.dividir || g.moneda !== moneda) return false;
        const pagadoPorMi =
          !g.pagadoPor ||
          g.pagadoPor === "Yo" ||
          g.pagadoPor.toLowerCase() === (nombre || "").toLowerCase();
        return pagadoPorMi;
      })
      .reduce((s, g) => {
        const nombres =
          g.hermanosNombres && g.hermanosNombres.length > 0
            ? g.hermanosNombres
            : hermanos.map((h) => h.nombre);
        const totalP = (g.hermanos || nombres.length) + 1;
        const cuota = g.cuotaPorPersona ?? calcularCuotaDivision(g.monto, totalP, g.moneda).cuotaFinal;
        const pendientes = nombres.filter((nom) => !(g.pagosRegistrados?.[nom] ?? false)).length;
        return s + cuota * pendientes;
      }, 0);

    return { ingresos, egresos, balance, porCobrar, debeHermanos };
  };

  const bs = calc("Bs");
  const usd = calc("USD");

  const fechaHoy = new Date().toLocaleDateString("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <RobotAvatar size={44} />
        <div>
          <p className="font-display font-bold text-[#e6edf3]">¡Hola, {nombre}! 👋</p>
          <p className="text-xs text-[#8b949e] capitalize">{fechaHoy}</p>
        </div>
      </div>

      <div className="rounded-2xl p-5 bg-gradient-to-br from-[#1f2937] to-[#161b22] border border-[#30363d] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-5" style={{ background: "#f59e0b", filter: "blur(40px)" }} />
        <p className="text-xs text-[#8b949e] font-display uppercase tracking-widest mb-1">Balance General (Ingresos - Gastos)</p>
        <p className="font-mono text-3xl font-bold text-[#f59e0b] mb-1">{fmt(bs.balance, "Bs")}</p>
        {usd.balance !== 0 && (
          <p className="font-mono text-xl font-bold text-[#f59e0b] opacity-80">{fmt(usd.balance, "USD")}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          onClick={() => onNavigateTab("gastos")}
          className="rounded-xl p-4 bg-[#14532d]/40 border border-[#22c55e]/20 hover:border-[#22c55e] cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[#8b949e] font-display uppercase font-semibold">Ingresos ↑</p>
            <span className="text-[10px] text-[#22c55e] group-hover:translate-x-0.5 transition-transform">Ver →</span>
          </div>
          <p className="font-mono text-md font-bold text-[#22c55e]">{fmt(bs.ingresos, "Bs")}</p>
          {usd.ingresos > 0 && <p className="font-mono text-xs text-[#22c55e]/80">{fmt(usd.ingresos, "USD")}</p>}
        </div>

        <div
          onClick={() => onNavigateTab("gastos")}
          className="rounded-xl p-4 bg-[#7f1d1d]/40 border border-[#ef4444]/20 hover:border-[#ef4444] cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[#8b949e] font-display uppercase font-semibold">Gastos ↓</p>
            <span className="text-[10px] text-[#ef4444] group-hover:translate-x-0.5 transition-transform">Ver →</span>
          </div>
          <p className="font-mono text-md font-bold text-[#ef4444]">{fmt(bs.egresos, "Bs")}</p>
          {usd.egresos > 0 && <p className="font-mono text-xs text-[#ef4444]/80">{fmt(usd.egresos, "USD")}</p>}
        </div>

        <div
          onClick={() => onNavigateTab("prestamos")}
          className="rounded-xl p-4 bg-[#134e4a]/40 border border-[#14b8a6]/20 hover:border-[#14b8a6] cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[#8b949e] font-display uppercase font-semibold">Por cobrar</p>
            <span className="text-[10px] text-[#14b8a6] group-hover:translate-x-0.5 transition-transform">Ver →</span>
          </div>
          <p className="font-mono text-md font-bold text-[#14b8a6]">{fmt(bs.porCobrar, "Bs")}</p>
          {usd.porCobrar > 0 && <p className="font-mono text-xs text-[#14b8a6]/80">{fmt(usd.porCobrar, "USD")}</p>}
          <p className="text-[10px] text-[#8b949e] mt-1">
            {prestamos.filter((p) => p.estado === "activo").length} préstamos activos
          </p>
        </div>

        <div
          onClick={() => onNavigateTab("hogar")}
          className="rounded-xl p-4 bg-[#4a1d96]/40 border border-[#a855f7]/30 hover:border-[#a855f7] cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[#8b949e] font-display uppercase font-semibold">Me deben (Hogar)</p>
            <span className="text-[10px] text-[#a855f7] group-hover:translate-x-0.5 transition-transform">Ver →</span>
          </div>
          <p className="font-mono text-md font-bold text-[#a855f7]">{fmt(bs.debeHermanos, "Bs")}</p>
          {usd.debeHermanos > 0 && <p className="font-mono text-xs text-[#a855f7]/80">{fmt(usd.debeHermanos, "USD")}</p>}
          <p className="text-[10px] text-[#8b949e] mt-1 truncate">
            {hermanos.length > 0 ? `${hermanos.map((h) => h.nombre).join(", ")}` : "Sin hermanos"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-display font-semibold text-[#e6edf3] mb-3">Progreso de metas</p>
        <div className="space-y-3">
          {metas.map((m: any) => (
            <div key={m.id} className="rounded-xl p-4 bg-[#161b22] border border-[#30363d]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-[#e6edf3]">
                  {m.emoji} {m.nombre}
                </span>
                <span className="font-mono text-xs" style={{ color: m.color || "#f59e0b" }}>
                  {m.meta > 0 ? ((m.ahorrado / m.meta) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <ProgressBar value={m.ahorrado} max={m.meta} color={m.color || "#f59e0b"} />
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

// ─── INGRESOS Y GASTOS (Rebautizado y Mejorado para control exacto) ─────────────

function MovimientosTab({
  gastos,
  onAdd,
  onDelete,
}: {
  gastos: Gasto[];
  onAdd: (g: Partial<Gasto>) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "ingreso" | "gasto">("todos");
  const [form, setForm] = useState({
    descripcion: "",
    monto: "",
    categoria: "Taller / Mecánica",
    tipo: "ingreso" as "ingreso" | "gasto",
    fecha: new Date().toISOString().slice(0, 10),
    moneda: "Bs" as Moneda,
  });

  const lista = gastos
    .filter((g) => filtro === "todos" || g.tipo === filtro)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Métricas rápidas
  const totalIngresosBs = gastos
    .filter((g) => g.tipo === "ingreso" && g.moneda === "Bs")
    .reduce((acc, g) => acc + g.monto, 0);
  const totalGastosBs = gastos
    .filter((g) => g.tipo === "gasto" && g.moneda === "Bs")
    .reduce((acc, g) => acc + g.monto, 0);
  const balanceDisponibleBs = totalIngresosBs - totalGastosBs;

  function agregar() {
    if (!form.descripcion.trim() || !form.monto) return;
    const montoNum = parseFloat(form.monto);
    if (isNaN(montoNum) || montoNum <= 0) return;

    onAdd({
      descripcion: form.descripcion.trim(),
      monto: montoNum,
      categoria: form.categoria,
      tipo: form.tipo,
      fecha: form.fecha,
      moneda: form.moneda,
    });

    setForm({
      descripcion: "",
      monto: "",
      categoria: form.tipo === "ingreso" ? "Taller / Mecánica" : "Comida",
      tipo: form.tipo,
      fecha: new Date().toISOString().slice(0, 10),
      moneda: "Bs",
    });
    setShowForm(false);
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Resumen de Flujo de Dinero */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl p-2.5 bg-[#14532d]/30 border border-[#22c55e]/30">
          <p className="text-[10px] text-[#22c55e] uppercase font-semibold">Total Ingresos</p>
          <p className="font-mono text-sm font-bold text-[#22c55e]">
            +Bs {totalIngresosBs.toLocaleString("es-BO")}
          </p>
        </div>
        <div className="rounded-xl p-2.5 bg-[#7f1d1d]/30 border border-[#ef4444]/30">
          <p className="text-[10px] text-[#ef4444] uppercase font-semibold">Total Gastos</p>
          <p className="font-mono text-sm font-bold text-[#ef4444]">
            -Bs {totalGastosBs.toLocaleString("es-BO")}
          </p>
        </div>
        <div className="rounded-xl p-2.5 bg-[#161b22] border border-[#f59e0b]/40">
          <p className="text-[10px] text-[#f59e0b] uppercase font-semibold">Disponible</p>
          <p className="font-mono text-sm font-bold text-[#f59e0b]">
            Bs {balanceDisponibleBs.toLocaleString("es-BO")}
          </p>
        </div>
      </div>

      {/* Selector de Filtros */}
      <div className="flex gap-2">
        {[
          { id: "todos", label: "Todos los movimientos" },
          { id: "ingreso", label: "Ingresos (Entradas)" },
          { id: "gasto", label: "Gastos (Salidas)" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id as any)}
            className={`flex-1 py-2 rounded-xl text-xs font-display font-semibold transition-all ${
              filtro === f.id
                ? f.id === "ingreso"
                  ? "bg-[#22c55e] text-[#0d1117] font-bold shadow"
                  : f.id === "gasto"
                  ? "bg-[#ef4444] text-white font-bold shadow"
                  : "bg-[#f59e0b] text-[#0d1117] font-bold shadow"
                : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Botón para Abrir Formulario */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#22c55e] to-[#10b981] text-[#0d1117] font-display font-bold text-sm hover:opacity-95 transition-all shadow-lg flex items-center justify-center gap-2"
      >
        <span>{showForm ? "✕ Cancelar registro" : "+ Registrar Ingreso o Gasto"}</span>
      </button>

      {/* FORMULARIO */}
      {showForm && (
        <div className="rounded-2xl p-4 bg-[#161b22] border border-[#30363d] space-y-3.5 animate-fade-in shadow-xl">
          <h4 className="font-display font-bold text-sm text-[#e6edf3] border-b border-[#30363d] pb-2 flex items-center gap-2">
            <span>📝</span> Detalle del Movimiento
          </h4>

          {/* Selector de Tipo: 2 Únicas Funciones Claras */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  tipo: "ingreso",
                  categoria: "Taller / Mecánica",
                }))
              }
              className={`py-3 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${
                form.tipo === "ingreso"
                  ? "bg-[#22c55e] text-[#0d1117] border-[#22c55e] shadow-lg shadow-[#22c55e]/20"
                  : "bg-[#0d1117] text-[#8b949e] border-[#30363d]"
              }`}
            >
              <span>↑</span> INGRESO (Me pagaron / Dinero que entra)
            </button>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  tipo: "gasto",
                  categoria: "Comida",
                }))
              }
              className={`py-3 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-1.5 transition-all border ${
                form.tipo === "gasto"
                  ? "bg-[#ef4444] text-white border-[#ef4444] shadow-lg shadow-[#ef4444]/20"
                  : "bg-[#0d1117] text-[#8b949e] border-[#30363d]"
              }`}
            >
              <span>↓</span> GASTO (Salida de dinero / Compras)
            </button>
          </div>

          {/* Atajos Rápidos según Tipo */}
          <div>
            <label className="text-xs text-[#8b949e] mb-1.5 block">
              {form.tipo === "ingreso"
                ? "Atajos rápidos de tus ingresos:"
                : "Atajos rápidos de gastos:"}
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {form.tipo === "ingreso" ? (
                <>
                  {[
                    { desc: "Arreglo Auto Toyota", cat: "Taller / Mecánica", m: "500" },
                    { desc: "Ventas de mi tienda", cat: "Ventas / Tienda", m: "200" },
                    { desc: "Cambio de aceite y frenos", cat: "Taller / Mecánica", m: "350" },
                    { desc: "Cobro por trabajo", cat: "Trabajo / Sueldo", m: "" },
                  ].map((sug) => (
                    <button
                      key={sug.desc}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          descripcion: sug.desc,
                          categoria: sug.cat,
                          monto: sug.m = sug.m ? sug.m : f.monto,
                        }))
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#0d1117] border border-[#30363d] hover:border-[#22c55e] text-[11px] text-[#e6edf3] flex-shrink-0 transition-colors"
                    >
                      {sug.desc}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {[
                    { desc: "Almuerzo / Comida", cat: "Comida" },
                    { desc: "Repuestos taller", cat: "Taller / Mecánica" },
                    { desc: "Gasolina / Transporte", cat: "Transporte" },
                    { desc: "Materiales y compras", cat: "Otro" },
                  ].map((sug) => (
                    <button
                      key={sug.desc}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          descripcion: sug.desc,
                          categoria: sug.cat,
                        }))
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#0d1117] border border-[#30363d] hover:border-[#ef4444] text-[11px] text-[#e6edf3] flex-shrink-0 transition-colors"
                    >
                      {sug.desc}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Motivo / Por qué del Dinero */}
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">
              {form.tipo === "ingreso"
                ? "¿De qué es el pago o ingreso? (Escribe el motivo exacto):"
                : "¿En qué gastaste el dinero?:"}
            </label>
            <input
              type="text"
              placeholder={
                form.tipo === "ingreso"
                  ? "Ej: Arreglo Auto Toyota, Ventas en la tienda, Cobro por trabajo..."
                  : "Ej: Repuestos de auto, Almuerzo, Compras..."
              }
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#22c55e]"
            />
          </div>

          {/* Monto y Moneda */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-[#8b949e] mb-1 block">Monto que ingresó/salió:</label>
              <input
                type="number"
                placeholder="Ej: 500"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#22c55e]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Moneda:</label>
              <div className="grid grid-cols-2 gap-1">
                {(["Bs", "USD"] as Moneda[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, moneda: m }))}
                    className={`py-2 rounded-xl text-xs font-bold font-mono transition-all ${
                      form.moneda === m
                        ? "bg-[#22c55e] text-[#0d1117]"
                        : "bg-[#0d1117] text-[#8b949e] border border-[#30363d]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Categoría y Fecha */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Categoría:</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-[#e6edf3] outline-none focus:border-[#22c55e]"
              >
                {CATS_GASTO.map((c) => (
                  <option key={c} value={c}>
                    {catEmoji(c)} {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Fecha:</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-[#e6edf3] outline-none focus:border-[#22c55e]"
              />
            </div>
          </div>

          <button
            onClick={agregar}
            disabled={!form.descripcion.trim() || !form.monto}
            className="w-full py-3 rounded-xl bg-[#22c55e] text-[#0d1117] font-display font-bold text-sm hover:bg-[#16a34a] transition-colors shadow-lg disabled:opacity-40"
          >
            Guardar {form.tipo === "ingreso" ? "Ingreso (+)" : "Gasto (-)"} ✓
          </button>
        </div>
      )}

      {/* Historial con Detalle de Cada Entrada y Salida */}
      <div className="space-y-2">
        {lista.map((g) => (
          <div
            key={g.id}
            className="flex items-center justify-between rounded-xl p-3 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] transition-all"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-2xl flex-shrink-0">{catEmoji(g.categoria)}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#e6edf3] truncate">{g.descripcion}</p>
                <p className="text-xs text-[#8b949e]">
                  <span
                    className={`font-semibold ${
                      g.tipo === "ingreso" ? "text-[#22c55e]" : "text-[#ef4444]"
                    }`}
                  >
                    {g.tipo === "ingreso" ? "Ingreso" : "Gasto"}
                  </span>{" "}
                  · {g.categoria} · {g.fecha.slice(5).replace("-", "/")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-sm font-bold flex-shrink-0 ${
                  g.tipo === "ingreso" ? "text-[#22c55e]" : "text-[#ef4444]"
                }`}
              >
                {g.tipo === "ingreso" ? "+" : "-"}
                {fmt(g.monto, g.moneda)}
              </span>
              <button
                onClick={() => onDelete(g.id)}
                className="text-[#8b949e] hover:text-[#ef4444] text-xs p-1"
                title="Eliminar movimiento"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <div className="text-center py-8 text-[#8b949e] text-xs bg-[#161b22] rounded-xl border border-dashed border-[#30363d]">
            No hay movimientos registrados en esta vista.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── METAS ────────────────────────────────────────────────────────────────────

function Metas({
  metas,
  onAdd,
  onUpdate,
  onDelete,
}: {
  metas: Meta[];
  onAdd: (g: Partial<Meta>) => void;
  onUpdate: (id: string, updates: Partial<Meta>) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [abonoId, setAbonoId] = useState<string | null>(null);
  const [abono, setAbono] = useState("");
  const [form, setForm] = useState({
    nombre: "",
    emoji: "🎯",
    meta: "",
    color: "#f59e0b",
    moneda: "Bs" as Moneda,
  });

  const EMOJIS = ["🏍️", "🏥", "🎓", "🏠", "💻", "✈️", "🛡️", "🎯", "🚗", "📱"];
  const COLORS = ["#f59e0b", "#14b8a6", "#a855f7", "#ef4444", "#22c55e", "#3b82f6"];

  function agregar() {
    if (!form.nombre || !form.meta) return;
    onAdd({
      nombre: form.nombre,
      emoji: form.emoji,
      meta: parseFloat(form.meta),
      ahorrado: 0,
      color: form.color,
      moneda: form.moneda,
    } as any);
    setForm({ ...form, nombre: "", meta: "" });
    setShowForm(false);
  }

  function abonar(m: Meta) {
    if (!abono) return;
    onUpdate(m.id, { ahorrado: Math.min(m.meta, m.ahorrado + parseFloat(abono)) });
    setAbono("");
    setAbonoId(null);
  }

  return (
    <div className="space-y-4 pb-4">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full py-3 rounded-xl bg-[#a855f7]/20 border border-[#a855f7]/40 text-[#a855f7] font-display font-bold text-sm hover:bg-[#a855f7]/30 transition-colors"
      >
        {showForm ? "✕ Cancelar" : "+ Nueva meta de ahorro"}
      </button>

      {showForm && (
        <div className="rounded-xl p-4 bg-[#161b22] border border-[#30363d] space-y-3">
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                className={`text-xl p-1.5 rounded-lg transition-all ${
                  form.emoji === e ? "bg-[#30363d]" : "hover:bg-[#1f2937]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Nombre de la meta"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Monto objetivo"
              value={form.meta}
              onChange={(e) => setForm((f) => ({ ...f, meta: e.target.value }))}
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]"
            />
            <select
              value={form.moneda}
              onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value as Moneda }))}
              className="w-24 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#a855f7]"
            >
              <option value="Bs">Bs</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={`w-8 h-8 rounded-full transition-all ${
                  form.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#161b22]" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={agregar}
            className="w-full py-2.5 rounded-lg bg-[#a855f7] text-white font-display font-bold text-sm hover:bg-[#c084fc] transition-colors"
          >
            Crear meta
          </button>
        </div>
      )}

      <div className="space-y-4">
        {metas.map((m: any) => {
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
                  <span className="font-mono text-sm font-bold" style={{ color: m.color || "#f59e0b" }}>
                    {pct.toFixed(0)}%
                  </span>
                  <button onClick={() => onDelete(m.id)} className="text-[#30363d] hover:text-red-500 text-xs mt-1">
                    ✕
                  </button>
                </div>
              </div>
              <ProgressBar value={m.ahorrado} max={m.meta} color={m.color || "#f59e0b"} />
              <div className="flex justify-between mt-2 mb-4">
                <span className="font-mono text-xs text-[#8b949e]">{fmt(m.ahorrado, m.moneda)}</span>
                <span className="font-mono text-xs text-[#8b949e]">{fmt(m.meta, m.moneda)}</span>
              </div>
              {abonoId === m.id ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Monto a abonar"
                    value={abono}
                    onChange={(e) => setAbono(e.target.value)}
                    className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none"
                  />
                  <button
                    onClick={() => abonar(m)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-[#0d1117]"
                    style={{ backgroundColor: m.color || "#f59e0b" }}
                  >
                    ✓
                  </button>
                  <button onClick={() => setAbonoId(null)} className="px-3 py-2 rounded-lg text-sm text-[#8b949e] bg-[#1f2937]">
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAbonoId(m.id)}
                  className="w-full py-2 rounded-lg text-xs font-semibold transition-all border"
                  style={{
                    borderColor: (m.color || "#f59e0b") + "60",
                    color: m.color || "#f59e0b",
                    backgroundColor: (m.color || "#f59e0b") + "15",
                  }}
                >
                  + Abonar a esta meta
                </button>
              )}
            </div>
          );
        })}
        {metas.length === 0 && <p className="text-xs text-center text-[#8b949e] mt-4">No hay metas.</p>}
      </div>
    </div>
  );
}

// ─── ASISTENTE IA (Con Fallback Local Robusto para Evitar Errores de API) ───────

function Asistente({
  nombre,
  gastos,
  prestamos,
  metas,
  hogar,
  hermanos,
}: {
  nombre: string;
  gastos: Gasto[];
  prestamos: Prestamo[];
  metas: Meta[];
  hogar: GastoHogar[];
  hermanos: Hermano[];
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      id: 0,
      role: "bot",
      text: `¡Hola ${nombre}! 👋 Soy AHORRO, tu agente financiero personal con IA. Preguntame lo que quieras sobre tus ingresos de taller o tienda, gastos del hogar con tus hermanos, préstamos con intereses o cuánto puedes ahorrar.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Motor de respuesta local para cuando falle la API o no haya conexión
  function generarRespuestaLocal(pregunta: string): string {
    const q = pregunta.toLowerCase();

    // Consulta de Préstamo a Jose o deudores
    if (q.includes("jose") || q.includes("préstamo") || q.includes("prestamo") || q.includes("debe")) {
      const pJose = prestamos.find((p) => p.deudor.toLowerCase().includes("jose"));
      if (pJose) {
        const det = calcularDetallesPrestamo(pJose);
        return `📊 **Estado del préstamo de ${pJose.deudor}:**\n\n• Capital original: ${pJose.moneda} ${pJose.capital.toLocaleString("es-BO")}\n• Interés mensual pactado: ${pJose.interes}%\n• Estado: ${det.tieneAtraso ? `⚠️ Retraso de ${det.diasAtraso} días (${det.cuotasVencidasCount} meses vencidos)` : "Al día"}\n• Total cobrado: ${pJose.moneda} ${det.totalCobrado.toLocaleString("es-BO")}\n• Multas acumuladas: +${pJose.moneda} ${det.totalPenalizaciones.toLocaleString("es-BO")}\n• **Total pendiente por cobrar HOY:** ${pJose.moneda} ${det.deudaVencidaTotal.toLocaleString("es-BO")}\n\nSi necesitas cobrarle, puedes usar el botón de WhatsApp en la pestaña de Préstamos para enviarle el desglose mensual completo.`;
      }
    }

    // Consulta de Hermanos y Hogar
    if (q.includes("herman") || q.includes("meli") || q.includes("nayda") || q.includes("casa") || q.includes("hogar")) {
      const resumenHermanos = hermanos.map((h) => {
        let debeBs = 0;
        hogar.forEach((g) => {
          if (!g.dividir) return;
          const participantes = g.hermanosNombres && g.hermanosNombres.length > 0 ? g.hermanosNombres : hermanos.map((x) => x.nombre);
          if (participantes.includes(h.nombre)) {
            const totalP = (g.hermanos || participantes.length) + 1;
            const cuota = g.cuotaPorPersona ?? calcularCuotaDivision(g.monto, totalP, g.moneda).cuotaFinal;
            const yaPago = g.pagosRegistrados?.[h.nombre] ?? false;
            if (!yaPago && (g.pagadoPor === "Yo" || g.pagadoPor === nombre)) {
              debeBs += cuota;
            }
          }
        });
        return `• ${h.avatar || "👤"} **${h.nombre}**: ${debeBs > 0 ? `te debe Bs ${debeBs}` : "está al día ✓"}`;
      });
      return `🏡 **Cuentas con tus hermanos en el hogar:**\n\n${resumenHermanos.join("\n")}\n\nRecuerda que si vienen a pagarte de a poco (por ejemplo, el internet o un par de compras), puedes tocar "Descontar ✓" en esa compra específica.`;
    }

    // Ingresos, Taller y Ahorro
    if (q.includes("taller") || q.includes("tienda") || q.includes("ingreso") || q.includes("ahorr") || q.includes("gastar")) {
      const totalIng = gastos.filter((g) => g.tipo === "ingreso" && g.moneda === "Bs").reduce((acc, g) => acc + g.monto, 0);
      const totalGas = gastos.filter((g) => g.tipo === "gasto" && g.moneda === "Bs").reduce((acc, g) => acc + g.monto, 0);
      const disponible = totalIng - totalGas;
      return `💰 **Resumen de tus finanzas personales:**\n\n• Ingresos registrados: +Bs ${totalIng.toLocaleString("es-BO")}\n• Gastos realizados: -Bs ${totalGas.toLocaleString("es-BO")}\n• **Saldo disponible actual:** Bs ${disponible.toLocaleString("es-BO")}\n\n💡 *Consejo de ahorro:* Te sugiero apartar un 20% de tus ingresos de taller o ventas (unos Bs ${(totalIng * 0.2).toFixed(0)}) directo para tus metas de ahorro antes de realizar gastos no esenciales.`;
    }

    return `¡Te tengo cubierto, ${nombre}! 🤖 Tienes registrados:\n• ${prestamos.filter((p) => p.estado === "activo").length} préstamos activos con cálculo de intereses y mora.\n• ${hermanos.length} hermanos en el control del hogar para dividir alimentos, internet y streaming.\n• Control detallado de tus ingresos de taller/ventas.\n\n¿Deseas redactar un mensaje de cobro por WhatsApp o revisar alguna cuenta en específico?`;
  }

  async function enviar() {
    if (!input.trim() || loading) return;
    const query = input.trim();
    const userMsg: ChatMsg = { id: Date.now(), role: "user", text: query };
    setMsgs((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    let respondido = false;

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (apiKey && !apiKey.startsWith("AQ.")) {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Intentar modelos estándar de Gemini con fallback
        const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
        for (const mName of modelNames) {
          try {
            const model = genAI.getGenerativeModel({ model: mName });
            const prestamosInfo = prestamos.map((p) => {
              const det = calcularDetallesPrestamo(p);
              return {
                deudor: p.deudor,
                capital: `${p.moneda} ${p.capital}`,
                interesMensual: `${p.interes}%`,
                saldoTotalPendiente: `${p.moneda} ${det.saldoPendiente}`,
                totalCobrado: `${p.moneda} ${det.totalCobrado}`,
                cuotasVencidas: det.cuotasVencidasCount,
                penalizaciones: det.totalPenalizaciones,
              };
            });

            const contexto = `
              Eres AHORRO, el agente financiero personal de ${nombre}. Sé amable, conciso, usa emojis y un tono cercano y profesional boliviano/latinoamericano.
              Datos de ${nombre}:
              - Ingresos y Gastos: ${JSON.stringify(gastos)}
              - Metas: ${JSON.stringify(metas)}
              - Hermanos: ${JSON.stringify(hermanos)}
              - Hogar compras divididas: ${JSON.stringify(hogar)}
              - Préstamos: ${JSON.stringify(prestamosInfo)}

              Responde a la siguiente consulta del usuario con exactitud: "${query}"
            `;

            const result = await model.generateContent(contexto);
            const response = await result.response;
            const text = response.text();
            if (text) {
              setMsgs((prev) => [...prev, { id: Date.now() + 1, role: "bot", text }]);
              respondido = true;
              break;
            }
          } catch (innerErr) {
            console.warn(`Fallo con ${mName}, intentando alternativa...`, innerErr);
          }
        }
      }
    } catch (error) {
      console.error("Error en llamada Gemini:", error);
    }

    // Si la API remota falló o la clave no tiene acceso, el motor local inteligente responde de inmediato
    if (!respondido) {
      const respuestaLocal = generarRespuestaLocal(query);
      setMsgs((prev) => [...prev, { id: Date.now() + 1, role: "bot", text: respuestaLocal }]);
    }

    setLoading(false);
  }

  const SUGERENCIAS = [
    "¿Cuánto me debe Jose con intereses?",
    "¿Qué préstamos tienen retraso o mora?",
    "¿Cuánto me deben mis hermanos del hogar?",
    "¿Cuánto dinero ingresó por mi taller y ventas?",
    "Redacta un cobro para WhatsApp",
  ];

  return (
    <div className="flex flex-col h-[70vh] pb-4">
      <div className="flex items-center gap-3 mb-4 p-4 rounded-2xl bg-[#161b22] border border-[#30363d]">
        <div className="relative">
          <RobotAvatar size={52} />
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22c55e] border-2 border-[#161b22]" />
        </div>
        <div>
          <p className="font-display font-bold text-[#e6edf3]">AHORRO AI</p>
          <p className="text-xs text-[#22c55e]">● En línea · Tu agente inteligente 24/7</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {SUGERENCIAS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setInput(s);
            }}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-[#1f2937] border border-[#30363d] text-[#8b949e] hover:border-[#f59e0b] hover:text-[#f59e0b] transition-all"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto mb-4 min-h-0">
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {m.role === "bot" && (
              <div className="flex-shrink-0 mt-1">
                <RobotAvatar size={32} />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                m.role === "bot"
                  ? "bg-[#161b22] border border-[#30363d] text-[#e6edf3] rounded-tl-sm"
                  : "bg-[#f59e0b] text-[#0d1117] font-medium rounded-tr-sm"
              }`}
            >
              {m.text.replace(/\*\*(.*?)\*\*/g, "$1")}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <RobotAvatar size={32} />
            </div>
            <div className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
              Analizando finanzas...
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-auto">
        <input
          type="text"
          placeholder="Pregúntame sobre tus ingresos, préstamos, intereses o deudores..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded-2xl px-4 py-3 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#f59e0b] transition-colors"
        />
        <button
          onClick={enviar}
          disabled={loading}
          className="w-12 h-12 rounded-2xl bg-[#f59e0b] text-[#0d1117] font-bold text-lg hover:bg-[#fbbf24] transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-50"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [usuario, setUsuario] = useState<{ id: string; nombre: string; email: string } | null>(() => {
    const saved = localStorage.getItem("ahorro_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [hogar, setHogar] = useState<GastoHogar[]>([]);

  // Hermanos configurados por el usuario
  const [hermanos, setHermanos] = useState<Hermano[]>(() => {
    if (typeof window === "undefined") return HERMANOS_DEFAULT;
    const savedUser = localStorage.getItem("ahorro_user");
    const userId = savedUser ? JSON.parse(savedUser)?.id : "default";
    const saved = localStorage.getItem(`ahorro_hermanos_${userId}`);
    return saved ? JSON.parse(saved) : HERMANOS_DEFAULT;
  });

  // Cargar hermanos específicos del usuario
  useEffect(() => {
    if (usuario) {
      const saved = localStorage.getItem(`ahorro_hermanos_${usuario.id}`);
      if (saved) {
        setHermanos(JSON.parse(saved));
      } else {
        localStorage.setItem(`ahorro_hermanos_${usuario.id}`, JSON.stringify(HERMANOS_DEFAULT));
        setHermanos(HERMANOS_DEFAULT);
      }
    }
  }, [usuario]);

  // Cargar datos de Supabase y enriquecer con localStorage
  useEffect(() => {
    if (usuario) {
      localStorage.setItem("ahorro_user", JSON.stringify(usuario));
    } else {
      localStorage.removeItem("ahorro_user");
    }

    if (!usuario) return;

    async function loadData() {
      const { data: g } = await supabase.from("gastos").select("*").eq("usuario_id", usuario!.id);
      if (g) setGastos(g as Gasto[]);

      const { data: p } = await supabase.from("prestamos").select("*").eq("usuario_id", usuario!.id);
      if (p) {
        const metaKeyP = `ahorro_prestamos_meta_${usuario!.id}`;
        const metaSavedP = JSON.parse(localStorage.getItem(metaKeyP) || "{}");
        const mappedP = p.map((row) => {
          const extra = metaSavedP[row.id] || {};
          return {
            ...row,
            fechaInicio: row.fecha_inicio,
            cuotasPagadas: row.cuotas_pagadas,
            metodoPago: extra.metodoPago || "solo_interes_capital_final",
            fechaFin: extra.fechaFin,
            cronograma: extra.cronograma,
            penalizaciones: extra.penalizaciones || [],
            notas: extra.notas,
          };
        }) as Prestamo[];
        setPrestamos(mappedP);
      }

      const { data: m } = await supabase.from("metas").select("*").eq("usuario_id", usuario!.id);
      if (m) setMetas(m as Meta[]);

      const { data: h } = await supabase.from("hogar").select("*").eq("usuario_id", usuario!.id);
      if (h) {
        // Enriquecer registros de hogar con metadatos locales (nombres de hermanos, pagos)
        const metaKey = `ahorro_hogar_meta_${usuario!.id}`;
        const metaSaved = JSON.parse(localStorage.getItem(metaKey) || "{}");
        const mappedH = h.map((row) => {
          const extra = metaSaved[row.id] || {};
          return {
            ...row,
            pagadoPor: row.pagado_por || "Yo",
            ...extra,
          };
        }) as GastoHogar[];
        setHogar(mappedH);
      }
    }
    loadData();
  }, [usuario]);

  // Gestión de Hermanos
  const saveHermano = (h: Hermano) => {
    setHermanos((prev) => {
      const exists = prev.some((x) => x.id === h.id);
      const updated = exists ? prev.map((x) => (x.id === h.id ? h : x)) : [...prev, h];
      if (usuario) {
        localStorage.setItem(`ahorro_hermanos_${usuario.id}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  const deleteHermano = (id: string) => {
    setHermanos((prev) => {
      const updated = prev.filter((x) => x.id !== id);
      if (usuario) {
        localStorage.setItem(`ahorro_hermanos_${usuario.id}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Operaciones CRUD en Supabase & Local
  const addGasto = async (g: Partial<Gasto>) => {
    const { data } = await supabase
      .from("gastos")
      .insert([{ ...g, usuario_id: usuario!.id }])
      .select()
      .single();
    if (data) setGastos((prev) => [...prev, data as Gasto]);
  };
  const delGasto = async (id: string) => {
    await supabase.from("gastos").delete().eq("id", id);
    setGastos((prev) => prev.filter((x) => x.id !== id));
  };

  // Operaciones de Préstamos
  const addPrestamo = async (p: Partial<Prestamo>) => {
    const dbPayload = {
      deudor: p.deudor,
      capital: p.capital,
      interes: p.interes,
      moneda: p.moneda,
      fecha_inicio: p.fechaInicio,
      cuotas: p.cuotas,
      cuotas_pagadas: p.cuotasPagadas ?? 0,
      estado: p.estado || "activo",
      usuario_id: usuario!.id,
    };

    const { data, error } = await supabase.from("prestamos").insert([dbPayload]).select().single();
    if (error) {
      console.error("Error al guardar préstamo en Supabase, guardando localmente:", error);
      const fallbackP: Prestamo = {
        id: `p_local_${Date.now()}`,
        deudor: p.deudor || "Deudor",
        capital: p.capital || 0,
        interes: p.interes || 0,
        fechaInicio: p.fechaInicio || new Date().toISOString().slice(0, 10),
        fechaFin: p.fechaFin,
        cuotas: p.cuotas || 1,
        cuotasPagadas: p.cuotasPagadas || 0,
        estado: p.estado || "activo",
        moneda: p.moneda || "Bs",
        metodoPago: p.metodoPago || "solo_interes_capital_final",
        cronograma: p.cronograma || [],
        penalizaciones: p.penalizaciones || [],
        notas: p.notas || "",
      };
      setPrestamos((prev) => [...prev, fallbackP]);
      return;
    }

    if (data) {
      const metaKeyP = `ahorro_prestamos_meta_${usuario!.id}`;
      const metaSavedP = JSON.parse(localStorage.getItem(metaKeyP) || "{}");
      metaSavedP[data.id] = {
        metodoPago: p.metodoPago || "solo_interes_capital_final",
        fechaFin: p.fechaFin,
        cronograma: p.cronograma,
        penalizaciones: p.penalizaciones || [],
        notas: p.notas,
      };
      localStorage.setItem(metaKeyP, JSON.stringify(metaSavedP));

      const newPrestamo: Prestamo = {
        ...data,
        fechaInicio: data.fecha_inicio,
        cuotasPagadas: data.cuotas_pagadas,
        metodoPago: p.metodoPago || "solo_interes_capital_final",
        fechaFin: p.fechaFin,
        cronograma: p.cronograma,
        penalizaciones: p.penalizaciones || [],
        notas: p.notas,
      };
      setPrestamos((prev) => [...prev, newPrestamo]);
    }
  };

  const updatePrestamo = async (id: string, updates: Partial<Prestamo>) => {
    const dbUpdates: any = {};
    if (updates.cuotasPagadas !== undefined) dbUpdates.cuotas_pagadas = updates.cuotasPagadas;
    if (updates.estado !== undefined) dbUpdates.estado = updates.estado;
    if (updates.capital !== undefined) dbUpdates.capital = updates.capital;
    if (updates.interes !== undefined) dbUpdates.interes = updates.interes;
    if (updates.deudor !== undefined) dbUpdates.deudor = updates.deudor;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("prestamos").update(dbUpdates).eq("id", id);
    }

    setPrestamos((prev) => prev.map((x) => (x.id === id ? { ...x, ...updates } : x)));

    if (usuario) {
      const metaKeyP = `ahorro_prestamos_meta_${usuario.id}`;
      const metaSavedP = JSON.parse(localStorage.getItem(metaKeyP) || "{}");
      metaSavedP[id] = {
        ...(metaSavedP[id] || {}),
        ...updates,
      };
      localStorage.setItem(metaKeyP, JSON.stringify(metaSavedP));
    }
  };

  const delPrestamo = async (id: string) => {
    await supabase.from("prestamos").delete().eq("id", id);
    setPrestamos((prev) => prev.filter((x) => x.id !== id));
    if (usuario) {
      const metaKeyP = `ahorro_prestamos_meta_${usuario.id}`;
      const metaSavedP = JSON.parse(localStorage.getItem(metaKeyP) || "{}");
      delete metaSavedP[id];
      localStorage.setItem(metaKeyP, JSON.stringify(metaSavedP));
    }
  };

  const addMeta = async (m: Partial<Meta>) => {
    const { data } = await supabase
      .from("metas")
      .insert([{ ...m, usuario_id: usuario!.id }])
      .select()
      .single();
    if (data) setMetas((prev) => [...prev, data as Meta]);
  };
  const updateMeta = async (id: string, updates: Partial<Meta>) => {
    await supabase.from("metas").update(updates).eq("id", id);
    setMetas((prev) => prev.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  };
  const delMeta = async (id: string) => {
    await supabase.from("metas").delete().eq("id", id);
    setMetas((prev) => prev.filter((x) => x.id !== id));
  };

  // Operaciones de Hogar sincronizadas con Supabase + Enriquecimiento local
  const addHogar = async (h: Partial<GastoHogar>) => {
    const dbPayload = {
      fecha: h.fecha,
      descripcion: h.descripcion,
      monto: h.monto,
      moneda: h.moneda,
      categoria: h.categoria,
      dividir: h.dividir ?? false,
      hermanos: h.hermanos ?? 0,
      pagado_por: h.pagadoPor || "Yo",
      usuario_id: usuario!.id,
    };

    const { data, error } = await supabase.from("hogar").insert([dbPayload]).select().single();
    if (error) {
      console.error("Error al guardar compra de hogar:", error);
      const fallbackItem: GastoHogar = {
        id: `h_local_${Date.now()}`,
        fecha: h.fecha || new Date().toISOString().slice(0, 10),
        descripcion: h.descripcion || "Compra Hogar",
        monto: h.monto || 0,
        moneda: h.moneda || "Bs",
        categoria: h.categoria || "otro",
        dividir: h.dividir ?? true,
        hermanos: h.hermanos || 0,
        pagadoPor: h.pagadoPor || "Yo",
        hermanosNombres: h.hermanosNombres,
        cuotaPorPersona: h.cuotaPorPersona,
        esRedondeado: h.esRedondeado,
        montoExacto: h.montoExacto,
        pagosRegistrados: h.pagosRegistrados || {},
      };
      setHogar((prev) => [...prev, fallbackItem]);
      return;
    }

    if (data) {
      const metaKey = `ahorro_hogar_meta_${usuario!.id}`;
      const metaSaved = JSON.parse(localStorage.getItem(metaKey) || "{}");
      metaSaved[data.id] = {
        hermanosNombres: h.hermanosNombres,
        cuotaPorPersona: h.cuotaPorPersona,
        esRedondeado: h.esRedondeado,
        montoExacto: h.montoExacto,
        pagosRegistrados: h.pagosRegistrados || {},
      };
      localStorage.setItem(metaKey, JSON.stringify(metaSaved));

      const newGastoHogar: GastoHogar = {
        ...data,
        pagadoPor: data.pagado_por,
        hermanosNombres: h.hermanosNombres,
        cuotaPorPersona: h.cuotaPorPersona,
        esRedondeado: h.esRedondeado,
        montoExacto: h.montoExacto,
        pagosRegistrados: h.pagosRegistrados || {},
      };
      setHogar((prev) => [...prev, newGastoHogar]);
    }
  };

  const updateHogar = (id: string, updates: Partial<GastoHogar>) => {
    setHogar((prev) => prev.map((x) => (x.id === id ? { ...x, ...updates } : x)));
    if (usuario) {
      const metaKey = `ahorro_hogar_meta_${usuario.id}`;
      const metaSaved = JSON.parse(localStorage.getItem(metaKey) || "{}");
      metaSaved[id] = {
        ...(metaSaved[id] || {}),
        ...updates,
      };
      localStorage.setItem(metaKey, JSON.stringify(metaSaved));
    }
  };

  const delHogar = async (id: string) => {
    await supabase.from("hogar").delete().eq("id", id);
    setHogar((prev) => prev.filter((x) => x.id !== id));
    if (usuario) {
      const metaKey = `ahorro_hogar_meta_${usuario.id}`;
      const metaSaved = JSON.parse(localStorage.getItem(metaKey) || "{}");
      delete metaSaved[id];
      localStorage.setItem(metaKey, JSON.stringify(metaSaved));
    }
  };

  if (!usuario) {
    return <Login onLogin={setUsuario} />;
  }

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: "inicio", label: "Inicio", emoji: "🏠" },
    { id: "gastos", label: "Ingresos & Gastos", emoji: "💵" },
    { id: "hogar", label: "Hogar & Hermanos", emoji: "🏡" },
    { id: "prestamos", label: "Préstamos", emoji: "🤝" },
    { id: "metas", label: "Metas", emoji: "🎯" },
    { id: "asistente", label: "AHORRO AI", emoji: "🤖" },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] flex justify-center">
      <div className="w-full max-w-md flex flex-col min-h-screen">
        {/* Header Superior */}
        <div className="flex items-center justify-between px-4 pt-6 pb-4 flex-shrink-0">
          <div>
            <h1 className="font-display font-extrabold text-xl text-[#e6edf3] tracking-tight">
              Agente <span className="text-[#f59e0b]">AHORRO-MES</span>
            </h1>
            <p className="text-xs text-[#8b949e] font-mono mt-0.5">{usuario.nombre} · Finanzas Inteligentes</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-10 h-10 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center hover:border-[#f59e0b] transition-colors relative"
            >
              <RobotAvatar size={28} />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#30363d]">
                  <p className="text-sm font-semibold text-[#e6edf3] truncate">{usuario.nombre}</p>
                  <p className="text-xs text-[#8b949e] truncate">{usuario.email}</p>
                </div>
                <button
                  onClick={() => {
                    setUsuario(null);
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-[#ef4444] font-semibold hover:bg-[#ef4444]/10 transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Barra de Pestañas */}
        <div className="flex gap-1.5 px-4 mb-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-display font-semibold transition-all ${
                tab === t.id
                  ? "bg-[#f59e0b] text-[#0d1117]"
                  : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"
              }`}
            >
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Contenido de la Pestaña Activa */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {tab === "inicio" && (
            <Inicio
              gastos={gastos}
              prestamos={prestamos}
              metas={metas}
              hogar={hogar}
              hermanos={hermanos}
              nombre={usuario.nombre}
              onNavigateTab={setTab}
            />
          )}
          {tab === "gastos" && (
            <MovimientosTab gastos={gastos} onAdd={addGasto} onDelete={delGasto} />
          )}
          {tab === "hogar" && (
            <HogarTab
              hogar={hogar}
              hermanos={hermanos}
              usuarioNombre={usuario.nombre}
              onAdd={addHogar}
              onDelete={delHogar}
              onUpdateGasto={updateHogar}
              onSaveHermano={saveHermano}
              onDeleteHermano={deleteHermano}
            />
          )}
          {tab === "prestamos" && (
            <PrestamosTab
              prestamos={prestamos}
              onAdd={addPrestamo}
              onUpdate={updatePrestamo}
              onDelete={delPrestamo}
            />
          )}
          {tab === "metas" && (
            <Metas metas={metas} onAdd={addMeta} onUpdate={updateMeta} onDelete={delMeta} />
          )}
          {tab === "asistente" && (
            <Asistente
              nombre={usuario.nombre}
              gastos={gastos}
              prestamos={prestamos}
              metas={metas}
              hogar={hogar}
              hermanos={hermanos}
            />
          )}
        </div>
      </div>
    </div>
  );
}
