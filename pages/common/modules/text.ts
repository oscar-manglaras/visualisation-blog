import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sizeText(selection: d3.Selection<d3.BaseType|SVGTextElement,any,d3.BaseType,unknown>, maxWidth: number) {
    return selection
        .attr('textLength', (_,i,n) => {
            const node = n[i]!;

            let width: number|null;

            if (node instanceof SVGTextElement || node instanceof SVGTSpanElement) {
                if (node.getAttribute('textLength')) return node.getAttribute('textLength');
                width = (node.getBBox().width ?? 0) > maxWidth ? maxWidth : null;

            } else
                width = null;

            return width;
        })
        .attr('lengthAdjust', 'spacingAndGlyphs');
}
