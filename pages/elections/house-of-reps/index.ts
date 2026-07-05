import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { fetchData, type ElectionResults, type ElectorateResult } from "./src/data-processing.js";
import { HousePreferenceFlowVisualisation } from "./src/visualisation.js";
import { setURLParam } from "../../common/modules/url.js";

interface SourceFile {
    'Federal Elections': {[key: string]: string};
    'Federal By-Elections': {[key: string]: string};
    [key: string]: {[key: string]: string};
}

const electorateSelect = d3.select(document.querySelector('select#electorate') as HTMLInputElement);
const electionSelect = d3.select(document.querySelector('select#election') as HTMLInputElement);

const figure: HTMLElement|null = document.querySelector('figure#visualisation');
console.assert(figure != null, 'Failed to find figure element.');
if (!figure) throw new Error('Failed to find figure element.');

const vis = new HousePreferenceFlowVisualisation(figure);

d3.select(document.querySelector('button#download-svg') as SVGSVGElement)
    .on('click', () => vis.download(`HoR_Preference_Flows-${vis.data?.name}-${vis.data?.year}`));

d3.select(document.querySelector('button#download-png') as SVGSVGElement)
    .on('click', () => vis.download(`HoR_Preference_Flows-${vis.data?.name}-${vis.data?.year}`, 'png'));

d3.select(document.querySelector('button#download-png-high') as SVGSVGElement)
    .on('click', () => vis.download(`HoR_Preference_Flows-${vis.data?.name}-${vis.data?.year}`, 'png', 5000));

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        election: params.get('election'),
        type: params.get('type'),
        electorate: params.get('electorate'),
    }
}

function loadElection(results?: ElectionResults | null) {
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

    const sourceMap = Object.entries(sources).map(([type, entries]) => ({
        label: type,
        elections: Object.entries(entries)
            .map(([election, source]) => ({ type: type, election: election, source }))
            .sort((a, b) => b.election.localeCompare(a.election))
    }));

    const params = getQueryParams();

    electionSelect
        .on('change', async (e: Event) => {
            const value = (e.target as HTMLSelectElement).value ?? '';
            const [group, election] = value.split('|');

            const source = sources[group??'']?.[election??''];
            if (!source) throw new Error(`no source for ${group}.${election}`);
            setURLParam('election', election??null);
            setURLParam('type', group??null);
            loadElection(await fetchData(source, election??''));
        })
        .selectAll('optgroup')
            .data(sourceMap, d => (d as typeof sourceMap[number]).label)
            .join('optgroup')
            .attr('label', d => d.label)
        .selectAll('option')
            .data(d => d.elections, (d) => (d as typeof sourceMap[number]["elections"][number]).election)
            .join('option')
            .order()
            .attr('value', d => `${d.type}|${d.election}`)
            .text(d => `${d.election}`)
            .filter(d => d.election === params.election)
            .attr('selected', true);

    electionSelect.node()?.dispatchEvent(new Event('change'));
}

main()