import { Prestamo, CuotaCronograma, MetodoPagoPrestamo, Moneda } from "./types";

export function sumarMeses(fechaStr: string, meses: number): string {
  if (!fechaStr) return new Date().toISOString().slice(0, 10);
  const parts = fechaStr.split("-").map(Number);
  const year = parts[0] || new Date().getFullYear();
  const month = (parts[1] || 1) - 1; // 0-indexed
  const day = parts[2] || 1;

  // Creamos la fecha y sumamos los meses
  const date = new Date(year, month + meses, day);
  // Manejo de overflow de fin de mes
  if (date.getDate() !== day) {
    date.setDate(0); // Último día del mes anterior si no existe ese día (ej: 31 feb)
  }
  return date.toISOString().slice(0, 10);
}

export function formatFecha(fechaStr: string): string {
  if (!fechaStr) return "";
  const parts = fechaStr.split("-").map(Number);
  if (parts.length < 3) return fechaStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("es-BO", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Genera el cronograma mensual de pagos según el método elegido:
 * 1. solo_interes_capital_final: Paga solo interés cada mes (interes% del capital) y al final todo el capital + interés.
 * 2. capital_mas_interes_cuotas: Paga (capital/cuotas) + interés en cada mes.
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
      // Paga solo interés cada mes
      montoInteres = (capital * interesPct) / 100;
      // En la última cuota devuelve todo el capital prestado
      montoCapital = i === n ? capital : 0;
    } else {
      // Método cuota combinada: amortiza capital mes a mes + interés
      montoCapital = Math.round((capital / n) * 100) / 100;
      montoInteres = Math.round(((capital * interesPct) / 100) * 100) / 100;
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

export function calcularDetallesPrestamo(p: Prestamo) {
  const metodo = p.metodoPago || "solo_interes_capital_final";
  const cronograma = p.cronograma && p.cronograma.length > 0
    ? p.cronograma
    : generarCronogramaInicial(p.capital, p.interes, p.fechaInicio, p.cuotas, metodo);

  const totalPenalizaciones = (p.penalizaciones || []).reduce((acc, curr) => acc + curr.monto, 0);
  const totalIntereses = cronograma.reduce((acc, c) => acc + c.montoInteres, 0);
  const totalEsperado = p.capital + totalIntereses + totalPenalizaciones;

  let totalCobrado = 0;
  cronograma.forEach((c) => {
    if (c.pagada) {
      totalCobrado += c.montoTotal + (c.montoPenalizacion || 0);
    }
  });

  const saldoPendiente = Math.max(0, totalEsperado - totalCobrado);
  const cuotasPagadasCount = cronograma.filter((c) => c.pagada).length;

  const hoy = new Date().toISOString().slice(0, 10);
  const proximaCuota = cronograma.find((c) => !c.pagada);
  const tieneAtraso = proximaCuota ? proximaCuota.fechaVencimiento < hoy : false;

  let diasAtraso = 0;
  if (tieneAtraso && proximaCuota) {
    const diffTime = Math.abs(new Date(hoy).getTime() - new Date(proximaCuota.fechaVencimiento).getTime());
    diasAtraso = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const fechaFinal = p.fechaFin || (cronograma.length > 0 ? cronograma[cronograma.length - 1].fechaVencimiento : sumarMeses(p.fechaInicio, p.cuotas));

  return {
    cronograma,
    totalIntereses,
    totalPenalizaciones,
    totalEsperado,
    totalCobrado,
    saldoPendiente,
    cuotasPagadasCount,
    totalCuotas: cronograma.length,
    proximaCuota,
    tieneAtraso,
    diasAtraso,
    fechaFinal,
  };
}

export function generarMensajeCobroPrestamo(p: Prestamo): string {
  const det = calcularDetallesPrestamo(p);
  const symbol = p.moneda === "Bs" ? "Bs" : "$";
  const proxima = det.proximaCuota;

  const lines = [
    `¡Hola ${p.deudor}! 👋`,
    `Te escribo para darte el resumen de tu préstamo:`,
    `• Capital prestado: ${symbol} ${p.capital.toLocaleString("es-BO")}`,
    `• Tasa de interés: ${p.interes}% mensual`,
    `• Modalidad: ${
      p.metodoPago === "solo_interes_capital_final"
        ? "Interés mensual + Capital al final"
        : "Cuota mensual con capital e interés"
    }`,
    `• Fecha de finalización acordada: ${formatFecha(det.fechaFinal)}`,
  ];

  if (proxima) {
    lines.push(`• Próximo pago pendiente (Cuota #${proxima.numero}): ${symbol} ${proxima.montoTotal.toLocaleString("es-BO")}`);
    lines.push(`• Fecha límite de pago: ${formatFecha(proxima.fechaVencimiento)}`);
    if (det.tieneAtraso) {
      lines.push(`⚠️ Nota: Esta cuota presenta un retraso de ${det.diasAtraso} días.`);
    }
  }

  if (det.totalPenalizaciones > 0) {
    lines.push(`• Penalizaciones por retraso (mora): ${symbol} ${det.totalPenalizaciones.toLocaleString("es-BO")}`);
  }

  lines.push(`-----------------------`);
  lines.push(`💰 Saldo total adeudado: ${symbol} ${det.saldoPendiente.toLocaleString("es-BO")}`);
  lines.push(`Agradezco tu pago puntual para mantener las cuentas al día. ¡Muchas gracias! 🙌`);

  return lines.join("\n");
}
