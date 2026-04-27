// Passo 3 — Audiencia. Spec: briefing-onboarding (task 6.4)

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { TagInput } from '@/components/briefing/TagInput';
import type { AudienceData } from '@/types/briefing';

interface Props {
  initial: AudienceData;
  disabled?: boolean;
  onSubmit: (audience: AudienceData) => void;
  onBack: () => void;
}

export function StepAudience({ initial, disabled, onSubmit, onBack }: Props) {
  const [ageMin, setAgeMin] = useState(initial.ageRange?.min ?? 18);
  const [ageMax, setAgeMax] = useState(initial.ageRange?.max ?? 45);
  const [gender, setGender] = useState<AudienceData['gender']>(initial.gender ?? 'mixed');
  const [country, setCountry] = useState(initial.location?.country ?? 'Brasil');
  const [state, setState] = useState(initial.location?.state ?? '');
  const [city, setCity] = useState(initial.location?.city ?? '');
  const [occupation, setOccupation] = useState(initial.occupation ?? '');
  const [income, setIncome] = useState<AudienceData['incomeRange']>(initial.incomeRange);
  const [awareness, setAwareness] = useState(initial.awarenessLevel ?? 3);
  const [interests, setInterests] = useState<string[]>(initial.interests ?? []);
  const [behaviors, setBehaviors] = useState<string[]>(initial.behaviors ?? []);
  const [samples, setSamples] = useState<string[]>(initial.languageSamples ?? []);

  const canSubmit = country.trim().length > 0 && ageMin > 0 && ageMax >= ageMin;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Idade minima *</Label>
          <Input type="number" value={ageMin} onChange={(e) => setAgeMin(parseInt(e.target.value) || 0)} disabled={disabled} />
        </div>
        <div>
          <Label>Idade maxima *</Label>
          <Input type="number" value={ageMax} onChange={(e) => setAgeMax(parseInt(e.target.value) || 0)} disabled={disabled} />
        </div>
      </div>

      <div>
        <Label>Genero predominante</Label>
        <select
          className="w-full h-10 rounded-md border border-input bg-background px-3"
          value={gender ?? 'mixed'}
          onChange={(e) => setGender(e.target.value as AudienceData['gender'])}
          disabled={disabled}
        >
          <option value="mixed">Misto</option>
          <option value="female">Feminino</option>
          <option value="male">Masculino</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Pais *</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <Label>Estado</Label>
          <Input value={state} onChange={(e) => setState(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <Label>Cidade</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={disabled} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Profissao tipica</Label>
          <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <Label>Faixa de renda</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3"
            value={income ?? ''}
            onChange={(e) => setIncome((e.target.value || undefined) as AudienceData['incomeRange'])}
            disabled={disabled}
          >
            <option value="">Nao especificar</option>
            <option value="low">Baixa</option>
            <option value="mid">Media</option>
            <option value="high">Alta</option>
            <option value="premium">Premium</option>
          </select>
        </div>
      </div>

      <div>
        <Label>Nivel de consciencia da dor (1 = nao sabe que tem; 5 = ja procura solucao)</Label>
        <div className="pt-2">
          <Slider min={1} max={5} step={1} value={[awareness]} onValueChange={(v) => setAwareness((v[0] ?? 3) as 1 | 2 | 3 | 4 | 5)} disabled={disabled} />
          <p className="text-xs text-muted-foreground mt-1">Nivel: {awareness}</p>
        </div>
      </div>

      <div>
        <Label>Interesses</Label>
        <TagInput value={interests} onChange={setInterests} placeholder="Pressione enter para adicionar" disabled={disabled} max={20} />
      </div>

      <div>
        <Label>Comportamentos</Label>
        <TagInput value={behaviors} onChange={setBehaviors} placeholder="Ex: compra impulsiva, pesquisa muito" disabled={disabled} max={20} />
      </div>

      <div>
        <Label>Frases que o publico costuma usar</Label>
        <TagInput value={samples} onChange={setSamples} placeholder='Ex: "to cansada de dieta"' disabled={disabled} max={20} />
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} disabled={disabled}>Voltar</Button>
        <Button
          disabled={!canSubmit || disabled}
          onClick={() =>
            onSubmit({
              ageRange: { min: ageMin, max: ageMax },
              gender,
              location: { country: country.trim(), state: state.trim() || undefined, city: city.trim() || undefined },
              occupation: occupation.trim() || undefined,
              incomeRange: income,
              awarenessLevel: awareness as 1 | 2 | 3 | 4 | 5,
              interests,
              behaviors,
              languageSamples: samples,
            })
          }
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
