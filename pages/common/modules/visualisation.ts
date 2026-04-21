import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export interface VisualisationOptions {
    background_colour?: string;
    w?: number|string;
    h?: number|string;
    max_w?: number|string;
    max_h?: number|string;
    min_w?: number|string;
    min_h?: number|string;
}

export abstract class Visualisation<T> {
    readonly _container: HTMLElement;
    readonly svg: SVGSVGElement;
    readonly resize_observer: ResizeObserver;

    background_colour: string|null = null;

    w: number = 0;
    h: number = 0;

    data: T|undefined;

    constructor(container: HTMLElement, options?: VisualisationOptions) {
        this._container = container;
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        container.append(this.svg);

        this.resize_observer = new ResizeObserver((entries, _observer) => {
            entries.forEach(e => {
                this.w = e.contentRect.width;
                this.h = e.contentRect.height;

                this.resize();
            });
        });

        this.update_options(options);
        this.resize_observer.observe(this.svg);
    }

    update_options(this: Visualisation<T>, options?: VisualisationOptions): void {
        this.background_colour = options?.background_colour ?? null;

        d3.select(this._container)
            .style('width', options?.w ?? '')
            .style('height', options?.h ?? '')
            .style('max-height', options?.max_h ?? '')
            .style('background-color', this.background_colour ?? '');

        d3.select(this.svg)
            .style('min-width', options?.min_w ?? '')
            .style('min-height', options?.min_h ?? '')
            .style('max-width', options?.max_w ?? '')
            .style('max-height', options?.max_h ?? '')
            .style('width', '100%')
            .style('height', '100%')
            .style('background-color', this.background_colour ?? '');
    }

    abstract resize(this: Visualisation<T>): void;
    abstract updateData(this: Visualisation<T>, data?: T): void;
    abstract draw(this:Visualisation<T>): void;
}
