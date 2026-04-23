import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { Visualisation } from "../../../common/modules/visualisation.js";
import type { Candidate, ElectorateResult } from "./data-processing.js";
import { darken, labelColour, partyColour } from "./colours.js";

interface Node {
    round: number;
    candidate: Candidate;
    votes: number;
    offset: number;

    transfers: Link[];
}

interface Link {
    source: Node;
    target: Node;
    votes: number;
}

type LabelStore = Map<Candidate,LabelY>;
type LabelY = {y: number, originalY: number}

interface LayoutOptions {
    order?: '2pp' | 'count';
}

function centerOut<T>(arr: T[]): T[] {
    const result: T[] = [];
    const n = arr.length;
    const mid = Math.floor(n / 2);
    if (!arr[mid]) return [];

    result.push(arr[mid]);

    for (let i = 1; i <= mid; i++) {
        const above = arr[mid+i];
        const below = arr[mid-i]
        if (below) result.push(below); // below
        if (above) result.push(above); // above
    }

    return result;
}

export class HousePreferenceFlowVisualisation extends Visualisation<ElectorateResult> {
    private padding = {
        left: 200, right: 140,
        top: 60, bottom: 20,
    };

    private labelSize = 12;
    private labelPadding = 4;
    private bandWidth = 20;

    private candidatePlacementOrder: Candidate[] = [];
    private nodes: Map<Candidate,Node>[] = [];
    private roundScale = d3.scaleLinear();
    private voteScale = d3.scaleLinear();
    private totalVotes = 0;
    private percentFormat = d3.format('.1%');

    private gradients = new Set<string>();

    private options: LayoutOptions = {};

    constructor(container: HTMLElement) {
        super(container, {
            min_w: '40rem', min_h: '20rem',
            max_h: '50rem',
            w: '80rem',
            background_colour: 'floralwhite',
        });

        const svg = d3.select(this.svg);

        svg.append('defs');
        svg.append('g').classed('title', true).append('text');
        svg.append('g').classed('candidates', true);
        svg.append('g').classed('links', true);
        svg.append('g').classed('nodes', true);

        const decorations = svg.append('g').classed('decorations', true);
        decorations.append('line').classed('mid-point', true);
        decorations.append('text').classed('mid-point', true)

        const _2pp = decorations.append('g').classed('two-pp', true);
        _2pp.append('text').classed('winner', true);
        _2pp.append('text').classed('second', true);
    }

    updateData(this: HousePreferenceFlowVisualisation, data?: ElectorateResult, opts?: LayoutOptions) {
        d3.select(this.svg).select('defs').selectAll('linearGradient').remove();
        this.gradients.clear();

        this.data = data;
        this.options = opts ?? {};
        this.candidatePlacementOrder = this.calculateCandidateOrder();
        // this.candidates = data?.candidates ?? [];

        // const roundNodes: Map<Candidate,Node>[] = [];
        this.nodes = [];
        this.roundScale.domain([0, (data?.results.length ?? 1) - 1])

        // create nodes for each candidate in each round
        data?.results.forEach((roundResults, round) => {
            this.nodes.push(new Map());

            const eliminatedCandidate = roundResults.find(r => r.change < 0)?.candidate;
            
            roundResults.forEach(candidateResult => {
                // This node is not guaranteed to be added to the graph.
                const newNode: Node = {
                    round: round,
                    candidate: candidateResult.candidate,
                    votes: candidateResult.count,
                    transfers: [],
                    offset: 0,
                };

                // first round early return
                if (round === 0) {
                    this.nodes[round]?.set(candidateResult.candidate, newNode);
                    return;
                }

                // if the candidate has been eliminated in this or prev rounds
                if (candidateResult.count === 0) return;

                const prevNode = this.nodes[round-1]?.get(candidateResult.candidate);
                if (!prevNode) throw new Error(`failed to find previous node for candidate ${candidateResult.candidate}`);

                if (!eliminatedCandidate) throw new Error(`failed to find eliminated candidate for round ${round}`);
                const eliminatedNode = this.nodes[round-1]?.get(eliminatedCandidate);
                if (!eliminatedNode) throw new Error(`failed to find previous node for eliminated candidate ${eliminatedCandidate}`);

                // Add link from previous node to new one for same candidate.
                prevNode.transfers.push({
                    source: prevNode,
                    target: newNode,
                    votes: prevNode.votes,
                });

                // Add link from previous node of eliminated candidate to new node.
                eliminatedNode.transfers.push({
                    source: eliminatedNode,
                    target: newNode,
                    votes: candidateResult.change,
                });

                this.nodes[round]?.set(candidateResult.candidate, newNode);
            });
        });

        // sort the candidates in each round and calculate vote offsets
        const rootNodes = this.nodes.at(0);
        if (!rootNodes) throw new Error();
        this.totalVotes = d3.reduce(rootNodes, (prev, [_,node]) => prev + node.votes, 0);
        console.log('voteTotal', this.totalVotes)

        this.voteScale.domain([0,this.totalVotes]);

        this.nodes.forEach(nodes => {
            const nodeIt = this.sortCandidates([...nodes.values()]);

            let offset = 0;
            for (const node of nodeIt) {
                node.offset = offset;
                offset += node.votes;
            }
        });

        this.draw();
    }

