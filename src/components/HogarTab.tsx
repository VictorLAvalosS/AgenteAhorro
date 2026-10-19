import { useState } from "react";
import { GastoHogar, Moneda, CategoriaHogar } from "../lib/types";
import { Hermano, calcularCuotaDivision, formatearMontoDivision } from "../lib/hermanos";
import ModalHermanos from "./ModalHermanos";

interface Props {
  hogar: GastoHogar[];
  hermanos: Hermano[];
  usuarioNombre: string;
  onAdd: (g: Partial<GastoHogar>) => void;
  onDelete: (id: string) => void;
  onUpdateGasto?: (id: string, updates: Partial<GastoHogar>) => void;
  onSaveHermano: (hermano: Hermano) => void;
  onDeleteHermano: (id: string) => void;
}

const CATS_HOGAR: { val: CategoriaHogar; label: string; emoji: string }[] = [
  { val: "comida", label: "Alimentos / Comida", emoji: "🛒" },
  { val: "limpieza", label: "Limpieza", emoji: "🧴" },
  { val: "internet", label: "Internet", emoji: "📶" },
  { val: "streaming", label: "Streaming", emoji: "📺" },
  { val: "servicios", label: "Luz / Agua / Gas", emoji: "💡" },
  { val: "mascotas", label: "Comida Perros / Mascotas", emoji: "🐕" },
  { val: "otro", label: "Otro gasto", emoji: "📦" },
];

