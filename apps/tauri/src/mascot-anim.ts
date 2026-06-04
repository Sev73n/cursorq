/** 3 组动作 × 6 帧，每帧 0.5s，播完切下一组 */
const STRIPS = [
  "/mascot/action-0-strip.png",
  "/mascot/action-1-strip.png",
  "/mascot/action-2-strip.png",
] as const;

const FRAMES = 6;
const FRAME_MS = 500;
const ACTION_MS = FRAMES * FRAME_MS;

export function startMascotActionCycle(el: HTMLElement | null) {
  if (!el) return;
  let action = 0;

  const apply = () => {
    el.style.backgroundImage = `url(${STRIPS[action]})`;
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = `pixel-mascot-play ${ACTION_MS}ms steps(${FRAMES}) infinite`;
  };

  apply();
  window.setInterval(() => {
    action = (action + 1) % STRIPS.length;
    apply();
  }, ACTION_MS);
}
