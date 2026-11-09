/**
 * Network Viewer configuration — editor.
 *
 * The bundled example is loaded automatically. The editor page additionally
 * allows a local edge TSV plus optional node and group-color YAML files to be
 * selected without uploading data to a server.
 */
window.NETWORK_VIEWER_CONFIG = {
  title: 'Network Editor',
  subtitle: 'Load, unify, filter, detect communities, and prepare publication YAML',

  paperTitle: '',
  figureTitle: 'Interactive network editor',

  autoLoad: true,
  edgeUrl: './data/interactions.tsv',
  nodeUrl: './data/nodes.yaml',
  colorUrl: '',

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
  showDownloads: false
};
