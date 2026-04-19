// import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export abstract class Visualisation<T> {
    readonly _container: HTMLElement;
    readonly svg: SVGSVGElement;
    readonly resize_observer: ResizeObserver;

    w: number = 0;
    h: number = 0;

    data: T|undefined;

    constructor(container: HTMLElement) {
        this._container = container;
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        container.append(this.svg);


        this.resize_observer = new ResizeObserver((entries, _observer) => {
            entries.forEach(e => {
                this.w = e.contentRect.width;
                this.h = e.contentRect.height;

                console.log(this.w, this.h);
                // d3.select(this.svg)
                //     .attr('width', `${this.w}`)
                //     .attr('height', `${this.h}`);

                this.draw();
            });
        });

        this.resize_observer.observe(this.svg);
    }



    abstract update(this: Visualisation<T>, data?: T): void;
    abstract draw(this:Visualisation<T>): void;
}
