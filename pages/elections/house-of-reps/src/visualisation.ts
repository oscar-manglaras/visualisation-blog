import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

import { Visualisation } from "../../../common/modules/visualisation.js";
import type { Candidate, ElectorateResult } from "./data-processing.js";

interface Node {
    round: number;
    candidate: Candidate;
    votes: number;
    offset: number;

    transfers: Set<Link>;
}

interface Link {
    source: Node;
    target: Node;
    votes: number;
}

export class HousePreferenceFlowVisualisation extends Visualisation<ElectorateResult> {
    private padding = {
        left: 80, right: 80,
        top: 20, bottom: 20,
    };

    private name_padding = 100;

    private nodes: Map<Candidate,Node>[] = [];
    private roundScale = d3.scaleLinear();
    private voteScale = d3.scaleLinear();

    constructor(container: HTMLElement) {
        super(container, {
            min_w: '40rem', min_h: '20rem',
            max_h: '50rem',
            w: '80rem',
        });

        const svg = d3.select(this.svg);
        svg.append('g').classed('candidates', true);
        svg.append('g').classed('votes', true);
    }

    updateData(this: HousePreferenceFlowVisualisation, data?: ElectorateResult) {
        this.data = data;
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
                    transfers: new Set(),
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
                prevNode.transfers.add({
                    source: prevNode,
                    target: newNode,
                    votes: prevNode.votes,
                });

                // Add link from previous node of eliminated candidate to new node.
                eliminatedNode.transfers.add({
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
        const voteTotal = d3.reduce(rootNodes, (prev, [_,node]) => prev + node.votes, 0);
        console.log('voteTotal', voteTotal)

        this.voteScale.domain([0,voteTotal]);

        this.nodes.forEach(nodes => {
            const nodeIt = this.sortCandidates([...nodes.values()]);

            let offset = 0;
            for (const node of nodeIt) {
                node.offset = offset;
                offset += node.votes;
            }
        });

        // this.rootNodes = [...roundNodes[0]?.values()??[]];
        console.log(this.nodes.map(d => [...d.values()]));
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

        const order = this.calculateCandidateOrder();
        console.log(order);

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

        this.roundScale.range([0, this.w-this.padding.right-this.padding.left - this.name_padding]);
        this.voteScale.range([0, this.h-this.padding.bottom-this.padding.top]);
        this.draw();
    }

    draw(this: HousePreferenceFlowVisualisation) {
        d3.select(this.svg)
            .style('background-color', 'antiquewhite')
            .select('g.votes')
            .selectAll('g.round')
                .data(this.nodes)
                .join('g')
                .classed('round', true)
                .attr('transform', (_d,i) => `translate(${this.padding.left+this.name_padding+this.roundScale(i)},${this.padding.top})`)
            .selectAll('g.candidate')
                .data(d => d.values())
                .join(enter => {
                    const g = enter.append('g');
                    g.append('rect')
                        .attr('x', -10)
                        .attr('width', 20)
                        .attr('fill', 'none')
                        .attr('stroke', 'black');

                    g.append('text')
                        .attr('dominant-baseline', 'hanging')
                        .attr('text-anchor', 'middle')
                        .attr('x', '-3rem')
                        .attr('font-size', '0.6rem')
                        .attr('white-space', 'pre-wrap');

                    return g;
                })
                .classed('candidate', true)
                .attr('transform', d => `translate(0,${this.voteScale(d.offset)})`)
                .each((d,i,n) => {
                    if (!n[i]) throw new Error();

                    d3.select(n[i])
                        .select('text')
                        .text(`${d.candidate.surname},\n${d.candidate.given_name} (${d.candidate.party_abbr})`);

                    d3.select(n[i])
                        .select('rect')
                        .attr('height', this.voteScale(d.votes))
                });
    }
}
