import type { ReactNode } from "react";

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{title}</h2>
    {description ? <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
    <div className="mt-4 grid gap-4">{children}</div>
  </section>;
}

export function Field({ label, hint, required = false, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <label className="block">
    <span className="mb-1.5 block text-sm font-black">{label}{required ? <span className="ml-1 text-[var(--red)]">*</span> : null}</span>
    {children}
    {hint ? <span className="mt-1.5 block text-xs leading-5 text-[var(--muted)]">{hint}</span> : null}
  </label>;
}

export function SelectField<T extends string>({ label, value, options, optionLabel, onChange }: {
  label: string;
  value: string;
  options: readonly T[];
  optionLabel: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return <Field label={label}><select className="field" value={value} onChange={(event) => onChange(event.target.value as T)}>
    {options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
  </select></Field>;
}
