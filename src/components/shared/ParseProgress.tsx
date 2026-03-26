export function ParseProgress() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-64 h-2 bg-surface rounded-full overflow-hidden">
        <div className="h-full bg-gold rounded-full animate-pulse w-2/3 transition-all" />
      </div>
      <p className="text-text-secondary text-sm">
        Parsing GEDCOM file...
      </p>
    </div>
  );
}
