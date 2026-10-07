"use client";

import { useState } from "react";

// Shared form styles for the public sign-up + edit flows.
export const card = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";
export const fieldLabel = "block text-sm font-semibold text-slate-700 mb-1.5";
export const fieldInput =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

// Searchable combobox: type to filter existing items; offers an inline
// "create new" action when the typed text doesn't exactly match one.
export function Combobox({
  items,
  query,
  onQueryChange,
  onSelectExisting,
  onCreateNew,
  placeholder,
  disabled,
  createLabel,
  invalid,
  title,
}: {
  items: { id: string; label: string }[];
  query: string;
  onQueryChange: (text: string) => void;
  onSelectExisting: (id: string, label: string) => void;
  onCreateNew: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  createLabel: (text: string) => string;
  invalid?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  // Rank matches so exact / prefix hits surface first — otherwise a very short
  // name (e.g. a horse called "H") gets buried below the 8-item cap.
  const rank = (label: string) => {
    const l = label.toLowerCase();
    if (l === q) return 0;
    if (l.startsWith(q)) return 1;
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(l)) return 2;
    return 3;
  };
  const filtered = (q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items)
    .slice()
    .sort((a, b) => rank(a.label) - rank(b.label) || a.label.length - b.label.length || a.label.localeCompare(b.label, "es"))
    .slice(0, 8);
  const exact = items.some((it) => it.label.toLowerCase() === q);
  const showCreate = q.length > 0 && !exact;

  const inputCls = fieldInput + (invalid ? " border-red-400 ring-2 ring-red-100 focus:border-red-500 focus:ring-red-100" : "");

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        autoComplete="off"
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && !disabled && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectExisting(it.id, it.label);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-blue-50"
              >
                {it.label}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCreateNew(query.trim());
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                ➕ {createLabel(query.trim())}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
