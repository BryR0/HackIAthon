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

  await page.getByLabel('Describe tu sintoma').fill('me pica la piel hace dias')
  await page.getByRole('button', { name: 'Sugerir especialidad' }).click()

  await expect(page.getByText('Confirma la especialidad')).toBeVisible()
  // Un submit nativo habria anadido "?" y recargado.
  expect(page.url()).toBe(urlBefore)
})
