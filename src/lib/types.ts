export type Tab = "inicio" | "gastos" | "hogar" | "prestamos" | "metas" | "asistente";
export type Moneda = "Bs" | "USD";

export interface Gasto {
  id: string;
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "gasto" | "ingreso";
  moneda: Moneda;
}

export type MetodoPagoPrestamo = "solo_interes_capital_final" | "capital_mas_interes_cuotas";

export interface CuotaCronograma {
  numero: number;
  fechaVencimiento: string; // YYYY-MM-DD
  montoInteres: number;
  montoCapital: number;
  montoPenalizacion: number;
  montoTotal: number;
  pagada: boolean;
  fechaPago?: string;
  motivoPenalizacion?: string;
  montoPagado?: number; // Permite abonos parciales o registro del monto cobrado
  esMoraExtra?: boolean; // True si es un mes generado automáticamente por mora
}

export interface PenalizacionPrestamo {
  id: string;
  fecha: string;
  monto: number;
  motivo: string;
}

export interface Prestamo {
  id: string;
  deudor: string;
  capital: number;
  interes: number; // Porcentaje mensual (ej. 5, 8, 10%)
  fechaInicio: string; // YYYY-MM-DD
  fechaFin?: string; // Fecha acordada de devolución total
  cuotas: number; // Cantidad de meses / cuotas pactadas inicialmente
  cuotasPagadas: number;
  estado: "activo" | "pagado";
  moneda: Moneda;

  // Campos avanzados para el control exacto de intereses y penalizaciones
  metodoPago?: MetodoPagoPrestamo;
  penalizaciones?: PenalizacionPrestamo[];
  cronograma?: CuotaCronograma[];
  totalCobrado?: number;
  notas?: string;
}

export interface Meta {
  id: string;
  nombre: string;
  emoji: string;
  meta: number;
  ahorrado: number;
  fechaFin: string;
  moneda: Moneda;
}

export interface ChatMsg {
  id: number;
  role: "bot" | "user";
  text: string;
}

export type CategoriaHogar =
  | "limpieza"
  | "comida"
  | "mascotas"
  | "servicios"
  | "streaming"
  | "internet"
  | "otro";

export interface GastoHogar {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: Moneda;
  categoria: CategoriaHogar;
  dividir: boolean;
  hermanos: number; // Cantidad de personas con quienes se divide
  pagadoPor: string; // "Yo" o nombre del usuario/hermano

  // Campos enriquecidos para control por hermano y cobros parciales
  hermanosNombres?: string[]; // Nombres de hermanos que comparten este gasto
  cuotaPorPersona?: number; // Monto que debe pagar cada hermano
  esRedondeado?: boolean;
  montoExacto?: number;
  pagosRegistrados?: Record<string, boolean>; // { "Meli": true, "Nayda": false }
}
