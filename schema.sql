-- Habilitar la extensión UUID si no existe
create extension if not exists "uuid-ossp";

-- 1. Tabla de Usuarios
create table if not exists usuarios (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  email text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Tabla de Gastos
create table if not exists gastos (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id) on delete cascade not null,
  fecha date not null,
  categoria text not null,
  descripcion text not null,
  monto numeric(10,2) not null,
  moneda text not null check (moneda in ('Bs', 'USD')),
  tipo text not null check (tipo in ('gasto', 'ingreso')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Tabla de Prestamos
create table if not exists prestamos (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id) on delete cascade not null,
  deudor text not null,
  capital numeric(10,2) not null,
  interes numeric(5,2) not null,
  moneda text not null check (moneda in ('Bs', 'USD')),
  fecha_inicio date not null,
  cuotas integer not null,
  cuotas_pagadas integer not null default 0,
  estado text not null check (estado in ('activo', 'pagado')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Tabla de Metas
create table if not exists metas (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id) on delete cascade not null,
  nombre text not null,
  emoji text not null,
  meta numeric(10,2) not null,
  ahorrado numeric(10,2) not null default 0,
  color text not null,
  moneda text not null check (moneda in ('Bs', 'USD')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Tabla de Hogar (Gastos del Hogar)
create table if not exists hogar (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id) on delete cascade not null,
  fecha date not null,
  descripcion text not null,
  monto numeric(10,2) not null,
  moneda text not null check (moneda in ('Bs', 'USD')),
  categoria text not null,
  dividir boolean not null default false,
  hermanos integer not null default 0,
  pagado_por text not null default 'Yo',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Políticas de Seguridad (RLS) - Permitimos operaciones anónimas por simplicidad en la demo, 
-- pero en producción deberías usar Autenticación de Supabase.
alter table usuarios enable row level security;
alter table gastos enable row level security;
alter table prestamos enable row level security;
alter table metas enable row level security;
alter table hogar enable row level security;

-- Crear políticas para permitir acceso público anónimo (Solo con el ID del usuario)
create policy "Acceso público usuarios" on usuarios for all using (true);
create policy "Acceso público gastos" on gastos for all using (true);
create policy "Acceso público prestamos" on prestamos for all using (true);
create policy "Acceso público metas" on metas for all using (true);
create policy "Acceso público hogar" on hogar for all using (true);
