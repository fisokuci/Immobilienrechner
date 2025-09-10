import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Info, RotateCcw, Home, Calculator, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import ReactSpeedometer from "react-d3-speedometer";
import DobCalendarInput from "@/components/DobCalendarInput";


// Types for our calculator state
interface CalculatorState {
  // Step 1: Basic Information
  purchasePriceCh: string;   // Kaufpreis (CHF)
  investments: string;       // Investitionen (CHF)
  monthlyNetRent?: string;   // Nettomiete pro Monat (CHF), nur bei Fremdvermietung
  borrowerDob: string;     // dd.mm.yyyy
  yearsToRetirement: string;
  gender: "male" | "female" | "";

  // Step 2: Objektangaben & Finanzierung
  propertyType: string;    // Art
  usage: string;           // Nutzung
  investmentCost: string;  // Anlagekosten (CHF)
  marketValue: string;     // Verkehrswert (CHF)
  pensionWithdrawal: string; // Pensionskassenvorbezug (CHF)
  pillarWithdrawal: string;  // LVP / 3a-Bezug (CHF)
  cashEquity: string;        // Barmittel (CHF)
  mortgageNotes: string; // Schuldbriefe (CHF)
  collateral: string;    // Sicherstellungen (CHF)
  // Step 3: Additional Details
  incomeEr: string;              // CHF, z.B. "150000"
  incomeSie: string;             // CHF
  otherPropertiesBurden?: string; // kalk. Belastung weiterer Liegenschaften (CHF/Jahr), optional
  otherLoans: string;            // CHF (Leasing / Konsum)
  otherHousingCosts: string;     // CHF (eigene Wohnkosten)
}

const defaultState: CalculatorState = {
  // Step 1
  purchasePriceCh: "",
  investments: "",
  monthlyNetRent: "",
  borrowerDob: "01.01.1990",
  yearsToRetirement: "",
  gender: "",

  // Objektangaben & Finanzierung
  propertyType: "",   // z.B. "Einfamilienhaus fremdvermietet"
  usage: "",          // z.B. "Vermietet" oder "Zweitnutzung"
  investmentCost: "", // z.B. "1000000"
  marketValue: "",    // default: folgt investmentCost
  pensionWithdrawal: "",
  pillarWithdrawal: "",
  cashEquity: "",
  mortgageNotes: "", // Anfangswert leer
  collateral: "",    // Anfangswert leer

  // Step 3
  incomeEr: "",
  incomeSie: "",
  otherPropertiesBurden: "",
  otherLoans: "",
  otherHousingCosts: "",
};

//Helper formatierungen
const isRentedUsage = (usage: string) => (usage || "").toLowerCase() === "vermietet";

const kaufpreisPlusInvestitionen = (s: CalculatorState) =>
  parseNumber(s.purchasePriceCh || "0") + parseNumber(s.investments || "0");

// 01.01.1990 -> true/false
const isValidDob = (val: string): boolean => {
  const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return false;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  // exakte Kalenderprüfung (z.B. 31.02 ungültig)
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === mo &&
    dt.getDate() === d
  );
};

// Rentenalter CH
const getRetirementAge = (gender: "male" | "female" | "") =>
  gender === "female" ? 64 : 65; // default: 65

// Alter in Jahren zum Stichtag
const calcAge = (dobStr: string, asOf = new Date()): number => {
  if (!isValidDob(dobStr)) return NaN;
  const [d, m, y] = dobStr.split(".").map(Number);
  const dob = new Date(y, m - 1, d);
  let age = asOf.getFullYear() - y;
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
};

const yearsToRetirementFromDob = (
  dobStr: string,
  gender: "male" | "female" | ""
): number => {
  const age = calcAge(dobStr);
  if (Number.isNaN(age) || age < 0) return NaN;
  const target = getRetirementAge(gender);
  return Math.max(0, target - age);
};

// erlaubt „01011990“ -> „01.01.1990“, sonst gibt Originalstring zurück
const normalizeDob = (val: string): string => {
  const digits = val.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  }
  return val.trim();
};

//part 2 helper
// Helper functions for calculations
const forcedUsageFromType = (
  typeLabel: string
): "eigennutzung" | "vermietet" | undefined => {
  const t = (typeLabel || "").toLowerCase();
  if (t.includes("selbstgenutzt")) return "eigennutzung";
  if (t.includes("fremdvermietet")) return "vermietet";
  return undefined;
};

//helper for accepting only numbers
const onlyDigits = (v: string) => v.replace(/\D+/g, "");
const fmtCH = (digits: string) =>
  digits ? new Intl.NumberFormat("de-CH").format(Number(digits)) : "";


// Helper functions for calculations
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const parseNumber = (value: string): number => {
  return Number(value.replace(/[^\d]/g, ''));
};

const cleanCHF = (v: string) => v.replace(/[^\d]/g, ""); // erlaubt auch "CHF -"
const displayCHF = (raw: string) => raw ? formatCurrency(Number(raw)) : "";

