import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { fetchCompressedFile } from "../../../common/modules/compression.js";

type State = 'ACT'|'NSW'|'NT'|'QLD'|'SA'|'TAS'|'VIC'|'WA';

type KeyedStringObject = {
    [x: string]: string
}

export interface ElectionResults {
    election: string;
    electorates: ElectorateResult[];
}

export interface ElectorateResult {
    year: string;
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
    change: number;
}

export async function fetchData(source: string, electionLabel: string): Promise<ElectionResults|null> {
    const fileContents = await fetchCompressedFile(source);
    if (!fileContents) {
        console.error('failed to fetch or decompress file');
        return null;
    }

    // remove the extra header row
    const _header = fileContents.split(/\r?\n/, 1)[0];
    const csvBody = fileContents.replace(/^[^\r\n]+\r?\n/, '');

    return processElections(normaliseRows(csvBody), electionLabel);
}

const byElectionHeaders: (string|string[])[] = [
    'StateAb', 'DivisionNm', ['CountNumber', 'CountNum'],
    'BallotPosition', 'Surname', 'GivenNm','PartyAb', 'PartyNm',
    ['Elected', 'SittingMemberFl'], 'HistoricElected'
];

// Returns accessor functions for the columns we care about in the csv files.
// For use with d3 group/rollup/etc functions.
function getAccessors() {
    return byElectionHeaders.map(header => {
        if (typeof header === 'string')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (d: any) => d[header];

        if (Array.isArray(header))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (d: any) => d[header.find(h => d[h] !== undefined)??'']

        return () => null;
    })
}

function getCannonicalHeaders() {
    return byElectionHeaders.map(h => typeof h === 'string' ? h : h[0]);
}

// Normalises the names of different column headers in the csv files,
// and reduces the vote counts and transfers to single values.
function normaliseRows(csvText: string) {
    const csv = d3.csvParse(csvText);
    const r = d3.flatRollup(csv, D => ({
                voteTotal: d3.sum(D.filter(d => d.CalculationType === 'Preference Count'),
                                    d => parseInt(d.CalculationValue??'') ?? 0),
                voteTransfer: d3.sum(D.filter(d => d.CalculationType === 'Transfer Count'),
                                    d => parseInt(d.CalculationValue??'') ?? 0),
            }),
            ...getAccessors()
        ).map((row) => {
            let o: KeyedStringObject = {};
            row.forEach((v,i) => {
                const header = getCannonicalHeaders()[i];

                // columns with indices beyond the header array contain the rolled-up vote counts.
                if (!header) {
                    o = {...o, ...v}
                } else {
                    o[getCannonicalHeaders()[i]??'votes'] = v;
                }
            })
            return o;
        });

    return r;
}

function processElections(data: KeyedStringObject[], electionLabel: string) {
    const electorates = d3.flatGroup(data, d => d.StateAb, d => d.DivisionNm);

    const election_results: ElectionResults = {
        election: electionLabel,
        electorates: electorates.map((d): ElectorateResult => {
            const candidates = d3.flatGroup(d[2], d => d.BallotPosition)
                .map(d => ({
                    given_name: d[1]?.[0]?.GivenNm ?? '',
                    surname: d[1]?.[0]?.Surname ?? '',
                    party_name: d[1]?.[0]?.PartyNm ?? '',
                    party_abbr: d[1]?.[0]?.PartyAb ?? '',
                    ballot_id: parseInt(d[1]?.[0]?.BallotPosition ?? ''),
                    elected: (d[1]?.[0]?.Elected ?? d[1]?.[0]?.SittingMemberFl) === 'Y',
                    incumbent: d[1]?.[0]?.HistoricElected === 'Y',
                }));

            const results: RoundResult[][] = [];
            const rawResults = d3.group(d[2], d => parseInt(d.CountNumber??''), d => parseInt(d.BallotPosition??''));
            rawResults.forEach((rawRoundResults, round) => {
                const roundResults: RoundResult[] = [];

                rawRoundResults.forEach((rawCandidateResult, ballot_id) => {
                    if (rawCandidateResult.length > 1) throw new Error(`multiple rows found for round ${round} and ballot id ${ballot_id}`);
                    const candidateResultRow = rawCandidateResult[0];
                    const candidate = candidates.find(c => c.ballot_id === ballot_id);

                    if (!candidate) throw new Error(`Failed to find candidate for ballot id ${ballot_id}`)
                    roundResults.push({
                        round: round,
                        candidate: candidate,
                        count: parseInt(candidateResultRow?.voteTotal??'') ?? 0,
                        change: parseInt(candidateResultRow?.voteTransfer??'') ?? 0,
                    })
                })

                results.push(roundResults)
            });

            // Ensure that the round results are actually in the correct order
            // (the order is determined by the iterator on the map returned by d3.group, which is not sorted)
            results.sort((a,b) => (a[0]?.round ?? 0) - (b[0]?.round ?? 0))

            return {
                year: electionLabel,
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
