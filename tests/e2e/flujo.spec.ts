import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Recorridos de extremo a extremo (Blueprint seccion 4).
 *
 * Corre contra el servidor real con AI_PROVIDER=local, asi que la
 * clasificacion es determinista y estos casos no dependen de la red.
 */

async function asegurarModalAbierto(page: Page) {
  const modal = page.locator('#consulta-flujo')
  if (!(await modal.isVisible())) {
    const btn = page.getByRole('button', { name: 'Iniciar consulta ahora' })
    if (await btn.isVisible()) {
      await btn.click()
      await expect(modal).toBeVisible()
    }
  }
}

async function describirSintoma(page: Page, texto: string) {
  await asegurarModalAbierto(page)
  await page.getByLabel('Describe tu sintoma').fill(texto)
  await page.getByRole('button', { name: 'Sugerir especialidad' }).click()
}

async function elegirPaciente(page: Page, patientDemoId: string) {
  await asegurarModalAbierto(page)
  await page.getByLabel('Paciente de demostracion').selectOption(patientDemoId)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('ruta feliz: sintoma claro produce copago y comparacion', async ({ page }) => {
  await elegirPaciente(page, 'ANA-PLUS')
  await describirSintoma(page, 'tengo una mancha en la piel que no se va hace tres semanas')

  await expect(page.getByText('Confirma la especialidad')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Dermatologia')

  await page.getByRole('button', { name: 'Calcular mi copago' }).click()

  await expect(page.getByText('Tu copago estimado')).toBeVisible()
  // Caso GC-01: 6505 al 70 % deja 1951 en Centro Medico Pacifico.
  // es-EC formatea con coma decimal: $19,51.
  await expect(page.getByText('$19,51').first()).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByText('Mas economico')).toBeVisible()
})

test('emergencia: bloquea calculo y comparacion', async ({ page }) => {
  await describirSintoma(page, 'me duele fuerte el pecho y me falta el aire')

  const aviso = page.getByRole('alert', { name: 'Esto puede ser una emergencia' })
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('ECU 911')

  // Cero rastro de dinero o de eleccion de especialidad.
  await expect(page.getByRole('button', { name: 'Calcular mi copago' })).toHaveCount(0)
  await expect(page.getByText('Tu copago estimado')).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('no cubierto: explica la regla sin prometer cobertura', async ({ page }) => {
  await elegirPaciente(page, 'BRUNO-BASICO')
  await describirSintoma(page, 'tengo mucha ansiedad y no puedo dormir hace semanas')
  await page.getByRole('button', { name: 'Calcular mi copago' }).click()

  await expect(page.getByText('Tu plan no cubre esta consulta')).toBeVisible()
  await expect(page.getByText('Tu copago estimado')).toHaveCount(0)
})

test('sintoma ambiguo: una pregunta y seleccion manual', async ({ page }) => {
  await describirSintoma(page, 'me siento mal')

  await expect(page.getByText('Necesitamos un dato mas')).toBeVisible()
  await page.getByLabel('O elige la especialidad tu mismo').selectOption({ label: 'Dermatologia' })
  await page.getByRole('button', { name: 'Continuar con esta especialidad' }).click()

  await expect(page.getByText('Tu copago estimado')).toBeVisible()
})

test('sin hospitales compatibles: no deja pantalla vacia', async ({ page }) => {
  await elegirPaciente(page, 'BRUNO-BASICO')
  await describirSintoma(page, 'veo borroso de lejos y me arden los ojos')
  await page.getByRole('button', { name: 'Calcular mi copago' }).click()

  await expect(page.getByText('Ningun hospital de tu red puede atender esto hoy')).toBeVisible()
  await expect(page.getByText('Siguiente paso')).toBeVisible()
})

test('entrada invalida: el foco va al resumen de errores', async ({ page }) => {
  await asegurarModalAbierto(page)
  await page.getByLabel('Describe tu sintoma').fill('ay')
  await page.getByRole('button', { name: 'Sugerir especialidad' }).click()

  const resumen = page.getByRole('alert', { name: 'Revisa lo siguiente' })
  await expect(resumen).toBeVisible()
  await expect(resumen).toBeFocused()
})

test('el flujo completo funciona solo con teclado', async ({ page }) => {
  await page.keyboard.press('Tab') // skip link
  await expect(page.getByRole('link', { name: 'Saltar al contenido principal' })).toBeFocused()

  await asegurarModalAbierto(page)
  await page.getByLabel('Describe tu sintoma').focus()
  await page.keyboard.type('me torci el tobillo jugando y sigue hinchado')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')

  await expect(page.getByText('Confirma la especialidad')).toBeVisible()
})

test('el rotulo de datos ficticios esta siempre visible', async ({ page }) => {
  await expect(page.getByText('Datos ficticios de demostracion')).toBeVisible()
  await describirSintoma(page, 'me duele la rodilla al subir escaleras')
  await expect(page.getByText('Datos ficticios de demostracion')).toBeVisible()
})

test('no hay scroll horizontal en ningun ancho objetivo', async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, `scroll horizontal a ${width}px`).toBe(false)
  }
})

test('accesibilidad automatizada: inicio y resultado sin violaciones', async ({ page }) => {
  const inicio = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(inicio.violations).toEqual([])

  await elegirPaciente(page, 'ANA-PLUS')
  await describirSintoma(page, 'tengo una mancha en la piel que no se va')
  await page.getByRole('button', { name: 'Calcular mi copago' }).click()
  await expect(page.getByText('Tu copago estimado')).toBeVisible()

  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(resultado.violations).toEqual([])
})
