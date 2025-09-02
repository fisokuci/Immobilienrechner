// DobCalendarInput.tsx
import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format as formatDate,
  isValid as isValidDate,
  parse as parseDate,
} from "date-fns";

/** --- helpers ------------------------------------------------------------ */

// "01.01.1990" -> Date | null
function parseDobString(v: string): Date | null {
  if (!v) return null;
  const normalized = normalizeDob(v);
  const d = parseDate(normalized, "dd.MM.yyyy", new Date());
  return isValidDate(d) ? d : null;
}

// erlaubt „01011990“ -> „01.01.1990“, sonst trim.
function normalizeDob(v: string): string {
  const digits = (v || "").replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  }
  return (v || "").trim();
}

// Date -> "dd.mm.yyyy"
function toSwissDateString(d: Date | null): string {
  if (!d || !isValidDate(d)) return "";
  return formatDate(d, "dd.MM.yyyy");
}

function clampToBounds(d: Date): Date {
  const min = new Date(1900, 0, 1);
  const today = new Date();
  if (d < min) return min;
  if (d > today) return today;
  return d;
}

/** --- component ---------------------------------------------------------- */

export type DobCalendarInputProps = {
  id?: string;
  value?: string;                 // "dd.mm.yyyy"
  placeholder?: string;
  onChange?: (next: string) => void;
  className?: string;             // forward to wrapper
  inputClassName?: string;        // forward to <Input />
  error?: boolean;                // adds red border if true
  disabled?: boolean;
};

export function DobCalendarInput({
  id = "borrowerDob",
  value,
  placeholder = "dd.mm.yyyy",
  onChange,
  className,
  inputClassName,
  error,
  disabled,
}: DobCalendarInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const initial = useMemo(() => parseDobString(value || ""), [value]);
  const [date, setDate] = useState<Date | undefined>(initial ?? undefined);
  const [open, setOpen] = useState(false);

  // keep input display in sync when parent value changes externally
  React.useEffect(() => {
    const next = parseDobString(value || "");
    setDate(next ?? undefined);
    if (inputRef.current) inputRef.current.value = next ? toSwissDateString(next) : value || "";
  }, [value]);

  const commit = (d: Date | null) => {
    const clamped = d ? clampToBounds(d) : null;
    const str = clamped ? toSwissDateString(clamped) : "";
    if (inputRef.current) inputRef.current.value = str;
    onChange?.(str);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        ref={inputRef}
        placeholder={placeholder}
        defaultValue={value}
        disabled={disabled}
        onBlur={(e) => {
          const normalized = normalizeDob(e.currentTarget.value);
          const parsed = parseDobString(normalized);
          commit(parsed);
        }}
        className={cn(inputClassName, error && "border-red-500")}
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1.5 top-1.5 h-8 w-8"
            disabled={disabled}
            aria-label="Geburtstag im Kalender auswählen"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              const valid = d ? clampToBounds(d) : undefined;
              setDate(valid);
              commit(valid ?? null);
              // Popover zu, wenn Datum gewählt
              if (valid) setOpen(false);
            }}
            // simple bounds: 1900..heute
            disabled={(d) => {
              const min = new Date(1900, 0, 1);
              const today = new Date();
              return d < min || d > today;
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DobCalendarInput;
