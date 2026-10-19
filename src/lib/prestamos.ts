import { Prestamo, CuotaCronograma, MetodoPagoPrestamo } from "./types";

export function sumarMeses(fechaStr: string, meses: number): string {
  if (!fechaStr) return new Date().toISOString().slice(0, 10);
  const parts = fechaStr.split("-").map(Number);
  const year = parts[0] || new Date().getFullYear();
  const month = (parts[1] || 1) - 1;
  const day = parts[2] || 1;
  const date = new Date(year, month + meses, day);
  // Si el día no existe ese mes (ej: 31 de febrero), retroceder al último día del mes
  if (date.getDate() !== day) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

export function formatFecha(fechaStr: string): string {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-").map(Number);
  if (parts.length < 3) return fechaStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("es-BO", { day: "numeric", month: "short", year: "numeric" });
}

export function formatFechaCorta(fechaStr: string): string {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-").map(Number);
  if (parts.length < 3) return fechaStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("es-BO", { month: "short", year: "numeric" });
}

export function formatMesCompleto(fechaStr: string): string {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-").map(Number);
  if (parts.length < 3) return fechaStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const mes = d.toLocaleDateString("es-BO", { month: "long" });
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${parts[0]}`;
}

/**
 * Genera el cronograma inicial de cuotas según la modalidad elegida.
 * Modalidad 1: solo_interes_capital_final — paga interés cada mes, al final devuelve el capital + último interés.
 * Modalidad 2: capital_mas_interes_cuotas — paga capital amortizado + interés cada mes.
 */
export function generarCronogramaInicial(
  capital: number,
  interesPct: number,
  fechaInicio: string,
  cuotas: number,
  metodoPago: MetodoPagoPrestamo
): CuotaCronograma[] {
  const cronograma: CuotaCronograma[] = [];
  const n = Math.max(1, cuotas || 1);

  for (let i = 1; i <= n; i++) {
    const fechaVenc = sumarMeses(fechaInicio, i);
    let montoInteres = 0;
    let montoCapital = 0;

    if (metodoPago === "solo_interes_capital_final") {
      montoInteres = Math.round((capital * interesPct / 100) * 100) / 100;
      montoCapital = i === n ? capital : 0;
    } else {
      // Cuota combinada: capital/n + interés sobre el capital total
      montoCapital = Math.round((capital / n) * 100) / 100;
      montoInteres = Math.round((capital * interesPct / 100) * 100) / 100;
    }

    cronograma.push({
      numero: i,
      fechaVencimiento: fechaVenc,
      montoInteres,
      montoCapital,
      montoPenalizacion: 0,
      montoTotal: montoCapital + montoInteres,
      pagada: false,
    });
  }

  return cronograma;
}

/**
 * ═══════════════════════════════════════════════════════════════
 * LÓGICA DE MORA ACUMULADA:
 * Si el préstamo sigue activo y no se ha cancelado todo el capital,
 * se deben seguir acumulando los intereses mensuales de cada mes transcurrido
 * hasta la fecha de HOY.
 *
 * Ejemplo del usuario:
 * - Préstamo a José: 2.000 Bs al 10% mensual pactado por 2 meses (vencía hace meses).
 * - Como no pagó el capital, se le siguen generando meses de interés (10% de 2000 = 200 Bs cada mes).
 * - Si José viene y paga el mes de Junio, se puede cobrar ESE mes específico,
 *   pero los meses de Enero, Febrero, etc. que están impagos se mantienen como deuda
 *   pendiente hasta que se cobren.
 * ═══════════════════════════════════════════════════════════════
 */
export function extenderCronogramaConMora(
  cronogramaActual: CuotaCronograma[],
  p: Prestamo
): CuotaCronograma[] {
  if (!cronogramaActual || cronogramaActual.length === 0) return cronogramaActual;
  if (p.estado === "pagado") return cronogramaActual;

  const hoy = new Date().toISOString().slice(0, 10);

  // Buscar la fecha más alta actualmente en el cronograma
  const todasFechas = cronogramaActual.map((c) => c.fechaVencimiento).sort();
  const ultimaFechaRegistrada = todasFechas[todasFechas.length - 1];

  // Si la última cuota registrada vence en el futuro o hoy mismo, no hay meses nuevos vencidos
  if (ultimaFechaRegistrada >= hoy) return cronogramaActual;

  // Calcular capital pagado hasta el momento en cuotas pagadas
  const capitalPagado = cronogramaActual
    .filter((c) => c.pagada)
    .reduce((acc, c) => acc + (c.montoCapital || 0), 0);

  const capitalPendiente = Math.max(0, p.capital - capitalPagado);

  // Si el capital ya fue 100% devuelto, no se siguen generando nuevos meses de interés
  if (capitalPendiente <= 0) return cronogramaActual;

  // Interés mensual sobre el capital pendiente
  const interesMensual = Math.round((capitalPendiente * p.interes / 100) * 100) / 100;

  const extendido = [...cronogramaActual];
  let fechaIter = ultimaFechaRegistrada;
  let numCuota = extendido.reduce((max, c) => Math.max(max, c.numero), 0);

  // Generar un mes extra de interés por cada mes transcurrido hasta hoy
  while (true) {
    const siguiente = sumarMeses(fechaIter, 1);
    if (siguiente > hoy) break;

    numCuota++;
    extendido.push({
      numero: numCuota,
      fechaVencimiento: siguiente,
      montoInteres: interesMensual,
      montoCapital: 0, // En meses de mora extra se cobra el interés mensual generado
      montoPenalizacion: 0,
      montoTotal: interesMensual,
      pagada: false,
      esMoraExtra: true,
    });

    fechaIter = siguiente;
  }

  return extendido;
}

/**
 * Calcula el estado detallado del préstamo:
 * - Cuotas pendientes (vencidas / futuras / de mora)
 * - Cuotas pagadas
 * - Cuántos meses debe en total
 * - Cuánto debe ahora mismo (deuda vencida + penalizaciones)
 * - Saldo total restante
 */
export function calcularDetallesPrestamo(p: Prestamo) {
  const metodo = p.metodoPago || "solo_interes_capital_final";

  // Cronograma guardado o regenerado inicialmente
  const cronogramaBase = p.cronograma && p.cronograma.length > 0
    ? p.cronograma
    : generarCronogramaInicial(p.capital, p.interes, p.fechaInicio, p.cuotas, metodo);

  // Cronograma extendido automáticamente con los meses de mora hasta hoy
  const cronograma = extenderCronogramaConMora(cronogramaBase, p);

  const hoy = new Date().toISOString().slice(0, 10);
  const totalPenalizaciones = (p.penalizaciones || []).reduce((acc, pen) => acc + pen.monto, 0);

  // Clasificación de cuotas
  const cuotasPagadas = cronograma.filter((c) => c.pagada);
  const cuotasPendientes = cronograma.filter((c) => !c.pagada);
  const cuotasVencidas = cuotasPendientes.filter((c) => c.fechaVencimiento <= hoy);
  const cuotasFuturas = cuotasPendientes.filter((c) => c.fechaVencimiento > hoy);

  // Cuotas de mora generadas por meses de atraso transcurridos
  const cuotasMora = cronograma.filter((c) => c.esMoraExtra);
  const cuotasMoraPendientes = cuotasMora.filter((c) => !c.pagada);

  // Total cobrado sumando cuotas pagadas
  const totalCobrado = cuotasPagadas.reduce((acc, c) => acc + (c.montoPagado ?? c.montoTotal), 0);

  // Capital amortizado vs pendiente
  const capitalPagado = cuotasPagadas.reduce((acc, c) => acc + (c.montoCapital || 0), 0);
  const capitalPendiente = Math.max(0, p.capital - capitalPagado);

  // Intereses cobrados vs intereses pendientes
  const interesesCobrados = cuotasPagadas.reduce((acc, c) => acc + (c.montoInteres || 0), 0);
  const interesesPendientes = cuotasPendientes.reduce((acc, c) => acc + (c.montoInteres || 0), 0);

  // Monto vencido HOY (intereses y capital de cuotas ya vencidas que no han pagado)
  const montoVencidoSinMultas = cuotasVencidas.reduce((acc, c) => acc + c.montoTotal, 0);
  const deudaVencidaTotal = montoVencidoSinMultas + totalPenalizaciones;

  // Deuda futura aún no vencida
  const deudaFutura = cuotasFuturas.reduce((acc, c) => acc + c.montoTotal, 0);

  // Saldo total pendiente (vencido + futuro + multas)
  const saldoPendiente = montoVencidoSinMultas + deudaFutura + totalPenalizaciones;
  const saldoPendienteTotal = saldoPendiente;

  // Detección de retraso
  const tieneAtraso = cuotasVencidas.length > 0;
  let diasAtraso = 0;
  if (tieneAtraso && cuotasVencidas.length > 0) {
    const primerVencida = cuotasVencidas[0];
    const diff = new Date(hoy).getTime() - new Date(primerVencida.fechaVencimiento).getTime();
    diasAtraso = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // La cuota más antigua pendiente para sugerir cobro prioritario
  const proximaCuota = cuotasPendientes.length > 0 ? cuotasPendientes[0] : null;

  // Fecha final pactada inicialmente
  const fechaFinal = p.fechaFin || (cronogramaBase.length > 0
    ? cronogramaBase[cronogramaBase.length - 1].fechaVencimiento
    : sumarMeses(p.fechaInicio, p.cuotas));

  return {
    cronograma,
    cronogramaBase,
    cuotasPagadas,
    cuotasPendientes,
    cuotasVencidas,
    cuotasFuturas,
    cuotasMora,
    cuotasMoraPendientes,
    totalPenalizaciones,
    montoVencidoSinMultas,
    deudaVencidaTotal,
    deudaFutura,
    saldoPendiente,
    saldoPendienteTotal,
    totalCobrado,
    capitalPagado,
    capitalPendiente,
    interesesCobrados,
    interesesPendientes,
    totalIntereses: interesesCobrados + interesesPendientes,
    cuotasPagadasCount: cuotasPagadas.length,
    totalCuotas: cronograma.length,
    cuotasVencidasCount: cuotasVencidas.length,
    proximaCuota,
    tieneAtraso,
    diasAtraso,
    fechaFinal,
  };
}

/**
 * Genera un mensaje detallado para WhatsApp listo para enviar al deudor,
 * especificando con precisión qué meses debe y qué meses ya pagó.
 */
export function generarMensajeCobroPrestamo(p: Prestamo): string {
  const det = calcularDetallesPrestamo(p);
  const symbol = p.moneda === "Bs" ? "Bs" : "$";

  const lines = [
    `¡Hola ${p.deudor}! 👋`,
    `Te paso el resumen detallado y actualizado de tu préstamo:`,
    ``,
    `💰 Capital prestado: ${symbol} ${p.capital.toLocaleString("es-BO")}`,
    `📊 Interés mensual acordado: ${p.interes}% mensual`,
    `📅 Fecha de inicio: ${formatFecha(p.fechaInicio)}`,
    `📅 Vencimiento pactado: ${formatFecha(det.fechaFinal)}`,
    ``,
  ];

  if (det.cuotasVencidas.length > 0) {
    lines.push(`🚨 MESES PENDIENTES DE PAGO (${det.cuotasVencidas.length} meses vencidos):`);
    det.cuotasVencidas.forEach((c) => {
      const mesNombre = formatMesCompleto(c.fechaVencimiento);
      const detalle = c.montoCapital > 0
        ? `Capital ${symbol} ${c.montoCapital.toLocaleString("es-BO")} + Interés ${symbol} ${c.montoInteres.toLocaleString("es-BO")}`
        : `Interés del mes: ${symbol} ${c.montoInteres.toLocaleString("es-BO")}`;
      lines.push(`  • ${mesNombre} (${formatFecha(c.fechaVencimiento)}): ${symbol} ${c.montoTotal.toLocaleString("es-BO")} [${detalle}]`);
    });
    lines.push(``);
  }

  if (det.cuotasPagadas.length > 0) {
    lines.push(`✅ MESES QUE YA PAGASTE (${det.cuotasPagadas.length}):`);
    det.cuotasPagadas.forEach((c) => {
      const mesNombre = formatMesCompleto(c.fechaVencimiento);
      lines.push(`  ✓ ${mesNombre}: ${symbol} ${c.montoTotal.toLocaleString("es-BO")} (Pagado)`);
    });
    lines.push(``);
  }

  if (det.totalPenalizaciones > 0) {
    lines.push(`⚠️ Multas por retraso acumuladas: +${symbol} ${det.totalPenalizaciones.toLocaleString("es-BO")}`);
    lines.push(``);
  }

  lines.push(`═════════════════════════`);
  lines.push(`💳 Total pagado a la fecha: ${symbol} ${det.totalCobrado.toLocaleString("es-BO")}`);
  lines.push(`🔴 DEUDA VENCIDA HOY: ${symbol} ${det.deudaVencidaTotal.toLocaleString("es-BO")}`);

  if (det.deudaFutura > 0) {
    lines.push(`📆 Cuotas futuras pendientes: ${symbol} ${det.deudaFutura.toLocaleString("es-BO")}`);
  }

  lines.push(`🔴 TOTAL SALDO PENDIENTE: ${symbol} ${det.saldoPendienteTotal.toLocaleString("es-BO")}`);
  lines.push(`═════════════════════════`);
  lines.push(``);
  lines.push(`Por favor coordina tu pago para poner tu cuenta al día. ¡Muchas gracias! 🙏`);

  return lines.join("\n");
}
