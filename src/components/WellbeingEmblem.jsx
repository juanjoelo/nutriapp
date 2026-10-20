import { Sprout, Sun } from 'lucide-react';

export function WellbeingEmblem() {
  return (
    <div className="wellbeing-emblem" aria-hidden="true">
      <Sun className="emblem-sun" strokeWidth={1.2} />
      <Sprout className="emblem-sprout" strokeWidth={1.1} />
      <span className="emblem-seed emblem-seed-left" />
      <span className="emblem-seed emblem-seed-right" />
    </div>
  );
}
