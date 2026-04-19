import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { fetch_data } from "./src/data-processing.js";

const selected_electorate = d3.select('select#electorate');

async function main() {
    const results = await fetch_data();
    const electorates_by_state = d3.group(results.electorates, d => d.state);

    selected_electorate
        .selectAll('optgroup')
            .data(electorates_by_state)
            .join('optgroup')
            .attr('label', d => d[0])
            .sort((a, b) => a[0].localeCompare(b[0]))
        .selectAll('option')
            .data(d => d[1])
            .join('option')
            .attr('value', d => d.name)
            .text(d => d.name)
}

main()