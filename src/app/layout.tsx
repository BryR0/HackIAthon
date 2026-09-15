import type { Metadata, Viewport } from 'next'
import { Lexend, Source_Sans_3 } from 'next/font/google'

import './globals.css'

// Autohospedadas por next/font: sin peticion a un CDN y sin salto de layout.
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', display: 'swap' })
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cobertura Clara — estimador de copago',
  description:
    'Agente que sugiere la especialidad segun tu sintoma y estima tu copago con datos ficticios de demostracion.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c3b47',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-EC" className={`${lexend.variable} ${sourceSans.variable}`}>
      <body className="m-0 min-h-dvh">
        <a
          href="#contenido"
          className="absolute left-3 top-[-6rem] z-50 rounded bg-primary px-4 py-3 font-semibold text-white transition-[top] focus:top-3"
        >
          Saltar al contenido principal
        </a>

        <div className="flex min-h-dvh flex-col">
          <header className="border-b border-line bg-card">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded bg-ink text-white"
                  aria-hidden="true"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </span>
                <span>
                  <span className="block font-heading text-lg font-semibold tracking-tight text-strong">
                    Cobertura Clara
                  </span>
                  <span className="block text-[0.8125rem] text-muted">
                    Estimador de copago y cobertura
                  </span>
                </span>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full border border-warn bg-warn-soft px-3 py-2 text-[0.8125rem] font-semibold leading-tight text-warn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                Datos ficticios de demostracion
              </span>
            </div>
          </header>

          <main
            id="contenido"
            tabIndex={-1}
            className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 pt-8 max-sm:px-4 max-sm:pb-12 max-sm:pt-6"
          >
            {children}
          </main>

          <footer className="mt-auto bg-ink text-[#e0f7fa]">
            <div className="mx-auto grid w-full max-w-5xl gap-4 px-5 py-8 text-[0.9375rem] md:grid-cols-2 md:gap-8">
              <p className="m-0">
                Esta herramienta no emite diagnosticos ni autorizaciones. El monto mostrado es una
                estimacion con datos ficticios, no una factura.
              </p>
              <p className="m-0">
                Ante una emergencia, llama al <strong className="text-white">ECU 911</strong> o acude
                a emergencias del centro de salud mas cercano.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
