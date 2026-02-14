import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className={cn("h-4 w-4 rounded border border-input text-primary focus:ring-ring", className)}
        {...props}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
