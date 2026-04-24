import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { fetchCompressedFile } from "../../../common/modules/compression.js";

type State = 'ACT'|'NSW'|'NT'|'QLD'|'SA'|'TAS'|'VIC'|'WA';

export interface ElectionResults {
    year: number;
    electorates: ElectorateResult[];
}

export interface ElectorateResult {
    state: State;
    name: string;
    results: RoundResult[][];
    candidates: Candidate[]
}

export interface Candidate {
    given_name: string;
    surname: string;
    party_name: string;
    party_abbr: string;
    elected: boolean;
    incumbent: boolean;
    ballot_id: number;
}

export interface RoundResult {
    candidate: Candidate;
    round: number;
    count: number;
    percentage: number;
    change: number;
}

export async function fetch_data() {
    let text = await fetchCompressedFile('./data/2025-federal-election.csv.gz');
    if (!text) {
        console.error('failed to fetch or decompress file');
        return;
    }
    
    // remove the extra header row
    text = text.replace(/^[^\r\n]+\r?\n/, '');

    const electorates = d3.flatGroup(d3.csvParse(text), d => d.StateAb, d => d.DivisionNm);

    const election_results: ElectionResults = {
        year: 2025,
        electorates: electorates.map((d): ElectorateResult => {
            const candidates = d3.flatGroup(d[2], d => d.BallotPosition)
                .map(d => ({
                    given_name: d[1]?.[0]?.GivenNm ?? '',
                    surname: d[1]?.[0]?.Surname ?? '',
                    party_name: d[1]?.[0]?.PartyNm ?? '',
                    party_abbr: d[1]?.[0]?.PartyAb ?? '',
                    ballot_id: parseInt(d[1]?.[0]?.BallotPosition ?? ''),
                    elected: d[1]?.[0]?.Elected === 'Y',
                    incumbent: d[1]?.[0]?.HistoricElected === 'Y',
                }));

            const results: RoundResult[][] = [];
            const rawResults = d3.group(d[2], d => parseInt(d.CountNumber??''), d => parseInt(d.BallotPosition??''));
            rawResults.forEach((d, round) => {
                const round_results: RoundResult[] = [];

                d.forEach((d, ballot_id) => {
                    const candidate = candidates.find(c => c.ballot_id === ballot_id);
                    if (!candidate) throw new Error(`Failed to find candidate for ballot id ${ballot_id}`)
                    round_results.push({
                        round: round,
                        candidate: candidate,
                        count: parseInt(d.find(d => d.CalculationType === 'Preference Count')?.CalculationValue ?? ''),
                        percentage: parseFloat(d.find(d => d.CalculationType === 'Preference Percent')?.CalculationValue ?? ''),
                        change: parseInt(d.find(d => d.CalculationType === 'Transfer Count')?.CalculationValue ?? ''),
                    })
                })

                results.push(round_results)
            });

            return {
                state: d[0] as State,
                name: d[1] ?? '',
                candidates: candidates,
                results: results,
            }
        }),
    }

    console.log(election_results);
    return election_results;
}
