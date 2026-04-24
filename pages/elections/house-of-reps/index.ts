import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { fetch_data, type ElectionResults, type ElectorateResult } from "./src/data-processing.js";
import { HousePreferenceFlowVisualisation } from "./src/visualisation.js";
import { setURLParam } from "../../common/modules/url.js";

interface SourceFile {
    federal_elections: {[key: string]: string};
}

const electorateSelect = d3.select(document.querySelector('select#electorate') as HTMLInputElement);
const electionSelect = d3.select(document.querySelector('select#election') as HTMLInputElement);

const figure: HTMLElement|null = document.querySelector('figure#visualisation');
console.assert(figure != null, 'Failed to find figure element.');
if (!figure) throw new Error('Failed to find figure element.');

const vis = new HousePreferenceFlowVisualisation(figure);

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        election: params.get('election'),
        electorate: params.get('electorate'),
    }
}

function loadElection(results?: ElectionResults) {
    const electorates_by_state = d3.group(results?.electorates ?? [], d => d.state);

    function updateVis(electorate?: string): void {
        setURLParam('electorate', electorate?.toLowerCase() ?? null)
        if (results)
            vis.updateData( results.electorates.find( d => d.name === electorate ), {order: '2pp'} );
    }

    const params = getQueryParams();

    electorateSelect
        .on('change', (e: Event) => updateVis((e.target as HTMLSelectElement)?.value))
        .selectAll('optgroup')
            .data(electorates_by_state)
            .join('optgroup')
            .attr('label', d => d[0])
            .sort((a, b) => a[0].localeCompare(b[0]))
        .selectAll('option')
            .data(d => d[1], d => (d as ElectorateResult).name)
            .join('option')
            .order()
            .attr('value', d => d.name)
            .text(d => d.name)
            .filter(d => d.name.toLowerCase() === params.electorate?.toLowerCase())
            .attr('selected', true);

    electorateSelect.node()?.dispatchEvent(new Event('change'));
}

async function main() {
    const sources = await d3.json('./data/sources.json') as SourceFile | null;
    if (!sources) return console.error('failed to load sources.json');

    type SourceEntry = {year: string, source: string};
    const federalElections = Object.entries(sources.federal_elections)
        .map(([year,source]): SourceEntry => ({year: year, source: source}))
        .sort((a,b) => b.year.localeCompare(a.year));

    const params = getQueryParams();

    electionSelect
        .on('change', async (e: Event) => {
            const year = (e.target as HTMLSelectElement).value ?? '';
            const source = sources.federal_elections[year];
            if (!source) throw new Error(`no source for federal_elections.${year}`);
            setURLParam('election', year);
            loadElection(await fetch_data(source, year));
        })
        .selectAll('option')
        .data(federalElections, (d) => (d as SourceEntry)?.year)
        .join('option')
        .order()
        .attr('value', d => d.year)
        .text(d => `${d.year} federal election`)
        .filter(d => d.year === params.election)
        .attr('selected', true);

    electionSelect.node()?.dispatchEvent(new Event('change'));
}

main()