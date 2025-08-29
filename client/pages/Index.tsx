import { useState, useEffect } from "react";
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
  
  // Step 2: Income & Expenses
  grossAnnualIncome: string;
  monthlyDebts: string;
  propertyTax: string;
  homeInsurance: string;
  pmiRate: string;
  
  // Step 3: Additional Details
  firstTimeBuyer: boolean;
  creditScore: string;
  employmentType: string;
  moveInDate: Date | undefined;
}

const defaultState: CalculatorState = {
  purchasePrice: "",
  downPayment: "",
  downPaymentType: "percentage",
  loanTerm: "30",
  interestRate: "",
  grossAnnualIncome: "",
  monthlyDebts: "",
  propertyTax: "",
  homeInsurance: "",
  pmiRate: "",
  firstTimeBuyer: false,
  creditScore: "",
  employmentType: "",
  moveInDate: undefined,
};

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
        if (!state.purchasePrice) newErrors.purchasePrice = "Kaufpreis ist erforderlich";
        if (!state.downPayment) newErrors.downPayment = "Eigenkapital ist erforderlich";
        if (!state.interestRate) newErrors.interestRate = "Zinssatz ist erforderlich";
        break;
      case 2:
        if (!state.grossAnnualIncome) newErrors.grossAnnualIncome = "Jahreseinkommen ist erforderlich";
        break;
      case 3:
        if (!state.creditScore) newErrors.creditScore = "Kreditwürdigkeit ist erforderlich";
        if (!state.employmentType) newErrors.employmentType = "Beschäftigungsart ist erforderlich";
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
              <Label htmlFor="purchasePrice">Kaufpreis der Immobilie *</Label>
              <Input
                id="purchasePrice"
                placeholder="500000"
                type="text"
                defaultValue={state.purchasePrice ? formatCurrency(Number(state.purchasePrice)) : ''}
                onBlur={(e) => {
                  const cleanValue = e.target.value.replace(/[^\d]/g, '');
                  if (cleanValue) {
                    // Format the input field display
                    e.target.value = formatCurrency(Number(cleanValue));
                    // Update state for calculations
                    setState(prev => ({
                      ...prev,
                      purchasePrice: cleanValue
                    }));
                  }
                }}
                onFocus={(e) => {
                  // Remove formatting when focused so user can type freely
                  const cleanValue = state.purchasePrice;
                  if (cleanValue) {
                    e.target.value = cleanValue;
                  }
                }}
                className={errors.purchasePrice ? "border-red-500" : ""}
              />
              {errors.purchasePrice && (
                <p className="text-sm text-red-500">{errors.purchasePrice}</p>
              )}
            </div>

            <div className="space-y-4">
              <Label>Eigenkapital *</Label>
              <RadioGroup
                value={state.downPaymentType}
                onValueChange={(value: "percentage" | "amount") =>
                  setState(prev => ({ ...prev, downPaymentType: value, downPayment: "" }))
                }
                className="flex space-x-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="percentage" />
                  <Label htmlFor="percentage">Prozentsatz</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="amount" id="amount" />
                  <Label htmlFor="amount">CHF-Betrag</Label>
                </div>
              </RadioGroup>

              <Input
                placeholder={state.downPaymentType === "percentage" ? "20%" : "CHF 100'000"}
                defaultValue={state.downPaymentType === "percentage"
                  ? state.downPayment
                  : state.downPayment ? formatCurrency(Number(state.downPayment)) : ''
                }
                onBlur={(e) => {
                  const cleanValue = state.downPaymentType === "percentage"
                    ? e.target.value.replace(/[^0-9.]/g, '')
                    : e.target.value.replace(/[^\d]/g, '');

                  if (cleanValue) {
                    // Format display for amount type
                    if (state.downPaymentType === "amount") {
                      e.target.value = formatCurrency(Number(cleanValue));
                    }
                    // Update state
                    setState(prev => ({
                      ...prev,
                      downPayment: cleanValue
                    }));
                  }
                }}
                onFocus={(e) => {
                  // Remove formatting when focused
                  if (state.downPaymentType === "amount" && state.downPayment) {
                    e.target.value = state.downPayment;
                  }
                }}
                className={errors.downPayment ? "border-red-500" : ""}
              />
              {errors.downPayment && (
                <p className="text-sm text-red-500">{errors.downPayment}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loanTerm">Laufzeit</Label>
                <Select value={state.loanTerm} onValueChange={(value) =>
                  setState(prev => ({ ...prev, loanTerm: value }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Laufzeit wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Jahre</SelectItem>
                    <SelectItem value="20">20 Jahre</SelectItem>
                    <SelectItem value="25">25 Jahre</SelectItem>
                    <SelectItem value="30">30 Jahre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="interestRate">Zinssatz * (%)</Label>
                <Input
                  id="interestRate"
                  placeholder="2.5"
                  defaultValue={state.interestRate}
                  onBlur={(e) => {
                    const cleanValue = e.target.value.replace(/[^0-9.]/g, '');
                    setState(prev => ({
                      ...prev,
                      interestRate: cleanValue
                    }));
                  }}
                  className={errors.interestRate ? "border-red-500" : ""}
                />
                {errors.interestRate && (
                  <p className="text-sm text-red-500">{errors.interestRate}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="grossAnnualIncome">Bruttojahreseinkommen *</Label>
              <Input
                id="grossAnnualIncome"
                placeholder="75000"
                type="text"
                defaultValue={state.grossAnnualIncome ? formatCurrency(Number(state.grossAnnualIncome)) : ''}
                onBlur={(e) => {
                  const cleanValue = e.target.value.replace(/[^\d]/g, '');
                  if (cleanValue) {
                    // Format the input field display
                    e.target.value = formatCurrency(Number(cleanValue));
                    // Update state for calculations
                    setState(prev => ({
                      ...prev,
                      grossAnnualIncome: cleanValue
                    }));
                  }
                }}
                onFocus={(e) => {
                  // Remove formatting when focused so user can type freely
                  const cleanValue = state.grossAnnualIncome;
                  if (cleanValue) {
                    e.target.value = cleanValue;
                  }
                }}
                className={errors.grossAnnualIncome ? "border-red-500" : ""}
              />
              {errors.grossAnnualIncome && (
                <p className="text-sm text-red-500">{errors.grossAnnualIncome}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyDebts">Monatliche Schuldenzahlungen</Label>
              <Input
                id="monthlyDebts"
                placeholder="500"
                type="text"
                defaultValue={state.monthlyDebts ? formatCurrency(Number(state.monthlyDebts)) : ''}
                onBlur={(e) => {
                  const cleanValue = e.target.value.replace(/[^\d]/g, '');
                  if (cleanValue) {
                    // Format the input field display
                    e.target.value = formatCurrency(Number(cleanValue));
                    // Update state for calculations
                    setState(prev => ({
                      ...prev,
                      monthlyDebts: cleanValue
                    }));
                  }
                }}
                onFocus={(e) => {
                  // Remove formatting when focused so user can type freely
                  const cleanValue = state.monthlyDebts;
                  if (cleanValue) {
                    e.target.value = cleanValue;
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyTax">Jährliche Grundsteuer</Label>
                <Input
                  id="propertyTax"
                  placeholder="3000"
                  type="text"
                  defaultValue={state.propertyTax ? formatCurrency(Number(state.propertyTax)) : ''}
                  onBlur={(e) => {
                    const cleanValue = e.target.value.replace(/[^\d]/g, '');
                    if (cleanValue) {
                      // Format the input field display
                      e.target.value = formatCurrency(Number(cleanValue));
                      // Update state for calculations
                      setState(prev => ({
                        ...prev,
                        propertyTax: cleanValue
                      }));
                    }
                  }}
                  onFocus={(e) => {
                    // Remove formatting when focused so user can type freely
                    const cleanValue = state.propertyTax;
                    if (cleanValue) {
                      e.target.value = cleanValue;
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="homeInsurance">Jährliche Gebäudeversicherung</Label>
                <Input
                  id="homeInsurance"
                  placeholder="1500"
                  type="text"
                  defaultValue={state.homeInsurance ? formatCurrency(Number(state.homeInsurance)) : ''}
                  onBlur={(e) => {
                    const cleanValue = e.target.value.replace(/[^\d]/g, '');
                    if (cleanValue) {
                      // Format the input field display
                      e.target.value = formatCurrency(Number(cleanValue));
                      // Update state for calculations
                      setState(prev => ({
                        ...prev,
                        homeInsurance: cleanValue
                      }));
                    }
                  }}
                  onFocus={(e) => {
                    // Remove formatting when focused so user can type freely
                    const cleanValue = state.homeInsurance;
                    if (cleanValue) {
                      e.target.value = cleanValue;
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pmiRate">Hypothekenversicherung (% jährlich)</Label>
              <Input
                id="pmiRate"
                placeholder="0.5"
                defaultValue={state.pmiRate}
                onBlur={(e) => {
                  const cleanValue = e.target.value.replace(/[^0-9.]/g, '');
                  setState(prev => ({
                    ...prev,
                    pmiRate: cleanValue
                  }));
                }}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="creditScore">Kreditwürdigkeit *</Label>
              <Select value={state.creditScore} onValueChange={(value) =>
                setState(prev => ({ ...prev, creditScore: value }))
              }>
                <SelectTrigger className={errors.creditScore ? "border-red-500" : ""}>
                  <SelectValue placeholder="Kreditwürdigkeit auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Ausgezeichnet (750+)</SelectItem>
                  <SelectItem value="good">Gut (700-749)</SelectItem>
                  <SelectItem value="fair">Befriedigend (650-699)</SelectItem>
                  <SelectItem value="poor">Schwach (600-649)</SelectItem>
                  <SelectItem value="bad">Schlecht (unter 600)</SelectItem>
                </SelectContent>
              </Select>
              {errors.creditScore && (
                <p className="text-sm text-red-500">{errors.creditScore}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="employmentType">Beschäftigungsart *</Label>
              <Select value={state.employmentType} onValueChange={(value) =>
                setState(prev => ({ ...prev, employmentType: value }))
              }>
                <SelectTrigger className={errors.employmentType ? "border-red-500" : ""}>
                  <SelectValue placeholder="Beschäftigungsart auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fullTime">Vollzeitangestellt</SelectItem>
                  <SelectItem value="partTime">Teilzeitangestellt</SelectItem>
                  <SelectItem value="selfEmployed">Selbständig</SelectItem>
                  <SelectItem value="contract">Auftragnehmer</SelectItem>
                  <SelectItem value="retired">Pensioniert</SelectItem>
                  <SelectItem value="other">Andere</SelectItem>
                </SelectContent>
              </Select>
              {errors.employmentType && (
                <p className="text-sm text-red-500">{errors.employmentType}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Voraussichtliches Einzugsdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !state.moveInDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {state.moveInDate ? format(state.moveInDate, "dd.MM.yyyy") : "Datum auswählen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={state.moveInDate}
                    onSelect={(date) => setState(prev => ({ ...prev, moveInDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="firstTimeBuyer"
                checked={state.firstTimeBuyer}
                onChange={(e) => setState(prev => ({
                  ...prev,
                  firstTimeBuyer: e.target.checked
                }))}
                className="rounded border-gray-300"
              />
              <Label htmlFor="firstTimeBuyer">Ich bin Erstkäufer</Label>
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
            Hypotheken- & Erschwinglichkeitsrechner
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Berechnen Sie Ihre Hypothekenzahlungen und ermitteln Sie, wie viel Eigenheim Sie sich
            mit unserem umfassenden Rechner leisten können.
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
            <span>Kreditdetails</span>
            <span>Einkommen & Ausgaben</span>
            <span>Zusätzliche Infos</span>
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
