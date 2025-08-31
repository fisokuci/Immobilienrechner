import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Info, RotateCcw, Home, Calculator, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Types for our calculator state
interface CalculatorState {
  // Step 1: Basic Information
  purchasePrice: string;
  downPayment: string;
  downPaymentType: "percentage" | "amount";
  loanTerm: string;
  interestRate: string;
  closingCostRate: string; // Nebenkostenansatz in %
  mortgageRate: string; //hypothekarzinssatz
  borrowerDob: string; //dd.mm.yyyy
  yearsToRetirement: string;
  gender: "male" | "female" | "diverse" | "";
  // Step 2: Income & Expenses
  grossAnnualIncome: string;
  monthlyDebts: string;
  propertyTax: string;
  homeInsurance: string;
  pmiRate: string;



  // Step 2: Objektangaben & Finanzierung
  propertyType: string;    // Art
  usage: string;           // Nutzung
  investmentCost: string;  // Anlagekosten (CHF)
  marketValue: string;     // Verkehrswert (CHF)
  pensionWithdrawal: string; // Pensionskassenvorbezug (CHF)
  pillarWithdrawal: string;  // LVP / 3a-Bezug (CHF)
  cashEquity: string;        // Barmittel (CHF)
  isMarketLinked: boolean;   // steuert, ob Verkehrswert an Anlagekosten gekoppelt bleibt
  
  // Step 3: Additional Details
  incomeEr: string;              // CHF, z.B. "150000"
  incomeSie: string;             // CHF
  otherLoans: string;            // CHF (Leasing / Konsum)
  otherHousingCosts: string;     // CHF (eigene Wohnkosten)
}

const defaultState: CalculatorState = {
  closingCostRate: "",
  mortgageRate: "",
  borrowerDob: "01.01.1990",
  yearsToRetirement: "",
    propertyType: "",   // z.B. "Einfamilienhaus fremdvermietet"
  usage: "",          // z.B. "Vermietet" oder "Zweitnutzung"
  investmentCost: "", // z.B. "1000000"
  marketValue: "",    // default: folgt investmentCost
  pensionWithdrawal: "",
  pillarWithdrawal: "",
  cashEquity: "",
  isMarketLinked: true,

  incomeEr: "",
  incomeSie: "",
  otherLoans: "",
  otherHousingCosts: "",
};

//Helper formatierungen
const clampPercent = (n: number) => Math.min(100, Math.max(1, n || 0));

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
const getRetirementAge = (gender: "male" | "female" | "diverse" | "") =>
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
  gender: "male" | "female" | "diverse" | ""
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

const formatNumber = (value: string): string => {
  const num = value.replace(/[^\d]/g, '');
  return new Intl.NumberFormat('de-CH').format(Number(num));
};

const parseNumber = (value: string): number => {
  return Number(value.replace(/[^\d]/g, ''));
};

