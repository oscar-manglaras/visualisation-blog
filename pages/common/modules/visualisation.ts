import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export interface VisualisationOptions {
    background_colour?: string;
    aspect?: number;
    w?: number|string;
    h?: number|string;
    max_w?: number|string;
    min_w?: number;
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
                const min_w = options?.min_w ?? -1;

                this.w = e.contentRect.width >= (min_w ?? -1) ?
                    e.contentRect.width : (min_w ?? 0);

                if (options?.aspect && !options.h){
                    this.h = this.w * options.aspect;
                    d3.select(this.svg)
                        .attr('height', e.contentRect.width < (min_w ?? -1)
                                            ? e.contentRect.width * options.aspect
                                            : this.h);
                } else {
                    this.h = e.contentRect.height;
                }

                d3.select(this.svg)
                    .attr('viewBox', e.contentRect.width < (min_w ?? -1) ? `0 0 ${this.w} ${this.h}` : null);

                this.resize();
            });
        });

        this.update_options(options);
        this.resize_observer.observe(this.svg);
    }

    toXMLString(this: Visualisation<T>): string {
        const svg = d3.select(this.svg)
            .clone(true)
            .attr('viewBox', `0 0 ${this.w} ${this.h}`)
            .attr('width', this.w)
            .attr('height', this.h)
            .style('font-family', 'Atkinson Hyperligible Next,Atkinson Hyperlegible,Gill Sans,Sans-Serif')
            .style('background-color', 'white');

        const node = svg.node()!;
        const xmlSerializer = new XMLSerializer();

        const string = xmlSerializer.serializeToString(node);

        svg.remove();
        return string;
    }

    toBlob(this: Visualisation<T>): Blob {
        return new Blob([this.toXMLString()], { type: 'image/svg+xml' });
    }

    private async loadImage(this: Visualisation<T>): Promise<HTMLImageElement> {
        const svgURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.toXMLString())}`;

        const img = new Image(this.w, this.h);
        img.src = svgURL;
        return new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = reject;
        })
    }

    async toImage(this: Visualisation<T>, format: 'png'|'jpeg', scaling?: number): Promise<Blob> {
        const img = await this.loadImage();
        scaling = scaling ?? 1;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth * scaling;
        canvas.height = img.naturalHeight * scaling;
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);

        let cb: (blob: Blob) => void, err: () => void;
        const promise = new Promise<Blob>((resolve, reject) => {
            cb = resolve;
            err = reject;
        });

        canvas.toBlob((blob) => blob ? cb(blob) : err(), `image/${format}`, 1);
        return promise;
    }

    async download(this: Visualisation<T>, name?: string, format?: 'svg'|'png'|'jpeg', minYRes?: number): Promise<void> {
        format = format ?? 'svg';

        let blob: Blob;
        if (format === 'svg') {
            blob = this.toBlob();
        } else {
            const scaling = Math.max(1, (minYRes ?? 2000) / this.h);
            blob = await this.toImage(format, scaling);
        }

        if (!blob) return;

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = name ?? document.title;

        document.body.appendChild(a);
        a.style.display = 'none';
        a.click();

        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    print(this: Visualisation<T>): void {
        const url = URL.createObjectURL(this.toBlob());
        const newWindow = window.open(url, '_blank');
        if (newWindow)
            newWindow.onload = () => {
                newWindow.print();
                window.URL.revokeObjectURL(url);
            };
        else
            window.URL.revokeObjectURL(url);
    }

    update_options(this: Visualisation<T>, options?: VisualisationOptions): void {
        this.background_colour = options?.background_colour ?? null;

        d3.select(this._container)
            .style('width', options?.w ?? '')
            .style('height', options?.h ?? '')
            .style('background-color', this.background_colour ?? '');

        d3.select(this.svg)
            .style('background-color', this.background_colour ?? '');
    }

    abstract resize(this: Visualisation<T>): void;
    abstract updateData(this: Visualisation<T>, data?: T): void;
    abstract draw(this:Visualisation<T>): void;
}