    calculateCandidateOrder(this: HousePreferenceFlowVisualisation): Candidate[] {
        const finalRound = this.data?.results.at(-1);

        if (!finalRound) return [];

        const finalPlacements: Candidate[] = finalRound.filter(d => d.count !== 0)
                                                        .sort((a,b) => b.count - a.count)
                                                        .map(d => d.candidate);

        const eliminations: Candidate[] = [];
        this.data?.results.forEach(round => {
            for (const result of round) {
                if (result.change < 0) {
                    eliminations.push(result.candidate)
                    return;
                }
            }
        })

        return [...finalPlacements, ...eliminations.reverse()];
    }

    private doNode(nodes: Node[], pred: (d: Node) => boolean, action: (d: Node) => void): boolean {
        const node = nodes.find(pred);
        if (!node) return false;
        action(node);
        return true;
    }

    /** Returns a new array containing the given nodes in the order they should be displayed.
     * @param round The round number (zero-based).
     * @returns
     */
    private sortCandidates(this: HousePreferenceFlowVisualisation, nodes: Node[]): Node[] {
        switch (this.options.order) {
            // orders the candidates in each round based on theur vote count
            case 'count':
                return nodes.toSorted((a,b) => b.votes - a.votes);

            // orders the candidates against a 2pp axis
            default:
            case '2pp':{
                const newNodes: Node[] = [];
                const order = this.candidatePlacementOrder;

                this.doNode(nodes, d => d.candidate === order[0], d => newNodes.unshift(d));
                this.doNode(nodes, d => d.candidate === order[1], d => newNodes.push(d));

                const sortedEliminated = order.toSpliced(0, 2)
                    .map((d, i) => {
                        const roundEliminated = (order.length - (i + 2) - 1);
                        const finalPreferenceFlows = this.nodes[roundEliminated]?.get(d)?.transfers ?? [];
                        const flowToFirst = finalPreferenceFlows.find(d => d.target.candidate === order[0])?.votes ?? 0;
                        const flowToSecond = finalPreferenceFlows.find(d => d.target.candidate === order[1])?.votes ?? 0;

                        return {
                            candidate: d,
                            ratio: (flowToFirst - flowToSecond)/(flowToFirst+flowToSecond),
                        }
                    })
                    .sort((a,b) => b.ratio - a.ratio)
                    .map(d => nodes.find(n => n.candidate === d.candidate))
                    .filter(d => d != undefined);

                newNodes.splice(1, 0, ...sortedEliminated);
                return newNodes;
            }
        }
    }

    resize(this: HousePreferenceFlowVisualisation): void {
        console.log('drawing!!!');

        this.roundScale.range([0, this.w-this.padding.right-this.padding.left - this.bandWidth]);
        this.voteScale.range([0, this.h-this.padding.bottom-this.padding.top]);
        this.draw();
    }

