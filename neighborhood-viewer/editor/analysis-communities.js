/* Editor-only community routines shared in behavior with Network Viewer.
 * The Leiden option uses connectivity refinement, not the full stochastic
 * refinement procedure of the reference Leiden implementation.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeighborhoodCommunities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function makeCommunityGraph(nodeCount, edgeTuples) {
    const adjacency = Array.from({ length: nodeCount }, () => new Map());
    const degree = Array(nodeCount).fill(0);
    const edgeList = [];
    let totalWeight = 0;
    edgeTuples.forEach((tuple) => {
      const a = Number(tuple[0]);
      const b = Number(tuple[1]);
      const weight = Number(tuple[2]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= nodeCount || b >= nodeCount || !Number.isFinite(weight) || weight <= 0) return;
      edgeList.push([a, b, weight]);
      totalWeight += weight;
      if (a === b) {
        adjacency[a].set(a, (adjacency[a].get(a) || 0) + weight);
        degree[a] += weight * 2;
      } else {
        adjacency[a].set(b, (adjacency[a].get(b) || 0) + weight);
        adjacency[b].set(a, (adjacency[b].get(a) || 0) + weight);
        degree[a] += weight;
        degree[b] += weight;
      }
    });
    return { n: nodeCount, adjacency, degree, edgeList, totalWeight, twoM: totalWeight * 2 };
  }

  function createCommunityGraph(nodes, edges, weighted) {
    const index = new Map(nodes.map((node, position) => [node.id, position]));
    const tuples = [];
    edges.forEach((edge) => {
      const a = index.get(edge.source);
      const b = index.get(edge.target);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return;
      const weight = weighted ? Math.max(0, Number(edge.totalCount) || 0) : 1;
      if (weight > 0) tuples.push([a, b, weight]);
    });
    return { graph: makeCommunityGraph(nodes.length, tuples), index };
  }

  function shuffledIndices(length, random) {
    const values = Array.from({ length }, (_value, index) => index);
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const temporary = values[i];
      values[i] = values[j];
      values[j] = temporary;
    }
    return values;
  }

  function renumberPartition(partition) {
    const remap = new Map();
    let next = 0;
    const dense = partition.map((community) => {
      if (!remap.has(community)) remap.set(community, next++);
      return remap.get(community);
    });
    return { partition: dense, count: next };
  }

  function localMoving(graph, resolution, seed, maxPasses, allowedGroups) {
    if (!graph.n || graph.totalWeight <= 0) return { partition: Array.from({ length: graph.n }, (_value, index) => index), count: graph.n, moved: false };
    const random = seededRandom(seed || 1);
    const community = Array.from({ length: graph.n }, (_value, index) => index);
    const totals = graph.degree.slice();
    let movedAtLeastOnce = false;
    const passes = Math.max(1, Math.min(250, Number(maxPasses) || 20));

    for (let pass = 0; pass < passes; pass += 1) {
      let movedThisPass = false;
      const order = shuffledIndices(graph.n, random);
      order.forEach((node) => {
        const current = community[node];
        const nodeDegree = graph.degree[node];
        if (nodeDegree <= 0) return;
        const neighborWeights = new Map();
        graph.adjacency[node].forEach((weight, neighbor) => {
          if (neighbor === node) return;
          if (allowedGroups && allowedGroups[neighbor] !== allowedGroups[node]) return;
          const candidate = community[neighbor];
          neighborWeights.set(candidate, (neighborWeights.get(candidate) || 0) + weight);
        });
        if (!neighborWeights.has(current)) neighborWeights.set(current, 0);
        totals[current] -= nodeDegree;
        let bestCommunity = current;
        let bestGain = 0;
        neighborWeights.forEach((weightIn, candidate) => {
          const gain = weightIn - resolution * nodeDegree * totals[candidate] / graph.twoM;
          if (gain > bestGain + 1e-10 || (Math.abs(gain - bestGain) <= 1e-10 && candidate < bestCommunity)) {
            bestGain = gain;
            bestCommunity = candidate;
          }
        });
        community[node] = bestCommunity;
        totals[bestCommunity] += nodeDegree;
        if (bestCommunity !== current) {
          movedThisPass = true;
          movedAtLeastOnce = true;
        }
      });
      if (!movedThisPass) break;
    }
    const dense = renumberPartition(community);
    dense.moved = movedAtLeastOnce;
    return dense;
  }

  function connectedComponentsWithin(graph, partition) {
    const components = Array(graph.n).fill(-1);
    let component = 0;
    for (let start = 0; start < graph.n; start += 1) {
      if (components[start] !== -1) continue;
      const expectedCommunity = partition[start];
      const queue = [start];
      components[start] = component;
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        graph.adjacency[current].forEach((weight, neighbor) => {
          if (weight <= 0 || neighbor === current || components[neighbor] !== -1 || partition[neighbor] !== expectedCommunity) return;
          components[neighbor] = component;
          queue.push(neighbor);
        });
      }
      component += 1;
    }
    return components;
  }

  function refineLeidenPartition(graph, coarsePartition, resolution, seed, maxPasses) {
    const connectedBlocks = connectedComponentsWithin(graph, coarsePartition);
    const refined = localMoving(graph, resolution, seed, maxPasses, connectedBlocks).partition;
    return renumberPartition(connectedComponentsWithin(graph, refined));
  }

  function aggregateCommunityGraph(graph, partition, members) {
    const dense = renumberPartition(partition);
    const nextMembers = Array.from({ length: dense.count }, () => []);
    members.forEach((memberList, node) => {
      nextMembers[dense.partition[node]].push(...memberList);
    });
    const edgeMap = new Map();
    graph.edgeList.forEach(([a, b, weight]) => {
      const ca = dense.partition[a];
      const cb = dense.partition[b];
      const low = Math.min(ca, cb);
      const high = Math.max(ca, cb);
      const key = `${low}\u0000${high}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + weight);
    });
    const tuples = Array.from(edgeMap.entries(), ([key, weight]) => {
      const parts = key.split('\u0000').map(Number);
      return [parts[0], parts[1], weight];
    });
    return { graph: makeCommunityGraph(dense.count, tuples), members: nextMembers };
  }

  function modularityForMembership(nodes, edges, membership, weighted, resolution) {
    if (!nodes.length || !edges.length) return 0;
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    let totalWeight = 0;
    let internalWeight = new Map();
    edges.forEach((edge) => {
      const weight = weighted ? Math.max(0, Number(edge.totalCount) || 0) : 1;
      if (weight <= 0) return;
      totalWeight += weight;
      degree.set(edge.source, (degree.get(edge.source) || 0) + weight);
      degree.set(edge.target, (degree.get(edge.target) || 0) + weight);
      const sourceCommunity = membership.get(edge.source);
      const targetCommunity = membership.get(edge.target);
      if (sourceCommunity != null && sourceCommunity === targetCommunity) {
        internalWeight.set(sourceCommunity, (internalWeight.get(sourceCommunity) || 0) + weight);
      }
    });
    if (totalWeight <= 0) return 0;
    const communityDegree = new Map();
    degree.forEach((value, id) => {
      const community = membership.get(id);
      if (community == null) return;
      communityDegree.set(community, (communityDegree.get(community) || 0) + value);
    });
    let quality = 0;
    communityDegree.forEach((degreeSum, community) => {
      const internal = internalWeight.get(community) || 0;
      quality += internal / totalWeight - resolution * Math.pow(degreeSum / (2 * totalWeight), 2);
    });
    return quality;
  }

  function finalizeCommunityResult(nodes, edges, members, weighted, resolution) {
    const groups = members
      .filter((memberList) => memberList.length)
      .map((memberList) => memberList.slice().sort((a, b) => a.localeCompare(b)))
      .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
    const membership = new Map();
    const communities = groups.map((memberList, index) => {
      const id = index;
      const label = `Community ${index + 1}`;
      memberList.forEach((nodeId) => membership.set(nodeId, id));
      return { id, label, size: memberList.length, members: memberList };
    });
    return {
      membership,
      communities,
      modularity: modularityForMembership(nodes, edges, membership, weighted, resolution)
    };
  }

  function detectCommunities(method, nodes, edges, options) {
    const weighted = options.weighted !== false;
    const resolution = Math.max(0.0001, Number(options.resolution) || 1);
    const seed = Number(options.seed) || 1;
    const passes = Math.max(1, Math.min(250, Number(options.iterations) || 20));
    const initial = createCommunityGraph(nodes, edges, weighted);
    let graph = initial.graph;
    let members = nodes.map((node) => [node.id]);
    if (!nodes.length) return finalizeCommunityResult(nodes, edges, members, weighted, resolution);
    if (graph.totalWeight <= 0) return finalizeCommunityResult(nodes, edges, members, weighted, resolution);

    for (let level = 0; level < 40 && graph.n > 1; level += 1) {
      const coarse = localMoving(graph, resolution, seed + level * 1009, passes);
      let selected = coarse;
      if (method === 'leiden') {
        selected = refineLeidenPartition(graph, coarse.partition, resolution, seed + level * 1009 + 503, passes);
      }
      if (selected.count >= graph.n) break;
      const aggregated = aggregateCommunityGraph(graph, selected.partition, members);
      graph = aggregated.graph;
      members = aggregated.members;
    }
    return finalizeCommunityResult(nodes, edges, members, weighted, resolution);
  }

  function seededRandom(seedValue) {
    let seed = (Number(seedValue) || 1) >>> 0;
    return function random() {
      seed += 0x6D2B79F5;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function connectorSummaries(observations, edges, groups) {
    const domainSets = new Map(observations.map(o => [o.id, new Set(o.domainIds)]));
    const owners = new Map(), summaries = groups.map(group => ({ ...group, internalEdges: 0, connectors: new Map() }));
    for (const group of summaries) for (const member of group.members) owners.set(member, group);
    for (const edge of edges) {
      const group = owners.get(edge.source);
      if (!group || owners.get(edge.target) !== group) continue;
      group.internalEdges++;
      for (const id of domainSets.get(edge.source) || []) {
        if (!domainSets.get(edge.target)?.has(id)) continue;
        if (!group.connectors.has(id)) group.connectors.set(id, { id, edgeCount: 0, neighborhoods: new Set() });
        const connector = group.connectors.get(id); connector.edgeCount++;
        connector.neighborhoods.add(edge.source); connector.neighborhoods.add(edge.target);
      }
    }
    const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    return summaries.map(group => ({ ...group, connectors: [...group.connectors.values()]
      .map(c => ({ id: c.id, edgeCount: c.edgeCount, neighborhoodCount: c.neighborhoods.size, members: [...c.neighborhoods].sort(compare) }))
      .sort((a, b) => b.edgeCount - a.edgeCount || compare(a.id, b.id)) }));
  }
  return { detectCommunities, connectorSummaries };
});
