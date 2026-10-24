export function Plamen({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`text-vatra ${className}`} fill="currentColor">
      <path d="M12.6 2.2c.9 3.6-1.4 5.4-2.8 7.2C8.6 11 7.6 12.5 7.6 14.6c0 3.4 2.2 6.2 4.9 6.2s4.9-2.4 4.9-5.7c0-2-.9-3.6-1.9-4.8-.2 1.4-.9 2.4-2 2.9.5-3.7-.2-7.4-.9-11z" />
    </svg>
  );
}

export function Logo({ velik = false }: { velik?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Plamen className={velik ? "h-12 w-12" : "h-8 w-8"} />
      <div className={`font-black leading-none tracking-tight ${velik ? "text-3xl" : "text-xl"}`}>
        <span className="bg-linear-to-r from-vatra to-vatra-2 bg-clip-text text-transparent">INFERNO</span>{" "}
        <span className="text-tekst">ENERGY</span>
      </div>
    </div>
  );
}
