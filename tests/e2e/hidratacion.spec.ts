import { expect, test } from '@playwright/test'

/**
 * Regresion: la app debe hidratar.
 *
 * Con la hidratacion rota el formulario hace submit nativo y navega a "/?",
 * el guardrail de emergencia nunca corre y el flujo entero queda inservible,
 * pero la pagina se ve bien en una captura. Por eso se comprueba aparte.
 */

test('la pagina carga sin recursos rotos ni errores de consola', async ({ page }) => {
  const failedResources: string[] = []
  const pageErrors: string[] = []

  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`)
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  expect(failedResources).toEqual([])
  expect(pageErrors).toEqual([])
})

test('el formulario se maneja en cliente, no navega al enviar', async ({ page }) => {
  await page.goto('/')
  const urlBefore = page.url()

  await page.getByRole('button', { name: 'Iniciar consulta ahora' }).click()
  await page.getByLabel('Describe tu sintoma').fill('me pica la piel hace dias')
  await page.getByRole('button', { name: 'Sugerir especialidad' }).click()

  await expect(page.getByText('Confirma la especialidad')).toBeVisible()
  // Un submit nativo habria anadido "?" y recargado.
  expect(page.url()).toBe(urlBefore)
})

/**
 * Regresion: las utilidades de Tailwind deben llegar al navegador.
 *
 * Cuando la deteccion de fuentes de Tailwind no encuentra los .tsx, se emite
 * el preflight sin una sola utilidad y la pagina sale como texto plano. Todo
 * lo demas sigue pasando: el HTML es correcto, no hay errores de consola, y
 * axe no reporta contraste insuficiente porque negro sobre blanco cumple.
 * Por eso hace falta comprobar los estilos calculados.
 */
test('el CSS de utilidades se aplica, no solo el preflight', async ({ page }) => {
  await page.goto('/')

  const header = page.locator('header').first()
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  // max-w-5xl sobre el contenedor principal: sin utilidades seria "none".
  const maxWidth = await page
    .locator('main')
    .evaluate((el) => getComputedStyle(el).maxWidth)
  expect(maxWidth).not.toBe('none')

  // El boton primario lleva fondo del token, no el gris por defecto.
  await page.getByRole('button', { name: 'Iniciar consulta ahora' }).click()
  const buttonBackground = await page
    .getByRole('button', { name: 'Sugerir especialidad' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(buttonBackground).toBe('rgb(14, 108, 130)')
})