    private calculateLabelY(this: HousePreferenceFlowVisualisation, candidate: Candidate, labelStore: LabelStore): LabelY {
        if (labelStore.has(candidate))
            return labelStore.get(candidate)!;

        const candidateFirstBand = this.nodes[0]?.get(candidate);
        const offset = candidateFirstBand?.offset ?? 0;
        const votes = candidateFirstBand?.votes ?? 0;

        let y = this.voteScale(offset + votes/2);
        const originalY = y;

        const spacing = this.labelSize + this.labelPadding;

        // resolve collisions against already placed labels
        for (const [_, prev] of labelStore) {
            if (originalY < prev.originalY) {
                const diff = prev.y - y;
                if (diff < spacing){
                    y -= (spacing - diff);
                }
            } else {
                const diff = y - prev.y;
                if (diff < spacing){
                    y += (spacing - diff);
                }
            }
        }

        const store: LabelY = {y, originalY};
        labelStore.set(candidate, store);

        return store;
    }

    private sortLinks(this: HousePreferenceFlowVisualisation, links: Link[]): Link[] {
        return links.toSorted((a,b) => a.target.offset - b.target.offset );
    }

    private drawSankeyCurve(this: HousePreferenceFlowVisualisation, link: Link): string {
        const path = d3.path();
        const source = link.source;
        const target = link.target;

        const votes: number = link.votes;
        let sourceOffset: number = link.source.offset;
        let targetOffset: number = link.target.offset;

        // if the source was eliminated we need to calculate an offset for the link to avoid overlaps
        if (source.candidate.ballot_id !== target.candidate.ballot_id) {
            // we need to move it below the continuing votes at least
            if (source.offset > target.offset)
                targetOffset += link.target.votes - link.votes;
            for (const sortedLink of this.sortLinks(source.transfers)) {
                if (sortedLink !== link) {
                    sourceOffset += sortedLink.votes;
                } else {
                    break;
                }
            }

        } else {
            this.doNode([...this.nodes[source.round]?.values()??[]], d => d.transfers.length > 1, n => {
                if (n.offset < source.offset) {
                    const preferenceVotes = n.transfers.find(d => d.target === target)?.votes ?? 0;
                    targetOffset += preferenceVotes;
                }
            });
        }

        const sourceX = this.roundScale(link.source.round) + this.bandWidth/2;
        const targetX = this.roundScale(link.target.round) - this.bandWidth/2;

        const sourceY = this.voteScale(sourceOffset + votes/2);
        const targetY = this.voteScale(targetOffset + votes/2);

        const midX = (sourceX + targetX) / 2;

        // Our gradients require the path to have a non-zero height,
        // so when the height would be identical, lets add a little 'wiggle' to the bezier curve.
        // This value should hopefully be small enough to be unnoticeable.
        const wiggle = (sourceY === targetY && source.candidate.ballot_id !== target.candidate.ballot_id)
                        ? 0.0001
                        : 0;

        // We need to add a horizontal hook to the start of the line to ensure the
        // start of the line is attached to the target node.
        path.moveTo(sourceX - this.bandWidth/2, sourceY);
        path.lineTo(sourceX, sourceY);

        if (sourceY === targetY)
            path.bezierCurveTo(midX, sourceY + wiggle, midX, targetY - wiggle, targetX, targetY);

        // If the line is too thick relative to the distance between nodes, then a bezier curve
        // ends up rendering incorrectly. When this happens, draw a straight line instead.
        else if ((targetX - sourceX) / this.voteScale(votes) < 2)
            path.lineTo(targetX, targetY);
        else
            path.bezierCurveTo(midX, sourceY, midX, targetY, targetX, targetY);

        // We need to add a horizontal hook to the line to ensure the end of the line is attached to the target node.
        path.lineTo(targetX + this.bandWidth/2, targetY);

        return path.toString();
    }

