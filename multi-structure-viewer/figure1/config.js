window.MULTI_STRUCTURE_VIEWER_CONFIG = {
  title: 'Multi-Structure Comparison Viewer',
  editorMode: false,
  panelCount: 4,
  maxPanels: 64,
  focusedLayout: 'sequence-controls',
  autoLoad: true,
  syncOnLoad: false,
  showDownloads: true,
  files: [
    { id: 'line1-without-insert', label: 'LINE-1 without insert — KYQ92841.1', molxUrl: '../sample/molx/line1_wo_ins.molx', structureUrl: '../sample/structures/KYQ92841.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'human-line1', label: 'Human LINE-1 — AAC51271.1', molxUrl: '../sample/molx/ORF2pPCNA_refined260213_assigned.molx', structureUrl: '../sample/structures/AAC51271.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'r2-turtle', label: 'R2 — 9NL2', molxUrl: '../sample/molx/R2_Turtle.molx', structureUrl: '../sample/structures/9NL2.pdb', focusedLayout: 'sequence-controls' },
    { id: 'dual-nuclease', label: 'Dual nuclease — KAK3289676.1', molxUrl: '../sample/molx/KAK3289676.1_two_nuclease.molx', structureUrl: '../sample/structures/KAK3289676.1.pdb', focusedLayout: 'sequence-controls' }
  ]
};
