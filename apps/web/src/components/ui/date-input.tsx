// Champ de saisie de date au format français jj/mm/aaaa — le
// navigateur force parfois mm/dd/yyyy avec type="date", source
// d'erreurs. Tape les chiffres, les « / » s'insèrent tout seuls.
// Propriété value/onChange en ISO YYYY-MM-DD.
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

export const isoToFr = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const frToIso = (fr: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fr);
  if (!m) return null;
  const [jj, mm, aa] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(aa, mm - 1, jj);
  if (d.getFullYear() !== aa || d.getMonth() !== mm - 1 || d.getDate() !== jj) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

export function DateInput({
  value,
  onChange,
  invalid,
  ...props
}: {
  value: string;
  onChange: (iso: string) => void;
  invalid?: (bad: boolean) => void;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [txt, setTxt] = useState(isoToFr(value));
  useEffect(() => setTxt(isoToFr(value)), [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      placeholder="jj/mm/aaaa"
      value={txt}
      onChange={(e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 8);
        if (v.length > 4) v = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
        else if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
        setTxt(v);
        const iso = frToIso(v);
        onChange(iso ?? '');
        invalid?.(v.length === 10 && !iso);
      }}
    />
  );
}