    private defineGradient(this: HousePreferenceFlowVisualisation, colour1: string, colour2: string): string | null {
        if (colour1 === colour2) return colour1;

        const key = `${colour1}-${colour2}`.replaceAll(' ', '_').replaceAll(/[()[\]]/g, '~');

        if (this.gradients.has(key)) return `url(#${key})`;

        const newGradient = d3.select(this.svg).select('defs')
            .append('linearGradient')
            .attr('id', key);

        newGradient.append('stop')
            .attr('offset', '30%')
            .attr('stop-color', colour1);
        newGradient.append('stop')
            .attr('offset', '70%')
            .attr('stop-color', colour2);

        this.gradients.add(key);
        return `url(#${key})`;
    }

    draw(this: HousePreferenceFlowVisualisation) {
        d3.select(this.svg).select('g.title')
            .attr('visibility', this.data ? 'visible' : 'hidden')
            .select('text')
            .text(`2025 Preference Flows for ${this.data?.name} (${this.data?.state})`)
            .attr('x', this.w/2)
            .attr('y', 15)
            .attr('dominant-baseline', 'hanging')
            .attr('text-anchor', 'middle')
            .attr('font-size', '1.5rem');

        const labelStore: LabelStore = new Map();
        const actualOrder = this.sortCandidates([...this.nodes[0]?.values()??[]]).map(d => d.candidate);

        const candidateList = d3.select(this.svg)
            .select('g.candidates')
            .attr('transform', `translate(${this.padding.left}, ${this.padding.top})`);

        candidateList.selectAll('text')
            .data(centerOut(actualOrder))
            .join('text')
            .attr('x', -15)
            .attr('y', d => this.calculateLabelY(d, labelStore).y)
            .text(d =>`${d.surname}, ${d.given_name} (${d.party_abbr})`)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'end')
            .attr('font-size', this.labelSize)
            .attr('white-space', 'pre-wrap')
            .sort((a,b) => (this.nodes[0]?.get(a)?.offset ?? 0) - (this.nodes[0]?.get(b)?.offset ?? 0) );

        candidateList.selectAll('line')
            .data(actualOrder)
            .join('line')
            .attr('x1', -13)
            .attr('y1', d => this.calculateLabelY(d, labelStore).y)
            .attr('x2', 0)
            .attr('y2', d => this.calculateLabelY(d, labelStore).originalY)
            .attr('stroke', 'black')
            .attr('stroke-width', 1);

        const decorations = d3.select(this.svg)
            .select('g.decorations')
            .attr('transform', `translate(${this.padding.left}, ${this.padding.top})`)
            .attr('visibility', this.data ? 'visible' : 'hidden');
            
        decorations.select('line.mid-point')
            .attr('stroke', 'black')
            .attr('x1', -7)
            .attr('y1', this.voteScale(this.totalVotes/2))
            .attr('x2', (this.w - this.padding.left - this.padding.right) + 10)
            .attr('y2', this.voteScale(this.totalVotes/2))
            .attr('stroke-width', 2);

        decorations.select('text.mid-point')
            .text('50%')
            .attr('x', (this.w - this.padding.left - this.padding.right) + 20)
            .attr('y', this.voteScale(this.totalVotes/2))
            .attr('dominant-baseline', 'middle');

        const first = this.nodes.at(-1)?.get(this.candidatePlacementOrder[0]!);
        const second = this.nodes.at(-1)?.get(this.candidatePlacementOrder[1]!);

        decorations.select('g.two-pp')
            .attr('transform', `translate(${this.w - this.padding.left - this.padding.right}, 0)`)
            .selectAll('text')
                .data(first && second ? [first, second] : [])
                .join('text')
                .attr('transform', (_,i) => `translate(${this.padding.right / 2}, ${this.voteScale(this.totalVotes * (i == 0 ? 0.25 : 0.75))})`)
                .attr('dominant-baseline', 'middle')
                .attr('text-anchor', 'middle')
                .attr('font-size', this.labelSize)
                .selectAll('tspan')
                    .data(d => [
                        { text: `${d.candidate.surname},`, bold: true },
                        { text: d.candidate.given_name, bold: true },
                        { text: d.candidate.party_name, bold: false },
                        { text: `${d.votes} votes`, bold: false },
                        { text: this.percentFormat((d.votes ?? 0)/this.totalVotes), bold: false }
                    ])
                    .join('tspan')
                    .attr('x', 0)
                    .attr("dy", (_, i, n) => {
                        const lineHeight = this.labelSize + this.labelPadding;
                        return i === 0
                            ? (-(n.length - 1) / 2 * lineHeight)
                            : lineHeight;
                    })
                    .attr('font-weight', d => d.bold ? 'bold' : 'normal')
                    .text(d => d.text);

