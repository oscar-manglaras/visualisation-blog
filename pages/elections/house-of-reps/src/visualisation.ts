import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { Visualisation } from "../../../common/modules/visualisation.js";
import type { Candidate, ElectorateResult } from "./data-processing.js";
import { darken, partyColour } from "./colours.js";

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

type LabelStore = {y: number, originalY: number, candidate: Candidate}[];

export class HousePreferenceFlowVisualisation extends Visualisation<ElectorateResult> {
    private padding = {
        left: 80, right: 80,
        top: 20, bottom: 20,
    };

    private labelPadding = 13;
    private namePadding = 100;
    private bandWidth = 20;

    private candidateOrder: Candidate[] = [];
    private nodes: Map<Candidate,Node>[] = [];
    private roundScale = d3.scaleLinear();
    private voteScale = d3.scaleLinear();
    private totalVotes = 0;

    private gradients = new Map<string,string>();

    constructor(container: HTMLElement) {
        super(container, {
            min_w: '40rem', min_h: '20rem',
            max_h: '50rem',
            w: '80rem',
        });

        const svg = d3.select(this.svg);
        svg.style('background-color', 'floralwhite')

        svg.append('defs');
        svg.append('g').classed('candidates', true);
        svg.append('g').classed('links', true);
        svg.append('g').classed('nodes', true);
    }

    updateData(this: HousePreferenceFlowVisualisation, data?: ElectorateResult) {
        d3.select(this.svg).select('defs').selectAll('linearGradient').remove();
        this.gradients.clear();

        this.data = data;
        this.candidateOrder = this.calculateCandidateOrder();
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

    private sortCandidates(this: HousePreferenceFlowVisualisation, nodes: Node[]): Node[] {
        const newNodes: Node[] = [];

        const order = this.candidateOrder;

        this.doNode(nodes, d => d.candidate === order[0], d => newNodes.unshift(d));
        this.doNode(nodes, d => d.candidate === order[1], d => newNodes.push(d));

        for (let  i = 2; i < order.length; i++) {
            const candidate = order[i];
            const middle = (newNodes.length-1)/2;

            if (i % 2 == 0)
                this.doNode(nodes, d => d.candidate === candidate, d => newNodes.splice(Math.ceil(middle), 0, d));
            else
                this.doNode(nodes, d => d.candidate === candidate, d => newNodes.splice(Math.floor(middle), 0, d));
        }

        return newNodes;
    }

    resize(this: HousePreferenceFlowVisualisation): void {
        console.log('drawing!!!');

        this.roundScale.range([0, this.w-this.padding.right-this.padding.left - this.namePadding]);
        this.voteScale.range([0, this.h-this.padding.bottom-this.padding.top]);
        this.draw();
    }

    private calculateLabelY(this: HousePreferenceFlowVisualisation, candidate: Candidate, labelStore: LabelStore): number {
        const candidateFirstBand = [...this.nodes[0]?.values()??[]].find(c => c.candidate === candidate);
        const offset = candidateFirstBand?.offset ?? 0;
        const votes = candidateFirstBand?.votes ?? 0;

        let y = this.voteScale(offset + votes/2);
        const originalY = y;

        // resolve collisions against already placed labels
        for (const prev of labelStore) {
            if (originalY < prev.originalY) {
                const diff = prev.y - y;
                if (diff < this.labelPadding){
                    y -= (this.labelPadding - diff);
                }
            } else {
                const diff = y - prev.y;
                if (diff < this.labelPadding){
                    y += (this.labelPadding - diff);
                }
            }
        }

        labelStore.push({y, originalY, candidate})

        return y;
    }

    private sortLinks(this: HousePreferenceFlowVisualisation, links: Link[]): Link[] {
        return links.toSorted((a,b) => a.target.offset - b.target.offset );
    }

    private drawSankeyCurve(this: HousePreferenceFlowVisualisation, link: Link): string {
        const path = d3.path();
        const source = link.source;
        const target = link.target;

        let votes: number = link.votes;
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

        // If the offset for the same candidate has reduced, then a candidate higher on the screen
        // has been eliminated, so shuffle around the offsets.
        } else if (source.offset > target.offset) {
            this.doNode([...this.nodes[source.round]?.values()??[]], d => d.transfers.length > 1, n => {
                const preferenceVotes = n.transfers.find(d => d.target === target)?.votes ?? 0;
                targetOffset += preferenceVotes;
            });
        }

        const sourceX = this.roundScale(link.source.round) + this.bandWidth/2;
        const targetX = this.roundScale(link.target.round) - this.bandWidth/2;

        const sourceYTop = this.voteScale(sourceOffset);
        const sourceYBottom = this.voteScale(sourceOffset + votes);
        const targetYTop = this.voteScale(targetOffset);
        const targetYBottom = this.voteScale(targetOffset + votes);

        path.moveTo(sourceX, sourceYTop);

        const ctrl = (sourceX + targetX) / 2;
        path.bezierCurveTo(ctrl, sourceYTop, ctrl, targetYTop, targetX, targetYTop);

        path.lineTo(targetX, targetYBottom);
        path.bezierCurveTo(ctrl, targetYBottom, ctrl, sourceYBottom, sourceX, sourceYBottom);
        path.closePath()

        return path.toString();
    }

