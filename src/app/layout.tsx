import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cobertura Clara — estimador de copago',
  description:
    'Agente que sugiere la especialidad segun tu sintoma y estima tu copago con datos ficticios de demostracion.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e7490',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-EC">
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido principal
        </a>

        <div className="app-shell">
          <header className="app-header">
            <div className="app-header__inner brand">
              <p className="brand__name">Cobertura Clara</p>
              <span className="badge-demo">Datos ficticios de demostracion</span>
            </div>
          </header>

          <main className="app-main" id="contenido" tabIndex={-1}>
            {children}
          </main>

          <footer className="app-footer">
            <div className="app-footer__inner">
              <p>
                Esta herramienta no emite diagnosticos ni autorizaciones. El monto mostrado es una
                estimacion con datos ficticios, no una factura.
              </p>
              <p>
                Ante una emergencia, llama al <strong>ECU 911</strong> o acude a emergencias del
                centro de salud mas cercano.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