        d3.select(this.svg)
            .select('g.nodes')
            .selectAll('g.round')
                .data(this.nodes)
                .join('g')
                .classed('round', true)
                .attr('transform', (_d,i) => `translate(${this.padding.left+(this.bandWidth/2)+this.roundScale(i)},${this.padding.top})`)
            .selectAll('g.candidate')
                .data(d => d.values())
                .join(enter => {
                    const g = enter.append('g');
                    g.append('rect')
                        .attr('x', -this.bandWidth/2)
                        .attr('width', this.bandWidth)
                        .attr('stroke', 'black')
                        .attr('stroke-width', 0.5);

                    g.append('text')
                        .attr('dominant-baseline', 'middle')
                        .attr('text-anchor', 'middle');

                    return g;
                })
                .classed('candidate', true)
                .attr('transform', d => `translate(0,${this.voteScale(d.offset)})`)
                .each((d,i,n) => {
                    if (!n[i]) throw new Error();

                    d3.select(n[i])
                        .select('rect')
                        .attr('height', this.voteScale(d.votes))
                        .attr('fill', partyColour(d.candidate.party_abbr));
                    
                    d3.select(n[i])
                        .select('text')
                        .attr('font-size', this.labelSize - 1)
                        .attr('visibility', this.voteScale(d.votes) >= this.labelSize ? 'visible' : 'hidden')
                        .attr('fill', labelColour(partyColour(d.candidate.party_abbr), 'antiquewhite'))
                        .attr('y', this.voteScale(d.votes/2))
                        .text(d3.format('d')((d.votes/this.totalVotes) * 100));
                });

        const roundWidth = this.roundScale(1);

        d3.select(this.svg)
            .select('defs')
            .selectAll('clipPath')
                .data(d3.range(this.nodes.length-1))
                .join('clipPath')
                .attr('id', (_,i) => `round_${i}-${i+1}_area`)
                .selectAll('rect')
                .data((_d,i) => [i])
                .join('rect')
                .attr('x', d => this.roundScale(d))
                .attr('y', 0)
                .attr('width', roundWidth)
                .attr('height', this.voteScale.range()[1]??0);

        d3.select(this.svg)
            .select('g.links')
            .selectAll('g.round')
                .data(this.nodes)
                .join('g')
                .classed('round', true)
                .attr('transform', `translate(${this.padding.left+(this.bandWidth/2)},${this.padding.top})`)
            .selectAll('path.link')
                .data(d => [...d.values()].flatMap(d => [...d.transfers.values()]))
                .join('path')
                .sort((a,b) => a.source.transfers.length - b.source.transfers.length)
                .classed('link', true)
                .classed('eliminated', d => d.source.candidate.ballot_id !== d.target.candidate.ballot_id)
                .attr('d', d => this.drawSankeyCurve(d))
                .attr('stroke', d => (d.votes/this.totalVotes) > 0.005 ?
                    this.defineGradient(
                        partyColour(d.source.candidate.party_abbr),
                        partyColour(d.target.candidate.party_abbr)
                    )
                    : this.defineGradient(
                        darken(partyColour(d.source.candidate.party_abbr), 1),
                        darken(partyColour(d.target.candidate.party_abbr), 1)
                    ))
                .attr('stroke-width', d => this.voteScale(d.votes))
                .attr('fill', 'none')
                .attr('opacity', 0.8)
                .attr('clip-path', d => `url(#round_${d.source.round}-${d.target.round}_area)`);


    }
}
