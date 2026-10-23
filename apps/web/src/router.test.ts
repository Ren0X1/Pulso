import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { router } from './router.tsx'

function lazyRoutes(routes: RouteObject[], out: RouteObject[] = []): RouteObject[] {
  for (const r of routes) {
    if (r.lazy) out.push(r)
    if (r.children) lazyRoutes(r.children, out)
  }
  return out
}

describe('rutas con carga diferida', () => {
  it('cada pantalla se descarga y trae su componente', async () => {
    const routes = lazyRoutes(router.routes as RouteObject[])
    expect(routes.length).toBe(12)
    for (const route of routes) {
      const loaded = await (route.lazy as () => Promise<{ Component?: unknown }>)()
      expect(typeof loaded.Component, route.path ?? 'inicio').toBe('function')
    }
  })
})