const cleanCHF = (v: string) => v.replace(/[^\d]/g, ""); // erlaubt auch "CHF -"
const displayCHF = (raw: string) => raw ? formatCurrency(Number(raw)) : "";

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
        setState({
          ...parsedState,
          moveInDate: parsedState.moveInDate ? new Date(parsedState.moveInDate) : undefined
        });
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
  const calculations = {
    loanAmount: () => {
      const price = parseNumber(state.purchasePrice);
      const down = state.downPaymentType === "percentage" 
        ? (price * parseNumber(state.downPayment)) / 100
        : parseNumber(state.downPayment);
      return price - down;
    },
    monthlyPayment: () => {
      const principal = calculations.loanAmount();
      const monthlyRate = parseNumber(state.interestRate) / 100 / 12;
      const numPayments = parseNumber(state.loanTerm) * 12;
      
      if (monthlyRate === 0) return principal / numPayments;
      
      const monthlyPayment = principal * 
        (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
        (Math.pow(1 + monthlyRate, numPayments) - 1);
      
      return monthlyPayment;
    },
    totalMonthlyPayment: () => {
      const base = calculations.monthlyPayment();
      const tax = parseNumber(state.propertyTax) / 12;
      const insurance = parseNumber(state.homeInsurance) / 12;
      const pmi = calculations.loanAmount() * (parseNumber(state.pmiRate) / 100) / 12;
      
      return base + tax + insurance + pmi;
    },
    affordabilityRatio: () => {
      const monthlyIncome = parseNumber(state.grossAnnualIncome) / 12;
      const totalPayment = calculations.totalMonthlyPayment();
      
      return monthlyIncome > 0 ? (totalPayment / monthlyIncome) * 100 : 0;
    },
    maxAffordable: () => {
      const monthlyIncome = parseNumber(state.grossAnnualIncome) / 12;
      const maxPayment = monthlyIncome * 0.28; // 28% DTI rule
      return maxPayment * 12; // Simplified calculation
    }
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
      case 2:
        if (!state.propertyType) newErrors.propertyType = "Art ist erforderlich";
        if (!state.usage) newErrors.usage = "Nutzung ist erforderlich";
        if (!state.investmentCost) newErrors.investmentCost = "Anlagekosten sind erforderlich";
        if (!state.marketValue) newErrors.marketValue = "Verkehrswert ist erforderlich";
        break;
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

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Removed auto-advance to prevent infinite re-renders

  const InfoCard = ({ title, value, detail, icon: Icon }: { 
    title: string; 
    value: string; 
    detail: string; 
    icon: any;
  }) => (
    <Card className="relative">
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
              <p className="text-sm">{detail}</p>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  const InfoPanel = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Ihre Berechnungen</h2>

      {state.purchasePrice && (
        <InfoCard
          title="Hypothekenbetrag"
          value={formatCurrency(calculations.loanAmount())}
          detail="Dies ist der Betrag, den Sie nach Ihrem Eigenkapital leihen müssen."
          icon={Calculator}
        />
      )}

      {state.interestRate && state.loanTerm && calculations.loanAmount() > 0 && (
        <InfoCard
          title="Monatliche Rate (Kapital & Zinsen)"
          value={formatCurrency(calculations.monthlyPayment())}
          detail="Nur Kapital- und Zinszahlung. Enthält keine Steuern, Versicherung oder Hypothekenversicherung."
          icon={Home}
        />
      )}

      {state.propertyTax && state.homeInsurance && (
        <InfoCard
          title="Gesamte monatliche Zahlung"
          value={formatCurrency(calculations.totalMonthlyPayment())}
          detail="Enthält Kapital, Zinsen, Steuern, Versicherung und Hypothekenversicherung."
          icon={DollarSign}
        />
      )}

      {state.grossAnnualIncome && calculations.totalMonthlyPayment() > 0 && (
        <InfoCard
          title="Schulden-zu-Einkommen-Verhältnis"
          value={`${calculations.affordabilityRatio().toFixed(1)}%`}
          detail="Ihre Wohnungszahlung als Prozentsatz des Brutto-Monatseinkommens. Sollte idealerweise unter 28% liegen."
          icon={Calculator}
        />
      )}
    </div>
  );

  const StepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="closingCostRate">Nebenkostenansatz (%)</Label>
              <Input
                id="closingCostRate"
                placeholder="z. B. 5"
                defaultValue={state.closingCostRate}
                onBlur={(e) => {
                  const clean = e.target.value.replace(/[^0-9.]/g, "");
                  if (clean === "") {
                    // leer lassen, wenn nichts eingegeben wurde
                    setState(prev => ({ ...prev, closingCostRate: "" }));
                    e.target.value = "";
                    return;
                  }
                  const clamped = clampPercent(Number(clean));
                  // im Feld ohne % anzeigen (du formatierst Prozente sonst auch „roh“)
                  e.target.value = String(clamped);
                  setState(prev => ({ ...prev, closingCostRate: String(clamped) }));
                }}
              />
              {/* Optional: einfache Hinweiszeile */}
              {/*<p className="text-xs text-muted-foreground">
                Zwischen 1 % und 100 %. Wird automatisch begrenzt.
              </p>*/}
              <Label htmlFor="mortgageRate">Hypothekarzinssatz (%)</Label>
              <Input
                id="mortgageRate"
                placeholder="z. B. 5"
                defaultValue={state.mortgageRate}
                onBlur={(e) => {
                  const clean = e.target.value.replace(/[^0-9.]/g, "");
                  if (clean === "") {
                    // leer lassen, wenn nichts eingegeben wurde
                    setState(prev => ({ ...prev, mortgageRate: "" }));
                    e.target.value = "";
                    return;
                  }
                  const clamped = clampPercent(Number(clean));
                  // im Feld ohne % anzeigen (du formatierst Prozente sonst auch „roh“)
                  e.target.value = String(clamped);
                  setState(prev => ({ ...prev, mortgageRate: String(clamped) }));
                }}
              />
              {/* Optional: einfache Hinweiszeile */}
              {/*<p className="text-xs text-muted-foreground">
                Zwischen 1 % und 100 %. Wird automatisch begrenzt.
              </p>*/}
              <Label htmlFor="borrowerDob">Geburtstag Kreditnehmer *</Label>
              <Input
                id="borrowerDob"
                placeholder="dd.mm.yyyy"
                defaultValue={state.borrowerDob}
                onBlur={(e) => {
                  // normalisieren (z.B. 01011990 -> 01.01.1990)
                  const normalized = normalizeDob(e.target.value);
                  e.target.value = normalized;

                  // State setzen
                  setState(prev => {
                    const next = { ...prev, borrowerDob: normalized };
                    if (isValidDob(normalized)) {
                      const yrs = yearsToRetirementFromDob(
                        normalized,
                        prev.gender || "male" // Default: Mann
                      );
                      if (!Number.isNaN(yrs)) next.yearsToRetirement = String(yrs);
                    }
                    return next;
                  });
                  const errs = getValidationErrors(1);
                  setErrors(errs);
                }}
                onFocus={(e) => {
                  // nichts Besonderes nötig; Nutzer kann direkt tippen
                }}
                className={errors.borrowerDob ? "border-red-500" : ""}
              />
              {errors.borrowerDob && (
                <p className="text-sm text-red-500">{errors.borrowerDob}</p>
              )}
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

                  // sofortige Validierung
                  const errs = getValidationErrors(1);
                  setErrors(errs);
                }}
                className={errors.yearsToRetirement ? "border-red-500" : ""}
              />
              {errors.yearsToRetirement && (
                <p className="text-sm text-red-500">{errors.yearsToRetirement}</p>
              )}
              <Label htmlFor="gender">Geschlecht *</Label>
                  <Select
                    value={state.gender}
                    onValueChange={(value: "male" | "female" | "diverse") =>
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
                      <SelectItem value="diverse">Divers</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.gender && (
                    <p className="text-sm text-red-500">{errors.gender}</p>
                  )}
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
                onValueChange={(label) => {
                  const forced = forcedUsageFromType(label);
                  setState(prev => ({
                    ...prev,
                    propertyType: label,
                    // falls Art eine Nutzung erzwingt, gleich mitsetzen,
                    // sonst bisherige Nutzung beibehalten
                    usage: forced ?? prev.usage,
                  }));
                }}
              >
                <SelectTrigger className={errors.propertyType ? "border-red-500" : ""}>
                  <SelectValue placeholder="Art auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mehrfamilienhaus fremdvermietet">Mehrfamilienhaus fremdvermietet</SelectItem>
                  <SelectItem value="Einfamilienhaus selbstgenutzt">Einfamilienhaus selbstgenutzt</SelectItem>
                  <SelectItem value="Stockwerkeigentum selbstgenutzt">Stockwerkeigentum selbstgenutzt</SelectItem>
                  <SelectItem value="Ferienobjekt / Luxus">Ferienobjekt / Luxus</SelectItem>
                  <SelectItem value="Bauland">Bauland</SelectItem>
                  <SelectItem value="Einfamilienhaus fremdvermietet">Einfamilienhaus fremdvermietet</SelectItem>
                  <SelectItem value="Stockwerkeigentum fremdvermietet">Stockwerkeigentum fremdvermietet</SelectItem>
                </SelectContent>
              </Select>
              {errors.propertyType && <p className="text-sm text-red-500">{errors.propertyType}</p>}
            </div>

            {/* Nutzung */}
            <div className="space-y-2">
              <Label htmlFor="usage">Nutzung *</Label>
              {(() => {
                const forced = forcedUsageFromType(state.propertyType);
                const value = forced ?? state.usage;
                const disabled = Boolean(forced);

                return (
                  <>
                    <Select
                      value={value}
                      onValueChange={(v) => {
                        // nur erlauben, wenn NICHT erzwungen
                        if (!disabled) setState(prev => ({ ...prev, usage: v }));
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger className={errors.usage ? "border-red-500" : ""}>
                        <SelectValue placeholder="Nutzung auswählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eigennutzung">Eigennutzung</SelectItem>
                        <SelectItem value="vermietet">Vermietet</SelectItem>
                        <SelectItem value="zweitnutzung">Zweitnutzung</SelectItem>
                      </SelectContent>
                    </Select>
                    {disabled && (
                      <p className="text-xs text-muted-foreground">
                        Nutzung durch Art vorgegeben: {value === "eigennutzung" ? "Eigennutzung" : "Vermietet"}.
                      </p>
                    )}
                    {errors.usage && <p className="text-sm text-red-500">{errors.usage}</p>}
                  </>
                );
              })()}
            </div>

            {/* Anlagekosten & Verkehrswert */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="investmentCost">Anlagekosten (CHF) *</Label>
                <Input
                  id="investmentCost"
                  placeholder="CHF 1’000’000.00"
                  type="text"
                  defaultValue={displayCHF(state.investmentCost)}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);
                    setState(prev => {
                      const next: CalculatorState = { ...prev, investmentCost: clean };
                      // solange verknüpft, Verkehrswert automatisch nachziehen
                      if (prev.isMarketLinked) next.marketValue = clean;
                      return next;
                    });
                  }}
                  onFocus={(e) => { if (state.investmentCost) e.target.value = state.investmentCost; }}
                  className={errors.investmentCost ? "border-red-500" : ""}
                />
                {errors.investmentCost && <p className="text-sm text-red-500">{errors.investmentCost}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="marketValue">Verkehrswert (CHF) *</Label>
                  {/* kleiner Toggle-Hinweis */}
                  <span className="text-xs text-muted-foreground">
                    {state.isMarketLinked ? "∼ folgt Anlagekosten" : "manuell gesetzt"}
                  </span>
                </div>
                <Input
                  id="marketValue"
                  placeholder="CHF 1’000’000.00"
                  type="text"
                  defaultValue={displayCHF(state.marketValue || state.investmentCost)}
                  onBlur={(e) => {
                    const clean = cleanCHF(e.target.value);
                    e.target.value = displayCHF(clean);
                    setState(prev => ({ ...prev, marketValue: clean || prev.investmentCost, isMarketLinked: false }));
                  }}
                  onFocus={(e) => {
                    const current = state.marketValue || (state.isMarketLinked ? state.investmentCost : "");
                    if (current) e.target.value = current;
                  }}
                  className={errors.marketValue ? "border-red-500" : ""}
                />
                {errors.marketValue && <p className="text-sm text-red-500">{errors.marketValue}</p>}

                {/* Optional: Link/Unlink Button */}
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-1 h-7 px-2 text-xs"
                  onClick={() => setState(prev => {
                    const link = !prev.isMarketLinked;
                    return {
                      ...prev,
                      isMarketLinked: link,
                      marketValue: link ? prev.investmentCost : prev.marketValue
                    };
                  })}
                >
                  {state.isMarketLinked ? "Verknüpfung lösen" : "Mit Anlagekosten verknüpfen"}
                </Button>
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
                  placeholder={isOwnerOccupied ? "z. B. 50'000" : "0"}
                />
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Number(state.pensionWithdrawal || "0"))}
                </p>
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
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Number(state.pillarWithdrawal || "0"))}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cashEquity">Barmittel (CHF)</Label>
                <Input
                  id="cashEquity"
                  placeholder="CHF 250’000.00"
                  type="text"
                  defaultValue={displayCHF(state.cashEquity)}
                  onBlur={(e) => { const clean = cleanCHF(e.target.value); e.target.value = displayCHF(clean); setState(p => ({...p, cashEquity: clean})); }}
                  onFocus={(e) => { if (state.cashEquity) e.target.value = state.cashEquity; }}
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            {/* Einkommen nebeneinander */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Einkommen Er */}
                <div className="space-y-2">
                  <Label htmlFor="incomeEr">Jahreseinkommen Brutto (m)</Label>
                  <Input
                    id="incomeEr"
                    type="text"
                    placeholder="CHF 150'000"
                    defaultValue={displayCHF(state.incomeEr)}
                    onBlur={(e) => {
                      const clean = cleanCHF(e.target.value);
                      e.target.value = displayCHF(clean);
                      setState(p => ({ ...p, incomeEr: clean }));
                    }}
                    onFocus={(e) => { if (state.incomeEr) e.currentTarget.value = state.incomeEr; }}
                    inputMode="numeric"
                  />
                </div>

                {/* Einkommen Sie */}
                <div className="space-y-2">
                  <Label htmlFor="incomeSie">Jahreseinkommen Brutto (f)</Label>
                  <Input
                    id="incomeSie"
                    type="text"
                    placeholder="CHF 150'000"
                    defaultValue={displayCHF(state.incomeSie)}
                    onBlur={(e) => {
                      const clean = cleanCHF(e.target.value);
                      e.target.value = displayCHF(clean);
                      setState(p => ({ ...p, incomeSie: clean }));
                    }}
                    onFocus={(e) => { if (state.incomeSie) e.currentTarget.value = state.incomeSie; }}
                    inputMode="numeric"
                  />
                </div>
              </div>


            {/* Weitere Kreditbelastungen */}
            <div className="space-y-2">
              <Label htmlFor="otherLoans">Weitere Kreditbelastungen (Leasing / Konsumkredit)</Label>
              <Input
                id="otherLoans"
                type="text"
                placeholder="CHF 0"
                defaultValue={displayCHF(state.otherLoans)}
                onBlur={(e) => {
                  const clean = cleanCHF(e.target.value);
                  e.target.value = displayCHF(clean);
                  setState(p => ({ ...p, otherLoans: clean }));
                }}
                onFocus={(e) => { if (state.otherLoans) e.currentTarget.value = state.otherLoans; }}
                inputMode="numeric"
              />
            </div>

            {/* Weitere Belastungen */}
            <div className="space-y-2">
              <Label htmlFor="otherHousingCosts">Weitere Belastungen (eigene Wohnkosten)</Label>
              <Input
                id="otherHousingCosts"
                type="text"
                placeholder="CHF 0"
                defaultValue={displayCHF(state.otherHousingCosts)}
                onBlur={(e) => {
                  const clean = cleanCHF(e.target.value);
                  e.target.value = displayCHF(clean);
                  setState(p => ({ ...p, otherHousingCosts: clean }));
                }}
                onFocus={(e) => { if (state.otherHousingCosts) e.currentTarget.value = state.otherHousingCosts; }}
                inputMode="numeric"
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
                    {currentStep === 1 && "Kreditdetails"}
                    {currentStep === 2 && "Einkommen & Ausgaben"}
                    {currentStep === 3 && "Zusätzliche Informationen"}
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
                      onClick={nextStep}
                      disabled={currentStep === 3 || !isStepValid(currentStep)}
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
