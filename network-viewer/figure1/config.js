/**
 * Network Viewer configuration — publication figure.
 *
 * The viewer treats the edge table as undirected after resolving every TSV
 * endpoint to an included YAML node and unifying entries by Display_name.
 * All edge_count values between the same display-name pair are summed before
 * the minimum-count filter is applied.
 */
window.NETWORK_VIEWER_CONFIG = {
  title: 'Network Viewer',
  subtitle: 'Interactive association network',

  paperTitle: '',
  figureTitle: 'Domain-association network',

  autoLoad: true,
  edgeUrl: './data/interactions.tsv',
  nodeUrl: './data/nodes.yaml',
  colorUrl: '', // Optional YAML dictionary: group name -> color.

  delimiter: '\t',
  edgeColumns: {
    source: 'source',
    target: 'target',
    type: 'edge_type',
    count: 'edge_count'
  },
  nodeFields: {
    label: 'Display_name',
    include: 'Include',
    group: 'Function',
    notes: 'Notes'
  },

  defaultMinimumCount: 5,
  defaultLayout: 'fruchterman-reingold',
  defaultNodeSize: 'weighted-degree',
  defaultShowLabels: true,
  defaultShowIsolates: false,

  // Node scope and community analysis. Communities are always computed from
  // the currently visible network after scope, threshold, and isolate filters.
  defaultOnlyIncluded: true,
  defaultCommunityMethod: 'none', // none | louvain | leiden
  defaultCommunityResolution: 1.0,
  defaultCommunityWeighted: true,
  defaultCommunitySeed: 42,
  defaultCommunityIterations: 20,
  defaultColorBy: 'function', // function | community
  defaultGroupLayoutBy: 'function', // none | function | community

  layoutSeed: 20260929,
  fitAfterLayout: true,

  maxFileBytes: 32 * 1024 * 1024,
  maxNodes: 5000,
  maxAggregatedEdges: 30000,
  showDownloads: true
};
