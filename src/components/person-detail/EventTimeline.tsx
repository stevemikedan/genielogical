import type { LifeEvent } from '@/types/common.ts';

const EVENT_LABELS: Record<string, string> = {
  birth: 'Birth',
  death: 'Death',
  burial: 'Burial',
  baptism: 'Baptism',
  marriage: 'Marriage',
  divorce: 'Divorce',
  census: 'Census',
  immigration: 'Immigration',
  emigration: 'Emigration',
  naturalization: 'Naturalization',
  occupation: 'Occupation',
  residence: 'Residence',
  military: 'Military',
  other: 'Other',
};

interface EventTimelineProps {
  events: LifeEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  // Sort by date (events without dates at the end)
  const sorted = [...events].sort((a, b) => {
    const aYear = a.date?.year ?? Infinity;
    const bYear = b.date?.year ?? Infinity;
    return aYear - bYear;
  });

  return (
    <section>
      <h3 className="text-sm font-medium text-text-secondary mb-2 uppercase tracking-wide">
        Events
      </h3>
      <div className="space-y-1">
        {sorted.map((event, i) => (
          <div key={i} className="flex items-start gap-3 text-sm py-1">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center mt-1.5">
              <div className="w-2 h-2 rounded-full bg-border" />
              {i < sorted.length - 1 && (
                <div className="w-px h-full min-h-[16px] bg-border" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-text-primary font-medium">
                  {EVENT_LABELS[event.type] ?? event.type}
                </span>
                {event.date?.raw && (
                  <span className="text-text-dim text-xs">{event.date.raw}</span>
                )}
              </div>
              {event.place?.raw && (
                <div className="text-xs text-text-secondary truncate">{event.place.raw}</div>
              )}
              {event.notes && (
                <div className="text-xs text-text-dim mt-0.5">{event.notes}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
