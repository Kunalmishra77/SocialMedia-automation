'use client'

/** A <select> that submits its enclosing form on change. Safe to place inside
 *  a server-rendered <form action={serverAction}>. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className,
}: {
  name: string
  defaultValue: string
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={className}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
