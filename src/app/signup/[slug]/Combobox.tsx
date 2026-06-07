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
}: {
  items: { id: string; label: string }[];
  query: string;
  onQueryChange: (text: string) => void;
  onSelectExisting: (id: string, label: string) => void;
  onCreateNew: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  createLabel: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = (q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items).slice(0, 8);
  const exact = items.some((it) => it.label.toLowerCase() === q);
  const showCreate = q.length > 0 && !exact;

  return (
    <div className="relative">
      <input
        className={fieldInput}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
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
