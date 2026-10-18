import { useState } from "react";
import { Prestamo, CuotaCronograma, MetodoPagoPrestamo, Moneda, PenalizacionPrestamo } from "../lib/types";
import {
  sumarMeses,
  formatFecha,
  generarCronogramaInicial,
  calcularDetallesPrestamo,
  generarMensajeCobroPrestamo,
} from "../lib/prestamos";

interface Props {
  prestamos: Prestamo[];
  onAdd: (p: Partial<Prestamo>) => void;
  onUpdate: (id: string, updates: Partial<Prestamo>) => void;
  onDelete: (id: string) => void;
  onConsultarIA?: (deudor: string, contexto: string) => void;
}

export default function PrestamosTab({
  prestamos,
  onAdd,
  onUpdate,
  onDelete,
  onConsultarIA,
}: Props) {
  const [filtro, setFiltro] = useState<"activos" | "atrasados" | "pagados">("activos");
  const [showForm, setShowForm] = useState(false);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Modal de Penalización
  const [penalizarPrestamo, setPenalizarPrestamo] = useState<Prestamo | null>(null);
  const [montoPenalizacion, setMontoPenalizacion] = useState("50");
  const [motivoPenalizacion, setMotivoPenalizacion] = useState("No pagó el interés del mes");

  // Form State
  const [form, setForm] = useState<{
    deudor: string;
    capital: string;
    interes: string; // % mensual
    cuotas: string; // Meses
    fechaInicio: string;
    fechaFin: string;
    moneda: Moneda;
    metodoPago: MetodoPagoPrestamo;
    notas: string;
  }>({
    deudor: "",
    capital: "",
    interes: "10",
    cuotas: "2",
    fechaInicio: new Date().toISOString().slice(0, 10),
    fechaFin: sumarMeses(new Date().toISOString().slice(0, 10), 2),
    moneda: "Bs",
    metodoPago: "solo_interes_capital_final",
    notas: "",
  });

  // Actualizar fechaFin automáticamente cuando cambian fechaInicio o cuotas en el formulario
  function handleCambioCuotas(cuotasVal: string) {
    const n = parseInt(cuotasVal) || 1;
    setForm((f) => ({
      ...f,
      cuotas: cuotasVal,
      fechaFin: sumarMeses(f.fechaInicio, n),
    }));
  }

  function handleCambioFechaInicio(nuevaFecha: string) {
    const n = parseInt(form.cuotas) || 1;
    setForm((f) => ({
      ...f,
      fechaInicio: nuevaFecha,
      fechaFin: sumarMeses(nuevaFecha, n),
    }));
  }

  const capitalNum = parseFloat(form.capital) || 0;
  const interesNum = parseFloat(form.interes) || 0;
  const cuotasNum = parseInt(form.cuotas) || 1;

  // Cronograma estimado en vivo para el formulario
  const cronogramaPreview = capitalNum > 0
    ? generarCronogramaInicial(capitalNum, interesNum, form.fechaInicio, cuotasNum, form.metodoPago)
    : [];

  const totalInteresesEstimados = cronogramaPreview.reduce((acc, c) => acc + c.montoInteres, 0);
  const totalEsperadoEstimado = capitalNum + totalInteresesEstimados;

  function guardarNuevoPrestamo() {
    if (!form.deudor.trim() || !form.capital || capitalNum <= 0) return;

    const cronograma = generarCronogramaInicial(
      capitalNum,
      interesNum,
      form.fechaInicio,
      cuotasNum,
      form.metodoPago
    );

    const payload: Partial<Prestamo> = {
      deudor: form.deudor.trim(),
      capital: capitalNum,
      interes: interesNum,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      cuotas: cuotasNum,
      cuotasPagadas: 0,
      estado: "activo",
      moneda: form.moneda,
      metodoPago: form.metodoPago,
      cronograma,
      penalizaciones: [],
      notas: form.notas.trim(),
    };

    onAdd(payload);

    setForm({
      deudor: "",
      capital: "",
      interes: "10",
      cuotas: "2",
      fechaInicio: new Date().toISOString().slice(0, 10),
      fechaFin: sumarMeses(new Date().toISOString().slice(0, 10), 2),
      moneda: "Bs",
      metodoPago: "solo_interes_capital_final",
      notas: "",
    });
    setShowForm(false);
  }

  // Marcar una cuota específica como pagada o desmarcarla
  function toggleCuotaPagada(p: Prestamo, numCuota: number) {
    const det = calcularDetallesPrestamo(p);
    const nuevoCronograma = det.cronograma.map((c) => {
      if (c.numero === numCuota) {
        const pagada = !c.pagada;
        return {
          ...c,
          pagada,
          fechaPago: pagada ? new Date().toISOString().slice(0, 10) : undefined,
        };
      }
      return c;
    });

    const cuotasPagadasCount = nuevoCronograma.filter((c) => c.pagada).length;
    const todoPagado = cuotasPagadasCount === nuevoCronograma.length;

    onUpdate(p.id, {
      cronograma: nuevoCronograma,
      cuotasPagadas: cuotasPagadasCount,
      estado: todoPagado ? "pagado" : "activo",
    });
  }

  // Aplicar penalización por mora
  function aplicarPenalizacion() {
    if (!penalizarPrestamo) return;
    const monto = parseFloat(montoPenalizacion);
    if (isNaN(monto) || monto <= 0) return;

    const nuevaPenalizacion: PenalizacionPrestamo = {
      id: `pen_${Date.now()}`,
      fecha: new Date().toISOString().slice(0, 10),
      monto,
      motivo: motivoPenalizacion.trim() || "Retraso en pago de cuota",
    };

    const penalizacionesActuales = penalizarPrestamo.penalizaciones || [];
    const actualizadas = [...penalizacionesActuales, nuevaPenalizacion];

    onUpdate(penalizarPrestamo.id, {
      penalizaciones: actualizadas,
    });

    setPenalizarPrestamo(null);
    setMontoPenalizacion("50");
  }

  function eliminarPenalizacion(p: Prestamo, penalizacionId: string) {
    const actualizadas = (p.penalizaciones || []).filter((x) => x.id !== penalizacionId);
    onUpdate(p.id, { penalizaciones: actualizadas });
  }

  function copiarWhatsApp(p: Prestamo) {
    const msg = generarMensajeCobroPrestamo(p);
    navigator.clipboard.writeText(msg);
    setCopiadoId(p.id);
    setTimeout(() => setCopiadoId(null), 2500);
  }

  // Resumen global de Préstamos
  const stats = prestamos.reduce(
    (acc, p) => {
      const det = calcularDetallesPrestamo(p);
      if (p.moneda === "Bs") {
        acc.capitalBs += p.capital;
        acc.porCobrarBs += det.saldoPendiente;
        acc.interesesBs += det.totalIntereses;
        acc.penalizacionesBs += det.totalPenalizaciones;
        if (det.tieneAtraso) acc.atrasadosCount++;
      } else {
        acc.capitalUsd += p.capital;
        acc.porCobrarUsd += det.saldoPendiente;
        acc.interesesUsd += det.totalIntereses;
        acc.penalizacionesUsd += det.totalPenalizaciones;
        if (det.tieneAtraso) acc.atrasadosCount++;
      }
      return acc;
    },
    {
      capitalBs: 0,
      porCobrarBs: 0,
      interesesBs: 0,
      penalizacionesBs: 0,
      capitalUsd: 0,
      porCobrarUsd: 0,
      interesesUsd: 0,
      penalizacionesUsd: 0,
      atrasadosCount: 0,
    }
  );

  // Lista filtrada
  const prestamosFiltrados = prestamos.filter((p) => {
    const det = calcularDetallesPrestamo(p);
    if (filtro === "pagados") return p.estado === "pagado";
    if (filtro === "atrasados") return p.estado === "activo" && det.tieneAtraso;
    return p.estado === "activo";
  });

  return (
    <div className="space-y-4 pb-6">
      {/* TARJETA DE RESUMEN GLOBAL */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-[#134e4a] via-[#113a37] to-[#161b22] border border-[#14b8a6]/30 shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤝</span>
            <p className="text-xs font-display uppercase tracking-widest text-[#2dd4bf] font-bold">
              Gestor de Préstamos e Intereses
            </p>
          </div>
          {stats.atrasadosCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/40 text-xs text-[#ef4444] font-bold flex items-center gap-1">
              <span>⚠️</span> {stats.atrasadosCount} con retraso
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p className="text-[11px] text-[#8b949e] uppercase font-semibold">Total por cobrar</p>
            <p className="font-mono text-2xl font-bold text-[#14b8a6]">
              Bs {stats.porCobrarBs.toLocaleString("es-BO")}
            </p>
            {stats.porCobrarUsd > 0 && (
              <p className="font-mono text-xs text-[#14b8a6]/80">
                + $ {stats.porCobrarUsd.toLocaleString("es-BO")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#8b949e] uppercase font-semibold">Ganancia estimada</p>
            <p className="font-mono text-base font-bold text-[#f59e0b]">
              +Bs {(stats.interesesBs + stats.penalizacionesBs).toLocaleString("es-BO")}
            </p>
            {stats.penalizacionesBs > 0 && (
              <p className="text-[10px] text-[#ef4444]">
                Incluye Bs {stats.penalizacionesBs} en penalizaciones
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Selector de Filtros */}
      <div className="flex gap-2">
        {[
          { id: "activos", label: "Activos" },
          { id: "atrasados", label: "⚠️ Con Retraso" },
          { id: "pagados", label: "Pagados ✓" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id as any)}
            className={`flex-1 py-2 rounded-xl text-xs font-display font-semibold transition-all ${
              filtro === f.id
                ? "bg-[#14b8a6] text-[#0d1117] font-bold shadow-md shadow-[#14b8a6]/20"
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
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#14b8a6] to-[#0d9488] text-[#0d1117] font-display font-bold text-sm hover:opacity-95 transition-all shadow-md flex items-center justify-center gap-2"
      >
        <span>{showForm ? "✕" : "+"}</span>
        <span>{showForm ? "Cancelar nuevo préstamo" : "Nuevo préstamo con intereses"}</span>
      </button>

      {/* FORMULARIO DE NUEVO PRÉSTAMO */}
      {showForm && (
        <div className="rounded-2xl p-4 bg-[#161b22] border border-[#14b8a6]/40 shadow-xl space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-[#30363d]">
            <p className="text-sm font-display font-bold text-[#e6edf3] flex items-center gap-2">
              <span>✍️</span> Registrar nuevo préstamo
            </p>
            <span className="text-[11px] text-[#14b8a6]">Cálculo automático de intereses</span>
          </div>

          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">¿A quién le prestaste?</label>
            <input
              type="text"
              placeholder="Ej: Jose Mensias Rojas"
              value={form.deudor}
              onChange={(e) => setForm((f) => ({ ...f, deudor: e.target.value }))}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3.5 py-2.5 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#14b8a6]"
              autoFocus
            />
          </div>

          {/* Monto y Moneda */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-[#8b949e] mb-1 block">Monto del Capital:</label>
              <input
                type="number"
                placeholder="Ej: 2000"
                value={form.capital}
                onChange={(e) => setForm((f) => ({ ...f, capital: e.target.value }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#14b8a6]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Moneda:</label>
              <select
                value={form.moneda}
                onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value as Moneda }))}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2.5 text-sm text-[#e6edf3] outline-none focus:border-[#14b8a6]"
              >
                <option value="Bs">Bs</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Tasa de Interés */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#8b949e]">Tasa de interés mensual (%):</label>
              <span className="text-xs font-mono font-bold text-[#f59e0b]">{form.interes}% al mes</span>
            </div>
            <div className="flex gap-1.5 mb-2">
              {["5", "8", "10", "12", "15", "20"].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, interes: pct }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                    form.interes === pct
                      ? "bg-[#f59e0b] text-[#0d1117]"
                      : "bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <input
              type="number"
              placeholder="O escribe otro porcentaje %"
              value={form.interes}
              onChange={(e) => setForm((f) => ({ ...f, interes: e.target.value }))}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#14b8a6]"
            />
          </div>

          {/* Modalidad de Pago (Selector Crítico solicitado por el usuario) */}
          <div className="rounded-xl p-3 bg-[#0d1117] border border-[#30363d] space-y-2.5">
            <label className="text-xs font-semibold text-[#e6edf3] block">
              ¿Cómo debe pagar este préstamo?
            </label>

            {/* Opción 1: Solo Interés mensual + Capital al final */}
            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                form.metodoPago === "solo_interes_capital_final"
                  ? "bg-[#14b8a6]/15 border-[#14b8a6] text-[#e6edf3]"
                  : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#484f58]"
              }`}
            >
              <input
                type="radio"
                name="metodoPago"
                checked={form.metodoPago === "solo_interes_capital_final"}
                onChange={() => setForm((f) => ({ ...f, metodoPago: "solo_interes_capital_final" }))}
                className="mt-1 accent-[#14b8a6]"
              />
              <div className="text-xs">
                <p className="font-bold text-[#e6edf3]">
                  1. Paga solo el interés cada mes + Todo el capital al final
                </p>
                <p className="text-[11px] text-[#8b949e] mt-0.5">
                  Cada mes paga el interés acordado. En el último mes devuelve el interés más todo el capital prestado (Eje: Jose paga 100 Bs el mes 1, y 2100 Bs el mes 2).
                </p>
              </div>
            </label>

            {/* Opción 2: Capital + Interés en cada cuota */}
            <label
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                form.metodoPago === "capital_mas_interes_cuotas"
                  ? "bg-[#14b8a6]/15 border-[#14b8a6] text-[#e6edf3]"
                  : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#484f58]"
              }`}
            >
              <input
                type="radio"
                name="metodoPago"
                checked={form.metodoPago === "capital_mas_interes_cuotas"}
                onChange={() => setForm((f) => ({ ...f, metodoPago: "capital_mas_interes_cuotas" }))}
                className="mt-1 accent-[#14b8a6]"
              />
              <div className="text-xs">
                <p className="font-bold text-[#e6edf3]">
                  2. Paga Capital + Interés en cada cuota mensual
                </p>
                <p className="text-[11px] text-[#8b949e] mt-0.5">
                  Cada mes se divide una parte del capital más el interés (Eje: 4000 Bs para 5 meses al 8% = paga 1120 Bs cada mes).
                </p>
              </div>
            </label>
          </div>

          {/* Duración y Fechas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Duración (Meses / Cuotas):</label>
              <select
                value={form.cuotas}
                onChange={(e) => handleCambioCuotas(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#14b8a6]"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "mes (1 cuota)" : `meses (${n} cuotas)`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Fecha de entrega:</label>
              <input
                type="date"
                value={form.fechaInicio}
                onChange={(e) => handleCambioFechaInicio(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-[#e6edf3] outline-none focus:border-[#14b8a6]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#8b949e] mb-1 block">
              Fecha final acordada para devolver todo:
            </label>
            <input
              type="date"
              value={form.fechaFin}
              onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs font-mono text-[#e6edf3] outline-none focus:border-[#14b8a6]"
            />
          </div>

          {/* Previsualización en Vivo de Cuotas */}
          {capitalNum > 0 && cronogramaPreview.length > 0 && (
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#113a37] to-[#0d1117] border border-[#14b8a6]/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#8b949e]">Simulación de cobros:</span>
                <span className="font-mono text-[#2dd4bf] font-bold">
                  Total a recuperar: {form.moneda} {totalEsperadoEstimado.toLocaleString("es-BO")}
                </span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {cronogramaPreview.map((c) => (
                  <div
                    key={c.numero}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#161b22] text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#e6edf3]">
                        Mes {c.numero} ({formatFecha(c.fechaVencimiento)}):
                      </span>
                      <p className="text-[10px] text-[#8b949e]">
                        {form.metodoPago === "solo_interes_capital_final"
                          ? c.numero === cronogramaPreview.length
                            ? `Capital: ${c.montoCapital} + Interés: ${c.montoInteres}`
                            : `Solo Interés: ${c.montoInteres}`
                          : `Capital: ${c.montoCapital} + Interés: ${c.montoInteres}`}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-[#14b8a6]">
                      {form.moneda} {c.montoTotal.toLocaleString("es-BO")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={guardarNuevoPrestamo}
            disabled={!form.deudor.trim() || !form.capital || capitalNum <= 0}
            className="w-full py-3 rounded-xl bg-[#14b8a6] text-[#0d1117] font-display font-bold text-sm hover:bg-[#2dd4bf] transition-colors shadow-lg disabled:opacity-40"
          >
            Guardar préstamo ✓
          </button>
        </div>
      )}

      {/* LISTADO DE PRÉSTAMOS */}
      <div className="space-y-3">
        {prestamosFiltrados.map((p) => {
          const det = calcularDetallesPrestamo(p);
          const isExpandido = expandidoId === p.id;
          const symbol = p.moneda === "Bs" ? "Bs" : "$";

          return (
            <div
              key={p.id}
              className={`rounded-2xl p-4 bg-[#161b22] border transition-all space-y-3 ${
                det.tieneAtraso
                  ? "border-[#ef4444]/50 shadow-md shadow-[#ef4444]/10"
                  : "border-[#30363d] hover:border-[#484f58]"
              }`}
            >
              {/* Header de la tarjeta */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-base text-[#e6edf3]">
                      {p.deudor}
                    </h3>
                    {det.tieneAtraso ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#ef4444]/20 border border-[#ef4444]/40 text-[10px] text-[#ef4444] font-bold">
                        ⚠️ Atraso ({det.diasAtraso} días)
                      </span>
                    ) : p.estado === "pagado" ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#22c55e]/20 border border-[#22c55e]/40 text-[10px] text-[#22c55e] font-bold">
                        Pagado ✓
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-[#14b8a6]/20 border border-[#14b8a6]/40 text-[10px] text-[#14b8a6] font-bold">
                        Al día ●
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8b949e] mt-0.5">
                    Capital: <strong className="text-[#e6edf3]">{symbol} {p.capital.toLocaleString("es-BO")}</strong> · Tasa: <span className="text-[#f59e0b] font-mono font-bold">{p.interes}%</span> mes
                  </p>
                  <p className="text-[11px] text-[#8b949e]">
                    Vence: {formatFecha(det.fechaFinal)} ({p.cuotas} meses) ·{" "}
                    <span className="text-[#14b8a6]">
                      {p.metodoPago === "solo_interes_capital_final"
                        ? "Interés mensual + Capital final"
                        : "Cuotas con capital"}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onDelete(p.id)}
                    className="text-[#8b949e] hover:text-[#ef4444] text-xs p-1.5 rounded-lg hover:bg-[#ef4444]/10 transition-colors"
                    title="Eliminar préstamo"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Métricas clave */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl p-2 bg-[#0d1117] border border-[#30363d]/60">
                  <p className="text-[10px] text-[#8b949e]">Pendiente</p>
                  <p className="font-mono text-xs font-bold text-[#f59e0b]">
                    {symbol} {det.saldoPendiente.toLocaleString("es-BO")}
                  </p>
                </div>
                <div className="rounded-xl p-2 bg-[#0d1117] border border-[#30363d]/60">
                  <p className="text-[10px] text-[#8b949e]">Cobrado</p>
                  <p className="font-mono text-xs font-bold text-[#22c55e]">
                    {symbol} {det.totalCobrado.toLocaleString("es-BO")}
                  </p>
                </div>
                <div className="rounded-xl p-2 bg-[#0d1117] border border-[#30363d]/60">
                  <p className="text-[10px] text-[#8b949e]">Cuotas</p>
                  <p className="font-mono text-xs font-bold text-[#14b8a6]">
                    {det.cuotasPagadasCount} / {det.totalCuotas}
                  </p>
                </div>
              </div>

              {/* Alerta de Penalizaciones si tiene */}
              {det.totalPenalizaciones > 0 && (
                <div className="p-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-center justify-between text-xs">
                  <span className="text-[#ef4444] font-medium flex items-center gap-1.5">
                    <span>⚠️</span> Multas por retraso: +{symbol} {det.totalPenalizaciones.toLocaleString("es-BO")}
                  </span>
                  <span className="text-[10px] text-[#8b949e]">
                    ({p.penalizaciones?.length} aplicada{p.penalizaciones?.length === 1 ? "" : "s"})
                  </span>
                </div>
              )}

              {/* Próximo cobro destacado si está activo */}
              {p.estado === "activo" && det.proximaCuota && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    det.tieneAtraso
                      ? "bg-[#ef4444]/15 border-[#ef4444]/40 text-[#ef4444]"
                      : "bg-[#0d1117] border-[#14b8a6]/40 text-[#e6edf3]"
                  }`}
                >
                  <div>
                    <p className="font-bold">
                      Próxima Cuota #{det.proximaCuota.numero}: {symbol} {det.proximaCuota.montoTotal.toLocaleString("es-BO")}
                    </p>
                    <p className="text-[11px] opacity-80">
                      Fecha límite: {formatFecha(det.proximaCuota.fechaVencimiento)}
                      {det.tieneAtraso && ` (Venció hace ${det.diasAtraso} días)`}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleCuotaPagada(p, det.proximaCuota!.numero)}
                    className="px-3 py-1.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-[#0d1117] font-bold text-xs shadow transition-colors"
                  >
                    Cobrado ✓
                  </button>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => setPenalizarPrestamo(p)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/30 hover:bg-[#ef4444]/25 text-xs text-[#ef4444] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <span>⚠️</span> + Penalización
                </button>
                <button
                  onClick={() => copiarWhatsApp(p)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#22c55e] text-xs text-[#e6edf3] font-semibold flex items-center justify-center gap-1 transition-colors"
                  title="Copiar mensaje listo para WhatsApp"
                >
                  <span>📲</span>
                  <span>{copiadoId === p.id ? "¡Copiado!" : "WhatsApp"}</span>
                </button>
                <button
                  onClick={() => setExpandidoId(isExpandido ? null : p.id)}
                  className="py-1.5 px-3 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#14b8a6] text-xs text-[#14b8a6] font-semibold transition-colors"
                >
                  {isExpandido ? "Ocultar ▲" : "Cronograma ▼"}
                </button>
              </div>

              {/* CRONOGRAMA EXPANDIBLE CON TODAS LAS FECHAS */}
              {isExpandido && (
                <div className="pt-3 border-t border-[#30363d] space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <p className="font-display font-bold text-[#e6edf3] uppercase tracking-wider text-[11px]">
                      Calendario de cuotas mensuales ({det.cronograma.length})
                    </p>
                    <span className="text-[10px] text-[#8b949e]">Toca para marcar pagada</span>
                  </div>

                  <div className="space-y-1.5">
                    {det.cronograma.map((c) => (
                      <div
                        key={c.numero}
                        onClick={() => toggleCuotaPagada(p, c.numero)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          c.pagada
                            ? "bg-[#22c55e]/10 border-[#22c55e]/30 text-[#4ade80]"
                            : c.fechaVencimiento < new Date().toISOString().slice(0, 10)
                            ? "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#f87171]"
                            : "bg-[#0d1117] border-[#30363d] text-[#e6edf3] hover:border-[#14b8a6]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              c.pagada
                                ? "bg-[#22c55e] text-[#0d1117]"
                                : "bg-[#30363d] text-[#8b949e]"
                            }`}
                          >
                            {c.pagada ? "✓" : c.numero}
                          </span>
                          <div>
                            <p className="font-semibold">
                              Cuota #{c.numero} · {formatFecha(c.fechaVencimiento)}
                            </p>
                            <p className="text-[10px] text-[#8b949e]">
                              {c.montoCapital > 0 && `Cap: ${symbol} ${c.montoCapital} + `}
                              Interés: {symbol} {c.montoInteres}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="font-mono font-bold">
                            {symbol} {c.montoTotal.toLocaleString("es-BO")}
                          </p>
                          <span className="text-[10px]">
                            {c.pagada ? "Pagado ✓" : "Pendiente"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Listado de penalizaciones registradas */}
                  {p.penalizaciones && p.penalizaciones.length > 0 && (
                    <div className="pt-2 border-t border-[#30363d]/50 space-y-1.5">
                      <p className="text-[11px] font-bold text-[#ef4444] uppercase">
                        Penalizaciones aplicadas:
                      </p>
                      {p.penalizaciones.map((pen) => (
                        <div
                          key={pen.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[#0d1117] border border-[#ef4444]/20 text-xs"
                        >
                          <div>
                            <span className="text-[#e6edf3] font-medium">{pen.motivo}</span>
                            <span className="text-[#8b949e] text-[10px] ml-2">
                              ({formatFecha(pen.fecha)})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#ef4444]">
                              +{symbol} {pen.monto}
                            </span>
                            <button
                              onClick={() => eliminarPenalizacion(p, pen.id)}
                              className="text-[#8b949e] hover:text-[#ef4444] text-[10px]"
                              title="Quitar penalización"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {prestamosFiltrados.length === 0 && (
          <div className="text-center py-10 bg-[#161b22] rounded-2xl border border-dashed border-[#30363d] space-y-2">
            <span className="text-3xl">🤝</span>
            <p className="text-sm font-semibold text-[#e6edf3]">
              {filtro === "activos"
                ? "No hay préstamos activos registrados"
                : filtro === "atrasados"
                ? "¡Excelente! No tienes préstamos con retraso"
                : "Aún no tienes préstamos marcados como pagados"}
            </p>
            <p className="text-xs text-[#8b949e]">
              Registra préstamos con cálculo automático de interés y control de penalizaciones.
            </p>
          </div>
        )}
      </div>

      {/* MODAL DE PENALIZACIÓN */}
      {penalizarPrestamo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#ef4444]/40 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h4 className="font-display font-bold text-sm text-[#e6edf3]">
                  Aplicar Penalización por Retraso
                </h4>
              </div>
              <button
                onClick={() => setPenalizarPrestamo(null)}
                className="text-[#8b949e] hover:text-[#e6edf3] text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-xs text-[#8b949e]">
                Deudor: <strong className="text-[#e6edf3]">{penalizarPrestamo.deudor}</strong>
              </p>
            </div>

            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Monto de la penalización ({penalizarPrestamo.moneda}):</label>
              <div className="flex gap-2 mb-2">
                {["50", "100", "150", "200"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMontoPenalizacion(m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      montoPenalizacion === m
                        ? "bg-[#ef4444] text-white"
                        : "bg-[#0d1117] border border-[#30363d] text-[#8b949e]"
                    }`}
                  >
                    +{m}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder="Otro monto"
                value={montoPenalizacion}
                onChange={(e) => setMontoPenalizacion(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm font-mono text-[#e6edf3] outline-none focus:border-[#ef4444]"
              />
            </div>

            <div>
              <label className="text-xs text-[#8b949e] mb-1 block">Motivo de la penalización:</label>
              <input
                type="text"
                placeholder="Ej: No pagó el interés del mes, Atraso de 10 días..."
                value={motivoPenalizacion}
                onChange={(e) => setMotivoPenalizacion(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-xs text-[#e6edf3] outline-none focus:border-[#ef4444]"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPenalizarPrestamo(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#30363d] text-xs text-[#8b949e] font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={aplicarPenalizacion}
                className="flex-1 py-2.5 rounded-xl bg-[#ef4444] hover:bg-[#dc2626] text-white text-xs font-bold transition-colors shadow-lg"
              >
                Aplicar Multa ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
