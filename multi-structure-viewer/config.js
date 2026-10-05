window.MULTI_STRUCTURE_VIEWER_CONFIG = {
  title: 'Multi-Structure Comparison Editor',
  editorMode: true,
  panelCount: 6,
  maxPanels: 64,
  focusedLayout: 'sequence-controls',
  autoLoad: true,
  syncOnLoad: false,
  showDownloads: true,
  files: [
    { id: 'line1-without-insert', label: 'LINE-1 without insert — KYQ92841.1', molxUrl: '../sample/molx/line1_wo_ins.molx', structureUrl: '../sample/structures/KYQ92841.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'human-line1', label: 'Human LINE-1 — AAC51271.1', molxUrl: '../sample/molx/ORF2pPCNA_refined260213_assigned.molx', structureUrl: '../sample/structures/AAC51271.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'line1-rnaseh', label: 'LINE-1 RNase H insertion — OJT01835.1', molxUrl: '../sample/molx/OJT01835.1.molx', structureUrl: '../sample/structures/OJT01835.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'r2-turtle', label: 'R2 — 9NL2', molxUrl: '../sample/molx/R2_Turtle.molx', structureUrl: '../sample/structures/9NL2.pdb', focusedLayout: 'sequence-controls' },
    { id: 'r2-like-rnaseh', label: 'R2-like RNase H insertion — MDR3734992.1', molxUrl: '../sample/molx/R2_like_RnaseH_MDR3734992.1.molx', structureUrl: '../sample/structures/MDR3734992.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'rte-at-hook', label: 'RTE AT-hook insertion — XP_075788969.1', molxUrl: '../sample/molx/RTE_AT-hook_ZnRB.molx', structureUrl: '../sample/structures/XP_075788969.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'tad-rnaseh', label: 'TAD RNase H insertion — XP_073608912.1', molxUrl: '../sample/molx/TAD_RnasH_XP_073608912.molx', structureUrl: '../sample/structures/XP_073608912.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'dual-nuclease', label: 'Dual nuclease — KAK3289676.1', molxUrl: '../sample/molx/KAK3289676.1_two_nuclease.molx', structureUrl: '../sample/structures/KAK3289676.1.pdb', focusedLayout: 'sequence-controls' },
    { id: 'cre-insertion', label: 'CRE insertion — KAE8182555.1', molxUrl: '../sample/molx/KAE8182555.1.molx', structureUrl: '../sample/structures/KAE8182555.1.pdb', focusedLayout: 'sequence-controls' }
  ]
};