function ChfInputCommit({
  id,
  label,
  placeholder,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onCommit: (digits: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState<string>(value ? displayCHF(value) : "");

  useEffect(() => {
    // Wenn der Input nicht fokussiert ist, formatierten Wert übernehmen
    if (!focused) setText(value ? displayCHF(value) : "");
  }, [value, focused]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        onFocus={() => {
          setFocused(true);
          setText(value || "");
        }}
        onChange={(e) => setText(cleanCHF(e.target.value))}
        onBlur={() => {
          setFocused(false);
          const digits = cleanCHF(text);
          onCommit(digits);
          setText(digits ? displayCHF(digits) : "");
        }}
      />
    </div>
  );
}

export default function Index() {
  const [currentStep, setCurrentStep] = useState(1);
  const [state, setState] = useState<CalculatorState>(defaultState);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('mortgageCalculator');
    if (saved) {
      try {
        const parsedState = JSON.parse(saved);
        setState(parsedState);
      } catch (error) {
        console.error('Error loading saved state:', error);
      }
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('mortgageCalculator', JSON.stringify(state));
  }, [state]);

  // Nutzung-Flag
  const isOwnerOccupied = state.usage === "eigennutzung";

  const pwRef = useRef<HTMLInputElement | null>(null);
  const pillarRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isValidDob(state.borrowerDob)) return;
    const yrs = yearsToRetirementFromDob(state.borrowerDob, state.gender || "male");
    if (Number.isNaN(yrs)) return;
    if (state.yearsToRetirement !== String(yrs)) {
        setState(prev => ({ ...prev, yearsToRetirement: String(yrs) }));
    }
  }, [state.borrowerDob, state.gender]);

  // Nutzung umgeschaltet?
  useEffect(() => {
    if (!isOwnerOccupied) {
      // nicht Eigennutzung -> 0 + disable + State setzen
      if (pwRef.current) pwRef.current.value = "0";
      if (pillarRef.current) pillarRef.current.value = "0";
      setState(p => ({ ...p, pensionWithdrawal: "0", pillarWithdrawal: "0" }));
    } else {
      // Eigennutzung -> aus State anzeigen (formatiert)
      if (pwRef.current) {
        const d = state.pensionWithdrawal ? fmtCH(state.pensionWithdrawal) : "";
        pwRef.current.value = d;
      }
      if (pillarRef.current) {
        const d = state.pillarWithdrawal ? fmtCH(state.pillarWithdrawal) : "";
        pillarRef.current.value = d;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnerOccupied]);

  // Nur DOM filtern – KEIN React-State beim Tippen!
  const handleNumericInput: React.FormEventHandler<HTMLInputElement> = (e) => {
    const el = e.currentTarget;
    const digits = onlyDigits(el.value);
    if (el.value !== digits) el.value = digits;
  };

  const commitPw = () => {
    const el = pwRef.current;
    if (!el) return;
    const n = Number(onlyDigits(el.value));
    if (!n) {
      el.value = "";                                        // leer anzeigen
      setState(p => ({ ...p, pensionWithdrawal: "" }));     // global leer
      return;
    }
    setState(p => ({ ...p, pensionWithdrawal: String(n) })); // global n
    el.value = fmtCH(String(n));                             // Anzeige formatiert
  };

  const commitPillar = () => {
    const el = pillarRef.current;
    if (!el) return;
    const n = Number(onlyDigits(el.value));
    if (!n) {
      el.value = "";
      setState(p => ({ ...p, pillarWithdrawal: "" }));
      return;
    }
    setState(p => ({ ...p, pillarWithdrawal: String(n) }));
    el.value = fmtCH(String(n));
  };


  // Calculate derived values
type PT = "Einfamilienhaus" | "Wohnung";
type US = "eigennutzung" | "vermietet" ;

function thresholdsFor(pt: string, usage: string) {
  const p = (pt || "").toLowerCase();
  const u = (usage || "").toLowerCase() as US;

  // Standard-Schwellen nach (Art, Nutzung)
  if (u === "eigennutzung")   return { first: 2/3, second: 0.80 }; // 66.7% / 80%
  if (u === "vermietet")      return { first: 2/3, second: 0.75 }; // 66.7% / 75%
  //if (u === "zweitnutzung")   return { first: 0.50, second: 0.60 }; // 50% / 60% (analog Ferienobjekt)
  return { first: 0, second: 0 };
}

const firstMortgagePercent = () => thresholdsFor(state.propertyType, state.usage).first;
const secondMortgagePercent = () => thresholdsFor(state.propertyType, state.usage).second;

  const calculations = {
    newFinancing: () => {
      const investment   = parseNumber(state.investmentCost);
      const pension      = parseNumber(state.pensionWithdrawal || "0");
      const pillar       = parseNumber(state.pillarWithdrawal  || "0");
      const cashEquity   = parseNumber(state.cashEquity        || "0");
      return investment - pension - pillar - cashEquity;
    },
    erhoehungSchuldbriefe: () => {
      const nf   = calculations.newFinancing();
      const notes = parseNumber(state.mortgageNotes || "0");
      return nf > notes ? nf - notes : 0;
    },
    basisNettoBelehnung: () => {
      const nf         = calculations.newFinancing();
      const collateral = parseNumber(state.collateral || "0");
      return nf - collateral;
    },

    netLeverageRatio: () => {
      const nf = calculations.newFinancing();
      const invest = parseNumber(state.investmentCost || "0");
      if (nf <= 0 || invest <= 0) return 0;
      return (calculations.basisNettoBelehnung() / invest) * 100; // Prozentwert
    },
    firstMortgagePercent: () => firstMortgagePercent(),

    firstMortgageAbsolute: () => {
      const invest     = parseNumber(state.investmentCost || "0");
      const newFin     = calculations.newFinancing();
      const firstPct   = firstMortgagePercent();
      const collateral = parseNumber(state.collateral || "0");
      if (invest <= 0) return 0;
      const maxFirst = invest * firstPct + collateral;
      return Math.min(newFin, maxFirst);
    },
    secondMortgagePercent: () => secondMortgagePercent(),
    secondMortgageAbsolute: () => {
      const newFin  = calculations.newFinancing();
      const firstAbs = calculations.firstMortgageAbsolute();
      return Math.max(0, newFin - firstAbs);
    },
    amortizationYears: () => {
      // Jahre werden nur für Eigennutzung und Vermietet verwendet
      const u = state.usage;
      if (u === "eigennutzung") {
        const yrs = Number(state.yearsToRetirement || "0");
        return Math.max(1, Math.min(yrs, 15));
      }
      if (u === "vermietet") {
        return 10;
      }
      // Zweitnutzung: kein Jahreplan, da 1% p.a.-Regel (siehe amortizationInfo)
      return 0;
    },

    amortizationInfo: () => {
      const basisNet  = calculations.basisNettoBelehnung();
      const invest    = parseNumber(state.investmentCost || "0");
      const netRatio  = invest > 0 ? basisNet / invest : 0;
      const { first: firstPct } = thresholdsFor(state.propertyType, state.usage);
      const secondAbs = calculations.secondMortgageAbsolute();
      const years     = calculations.amortizationYears();
      const u         = state.usage;
    
      let rule = "-", annual = 0;
    
      if (u === "zweitnutzung") {
        // analog bisher "Ferienobjekt / Luxus"
        if (netRatio <= firstPct) {
          rule = "keine Amortisation";
          annual = 0;
        } else {
          annual = basisNet * 0.01; // 1% p.a. auf Basis Nettobelehnung
          rule   = "1% p.a.";
        }
      } else {
        // Eigennutzung / Vermietet
        annual = years > 0 ? secondAbs / years : 0;
        rule   = years > 0 ? `${years} Jahr${years > 1 ? "e" : ""}` : "-";
      }
    
      return { rule, annual };
    },

    kalkulatorischerZins: () => {
      const nf = calculations.newFinancing();
      return nf > 0 ? nf * 0.05 : 0; // 5% der neuen Finanzierung, nie < 0
    },
    kalkulatorischeNebenkosten: () => {
      const mv = parseNumber(state.marketValue || "0"); // Verkehrswert aus State
      return mv > 0 ? mv * 0.01 : 0; // 1% des Verkehrswerts
    },
    totalKalkulatorischeNebenkosten: () => {
      const amort = calculations.amortizationInfo().annual || 0;   // kalk. Amortisation (CHF/Jahr)
      const zins  = calculations.kalkulatorischerZins() || 0;      // 5% von Neue Finanzierung
      const nk    = calculations.kalkulatorischeNebenkosten() || 0; // 1% von Verkehrswert
      return amort + zins + nk;
    },
    annualNetRent: () => {
      const monthly = parseNumber(state.monthlyNetRent || "0");
      return isRentedUsage(state.usage) && monthly > 0 ? monthly * 12 : 0;
    },
    

    kalkBelastung: () => {
      const total = calculations.totalKalkulatorischeNebenkosten(); // Summe aus Amortisation + kalk. Zins + kalk. Nebenkosten
      const rent  = calculations.annualNetRent();
      return Math.max(total - rent, 0); // Nur wenn Miete die Kosten nicht deckt
    },

    totalGrossIncome: () => {
      const m = parseNumber(state.incomeEr || "0");
      const f = parseNumber(state.incomeSie || "0");
      return m + f; // Jahresbrutto (Er + Sie)
    },

    totalIncomeAfterCalcCosts: () => {
      const gross = calculations.totalGrossIncome();
      const step2Belastung = calculations.kalkBelastung(); // bereits vorhanden (Total kalk. NK - Jahresmiete)
      const other = parseNumber(state.otherPropertiesBurden || "0");
      return gross - step2Belastung - other; // kann negativ werden, absichtlich nicht gecappt
    },

    incomeAfterStep2: () => {
      // Jahresbrutto-Einkommen (Er + Sie) minus Kalk. Belastung aus Schritt 2
      const gross = parseNumber(state.incomeEr || "0") + parseNumber(state.incomeSie || "0");
      const belastung = calculations.kalkBelastung(); // bereits vorhanden
      return gross - belastung;
    },

    tragbarkeitPct: () => {
      const denom = calculations.incomeAfterStep2(); // Einkommen nach kalk. Kosten
      const own   = parseNumber(state.otherHousingCosts || "0"); // Eigene Wohnkosten jährlich
      if (denom <= 0) return NaN; // nicht berechenbar
      return (own / denom) * 100;
    },
  };

  const resetAll = () => {
    setState(defaultState);
    setCurrentStep(1);
    setErrors({});
    localStorage.removeItem('mortgageCalculator');
  };

  const getValidationErrors = (step: number): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 1:
        if (!state.borrowerDob || !isValidDob(state.borrowerDob)) {
            newErrors.borrowerDob = "Geburtstag im Format dd.mm.yyyy eingeben";
        }
        if (!state.yearsToRetirement) {
            newErrors.yearsToRetirement = "Anzahl Jahre bis Pension ist erforderlich";
        } else if (Number(state.yearsToRetirement) <= 0) {
          newErrors.yearsToRetirement = "Bitte eine positive Zahl eingeben";
        }
        if (!state.gender) newErrors.gender = "Geschlecht auswählen";
        break;
        case 2: {
          if (!state.propertyType) newErrors.propertyType = "Art ist erforderlich";

          // Nutzung bleibt wie bisher
          if (!state.usage) newErrors.usage = "Nutzung ist erforderlich";

          // NEU: Kaufpreis + Investitionen prüfen (>0)
          const kp = parseNumber(state.purchasePriceCh || "0");
          const inv = parseNumber(state.investments || "0");
          if (!kp || kp <= 0) newErrors.purchasePriceCh = "Kaufpreis ist erforderlich und muss > 0 sein";
          if (inv < 0) {
            newErrors.investments = "Investitionen dürfen nicht negativ sein";
          }

          // Fremdvermietung → Nettomiete erforderlich
          const rented = isRentedUsage(state.usage);
            if (rented) {
              const rent = parseNumber(state.monthlyNetRent || "0");
              if (!rent || rent <= 0) newErrors.monthlyNetRent = "Nettomiete ist erforderlich und muss > 0 sein";
            }
          break;
        }
        case 3: {
          // Einkommen: mindestens ein Feld ausgefüllt UND Summe > 0
          const erRaw = state.incomeEr ?? "";
          const sieRaw = state.incomeSie ?? "";
          const er = parseNumber(erRaw || "0");
          const sie = parseNumber(sieRaw || "0");
          const bothEmpty = erRaw === "" && sieRaw === "";
          const sum = er + sie;

          if (bothEmpty || sum <= 0) {
            newErrors.incomeTotal = "Mindestens ein Einkommen > 0 ist erforderlich.";
          }
          break;
        }
    }
    return newErrors;
  };

  const validateStep = (step: number): boolean => {
    const newErrors = getValidationErrors(step);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isStepValid = (step: number): boolean => {
    const stepErrors = getValidationErrors(step);
    return Object.keys(stepErrors).length === 0;
  };

  const finish = () => {
    // hier kannst du später z.B. einen Export/Toast machen
    console.log("Form abgeschlossen", state);
    // window.alert("Fertig!"); // optional visuelles Feedback
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Removed auto-advance to prevent infinite re-renders

  const InfoCard = ({ title, value, detail, icon: Icon, className }: {
    title: string; 
    value: string; 
    detail: React.ReactNode; // vorher: string
    icon: any;
    className?: string; // optional

  }) => (
    <Card className={cn("relative", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Info className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              {/* Prüfen, ob String oder React-Element */}
              {typeof detail === "string" ? (
                <p className="text-sm">{detail}</p>
              ) : (
                detail
              )}
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  function Speedometer({
    value,              // Prozentwert (0–100), NaN = nicht berechenbar
    greenMax = 30,      // ≤30% grün
    yellowMax = 33,     // 30–33% gelb, >33% rot
  }: {
    value: number;
    greenMax?: number;
    yellowMax?: number;
  }) {
    const width = 320;
    const height = 180;
    const cx = width / 2;
    const cy = height - 12;
    const r = Math.min(cx, cy) - 12;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const arc = (p1: number, p2: number) => {
      // 0% = links (-180°), 100% = rechts (0°)
      const a1 = -180 + (p1 * 180) / 100;
      const a2 = -180 + (p2 * 180) / 100;
      const x1 = cx + r * Math.cos(toRad(a1));
      const y1 = cy + r * Math.sin(toRad(a1));
      const x2 = cx + r * Math.cos(toRad(a2));
      const y2 = cy + r * Math.sin(toRad(a2));
      const largeArc = a2 - a1 > 180 ? 1 : 0;
      return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
    };

    const isValid = Number.isFinite(value);
    const pct = isValid ? Math.max(0, Math.min(100, value)) : 0;
    const angle = -180 + (pct * 180) / 100;
    const needleX = cx + (r - 12) * Math.cos(toRad(angle));
    const needleY = cy + (r - 12) * Math.sin(toRad(angle));

    return (<TragbarkeitGauge value={calculations.tragbarkeitPct()} />

    );
  }

  //Für Gradienten Speedometer
  // ---------- Konfiguration ----------
  // --- simple constants you can tweak ---
  
const GAUGE_WIDTH = 380;
const GAUGE_HEIGHT = 230;
const GAUGE_RING = 26;

// Mitte des Markers so, dass die Nadel bei 33.3% genau mittig darüber liegt:
const MARKER_CENTER = 33.33;     // <- hier liegt die Mitte des schwarzen Keils
const MARKER_WIDTH  = 1.0;       // Gesamtbreite in %-Punkten (0.6–1.2 üblich)

// -------- helpers --------
function lerpColor(from: string, to: string, t: number) {
  const f = from.replace('#',''), g = to.replace('#','');
  const fr = parseInt(f.slice(0,2),16), fg = parseInt(f.slice(2,4),16), fb = parseInt(f.slice(4,6),16);
  const tr = parseInt(g.slice(0,2),16), tg = parseInt(g.slice(2,4),16), tb = parseInt(g.slice(4,6),16);
  const rr = Math.round(fr + (tr - fr) * t);
  const rg = Math.round(fg + (tg - fg) * t);
  const rb = Math.round(fb + (tb - fb) * t);
  return `#${rr.toString(16).padStart(2,'0')}${rg.toString(16).padStart(2,'0')}${rb.toString(16).padStart(2,'0')}`;
}

// 0..(center-width/2) = grün→gelb, (center±width/2) = schwarzer Keil, (center+width/2)..100 = hellrot→dunkelrot
function buildStopsAndColorsCentered(center = MARKER_CENTER, width = MARKER_WIDTH, lowSteps = 120, highSteps = 180) {
  const green = "#10b981", yellow = "#f59e0b", redLight = "#f87171", redDark = "#991b1b";

  const half = width / 2;
  const lower = Math.max(0, center - half);
  const upper = Math.min(100, center + half);

  // 0..lower
  const lowStops  = Array.from({ length: lowSteps + 1 }, (_, i) => lower * (i / lowSteps));
  // upper..100
  const highStops = Array.from({ length: highSteps + 1 }, (_, i) => upper + (100 - upper) * (i / highSteps));
  // final stop list: [0..lower], [lower..upper] (schwarz), [upper..100]
  const stops = [...lowStops, upper, ...highStops.slice(1)];

  const lowColors  = Array.from({ length: lowSteps },  (_, i) => lerpColor(green, yellow, lowSteps === 1 ? 0 : i / (lowSteps - 1)));
  const highColors = Array.from({ length: highSteps }, (_, i) => lerpColor(redLight, redDark,  highSteps === 1 ? 0 : i / (highSteps - 1)));
  const colors = [...lowColors, "#000000", ...highColors];

  return { stops, colors };
}

// Nur Label (kein Linien-Overlay!)
function ThresholdLabel({
  width = GAUGE_WIDTH,
  height = GAUGE_HEIGHT,
  ringWidth = GAUGE_RING,
  at = MARKER_CENTER,
  text = "33%",
  margin = 65,
}: {
  width?: number; height?: number; ringWidth?: number; at?: number; text?: string; margin?: number;
}) {
  const cx = width / 2;
  const cy = height - margin;
  const outerR = Math.min(cx, cy) - margin;
  const r = outerR - ringWidth / 2;
  const angle = -Math.PI + (Math.PI * Math.max(0, Math.min(100, at)) / 100);
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle) - 10;
  return (
    <svg width={width} height={height} className="pointer-events-none absolute inset-0" style={{ left: 0, top: 0, zIndex: 10 }}>
      <text x={x} y={y} textAnchor="middle" fontSize="11" stroke="#fff" strokeWidth={3} paintOrder="stroke" fill="#111827" fontWeight={600}>
        {text}
      </text>
    </svg>
  );
}

// -------- usage --------
function TragbarkeitGauge({ value }: { value: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const { stops, colors } = buildStopsAndColorsCentered(); // zentriert um 33.33%

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: GAUGE_WIDTH, height: GAUGE_HEIGHT }}>
        <ReactSpeedometer
          minValue={0}
          maxValue={100}
          value={v}
          width={GAUGE_WIDTH}
          height={GAUGE_HEIGHT}
          ringWidth={GAUGE_RING}
          needleHeightRatio={0.78}
          needleColor="#0f172a"
          textColor="#0f172a"
          valueTextFontSize="16"
          currentValueText={`${v.toFixed(1)}%`}
          customSegmentStops={stops}
          segmentColors={colors}
          maxSegmentLabels={0}
          needleTransitionDuration={500}
          forceRender
        />
        <ThresholdLabel text="33%" />
      </div>
    </div>
  );
}





  const showTotalIncomeCard =
  (state.incomeEr !== "" || state.incomeSie !== "") || calculations.totalGrossIncome() > 0;
  const showTragbarkeitCard = (state.incomeEr !== "" || state.incomeSie !== "");


  const InfoPanel = () => {
    // Sichtbarkeitslogik für Einkommen & Side-by-Side
    const incomeSum = calculations.totalGrossIncome();
    const showTotalIncomeCard =
      (state.incomeEr !== "" || state.incomeSie !== "") || incomeSum > 0;
    const sideBySide = currentStep === 3 && incomeSum > 0;

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Ihre Berechnungen</h2>

        {/* Neue Finanzierung */}
        {state.investmentCost && (
          <InfoCard
            title="Neue Finanzierung"
            value={formatCurrency(calculations.newFinancing())}
            detail="Anlagekosten minus PK-Vorbezug, LVP-Bezug und Barmittel."
            icon={DollarSign}
          />
        )}

        {/* Erhöhung Schuldbriefe & Basis Nettobelehnung */}
        {state.investmentCost && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard
              title="Erhöhung Schuldbriefe"
              value={formatCurrency(calculations.erhoehungSchuldbriefe())}
              detail="Neue Finanzierung minus Schuldbriefe (min. 0)"
              icon={DollarSign}
            />
            <InfoCard
              title="Basis Nettobelehnung"
              value={formatCurrency(calculations.basisNettoBelehnung())}
              detail="Neue Finanzierung minus Sicherstellungen"
              icon={DollarSign}
              className="bg-green-50"
            />
          </div>
        )}

        {/* Details + Total Einkommen: nebeneinander ODER untereinander */}
        {sideBySide ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Details */}
            <InfoCard
              title="Details"
              value="–"
              icon={Calculator}
              detail={
                <>
                  <p className="text-sm"><strong>Nettobelehnung:</strong> {calculations.netLeverageRatio().toFixed(2)}%</p>
                  <p className="text-sm">
                    <strong>1. Hypothek (Prozent | CHF):</strong>{" "}
                    {(calculations.firstMortgagePercent() * 100).toFixed(2)}% | {formatCurrency(calculations.firstMortgageAbsolute())}
                  </p>
                  <p className="text-sm">
                    <strong>2. Hypothek (Prozent | CHF):</strong>{" "}
                    {(calculations.secondMortgagePercent() * 100).toFixed(2)}% | {formatCurrency(calculations.secondMortgageAbsolute())}
                  </p>
                  <p className="text-sm">
                    <strong>Amortisation (Jahre):</strong> {calculations.amortizationInfo().rule}
                  </p>
                  <p className="text-sm">
                    <strong>Kalk. Amortisation:</strong>{" "}
                    {formatCurrency(calculations.secondMortgageAbsolute() / calculations.amortizationYears() || 0)}
                  </p>
                  <p className="text-sm">
                    <strong>Kalk. Zins:</strong> {formatCurrency(calculations.kalkulatorischerZins())}
                  </p>
                  <p className="text-sm">
                    <strong>Kalk. Nebenkosten:</strong> {formatCurrency(calculations.kalkulatorischeNebenkosten())}
                  </p>
                  <p className="text-sm">
                    <strong>Jährliche Nettomiete:</strong> {formatCurrency(calculations.annualNetRent())}
                  </p>

                  {/* Totals */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border px-3 py-2 bg-slate-50">
                      <p className="text-xs uppercase tracking-wide text-slate-600">Kalk. Kosten</p>
                      <div className="text-base font-bold">
                        {formatCurrency(calculations.totalKalkulatorischeNebenkosten())}
                      </div>
                    </div>
                    <div className="rounded-lg border px-3 py-2 bg-amber-50">
                      <p className="text-xs uppercase tracking-wide text-slate-700">Kalk. Belastung</p>
                      <div className="text-base font-bold">
                        {formatCurrency(calculations.kalkBelastung())}
                      </div>
                    </div>
                  </div>
                </>
              }
            />

            {/* Total Einkommen (nach kalk. Kosten) */}
            {showTotalIncomeCard && (
              <InfoCard
                title="Einkommen (nach kalk. Kosten)"
                value={formatCurrency(calculations.totalIncomeAfterCalcCosts())}
                icon={DollarSign}
                detail={
                  <>
                    <p className="text-sm">
                      <strong>Brutto Einkommen (Haushalt):</strong> {formatCurrency(calculations.totalGrossIncome())}
                    </p>
                    <p className="text-sm">
                      <strong>− Kalk. Belastung:</strong> {formatCurrency(calculations.kalkBelastung())}
                    </p>
                    <p className="text-sm">
                      <strong>− Kalk. Belastung weitere Liegenschaften:</strong>{" "}
                      {formatCurrency(parseNumber(state.otherPropertiesBurden || "0"))}
                    </p>
                  </>
                }
              />
            )}
          </div>
        ) : (
          <>
            {/* Details (untereinander-Variante) */}
            {state.investmentCost && state.propertyType && (
              <InfoCard
                title="Details"
                value="–"
                icon={Calculator}
                detail={
                  <>
                    <p className="text-sm"><strong>Nettobelehnung:</strong> {calculations.netLeverageRatio().toFixed(2)}%</p>
                    <p className="text-sm">
                      <strong>1. Hypothek (% | CHF):</strong>{" "}
                      {(calculations.firstMortgagePercent() * 100).toFixed(2)}% | {formatCurrency(calculations.firstMortgageAbsolute())}
                    </p>
                    <p className="text-sm">
                      <strong>2. Hypothek (% | CHF):</strong>{" "}
                      {(calculations.secondMortgagePercent() * 100).toFixed(2)}% | {formatCurrency(calculations.secondMortgageAbsolute())}
                    </p>
                    <p className="text-sm">
                      <strong>Amortisation:</strong> {calculations.amortizationInfo().rule}
                    </p>
                    <p className="text-sm">
                      <strong>Kalk. Amortisation:</strong>{" "}
                      {formatCurrency(calculations.secondMortgageAbsolute() / calculations.amortizationYears() || 0)}
                    </p>
                    <p className="text-sm">
                      <strong>Kalk. Zins:</strong> {formatCurrency(calculations.kalkulatorischerZins())}
                    </p>
                    <p className="text-sm">
                      <strong>Kalk. Nebenkosten:</strong> {formatCurrency(calculations.kalkulatorischeNebenkosten())}
                    </p>
                    <p className="text-sm">
                      <strong>Jährliche Nettomiete:</strong> {formatCurrency(calculations.annualNetRent())}
                    </p>

                    {/* Totals */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border px-3 py-2 bg-slate-50">
                        <p className="text-xs uppercase tracking-wide text-slate-600">Kalk. Kosten</p>
                        <div className="text-base font-bold">
                          {formatCurrency(calculations.totalKalkulatorischeNebenkosten())}
                        </div>
                      </div>
                      <div className="rounded-lg border px-3 py-2 bg-amber-50">
                        <p className="text-xs uppercase tracking-wide text-slate-700">Kalk. Belastung</p>
                        <div className="text-base font-bold">
                          {formatCurrency(calculations.kalkBelastung())}
                        </div>
                      </div>
                    </div>
                  </>
                }
              />
            )}

            {/* Total Einkommen (untereinander-Variante) */}
            {showTotalIncomeCard && (
              <InfoCard
                title="Total Einkommen (nach kalk. Kosten)"
                value={formatCurrency(calculations.totalIncomeAfterCalcCosts())}
                icon={DollarSign}
                detail={
                  <>
                    <p className="text-sm">
                      <strong>Brutto Einkommen (Er + Sie):</strong> {formatCurrency(calculations.totalGrossIncome())}
                    </p>
                    <p className="text-sm">
                      <strong>− Kalk. Belastung (Schritt 2):</strong> {formatCurrency(calculations.kalkBelastung())}
                    </p>
                    <p className="text-sm">
                      <strong>− Kalk. Belastung weitere Liegenschaften:</strong>{" "}
                      {formatCurrency(parseNumber(state.otherPropertiesBurden || "0"))}
                    </p>
                  </>
                }
              />
            )}
          </>
        )}

        {/* Speedometer (am Schluss, ohne Karte) */}
        {(state.incomeEr !== "" || state.incomeSie !== "") && (
          <div className="mt-6">
            <h3 className="text-base font-semibold text-center">Tragbarkeit</h3>
            <div className="flex justify-center">
              <Speedometer value={calculations.tragbarkeitPct()} greenMax={30} yellowMax={33} />
            </div>
          </div>
        )}
      </div>
    );
  };

  const StepContent = () => {
    switch (currentStep) {
      case 1:
      return (
        <div className="space-y-6">
          {/* Reihe 2: Geschlecht */}
          <div className="space-y-2">
            <Label htmlFor="gender">Geschlecht *</Label>
            <Select
              value={state.gender}
              onValueChange={(value: "male" | "female") =>
                setState(prev => {
                  const next = { ...prev, gender: value };
                  if (isValidDob(prev.borrowerDob)) {
                    const yrs = yearsToRetirementFromDob(prev.borrowerDob, value);
                    if (!Number.isNaN(yrs)) next.yearsToRetirement = String(yrs);
                  }
                  return next;
                })
              }
            >
              <SelectTrigger id="gender" className={errors.gender ? "border-red-500" : ""}>
                <SelectValue placeholder="Geschlecht auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Weiblich</SelectItem>
                <SelectItem value="male">Männlich</SelectItem>
              </SelectContent>
            </Select>
            {errors.gender && (
              <p className="text-sm text-red-500">{errors.gender}</p>
            )}
          </div>

          {/* Reihe 3: Geburtstag & Jahre bis Pension nebeneinander */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="borrowerDob">Geburtstag Kreditnehmer *</Label>
              <DobCalendarInput
                id="borrowerDob"
                value={state.borrowerDob}
                placeholder="dd.mm.yyyy"
                // error={!!errors.borrowerDob}
                // defaultValue={state.borrowerDob}
                onChange={(normalized) => {
                  setState((prev) => {
                    const next = { ...prev, borrowerDob: normalized };
                    // Jahre bis Pension live berechnen
                    if (isValidDob(normalized)) {
                      const yrs = yearsToRetirementFromDob(normalized, prev.gender || "male");
                        if (!Number.isNaN(yrs)) next.yearsToRetirement = String(yrs);
                    }
                    return next;
                  });
                  //Fehler prüfen
                  const errs = getValidationErrors(1);
                  setErrors(errs);
                }}
                className={errors.borrowerDob ? "border-red-500" : ""}
              />
              {errors.borrowerDob && (
                <p className="text-sm text-red-500">{errors.borrowerDob}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="yearsToRetirement">Jahre bis Pension *</Label>
              <Input
                id="yearsToRetirement"
                placeholder="z. B. 20"
                defaultValue={state.yearsToRetirement}
                onBlur={(e) => {
                  const clean = e.target.value.replace(/[^\d]/g, "");
                  if (clean === "") {
                    setState(prev => ({ ...prev, yearsToRetirement: "" }));
                    e.target.value = "";
                    return;
                  }
                  e.target.value = clean;
                  setState(prev => ({ ...prev, yearsToRetirement: clean }));
                  const errs = getValidationErrors(1);
                  setErrors(errs);
                }}
                className={errors.yearsToRetirement ? "border-red-500" : ""}
              />
              {errors.yearsToRetirement && (
                <p className="text-sm text-red-500">{errors.yearsToRetirement}</p>
              )}
            </div>
          </div>
        </div>
      );


      case 2:
        return (
          <div className="space-y-6">
            {/* Art */}
            <div className="space-y-2">
              <Label htmlFor="propertyType">Art *</Label>
              <Select
                value={state.propertyType}
                onValueChange={(label) => setState(prev => ({ ...prev, propertyType: label }))}
              >
                <SelectTrigger className={errors.propertyType ? "border-red-500" : ""}>
                  <SelectValue placeholder="Art auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Einfamilienhaus">Einfamilienhaus</SelectItem>
                  <SelectItem value="Wohnung">Wohnung</SelectItem>
                </SelectContent>
              </Select>
              {errors.propertyType && <p className="text-sm text-red-500">{errors.propertyType}</p>}
            </div>

            {/* Nutzung */}
            <div className="space-y-2">
              <Label htmlFor="usage">Nutzung *</Label>
              <Select
                value={state.usage}
                onValueChange={(v) => setState(prev => ({ ...prev, usage: v }))}
              >
                <SelectTrigger className={errors.usage ? "border-red-500" : ""}>
                  <SelectValue placeholder="Nutzung auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eigennutzung">Eigennutzung</SelectItem>
                  <SelectItem value="vermietet">Vermietet</SelectItem>
                  {/*<SelectItem value="zweitnutzung">Zweitnutzung</SelectItem>*/}
                </SelectContent>
              </Select>
              {errors.usage && <p className="text-sm text-red-500">{errors.usage}</p>}
            </div>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Kaufpreis */}
              <div className="space-y-2">
                <Label htmlFor="purchasePriceCh">Kaufpreis (CHF) *</Label>
                <Input
                  id="purchasePriceCh"
                  placeholder="z.B. 1’000’000"
                  type="text"
                  defaultValue={displayCHF(state.purchasePriceCh)}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);

                    setState(prev => {
                      const next = { ...prev, purchasePriceCh: clean };
                      const sum = kaufpreisPlusInvestitionen({ ...next });
                      // Verkehrswert intern neu setzen (nicht anzeigen)
                      next.investmentCost = String(sum);
                      next.marketValue = String(sum);
                      return next;
                    });
                  }}
                  onFocus={(e) => { if (state.purchasePriceCh) e.target.value = state.purchasePriceCh; }}
                  className={errors.purchasePriceCh ? "border-red-500" : ""}
                />
                {errors.purchasePriceCh && <p className="text-sm text-red-500">{errors.purchasePriceCh}</p>}
              </div>

              {/* Investitionen mit Info-Icon */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="investments">Investitionen (CHF) *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <p className="text-sm">
                        Gemeint sind wertrelevante Investitionen wie z. B. der Bau eines Swimmingpools,
                        ein neuer Wintergarten oder eine Sanierung.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input
                  id="investments"
                  placeholder="z.B. 100’000"
                  type="text"
                  defaultValue={displayCHF(state.investments)}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);

                    setState(prev => {
                      const next = { ...prev, investments: clean };
                      const sum = kaufpreisPlusInvestitionen({ ...next });
                      // Verkehrswert intern neu setzen (nicht anzeigen)
                      next.investmentCost = String(sum);
                      next.marketValue = String(sum);
                      return next;
                    });
                  }}
                  onFocus={(e) => { if (state.investments) e.target.value = state.investments; }}
                  className={errors.investments ? "border-red-500" : ""}
                />
                {errors.investments && <p className="text-sm text-red-500">{errors.investments}</p>}
              </div>
            </div>


            {/* Finanzierungsquellen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pensionWithdrawal">Pensionskassenvorbezug (CHF)</Label>
                <Input
                  id="pensionWithdrawal"
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  // UNCONTROLLED: KEIN value, KEIN state beim Tippen
                  defaultValue={isOwnerOccupied ? (state.pensionWithdrawal ? fmtCH(state.pensionWithdrawal) : "") : "0"}
                  ref={pwRef}
                  onInput={handleNumericInput}
                  onFocus={(e) => { if (isOwnerOccupied) e.currentTarget.value = onlyDigits(e.currentTarget.value); }}
                  onBlur={commitPw}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  disabled={!isOwnerOccupied}
                  placeholder={isOwnerOccupied ? "z.B. 50'000" : "0"}
                />
                {/*
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Number(state.pensionWithdrawal || "0"))}
                </p>
                */}
              </div>

              <div className="space-y-2">
                <Label htmlFor="pillarWithdrawal">LVP / 3a-Bezug (CHF)</Label>
                <Input
                  id="pillarWithdrawal"
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  defaultValue={isOwnerOccupied ? (state.pillarWithdrawal ? fmtCH(state.pillarWithdrawal) : "") : "0"}
                  ref={pillarRef}
                  onInput={handleNumericInput}
                  onFocus={(e) => { if (isOwnerOccupied) e.currentTarget.value = onlyDigits(e.currentTarget.value); }}
                  onBlur={commitPillar}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  disabled={!isOwnerOccupied}
                  placeholder={isOwnerOccupied ? "z. B. 10'000" : "0"}
                />
                {/*
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Number(state.pillarWithdrawal || "0"))}
                </p>
                */}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cashEquity">Barmittel (CHF)</Label>
                <Input
                  id="cashEquity"
                  placeholder="z.B. CHF 250’000.00"
                  type="text"
                  defaultValue={displayCHF(state.cashEquity)}
                  onBlur={(e) => { const clean = cleanCHF(e.target.value); e.target.value = displayCHF(clean); setState(p => ({...p, cashEquity: clean})); }}
                  onFocus={(e) => { if (state.cashEquity) e.target.value = state.cashEquity; }}
                />
              </div>
            </div>

            {/* Nettomiete pro Monat (nur bei vermietet/fremdvermietet) */}
            {(isRentedUsage(state.propertyType) || state.usage === "vermietet") && (
              <div className="mt-4 space-y-2">
                <Label htmlFor="monthlyNetRent">Nettomiete pro Monat (ohne Nebenkosten) *</Label>
                <Input
                  id="monthlyNetRent"
                  type="text"
                  placeholder="z. B. 3'000"
                  defaultValue={displayCHF(state.monthlyNetRent || "")}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);
                    setState(prev => ({ ...prev, monthlyNetRent: clean }));
                  }}
                  onFocus={(e) => { if (state.monthlyNetRent) e.target.value = state.monthlyNetRent; }}
                  className={errors.monthlyNetRent ? "border-red-500" : ""}
                />
                {errors.monthlyNetRent && <p className="text-sm text-red-500">{errors.monthlyNetRent}</p>}
              </div>
            )}

            {/* Neue Reihe: Schuldbriefe & Sicherstellungen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/*
              <div className="space-y-2">
                <Label htmlFor="mortgageNotes">Schuldbriefe (CHF)</Label>
                <Input
                  id="mortgageNotes"
                  type="text"
                  placeholder="z. B. 100'000"
                  defaultValue={displayCHF(state.mortgageNotes)}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);
                    // nur Werte > 0 speichern; leere Felder bleiben leer
                    setState((prev) => ({
                      ...prev,
                      mortgageNotes: clean && Number(clean) > 0 ? clean : "",
                    }));
                  }}
                  onFocus={(e) => {
                    if (state.mortgageNotes) e.target.value = state.mortgageNotes;
                  }}
                />
              </div>
              */}
              <div className="space-y-2">
                <Label htmlFor="collateral">Sicherstellungen (CHF)</Label>
                <Input
                  id="collateral"
                  type="text"
                  placeholder="z. B. 50'000"
                  defaultValue={displayCHF(state.collateral)}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);
                    setState((prev) => ({
                      ...prev,
                      collateral: clean && Number(clean) > 0 ? clean : "",
                    }));
                  }}
                  onFocus={(e) => {
                    if (state.collateral) e.target.value = state.collateral;
                  }}
                />
              </div>
            </div>
          </div>
        );

        case 3:
          return (
            <div className="space-y-6">
              {/* Reihe 1: Einkommen */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChfInputCommit
                  id="incomeEr"
                  label="Jahreseinkommen Brutto (M)"
                  placeholder="z.B. CHF 100'000"
                  value={state.incomeEr}
                  onCommit={(digits) => setState((p) => ({ ...p, incomeEr: digits }))}
                />
                <ChfInputCommit
                  id="incomeSie"
                  label="Jahreseinkommen Brutto (F)"
                  placeholder="z.B. CHF 100'000"
                  value={state.incomeSie}
                  onCommit={(digits) => setState((p) => ({ ...p, incomeSie: digits }))}
                />
              </div>

              {errors.incomeTotal && (
                <p className="text-sm text-red-500 mt-1">{errors.incomeTotal}</p>
              )}


              {/* Nach dem Einkommen-Grid in case 3 einfügen */}
              {/*
              <div className="space-y-2">
                <ChfInputCommit
                  id="otherPropertiesBurden"
                  label="Kalk. Belastung weiterer Liegenschaften (jährlich, optional)"
                  placeholder="z.B. 0 oder 6'000"
                  value={state.otherPropertiesBurden || ""}
                  onCommit={(digits) => setState((p) => ({ ...p, otherPropertiesBurden: digits }))}
                />
                <p className="text-xs text-muted-foreground">
                  Falls vorhanden: jährliche kalk. Belastung aus weiteren Objekten (CHF/Jahr). 0 ist erlaubt.
                </p>
              </div>
              */}


              {/* Reihe 2: Belastungen */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChfInputCommit
                  id="otherLoans"
                  label="Weitere Kreditbelastungen (Leasing / Konsumkredit)"
                  placeholder="z.B. 12'000"
                  value={state.otherLoans}
                  onCommit={(digits) => setState((p) => ({ ...p, otherLoans: digits }))}
                />
                <ChfInputCommit
                  id="otherHousingCosts"
                  label="Weitere Belastungen (eigene Wohnkosten)"
                  placeholder="z.B. 24'000"
                  value={state.otherHousingCosts}
                  onCommit={(digits) => setState((p) => ({ ...p, otherHousingCosts: digits }))}
                />
              </div>
            </div>
          );


      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Hypothekarrechner
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            In wenigen Klicks berechen Sie Ihre Hypothek und Tragbarkeit.
          </p>
        </div>

        {/* Progress */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-slate-600">
              Schritt {currentStep} von 3
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAll}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Alle zurücksetzen
            </Button>
          </div>
          <Progress value={(currentStep / 3) * 100} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Zins & Personenangaben</span>
            <span>Finanzierung</span>
            <span>Tragbarkeit</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Form Section */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {currentStep === 1 && "Personenangaben"}
                    {currentStep === 2 && "Objekt & Finanzierung"}
                    {currentStep === 3 && "Tragbarkeit & weitere Angaben"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StepContent />

                  <div className="flex justify-between mt-8">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      disabled={currentStep === 1}
                    >
                      Zurück
                    </Button>
                    <Button
                      onClick={currentStep === 3 ? finish : nextStep}
                      disabled={!isStepValid(currentStep)}
                    >
                      {currentStep === 3 ? "Abschliessen" : "Weiter"}
                    </Button>

                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Info Panel - Desktop */}
            <div className="hidden lg:block">
              <div className="sticky top-8">
                <InfoPanel />
              </div>
            </div>
          </div>

          {/* Info Panel - Mobile Accordion */}
          <div className="lg:hidden mt-8">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="calculations">
                <AccordionTrigger>Ihre Berechnungen</AccordionTrigger>
                <AccordionContent>
                  <InfoPanel />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  );
}
