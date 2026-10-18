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
  cuotas: number; // Cantidad de meses / cuotas
  cuotasPagadas: number;
  estado: "activo" | "pagado";
  moneda: Moneda;

  // Nuevos campos avanzados para el control exacto de intereses y penalizaciones
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
  color: string;
  moneda: Moneda;
}

export interface GastoHogar {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: "limpieza" | "comida" | "mascotas" | "servicios" | "otro";
  dividir: boolean;
  hermanos: number;
  pagadoPor: string;
  moneda: Moneda;
  hermanosNombres?: string[];
  cuotaPorPersona?: number;
  esRedondeado?: boolean;
  montoExacto?: number;
  pagosRegistrados?: Record<string, boolean>;
}

export interface ChatMsg {
  id: number;
  role: "user" | "bot";
  text: string;
}

export interface Evento {
  id: number;
  dia: string;
  hora: string;
  titulo: string;
  tipo: "trabajo" | "estudio" | "salud" | "otro";
}
