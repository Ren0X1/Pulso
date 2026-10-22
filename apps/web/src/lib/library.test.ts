import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, parseLibraryParams, toSearchParams } from './library.ts'

const parse = (query: string) => parseLibraryParams(new URLSearchParams(query))

describe('parseLibraryParams', () => {
  it('valores por defecto', () => {
    expect(parse('')).toEqual({ status: null, favorite: false, tag: null, q: '', sort: 'added', view: 'grid', page: 1 })
  })

  it('lee todos los filtros', () => {
    expect(parse('estado=playing&favoritos=1&etiqueta=rpg&q=zelda&orden=name&vista=list&pagina=3')).toEqual({
      status: 'playing',
      favorite: true,
      tag: 'rpg',
      q: 'zelda',
      sort: 'name',
      view: 'list',
      page: 3,
    })
  })

  it('ignora valores que no existen en lugar de romper', () => {
    expect(parse('estado=hacking&orden=random&vista=3d&pagina=-4')).toMatchObject({
      status: null,
      sort: 'added',
      view: 'grid',
      page: 1,
    })
    expect(parse('pagina=abc').page).toBe(1)
  })

  it('recorta la búsqueda y la etiqueta', () => {
    expect(parse(`q=${'x'.repeat(200)}`).q).toHaveLength(80)
    expect(parse('etiqueta=%20%20').tag).toBeNull()
  })
})

describe('toSearchParams', () => {
  it('solo escribe lo que difiere del valor por defecto', () => {
    expect(toSearchParams({ ...parse(''), status: 'completed', page: 1 }).toString()).toBe('estado=completed')
  })

  it('ida y vuelta sin pérdidas', () => {
    const state = parse('estado=dropped&favoritos=1&etiqueta=coop&q=it&orden=playtime&vista=list&pagina=2')
    expect(parseLibraryParams(toSearchParams(state))).toEqual(state)
  })
})

describe('PAGE_SIZE', () => {
  it('pagina de 60 en 60', () => {
    expect(PAGE_SIZE).toBe(60)
  })
})
