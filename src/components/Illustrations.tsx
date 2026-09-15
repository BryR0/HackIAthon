/**
 * Ilustraciones vectoriales modernas, caricaturescas y amigables con animaciones SVG.
 * Estilo HealthTech moderno (tipo Duolingo / Headspace / Stripe).
 */

export function HeroDoctorBotIllustration({ className = 'size-48' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} aria-hidden="true">
      {/* Fondo con halo sutil */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary-soft via-accent-soft to-sunken opacity-70 blur-xl animate-pulse-glow" />

      <svg
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-full h-full drop-shadow-md"
      >
        <defs>
          <linearGradient id="bodyGrad" x1="40" y1="40" x2="200" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0e6c82" />
            <stop offset="1" stopColor="#08424f" />
          </linearGradient>
          <linearGradient id="faceGrad" x1="70" y1="70" x2="170" y2="170" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#f1f5f9" />
          </linearGradient>
          <linearGradient id="shieldGrad" x1="160" y1="140" x2="220" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#047857" />
            <stop offset="1" stopColor="#065f46" />
          </linearGradient>
        </defs>

        {/* Antena del asistente con pulso */}
        <line x1="120" y1="45" x2="120" y2="65" stroke="#0e6c82" strokeWidth="5" strokeLinecap="round" />
        <circle cx="120" cy="40" r="10" fill="#38bdf8">
          <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="120" cy="40" r="4" fill="#ffffff" />

        {/* Cabeza del robot asistente */}
        <rect x="65" y="60" width="110" height="95" rx="36" fill="url(#bodyGrad)" stroke="#0c3b47" strokeWidth="4" />

        {/* Pantalla / Cara amigable */}
        <rect x="76" y="72" width="88" height="70" rx="24" fill="url(#faceGrad)" />

        {/* Ojos expresivos parpadeantes */}
        <ellipse cx="98" cy="98" rx="8" ry="11" fill="#0c3b47">
          <animate attributeName="ry" values="11;11;1;11" keyTimes="0;0.9;0.95;1" dur="3.5s" repeatCount="indefinite" />
        </ellipse>
        <circle cx="95" cy="94" r="3.5" fill="#ffffff" />

        <ellipse cx="142" cy="98" rx="8" ry="11" fill="#0c3b47">
          <animate attributeName="ry" values="11;11;1;11" keyTimes="0;0.9;0.95;1" dur="3.5s" repeatCount="indefinite" />
        </ellipse>
        <circle cx="139" cy="94" r="3.5" fill="#ffffff" />

        {/* Mejillas sonrosadas caricaturescas */}
        <circle cx="88" cy="114" r="6" fill="#fca5a5" opacity="0.8" />
        <circle cx="152" cy="114" r="6" fill="#fca5a5" opacity="0.8" />

        {/* Sonrisa alegre */}
        <path d="M106 112 Q120 126 134 112" stroke="#0c3b47" strokeWidth="4" strokeLinecap="round" fill="none" />

        {/* Cuerpo médico con estetoscopio */}
        <path d="M72 155 Q120 168 168 155 L180 215 Q120 225 60 215 Z" fill="#ffffff" stroke="#0c3b47" strokeWidth="4" />

        {/* Cruz médica en el pecho */}
        <rect x="114" y="172" width="12" height="26" rx="4" fill="#047857" />
        <rect x="107" y="179" width="26" height="12" rx="4" fill="#047857" />

        {/* Estetoscopio alrededor del cuello */}
        <path d="M85 158 Q120 202 155 158" stroke="#38bdf8" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <circle cx="120" cy="198" r="8" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="3" />

        {/* Insignia flotante con escudo de ahorro */}
        <g className="animate-bounce" style={{ animationDuration: '3s' }}>
          <circle cx="185" cy="80" r="26" fill="url(#shieldGrad)" stroke="#ffffff" strokeWidth="3" />
          <path d="M176 80 L183 87 L196 74" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Chispa mágica flotante */}
        <g style={{ transformOrigin: '45px 75px' }}>
          <path d="M45 65 Q45 75 35 75 Q45 75 45 85 Q45 75 55 75 Q45 75 45 65" fill="#f59e0b">
            <animateTransform attributeName="transform" type="rotate" from="0 45 75" to="360 45 75" dur="6s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>
    </div>
  )
}

export function SymptomBotIllustration({ className = 'size-28' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none shrink-0 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Halo */}
        <circle cx="60" cy="60" r="48" fill="#cffafe" opacity="0.6" />

        {/* Libreta / historial médico */}
        <rect x="30" y="24" width="60" height="74" rx="12" fill="#ffffff" stroke="#0e6c82" strokeWidth="3" />
        <rect x="42" y="16" width="36" height="12" rx="6" fill="#0e6c82" />

        {/* Líneas de síntomas analizados */}
        <rect x="42" y="42" width="36" height="4" rx="2" fill="#94a3b8" />
        <rect x="42" y="54" width="28" height="4" rx="2" fill="#94a3b8" />
        <rect x="42" y="66" width="32" height="4" rx="2" fill="#94a3b8" />

        {/* Lápiz inteligente flotante con check */}
        <circle cx="82" cy="78" r="18" fill="#047857" stroke="#ffffff" strokeWidth="2.5" />
        <path d="M76 78 L80 82 L89 73" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function SavingsPiggyIllustration({ className = 'size-28' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center select-none shrink-0 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <circle cx="60" cy="60" r="46" fill="#d1fae5" opacity="0.6" />

        {/* Alcancía / Escudo caricaturesco */}
        <rect x="25" y="40" width="70" height="54" rx="24" fill="#047857" stroke="#065f46" strokeWidth="3" />
        <circle cx="45" cy="60" r="5" fill="#ffffff" />
        <circle cx="46" cy="60" r="2.5" fill="#065f46" />

        {/* Ranura de moneda */}
        <rect x="52" y="34" width="16" height="4" rx="2" fill="#065f46" />

        {/* Moneda dorada cayendo */}
        <g>
          <circle cx="60" cy="24" r="12" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
          <text x="60" y="28" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold" fontFamily="sans-serif">$</text>
          <animateTransform attributeName="transform" type="translate" values="0,0; 0,6; 0,0" dur="2s" repeatCount="indefinite" />
        </g>
      </svg>
    </div>
  )
}