export default function HogarTab({
  hogar,
  hermanos,
  usuarioNombre,
  onAdd,
  onDelete,
  onUpdateGasto,
  onSaveHermano,
  onDeleteHermano,
}: Props) {
  const [vista, setVista] = useState<"gastos" | "cuentas">("gastos");
  const [seccionFiltro, setSeccionFiltro] = useState<"todos" | "mascotas" | "servicios" | "divididos">("todos");
  const [showForm, setShowForm] = useState(false);
  const [showModalHermanos, setShowModalHermanos] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState<{
    descripcion: string;
    monto: string;
    categoria: CategoriaHogar;
    dividir: boolean;
    fecha: string;
    moneda: Moneda;
    pagadoPor: string;
    hermanosSeleccionados: string[]; // Nombres de hermanos que comparten
    incluirme: boolean; // Si el usuario también comparte
  }>({
    descripcion: "",
    monto: "",
    categoria: "comida",
    dividir: true,
    fecha: new Date().toISOString().slice(0, 10),
    moneda: "Bs",
    pagadoPor: "Yo",
    hermanosSeleccionados: hermanos.map((h) => h.nombre),
    incluirme: true,
  });

  // Helper para obtener la lista de hermanos asignados a una compra (retrocompatibilidad)
  function obtenerNombresParticipantes(g: GastoHogar): string[] {
    if (g.hermanosNombres && g.hermanosNombres.length > 0) {
      return g.hermanosNombres;
    }
    // Si no estaban guardados en metadatos, asignar a los hermanos configurados actualmente
    return hermanos.map((h) => h.nombre);
  }

  // Cálculo en vivo para el formulario según la regla del usuario
  const montoNum = parseFloat(form.monto) || 0;
  const numParticipantes = (form.incluirme ? 1 : 0) + form.hermanosSeleccionados.length;
  const calculoEnVivo = calcularCuotaDivision(montoNum, numParticipantes, form.moneda);

  function toggleHermanoForm(nombre: string) {
    setForm((prev) => {
      const exists = prev.hermanosSeleccionados.includes(nombre);
      const nuevos = exists
        ? prev.hermanosSeleccionados.filter((n) => n !== nombre)
        : [...prev.hermanosSeleccionados, nombre];
      return { ...prev, hermanosSeleccionados: nuevos };
    });
  }

  function agregarCompra() {
    if (!form.descripcion.trim() || !form.monto || montoNum <= 0) return;

    const numHermanos = form.hermanosSeleccionados.length;
    const calculo = calcularCuotaDivision(montoNum, numParticipantes, form.moneda);

    const payload: Partial<GastoHogar> = {
      descripcion: form.descripcion.trim(),
      monto: montoNum,
      categoria: form.categoria,
      moneda: form.moneda,
      fecha: form.fecha,
      dividir: form.dividir,
      hermanos: numHermanos,
      pagadoPor: form.pagadoPor,
      hermanosNombres: form.hermanosSeleccionados,
      cuotaPorPersona: calculo.cuotaFinal,
      esRedondeado: calculo.esRedondeado,
      montoExacto: calculo.cuotaExacta,
      pagosRegistrados: {}, // Ningún hermano ha pagado aún
    };

    onAdd(payload);

    setForm({
      ...form,
      descripcion: "",
      monto: "",
      hermanosSeleccionados: hermanos.map((h) => h.nombre),
      incluirme: true,
    });
    setShowForm(false);
  }

  // Filtrado de lista de gastos
  const lista = hogar
    .filter((g) => {
      if (seccionFiltro === "mascotas") return g.categoria === "mascotas";
      if (seccionFiltro === "servicios") return g.categoria === "servicios" || g.categoria === "internet" || g.categoria === "streaming";
      if (seccionFiltro === "divididos") return g.dividir;
      return true;
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Toggle de pago para un hermano en una compra específica (permite pagar de a poco)
  function togglePagoHermano(gasto: GastoHogar, nombreHermano: string) {
    if (!onUpdateGasto) return;
    const actual = gasto.pagosRegistrados?.[nombreHermano] ?? false;
    const nuevoEstado = !actual;
    const nuevosPagos = {
      ...(gasto.pagosRegistrados || {}),
      [nombreHermano]: nuevoEstado,
    };
    onUpdateGasto(gasto.id, { pagosRegistrados: nuevosPagos });
  }

  // Saldar todas las deudas de un hermano específico
  function saldarHermanoTotal(nombreHermano: string) {
    if (!onUpdateGasto) return;
    hogar.forEach((g) => {
      if (!g.dividir) return;
      const participantes = obtenerNombresParticipantes(g);
      if (participantes.includes(nombreHermano)) {
        const yaPago = g.pagosRegistrados?.[nombreHermano] ?? false;
        if (!yaPago) {
          const nuevosPagos = {
            ...(g.pagosRegistrados || {}),
            [nombreHermano]: true,
          };
          onUpdateGasto(g.id, { pagosRegistrados: nuevosPagos });
        }
      }
    });
  }

  // Cálculo de totales por hermano
  const deudasPorHermano = hermanos.map((h) => {
    let debeBs = 0;
    let debeUsd = 0;
    let pagadoBs = 0;
    let pagadoUsd = 0;
    const itemsPendientes: { gasto: GastoHogar; cuota: number }[] = [];
    const itemsPagados: { gasto: GastoHogar; cuota: number }[] = [];

    hogar.forEach((g) => {
      if (!g.dividir) return;
      const participantes = obtenerNombresParticipantes(g);

      if (participantes.includes(h.nombre)) {
        // Cuota calculada según la regla de redondeo
        const totalP = (g.hermanos || participantes.length) + 1;
        const calc = g.cuotaPorPersona ?? calcularCuotaDivision(g.monto, totalP, g.moneda).cuotaFinal;
        const yaPago = g.pagosRegistrados?.[h.nombre] ?? false;

        // Considerar compras pagadas por "Yo" o por el usuario
        const pagadoPorMi =
          !g.pagadoPor ||
          g.pagadoPor === "Yo" ||
          g.pagadoPor.toLowerCase() === (usuarioNombre || "").toLowerCase();

        if (pagadoPorMi) {
          if (!yaPago) {
            if (g.moneda === "Bs") debeBs += calc;
            else debeUsd += calc;
            itemsPendientes.push({ gasto: g, cuota: calc });
          } else {
            if (g.moneda === "Bs") pagadoBs += calc;
            else pagadoUsd += calc;
            itemsPagados.push({ gasto: g, cuota: calc });
          }
        }
      }
    });

    return {
      hermano: h,
      debeBs,
      debeUsd,
      pagadoBs,
      pagadoUsd,
      itemsPendientes,
      itemsPagados,
    };
  });

  const totalDeudaHermanosBs = deudasPorHermano.reduce((acc, curr) => acc + curr.debeBs, 0);
  const totalDeudaHermanosUsd = deudasPorHermano.reduce((acc, curr) => acc + curr.debeUsd, 0);

  // Copiar recordatorio de WhatsApp
  function copiarMensajeCobro(hInfo: (typeof deudasPorHermano)[0]) {
    const lines = [
      `¡Hola ${hInfo.hermano.nombre}! 👋`,
      `Te paso la cuenta detallada de los gastos compartidos del hogar:`,
      ``,
    ];

    if (hInfo.itemsPendientes.length > 0) {
      lines.push(`🔴 PENDIENTE POR PAGAR (${hInfo.itemsPendientes.length} compras/servicios):`);
      hInfo.itemsPendientes.forEach((it) => {
        lines.push(`  • ${it.gasto.descripcion}: ${formatearMontoDivision(it.cuota, it.gasto.moneda)}`);
      });
      lines.push(``);
    }

    if (hInfo.itemsPagados.length > 0) {
      lines.push(`✅ YA DESCONTADO / PAGADO:`);
      hInfo.itemsPagados.forEach((it) => {
        lines.push(`  ✓ ${it.gasto.descripcion}: ${formatearMontoDivision(it.cuota, it.gasto.moneda)}`);
      });
      lines.push(``);
    }

    lines.push(`═══════════════════════`);
    lines.push(`💰 TOTAL QUE ME DEBES: ${formatearMontoDivision(hInfo.debeBs, "Bs")}${
      hInfo.debeUsd > 0 ? ` + ${formatearMontoDivision(hInfo.debeUsd, "USD")}` : ""
    }`);
    lines.push(`═══════════════════════`);
    lines.push(``);
    lines.push(`¡Muchas gracias! 🙌`);

    const texto = lines.join("\n");
    navigator.clipboard.writeText(texto);
    setCopiadoId(hInfo.hermano.id);
    setTimeout(() => setCopiadoId(null), 2500);
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Tarjeta de Resumen Principal */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-[#2e1065] via-[#1f1937] to-[#161b22] border border-[#a855f7]/30 shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏡</span>
            <p className="text-xs font-display uppercase tracking-widest text-[#c084fc] font-bold">
              Cuentas del Hogar & Hermanos
            </p>
          </div>
          <button
            onClick={() => setShowModalHermanos(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#a855f7]/20 hover:bg-[#a855f7]/30 border border-[#a855f7]/40 text-xs text-[#e6edf3] font-semibold transition-all"
          >
            <span>👥</span> Gestionar Hermanos ({hermanos.length})
          </button>
        </div>

        <div className="flex items-baseline justify-between mt-1">
          <div>
            <p className="text-xs text-[#8b949e]">Total que te deben tus hermanos:</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-[#c084fc]">
                {formatearMontoDivision(totalDeudaHermanosBs, "Bs")}
              </span>
              {totalDeudaHermanosUsd > 0 && (
                <span className="font-mono text-sm text-[#c084fc]/80">
                  + {formatearMontoDivision(totalDeudaHermanosUsd, "USD")}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setVista(vista === "gastos" ? "cuentas" : "gastos")}
            className="px-3 py-2 rounded-xl bg-[#161b22] border border-[#30363d] text-xs font-semibold text-[#e6edf3] hover:border-[#a855f7] transition-all"
          >
            {vista === "gastos" ? "Ver por Hermano →" : "Ver Lista de Gastos →"}
          </button>
        </div>

        {/* Chips de hermanos con su deuda actualizada */}
        <div className="flex gap-2 overflow-x-auto pt-3 mt-2 border-t border-[#30363d]/50">
          {deudasPorHermano.map((d) => (
            <div
              key={d.hermano.id}
              onClick={() => setVista("cuentas")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border flex-shrink-0 cursor-pointer transition-all ${
                d.debeBs > 0
                  ? "bg-[#f59e0b]/15 border-[#f59e0b]/40"
                  : "bg-[#0d1117]/60 border-[#30363d]"
              }`}
            >
              <span className="text-sm">{d.hermano.avatar || "👤"}</span>
              <span className="text-xs text-[#e6edf3] font-medium">{d.hermano.nombre}:</span>
              <span
                className={`font-mono text-xs font-bold ${
                  d.debeBs > 0 ? "text-[#f59e0b]" : "text-[#22c55e]"
                }`}
              >
                {d.debeBs > 0 ? formatearMontoDivision(d.debeBs, "Bs") : "Al día ✓"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Selector de Vistas: Gastos / Cuentas */}
      <div className="flex gap-2">
        <button
          onClick={() => setVista("gastos")}
          className={`flex-1 py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            vista === "gastos"
              ? "bg-[#a855f7] text-white shadow-md shadow-[#a855f7]/20"
              : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"
          }`}
        >
          <span>📋</span> Compras del Hogar
        </button>
        <button
          onClick={() => setVista("cuentas")}
          className={`flex-1 py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
            vista === "cuentas"
              ? "bg-[#a855f7] text-white shadow-md shadow-[#a855f7]/20"
              : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"
          }`}
        >
          <span>🤝</span> Cuentas con Hermanos
        </button>
      </div>

      {/* Botón para Abrir Formulario */}
      <button
        onClick={() => {
          if (!showForm) {
            // Inicializar con los hermanos actuales
            setForm((f) => ({
              ...f,
              hermanosSeleccionados: hermanos.map((h) => h.nombre),
            }));
          }
          setShowForm(!showForm);
        }}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white font-display font-bold text-sm hover:opacity-95 transition-all shadow-lg flex items-center justify-center gap-2"
      >
        <span>{showForm ? "✕ Cancelar registro" : "+ Registrar compra del hogar"}</span>
      </button>

      {/* FORMULARIO DE NUEVA COMPRA */}
      {showForm && (
        <div className="rounded-2xl p-4 bg-[#161b22] border border-[#30363d] space-y-3.5 animate-fade-in shadow-xl">
          <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
            <h4 className="font-display font-bold text-sm text-[#e6edf3] flex items-center gap-2">
              <span>🛒</span> Nueva Compra o Servicio Compartido
            </h4>
            <span className="text-[11px] text-[#8b949e]">Hogar & Familia</span>
          </div>

          {/* Atajos Rápidos de Servicios */}
          <div>
            <label className="text-xs text-[#8b949e] mb-1.5 block">Atajos rápidos:</label>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { desc: "Papel higiénico", cat: "limpieza", emoji: "🧻" },
                { desc: "Colino / Pasta dental", cat: "limpieza", emoji: "🧴" },
                { desc: "Aceite y víveres", cat: "comida", emoji: "🍳" },
                { desc: "Comida de perros", cat: "mascotas", emoji: "🐕" },
                { desc: "Internet mensual", cat: "internet", emoji: "📶" },
                { desc: "Netflix / Streaming", cat: "streaming", emoji: "📺" },
              ].map((sug) => (
                <button
                  key={sug.desc}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      descripcion: sug.desc,
                      categoria: sug.cat as CategoriaHogar,
                    }))
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#0d1117] border border-[#30363d] hover:border-[#a855f7] text-[11px] text-[#e6edf3] flex items-center gap-1 flex-shrink-0 transition-colors"
                >
                  <span>{sug.emoji}</span>
                  <span>{sug.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">¿Qué compraste o pagaste?:</label>
            <input
              type="text"
              placeholder="Ej: Colino, Papel higiénico, Aceite, Internet Tigo, Netflix..."
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]"
            />
          </div>

          {/* Monto y Moneda */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-[#8b949e] mb-1 block">Monto total pagado:</label>
              <input
                type="number"
                placeholder="Ej: 68"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]"
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
                        ? "bg-[#a855f7] text-white"
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
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as CategoriaHogar }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-[#e6edf3] outline-none focus:border-[#a855f7]"
              >
                {CATS_HOGAR.map((c) => (
                  <option key={c.val} value={c.val}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Fecha de compra:</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-[#e6edf3] outline-none focus:border-[#a855f7]"
              />
            </div>
          </div>

          {/* Sección de División */}
          <div className="rounded-xl p-3.5 bg-[#0d1117] border border-[#30363d] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#e6edf3]">¿Dividir con hermanos?</p>
                <p className="text-xs text-[#8b949e]">Calcula la parte exacta de cada uno</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, dividir: !f.dividir }))}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  form.dividir ? "bg-[#a855f7]" : "bg-[#30363d]"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                    form.dividir ? "left-6" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {form.dividir && (
              <div className="space-y-3 pt-2 border-t border-[#30363d]/50">
                {/* ¿Quién pagó? */}
                <div>
                  <label className="text-xs text-[#8b949e] mb-1 block">
                    ¿Quién pagó esta compra con su dinero?:
                  </label>
                  <select
                    value={form.pagadoPor}
                    onChange={(e) => setForm((f) => ({ ...f, pagadoPor: e.target.value }))}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#a855f7]"
                  >
                    <option value="Yo">Yo ({usuarioNombre || "Mi dinero"})</option>
                    {hermanos.map((h) => (
                      <option key={h.id} value={h.nombre}>
                        {h.avatar} {h.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selección de Hermanos que comparten */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[#8b949e]">
                      ¿Quiénes comparten este gasto? ({numParticipantes} personas):
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          hermanosSeleccionados:
                            f.hermanosSeleccionados.length === hermanos.length
                              ? []
                              : hermanos.map((h) => h.nombre),
                        }))
                      }
                      className="text-[11px] text-[#a855f7] hover:underline"
                    >
                      {form.hermanosSeleccionados.length === hermanos.length
                        ? "Desmarcar todos"
                        : "Marcar todos"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Chip de "Yo" */}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, incluirme: !f.incluirme }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        form.incluirme
                          ? "bg-[#f59e0b]/20 border-[#f59e0b] text-[#f59e0b]"
                          : "bg-[#161b22] border-[#30363d] text-[#8b949e]"
                      }`}
                    >
                      <span>{form.incluirme ? "✓" : "○"}</span>
                      <span>Yo ({usuarioNombre || "Víctor"})</span>
                    </button>

                    {/* Chips de hermanos */}
                    {hermanos.map((h) => {
                      const selected = form.hermanosSeleccionados.includes(h.nombre);
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => toggleHermanoForm(h.nombre)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                            selected
                              ? "bg-[#a855f7]/25 border-[#a855f7] text-white shadow-sm"
                              : "bg-[#161b22] border-[#30363d] text-[#8b949e]"
                          }`}
                        >
                          <span>{selected ? "✓" : "○"}</span>
                          <span>{h.avatar || "👤"}</span>
                          <span>{h.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[#8b949e] mt-1.5">
                    💡 Selecciona solo a los hermanos que participan (ej: para alimento de perros, solo 1 hermana y 1 hermano).
                  </p>
                </div>

                {/* Previsualización en Vivo de la Regla de Redondeo */}
                {montoNum > 0 && numParticipantes > 0 && (
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#a855f7]/30 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8b949e]">Cada persona debe aportar:</span>
                      <span className="font-mono font-bold text-sm text-[#c084fc]">
                        {form.moneda} {calculoEnVivo.cuotaFinal}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#30363d]/40">
                      <span className="text-[#8b949e]">Cálculo matemático:</span>
                      <span className="font-mono text-[#8b949e]">
                        {montoNum} ÷ {numParticipantes} = {calculoEnVivo.cuotaExacta.toFixed(4)}...
                      </span>
                    </div>

                    {calculoEnVivo.esRedondeado ? (
                      <p className="text-[10px] text-[#f59e0b] flex items-center gap-1 pt-0.5">
                        <span>✨</span> Redondeado a entero ({calculoEnVivo.cuotaFinal} {form.moneda}) porque tiene más de 4 decimales.
                      </p>
                    ) : (
                      <p className="text-[10px] text-[#22c55e] flex items-center gap-1 pt-0.5">
                        <span>✓</span> Mantiene decimales exactos ({calculoEnVivo.cuotaFinal} {form.moneda}).
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={agregarCompra}
            disabled={!form.descripcion.trim() || !form.monto || montoNum <= 0}
            className="w-full py-3 rounded-xl bg-[#a855f7] text-white font-display font-bold text-sm hover:bg-[#c084fc] transition-colors shadow-lg disabled:opacity-40"
          >
            Guardar compra del hogar ✓
          </button>
        </div>
      )}

      {/* VISTA 1: LISTADO DE GASTOS */}
      {vista === "gastos" && (
        <div className="space-y-3">
          {/* Filtros de sección */}
          <div className="flex gap-2">
            {[
              { val: "todos", label: "Todos" },
              { val: "divididos", label: "🤝 Divididos" },
              { val: "mascotas", label: "🐕 Mascotas" },
              { val: "servicios", label: "📶 Servicios / Net" },
            ].map((f) => (
              <button
                key={f.val}
                onClick={() => setSeccionFiltro(f.val as any)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-all ${
                  seccionFiltro === f.val
                    ? "bg-[#a855f7] text-white"
                    : "bg-[#161b22] text-[#8b949e] border border-[#30363d]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Listado de Compras */}
          <div className="space-y-2.5">
            {lista.map((g) => {
              const catObj = CATS_HOGAR.find((c) => c.val === g.categoria);
              const nombresParticipantes = obtenerNombresParticipantes(g);

              const totalPers = nombresParticipantes.length + 1;
              const calc = calcularCuotaDivision(g.monto, totalPers, g.moneda);
              const cuotaVal = g.cuotaPorPersona || calc.cuotaFinal;
              const fueRedondeado = g.esRedondeado ?? calc.esRedondeado;

              return (
                <div
                  key={g.id}
                  className="rounded-2xl p-4 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl flex-shrink-0">{catObj?.emoji || "📦"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#e6edf3] truncate">
                          {g.descripcion}
                        </p>
                        <p className="text-xs text-[#8b949e]">
                          {catObj?.label || g.categoria} · {g.fecha.slice(5).replace("-", "/")} · Pagado por:{" "}
                          <span className="text-[#a855f7] font-medium">{g.pagadoPor || "Yo"}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-base font-bold text-[#e6edf3]">
                        {formatearMontoDivision(g.monto, g.moneda)}
                      </span>
                      <button
                        onClick={() => onDelete(g.id)}
                        className="text-[#8b949e] hover:text-[#ef4444] text-xs p-1 rounded-md transition-colors"
                        title="Eliminar compra"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Detalle de División con Hermanos */}
                  {g.dividir ? (
                    <div className="p-2.5 rounded-xl bg-[#0d1117] border border-[#30363d]/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#8b949e]">
                          Dividido entre {totalPers} personas ({cuotaVal} {g.moneda} c/u):
                        </span>
                        {fueRedondeado ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/20 text-[#f59e0b] font-mono">
                            Redondeado ({calc.cuotaExacta.toFixed(2)})
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#22c55e]/20 text-[#22c55e] font-mono">
                            Exacto
                          </span>
                        )}
                      </div>

                      {/* Chips de estado por cada hermano (Toca para descontar o marcar como pagado) */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {nombresParticipantes.map((nom) => {
                          const pagado = g.pagosRegistrados?.[nom] ?? false;
                          const hermanoObj = hermanos.find((h) => h.nombre === nom);
                          return (
                            <button
                              key={nom}
                              type="button"
                              onClick={() => togglePagoHermano(g, nom)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                                pagado
                                  ? "bg-[#22c55e]/15 border-[#22c55e]/30 text-[#4ade80]"
                                  : "bg-[#ef4444]/15 border-[#ef4444]/30 text-[#f87171] hover:bg-[#ef4444]/25"
                              }`}
                              title={
                                pagado
                                  ? "Ya pagó esta compra (toca para desmarcar)"
                                  : "Pendiente de pago (toca para descontar / marcar como pagada esta compra)"
                              }
                            >
                              <span>{hermanoObj?.avatar || "👤"}</span>
                              <span className="font-sans font-medium">{nom}:</span>
                              <span>{cuotaVal} {g.moneda}</span>
                              <span className="font-bold ml-1 px-1 rounded bg-black/20">
                                {pagado ? "Pagado ✓" : "Debe ⏳"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-[#1f2937] text-[#8b949e]">
                      Solo personal (no dividido)
                    </span>
                  )}
                </div>
              );
            })}

            {lista.length === 0 && (
              <div className="text-center py-8 text-[#8b949e] text-xs">
                No hay compras registradas en esta vista.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 2: CUENTAS POR HERMANO */}
      {vista === "cuentas" && (
        <div className="space-y-4">
          <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-between">
            <span className="text-xs text-[#8b949e]">
              Total de hermanos registrados: <strong className="text-[#e6edf3]">{hermanos.length}</strong>
            </span>
            <button
              onClick={() => setShowModalHermanos(true)}
              className="text-xs font-semibold text-[#a855f7] hover:underline"
            >
              + Agregar o editar hermanos
            </button>
          </div>

          <div className="space-y-3">
            {deudasPorHermano.map((d) => (
              <div
                key={d.hermano.id}
                className="rounded-2xl p-4 bg-[#161b22] border border-[#30363d] space-y-3"
              >
                {/* Header de la tarjeta del hermano */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border shadow-inner"
                      style={{
                        backgroundColor: (d.hermano.color || "#a855f7") + "20",
                        borderColor: (d.hermano.color || "#a855f7") + "40",
                      }}
                    >
                      {d.hermano.avatar || "👤"}
                    </span>
                    <div>
                      <h4 className="font-display font-bold text-base text-[#e6edf3]">
                        {d.hermano.nombre}
                      </h4>
                      <p className="text-xs text-[#8b949e]">
                        {d.itemsPendientes.length === 0
                          ? "¡Al día! No tiene pagos pendientes"
                          : `${d.itemsPendientes.length} compra${d.itemsPendientes.length > 1 ? "s" : ""} pendiente${d.itemsPendientes.length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>

                  {/* Estado de Deuda */}
                  <div className="text-right">
                    <p className="text-[11px] text-[#8b949e]">Te debe:</p>
                    <p
                      className={`font-mono text-xl font-bold ${
                        d.debeBs > 0 ? "text-[#f59e0b]" : "text-[#22c55e]"
                      }`}
                    >
                      {d.debeBs > 0 ? formatearMontoDivision(d.debeBs, "Bs") : "Bs 0"}
                    </p>
                    {d.debeUsd > 0 && (
                      <p className="font-mono text-xs text-[#f59e0b]">
                        + {formatearMontoDivision(d.debeUsd, "USD")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Compras pendientes de este hermano (Permite descontar de a poco) */}
                {d.itemsPendientes.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#30363d]">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-display font-semibold text-[#8b949e] uppercase tracking-wider">
                        Detalle de compras pendientes (puedes cobrar una por una):
                      </p>
                    </div>
                    {d.itemsPendientes.map(({ gasto, cuota }) => (
                      <div
                        key={gasto.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border border-[#30363d]/60 text-xs"
                      >
                        <div className="truncate flex-1 mr-2">
                          <span className="text-[#e6edf3] font-medium">{gasto.descripcion}</span>
                          <span className="text-[#8b949e] text-[10px] ml-1.5">
                            ({gasto.fecha.slice(5)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#f59e0b]">
                            {formatearMontoDivision(cuota, gasto.moneda)}
                          </span>
                          <button
                            onClick={() => togglePagoHermano(gasto, d.hermano.nombre)}
                            className="px-2.5 py-1 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-[#0d1117] text-xs font-bold transition-colors shadow"
                          >
                            Descontar ✓
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Compras ya pagadas / descontadas */}
                {d.itemsPagados.length > 0 && (
                  <div className="pt-2 border-t border-[#30363d]/40">
                    <p className="text-[10px] text-[#22c55e] font-semibold uppercase mb-1">
                      Compras ya saldadas por {d.hermano.nombre}:
                    </p>
                    <div className="space-y-1">
                      {d.itemsPagados.map(({ gasto, cuota }) => (
                        <div
                          key={gasto.id}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-[#0d1117]/50 border border-[#22c55e]/20 text-[11px]"
                        >
                          <span className="text-[#8b949e] line-through truncate">{gasto.descripcion}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[#22c55e]">
                              {formatearMontoDivision(cuota, gasto.moneda)}
                            </span>
                            <button
                              onClick={() => togglePagoHermano(gasto, d.hermano.nombre)}
                              className="text-[10px] text-[#8b949e] hover:text-[#ef4444]"
                              title="Revertir a pendiente"
                            >
                              Deshacer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Acciones de la tarjeta */}
                <div className="flex gap-2 pt-1">
                  {d.debeBs > 0 || d.debeUsd > 0 ? (
                    <>
                      <button
                        onClick={() => saldarHermanoTotal(d.hermano.nombre)}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/30 text-[#4ade80] hover:bg-[#22c55e]/25 font-display font-bold text-xs transition-colors"
                      >
                        Saldar toda la deuda ✓
                      </button>
                      <button
                        onClick={() => copiarMensajeCobro(d)}
                        className="py-2 px-3 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#a855f7] text-[#e6edf3] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Copiar texto para WhatsApp"
                      >
                        <span>📲</span>
                        <span>{copiadoId === d.hermano.id ? "¡Copiado!" : "Cobrar por WhatsApp"}</span>
                      </button>
                    </>
                  ) : (
                    <div className="w-full py-2 text-center text-xs text-[#22c55e] font-medium bg-[#22c55e]/10 rounded-xl border border-[#22c55e]/20">
                      ✓ Todas sus cuentas están saldadas
                    </div>
                  )}
                </div>
              </div>
            ))}

            {hermanos.length === 0 && (
              <div className="text-center p-8 bg-[#161b22] rounded-2xl border border-dashed border-[#30363d]">
                <p className="text-sm font-semibold text-[#e6edf3]">No tienes hermanos registrados</p>
                <p className="text-xs text-[#8b949e] mt-1 mb-4">
                  Agrega a tus hermanos para que el sistema calcule automáticamente cuánto te debe cada uno.
                </p>
                <button
                  onClick={() => setShowModalHermanos(true)}
                  className="px-4 py-2 rounded-xl bg-[#a855f7] text-white text-xs font-bold"
                >
                  + Configurar Hermanos ahora
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Administración de Hermanos */}
      {showModalHermanos && (
        <ModalHermanos
          hermanos={hermanos}
          onSaveHermano={onSaveHermano}
          onDeleteHermano={onDeleteHermano}
          onClose={() => setShowModalHermanos(false)}
        />
      )}
    </div>
  );
}
