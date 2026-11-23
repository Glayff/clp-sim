import { useEffect, useState } from 'react';

/**
 * Campo numérico que deixa digitar à vontade ("-", vazio, vírgula no meio):
 * só avisa quem chamou quando o texto vira um número válido.
 */
export function NumInput({
  value,
  onCommit,
  label,
  min,
  max,
  step = 1,
  className,
  disabled,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      className={className}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
