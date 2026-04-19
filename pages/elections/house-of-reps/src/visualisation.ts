import type { ElectorateResult } from "./data-processing.js";

export function draw_visualisation(_html: HTMLElement, electorate?: ElectorateResult) {
    if (!electorate) return;
    console.log(electorate);
}
