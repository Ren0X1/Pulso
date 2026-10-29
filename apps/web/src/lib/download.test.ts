import { describe, expect, it } from 'vitest'
import { launcherDownload, shouldOfferLauncher } from './download.ts'

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

const ASSETS = [
  { name: 'latest.json', browser_download_url: 'https://gh/latest.json' },
  { name: 'Pulso_3.2.101_x64-setup.exe', browser_download_url: 'https://gh/setup.exe' },
  { name: 'Pulso_3.2.101_x64-setup.exe.sig', browser_download_url: 'https://gh/setup.exe.sig' },
  { name: 'Pulso_3.2.101_amd64.deb', browser_download_url: 'https://gh/pulso.deb' },
  { name: 'Pulso_3.2.101_amd64.AppImage', browser_download_url: 'https://gh/pulso.AppImage' },
]

describe('shouldOfferLauncher', () => {
  it('sí en el navegador de un ordenador', () => {
    expect(shouldOfferLauncher({ inLauncher: false, ua: WIN, coarsePointer: false })).toBe(true)
  })

  it('nunca dentro del propio launcher', () => {
    expect(shouldOfferLauncher({ inLauncher: true, ua: WIN, coarsePointer: false })).toBe(false)
  })

  it('nunca en el móvil o la tablet', () => {
    expect(shouldOfferLauncher({ inLauncher: false, ua: ANDROID, coarsePointer: true })).toBe(false)
    expect(shouldOfferLauncher({ inLauncher: false, ua: IPHONE, coarsePointer: true })).toBe(false)
    expect(shouldOfferLauncher({ inLauncher: false, ua: LINUX, coarsePointer: true })).toBe(false)
  })
})

describe('launcherDownload', () => {
  it('Windows: el instalador .exe (no la firma)', () => {
    expect(launcherDownload(WIN, ASSETS)).toEqual({ os: 'Windows', files: [{ label: 'Descargar', url: 'https://gh/setup.exe' }] })
  })

  it('Linux: AppImage y .deb', () => {
    expect(launcherDownload(LINUX, ASSETS)).toEqual({
      os: 'Linux',
      files: [
        { label: 'Descargar AppImage', url: 'https://gh/pulso.AppImage' },
        { label: '.deb', url: 'https://gh/pulso.deb' },
      ],
    })
  })

  it('macOS u otro sistema: no hay versión', () => {
    expect(launcherDownload(MAC, ASSETS)).toBeNull()
  })

  it('si GitHub no contesta o falta el instalador, enlaza a la página de la última versión', () => {
    const page = { label: 'Descargar', url: 'https://github.com/Ren0X1/Pulso/releases/latest' }
    expect(launcherDownload(WIN, [])).toEqual({ os: 'Windows', files: [page] })
    expect(launcherDownload(LINUX, [{ name: 'latest.json', browser_download_url: 'x' }])).toEqual({ os: 'Linux', files: [page] })
  })
})
