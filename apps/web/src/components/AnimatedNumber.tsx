import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

/** Nombre animé : compte en douceur vers la valeur à chaque changement. */
export function AnimatedNumber({
  value,
  format = (n: number) => String(Math.round(n)),
  duration = 0.9,
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(() => (value == null ? '—' : format(0)));
  const prev = useRef(0);

  useEffect(() => {
    if (value == null) {
      setDisplay('—');
      return;
    }
    const from = prev.current;
    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(format(v)),
      onComplete: () => {
        prev.current = value;
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}
