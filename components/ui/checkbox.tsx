import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        className={cn("h-[18px] w-[18px] rounded border border-input bg-secondary/50 text-primary accent-primary focus:ring-primary/30 cursor-pointer", className)}
        {...props}
      />
      {label ? <span className="text-foreground">{label}</span> : null}
    </label>
  );
}
