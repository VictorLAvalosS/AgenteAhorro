import { useState } from "react";
import { Hermano } from "../lib/hermanos";

interface Props {
  hermanos: Hermano[];
  onSaveHermano: (hermano: Hermano) => void;
  onDeleteHermano: (id: string) => void;
  onClose: () => void;
}

const AVATARES = ["👩", "👧", "👨", "👦", "🧑", "👱‍♀️", "🧔", "🦊", "🐶", "🐱"];
const COLORES = [
  { name: "Rosa", bg: "#ec4899" },
  { name: "Púrpura", bg: "#a855f7" },
  { name: "Cian", bg: "#06b6d4" },
  { name: "Esmeralda", bg: "#10b981" },
  { name: "Ámbar", bg: "#f59e0b" },
  { name: "Azul", bg: "#3b82f6" },
];

export default function ModalHermanos({ hermanos, onSaveHermano, onDeleteHermano, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [avatar, setAvatar] = useState("👩");
  const [color, setColor] = useState("#ec4899");
  const [showAddForm, setShowAddForm] = useState(false);

  function startEdit(h: Hermano) {
    setEditingId(h.id);
    setNombre(h.nombre);
    setAvatar(h.avatar || "👩");
    setColor(h.color || "#a855f7");
    setShowAddForm(true);
  }

  function startNew() {
    setEditingId(null);
    setNombre("");
    setAvatar("👩");
    setColor("#ec4899");
    setShowAddForm(true);
  }

  function handleSave() {
    if (!nombre.trim()) return;
    const nuevo: Hermano = {
      id: editingId || `h_${Date.now()}`,
      nombre: nombre.trim(),
      avatar,
      color,
    };
    onSaveHermano(nuevo);
    setShowAddForm(false);
    setEditingId(null);
    setNombre("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#30363d] flex items-center justify-between bg-[#1f2937]/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <div>
              <h3 className="font-display font-bold text-base text-[#e6edf3]">
                Mis Hermanos y Familia
              </h3>
              <p className="text-xs text-[#8b949e]">
                Gestiona a tus hermanos para dividir gastos del hogar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {!showAddForm && (
            <button
              onClick={startNew}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#ec4899] text-white font-display font-bold text-sm shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2"
            >
              <span>+</span> Agregar nuevo hermano / hermana
            </button>
          )}

          {/* Formulario de agregar / editar */}
          {showAddForm && (
            <div className="p-4 rounded-xl bg-[#0d1117] border border-[#a855f7]/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-wider text-[#a855f7] font-bold">
                  {editingId ? "Editar hermano" : "Nuevo hermano"}
                </span>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-[#8b949e] hover:text-[#e6edf3]"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="text-xs text-[#8b949e] mb-1 block">Nombre:</label>
                <input
                  type="text"
                  placeholder="Ej: Mariana, Sofía, Carlos..."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#a855f7]"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-[#8b949e] mb-1 block">Avatar:</label>
                <div className="flex gap-2 flex-wrap">
                  {AVATARES.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatar(emoji)}
                      className={`text-xl p-1.5 rounded-lg border transition-all ${
                        avatar === emoji
                          ? "bg-[#30363d] border-[#a855f7] scale-110"
                          : "border-transparent bg-[#161b22] hover:bg-[#1f2937]"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8b949e] mb-1 block">Color:</label>
                <div className="flex gap-2.5">
                  {COLORES.map((c) => (
                    <button
                      key={c.bg}
                      type="button"
                      onClick={() => setColor(c.bg)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c.bg ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#0d1117]" : "opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.bg }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={!nombre.trim()}
                className="w-full py-2.5 rounded-lg bg-[#a855f7] text-white font-display font-bold text-sm hover:bg-[#c084fc] transition-colors disabled:opacity-40"
              >
                {editingId ? "Guardar cambios ✓" : "Agregar hermano ✓"}
              </button>
            </div>
          )}

          {/* Lista de Hermanos */}
          <div className="space-y-2">
            <p className="text-xs font-display font-semibold text-[#8b949e] uppercase tracking-wider">
              Hermanos configurados ({hermanos.length})
            </p>

            {hermanos.length === 0 ? (
              <div className="text-center p-6 bg-[#0d1117] rounded-xl border border-dashed border-[#30363d]">
                <p className="text-sm text-[#8b949e]">Aún no tienes hermanos agregados.</p>
                <p className="text-xs text-[#8b949e] mt-1">
                  Agrega a tus hermanos para poder elegirlos al dividir gastos.
                </p>
              </div>
            ) : (
              hermanos.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#0d1117] border border-[#30363d] hover:border-[#484f58] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-inner border"
                      style={{
                        backgroundColor: (h.color || "#a855f7") + "25",
                        borderColor: (h.color || "#a855f7") + "50",
                      }}
                    >
                      {h.avatar || "👤"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#e6edf3]">{h.nombre}</p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full uppercase font-mono font-medium"
                        style={{
                          backgroundColor: (h.color || "#a855f7") + "20",
                          color: h.color || "#a855f7",
                        }}
                      >
                        Hermano/a
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(h)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#a855f7] transition-all"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => onDeleteHermano(h.id)}
                      className="px-2 py-1 text-xs rounded-lg bg-[#161b22] border border-[#30363d] text-[#ef4444]/70 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-all"
                      title="Eliminar hermano"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#30363d] bg-[#1f2937]/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#30363d] hover:bg-[#3b434e] text-sm text-[#e6edf3] font-semibold transition-colors"
          >
            Listo ✓
          </button>
        </div>
      </div>
    </div>
  );
}
