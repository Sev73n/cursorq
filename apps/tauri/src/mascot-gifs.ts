import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const BUNDLED_PLACEHOLDER = "/mascot/default.png";
const CAROUSEL_START_MS = 60_000;
const CAROUSEL_INTERVAL_MS = 5_000;

let fileUrls: string[] = [];
let fileNames: string[] = [];
let index = 0;
let carouselStarted = false;
let carouselInterval: ReturnType<typeof setInterval> | null = null;
let carouselStartTimer: ReturnType<typeof setTimeout> | null = null;

function mascotImg(): HTMLImageElement | null {
  return document.getElementById("mascotGif") as HTMLImageElement | null;
}

async function placeholderSrc(): Promise<string> {
  try {
    const p = await invoke<string | null>("mascot_placeholder_path");
    if (p) return convertFileSrc(p);
  } catch {
    /* dev fallback */
  }
  return BUNDLED_PLACEHOLDER;
}

async function showPlaceholder(): Promise<void> {
  const img = mascotImg();
  if (!img) return;
  img.src = await placeholderSrc();
}

async function gifSrcAt(i: number): Promise<string | null> {
  const name = fileNames[i];
  if (!name) return null;
  try {
    const p = await invoke<string>("mascot_gif_path", { name });
    return convertFileSrc(p);
  } catch {
    return null;
  }
}

async function showAt(i: number): Promise<void> {
  const img = mascotImg();
  if (!img || !fileNames.length) return;
  index = ((i % fileNames.length) + fileNames.length) % fileNames.length;
  const src = await gifSrcAt(index);
  if (src) img.src = src;
}

async function reloadGifList(): Promise<void> {
  try {
    const files = await invoke<string[]>("list_mascot_gifs");
    fileNames = files;
    fileUrls = files;
  } catch {
    fileNames = [];
    fileUrls = [];
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
  if (!fileNames.length) {
    await showPlaceholder();
    return;
  }
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
  await showPlaceholder();
  await reloadGifList();
  scheduleAutoCarousel();
}

export async function reloadMascotGifsAfterContentUpdate(): Promise<void> {
  const was = carouselStarted;
  stopCarouselInterval();
  await reloadGifList();
  if (was && fileNames.length) {
    await showAt(index);
    if (fileNames.length >= 2) {
      carouselInterval = setInterval(() => {
        void showAt(index + 1);
      }, CAROUSEL_INTERVAL_MS);
    }
  } else if (!fileNames.length) {
    await showPlaceholder();
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