    private defineGradient(this: HousePreferenceFlowVisualisation, colour1: string, colour2: string): string | null {
        if (colour1 === colour2) return colour1;

        const key = `${colour1}-${colour2}`.replaceAll(/[\(\)\#]/g, '_').replaceAll(' ', '.');

        if (this.gradients.has(key)) return `url(#${this.gradients.get(key)})`;

        const newGradient = d3.select(this.svg).select('defs')
            .append('linearGradient')
            .attr('id', key)
            // .attr('gradientUnits', 'userSpaceOnUse');

        newGradient.append('stop')
            .attr('offset', '30%')
            .attr('stop-color', colour1);
        newGradient.append('stop')
            .attr('offset', '70%')
            .attr('stop-color', colour2);

        return `url(#${key})`;
    }

    draw(this: HousePreferenceFlowVisualisation) {
        const labelStore: LabelStore = [];

        d3.select(this.svg)
            .select('g.candidates')
            .attr('transform', `translate(${this.padding.left+this.namePadding-5}, ${this.padding.top})`)
            .selectAll('text')
                .data(this.candidateOrder.toReversed()/*, (d) => `${this.data?.name}-${(d as Candidate).ballot_id}`*/)
                .join('text')
                .attr('y', d => this.calculateLabelY(d, labelStore))
                .text(d =>`${d.surname}, ${d.given_name} (${d.party_abbr})`)
                .attr('dominant-baseline', 'middle')
                .attr('text-anchor', 'end')
                .attr('font-size', '0.6rem')
                .attr('white-space', 'pre-wrap')
                .sort((a,b) => (this.nodes[0]?.get(a)?.offset ?? 0) - (this.nodes[0]?.get(b)?.offset ?? 0) );

        d3.select(this.svg)
            .select('g.nodes')
            .selectAll('g.round')
                .data(this.nodes)
                .join('g')
                .classed('round', true)
                .attr('transform', (_d,i) => `translate(${this.padding.left+this.namePadding+10+this.roundScale(i)},${this.padding.top})`)
            .selectAll('g.candidate')
                .data(d => d.values())
                .join(enter => {
                    const g = enter.append('g');
                    g.append('rect')
                        .attr('x', -this.bandWidth/2)
                        .attr('width', this.bandWidth)
                        .attr('stroke', 'black')
                        .attr('stroke-width', 0.5);

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
                });

        d3.select(this.svg)
                .select('g.links')
                .selectAll('g.round')
                    .data(this.nodes)
                    .join('g')
                    .classed('round', true)
                    .attr('transform', `translate(${this.padding.left+this.namePadding+10},${this.padding.top})`)
                .selectAll('path.link')
                    .data(d => [...d.values()].flatMap(d => [...d.transfers.values()]))
                    .join('path')
                    .sort((a,b) => a.source.transfers.length - b.source.transfers.length)
                    .classed('link', true)
                    .classed('eliminated', d => d.source.candidate.ballot_id !== d.target.candidate.ballot_id)
                    .attr('d', d => this.drawSankeyCurve(d))
                    .attr('stroke', d => (d.votes/this.totalVotes) > 0.01 ?
                        null
                        : this.defineGradient(
                            darken(partyColour(d.source.candidate.party_abbr), 1),
                            darken(partyColour(d.target.candidate.party_abbr), 1)
                        ))
                    .attr('stroke-width', 0.5)
                    // .attr('fill', d => partyColour(d.source.candidate.party_abbr))
                    .attr('fill', d => this.defineGradient(
                        partyColour(d.source.candidate.party_abbr),
                        partyColour(d.target.candidate.party_abbr))
                    )
                    .attr('opacity', 0.8);

    }
}
