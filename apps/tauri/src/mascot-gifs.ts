import { invoke } from "@tauri-apps/api/core";

const DEV_PLACEHOLDER_STATIC = "/mascot/default.png";
/** 启动后先显示 default.png，满 1 分钟再开始轮播 */
const CAROUSEL_START_MS = 60_000;
/** 轮播中每张动图停留 20 分钟 */
const CAROUSEL_INTERVAL_MS = 20 * 60_000;

let fileNames: string[] = [];
let index = 0;
let carouselStarted = false;
let carouselInterval: ReturnType<typeof setInterval> | null = null;
let carouselStartTimer: ReturnType<typeof setTimeout> | null = null;

function mascotImg(): HTMLImageElement | null {
  return document.getElementById("mascotGif") as HTMLImageElement | null;
}

function isViteDev(): boolean {
  return (
    location.hostname === "localhost" &&
    (location.port === "1420" || location.port === "5173")
  );
}

function loadImage(src: string): Promise<boolean> {
  const img = mascotImg();
  if (!img) return Promise.resolve(false);
  if (img.src === src || img.currentSrc === src) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  });
}

async function dataUrl(asset: string, devFallback: string): Promise<string> {
  try {
    return await invoke<string>("mascot_asset_data_url", { asset });
  } catch {
    if (isViteDev()) return devFallback;
    throw new Error(`mascot asset failed: ${asset}`);
  }
}

async function showPlaceholder(): Promise<void> {
  try {
    const src = await dataUrl("placeholder", DEV_PLACEHOLDER_STATIC);
    const ok = await loadImage(src);
    if (!ok && isViteDev()) await loadImage(DEV_PLACEHOLDER_STATIC);
  } catch {
    if (isViteDev()) await loadImage(DEV_PLACEHOLDER_STATIC);
  }
}

async function gifSrcAt(i: number): Promise<string | null> {
  const name = fileNames[i];
  if (!name) return null;
  try {
    return await dataUrl(`gif:${name}`, `/mascot/gifs/${encodeURIComponent(name)}`);
  } catch {
    return isViteDev() ? `/mascot/gifs/${encodeURIComponent(name)}` : null;
  }
}

async function showAt(i: number): Promise<void> {
  if (!fileNames.length) {
    await showPlaceholder();
    return;
  }
  index = ((i % fileNames.length) + fileNames.length) % fileNames.length;
  const src = await gifSrcAt(index);
  if (!src) {
    await showPlaceholder();
    return;
  }
  const ok = await loadImage(src);
  if (!ok) await showPlaceholder();
}

async function reloadGifList(): Promise<void> {
  try {
    fileNames = await invoke<string[]>("list_mascot_gifs");
  } catch {
    fileNames = [];
  }
}

function stopCarouselInterval(): void {
  if (carouselInterval) {
    clearInterval(carouselInterval);
    carouselInterval = null;
  }
}

async function startAutoCarousel(): Promise<void> {
  if (carouselStarted) return;
  carouselStarted = true;
  if (!fileNames.length) return;
  await showAt(index);
  if (fileNames.length < 2) return;
  stopCarouselInterval();
  carouselInterval = setInterval(() => {
    void showAt(index + 1);
  }, CAROUSEL_INTERVAL_MS);
}

function scheduleAutoCarousel(): void {
  if (carouselStartTimer) clearTimeout(carouselStartTimer);
  carouselStartTimer = setTimeout(() => {
    carouselStartTimer = null;
    void reloadGifList().then(() => startAutoCarousel());
  }, CAROUSEL_START_MS);
}

export async function initMascotGifs(): Promise<void> {
  await reloadGifList();
  await showPlaceholder();
  scheduleAutoCarousel();
}

export async function reloadMascotGifsAfterContentUpdate(): Promise<void> {
  const was = carouselStarted;
  const prevIndex = index;
  stopCarouselInterval();
  await reloadGifList();
  if (!fileNames.length) {
    await showPlaceholder();
    return;
  }
  if (!was) return;
  index = Math.min(prevIndex, fileNames.length - 1);
  if (fileNames.length >= 2) {
    carouselInterval = setInterval(() => {
      void showAt(index + 1);
    }, CAROUSEL_INTERVAL_MS);
  }
}

export async function cycleMascotGif(): Promise<void> {
  await reloadGifList();
  if (!fileNames.length) {
    await showPlaceholder();
    return;
  }
  if (!carouselStarted) {
    carouselStarted = true;
    if (carouselStartTimer) {
      clearTimeout(carouselStartTimer);
      carouselStartTimer = null;
    }
  }
  await showAt(index + 1);
}

export function mascotGifCount(): number {
  return fileNames.length;
}
