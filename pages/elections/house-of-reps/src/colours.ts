import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export const partyColourMapping: Record<string,string> = {
    ALP:    '#e01f2f',
    LP:     '#0a52bd',
    LNP:    '#0a52bd',
    GRN:    '#51a702',
    GVIC: '#51a702',
    ON:     '#c75300',
    IND:    '#757575',
    NP:     '#007056',
    CYA:    '#cc8500',
    FFPA:   '#0e80a0',
    KAP:    '#814b41',
}

export const FALLBACK_COLOUR = '#848484';

export function partyColour(partyAbbr: string, fallback?: string): string {
    return partyColourMapping[partyAbbr] ?? (fallback ?? FALLBACK_COLOUR);
}

export function darken(colour: string, k: number): string {
    const hsl = d3.hsl(colour);
    return hsl.darker(k).toString()
}

export function lighten(colour: string, k: number): string {
    const hsl = d3.hsl(colour);
    return hsl.brighter(k).toString()
}

export function labelColour(colour: string, whiteColour?: string|null): string {
    const hsl = d3.cubehelix(colour);
    return hsl.l > 0.5 ? 'black' : whiteColour ?? 'white';
}
