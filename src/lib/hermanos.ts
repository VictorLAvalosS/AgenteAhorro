import { Moneda } from "./types";

export interface Hermano {
  id: string;
  nombre: string;
  avatar: string;
  color: string;
}

export interface CalculoDivision {
  montoTotal: number;
  totalPersonas: number;
  cuotaExacta: number;
  cuotaFinal: number;
  esRedondeado: boolean;
  decimalesDetectados: number;
  textoFormateado: string;
  detalle: string;
}

export const HERMANOS_DEFAULT: Hermano[] = [
  { id: "h1", nombre: "Hermana 1", avatar: "👩", color: "#ec4899" },
  { id: "h2", nombre: "Hermana 2", avatar: "👧", color: "#a855f7" },
];

/**
 * Regla de redondeo solicitada por el usuario:
 * Si una división genera más de 4 decimales (como 68/3 = 22.666666...),
 * se redondea a un número entero (ej: 23).
 * Si tiene 4 o menos decimales limpios (como 2.50, 7.50, 1.25), se mantiene con decimales.
 */
export function calcularCuotaDivision(
  montoTotal: number,
  totalPersonas: number,
  moneda: Moneda = "Bs"
): CalculoDivision {
  if (totalPersonas <= 0 || isNaN(montoTotal) || montoTotal <= 0) {
    return {
      montoTotal: Math.max(0, montoTotal || 0),
      totalPersonas: Math.max(1, totalPersonas || 1),
      cuotaExacta: montoTotal || 0,
      cuotaFinal: montoTotal || 0,
      esRedondeado: false,
      decimalesDetectados: 0,
      textoFormateado: `${moneda === "Bs" ? "Bs" : "$"} ${(montoTotal || 0).toFixed(2)}`,
      detalle: "1 persona",
    };
  }

  const cuotaExacta = montoTotal / totalPersonas;

  // Si es un número entero exacto (ej. 60 / 3 = 20)
  if (Number.isInteger(cuotaExacta)) {
    return {
      montoTotal,
      totalPersonas,
      cuotaExacta,
      cuotaFinal: cuotaExacta,
      esRedondeado: false,
      decimalesDetectados: 0,
      textoFormateado: `${moneda === "Bs" ? "Bs" : "$"} ${cuotaExacta}`,
      detalle: "División exacta",
    };
  }

  // Analizamos la parte decimal con precisión de 6 dígitos para evitar ruido IEEE-754
  const decStr = cuotaExacta.toFixed(6).split(".")[1]?.replace(/0+$/, "") || "";
  const decimalesDetectados = decStr.length;

  // Regla: si salen más de 4 decimales -> redondear a número entero
  if (decimalesDetectados > 4) {
    const redondeado = Math.round(cuotaExacta);
    return {
      montoTotal,
      totalPersonas,
      cuotaExacta,
      cuotaFinal: redondeado,
      esRedondeado: true,
      decimalesDetectados,
      textoFormateado: `${moneda === "Bs" ? "Bs" : "$"} ${redondeado}`,
      detalle: `Redondeado a entero (${cuotaExacta.toFixed(2)} → ${redondeado}) por tener ${decimalesDetectados} decimales`,
    };
  } else {
    // Si sale 2.50 o números con hasta 4 decimales finitos -> se mantiene con decimales
    const dosDec = Math.round(cuotaExacta * 100) / 100;
    const formatted = dosDec.toLocaleString("es-BO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return {
      montoTotal,
      totalPersonas,
      cuotaExacta,
      cuotaFinal: dosDec,
      esRedondeado: false,
      decimalesDetectados,
      textoFormateado: `${moneda === "Bs" ? "Bs" : "$"} ${formatted}`,
      detalle: `Mantiene decimales exactos (${dosDec.toFixed(2)})`,
    };
  }
}

/** Formateador amigable con soporte de la regla de decimales */
export function formatearMontoDivision(monto: number, moneda: Moneda = "Bs"): string {
  const symbol = moneda === "Bs" ? "Bs" : "$";
  if (Number.isInteger(monto)) {
    return `${symbol} ${monto}`;
  }
  return `${symbol} ${monto.toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
