// Every screen owns its own markup as a co-located `*.html` file, imported as
// a raw string (`import html from './thing.html?raw'`) and injected here on
// first show — keeps index.html down to app-chrome only. Each screen module
// still follows the existing wired-flag convention (guard mountPartial +
// event wiring together, on the first show* call), so this is intentionally
// just the injection primitive, not a new page lifecycle.
export function mountPartial(html: string): void {
  document.getElementById('page-mounts')!.insertAdjacentHTML('beforeend', html);
}
