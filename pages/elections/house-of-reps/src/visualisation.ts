import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { Visualisation } from "../../../common/modules/visualisation.js";
import type { ElectorateResult } from "./data-processing.js";

export class HousePreferenceFlowVisualisation extends Visualisation<ElectorateResult> {
    constructor(container: HTMLElement) {
        super(container);

        d3.select(this.svg)
            .style('min-width', '40rem')
            .style('min-height', '20rem')
            .style('max-height', '50rem')
            .style('width', '100%')
            .style('height', '100%')
    }

    update(this: HousePreferenceFlowVisualisation, data?: ElectorateResult) {
        this.data = data;
    }

    draw(this:HousePreferenceFlowVisualisation) {
        console.log('drawing!!!');

        d3.select(this.svg)
            .style('background-color', 'antiquewhite')
            .append('circle')
                .attr('cx', 50)
                .attr('cy', 50)
                .attr('r', 40)
    }
}
