(() => {
  'use strict';

  const EDITOR_VERSION = '1.1.0';
  const DEFAULT_REGION_COLOR = '#2563EB';
  const MAX_PREVIEW_SELECTION = 5000;

  const elements = {
    root: document.getElementById('proteinAnnotationEditor'),
    status: document.getElementById('annotationEditorStatus'),
    title: document.getElementById('annotationTitleInput'),
    numbering: document.getElementById('annotationNumberingSelect'),
    defaultChain: document.getElementById('annotationDefaultChainSelect'),
    viewerStyle: document.getElementById('annotationViewerStyleSelect'),
    backgroundColor: document.getElementById('annotationBackgroundColor'),
    backgroundText: document.getElementById('annotationBackgroundText'),
    baseColor: document.getElementById('annotationBaseColor'),
    baseColorText: document.getElementById('annotationBaseColorText'),
    baseOpacity: document.getElementById('annotationBaseOpacityInput'),
    baseOpacityValue: document.getElementById('annotationBaseOpacityValue'),
    referenceHelp: document.getElementById('msaReferenceHelp'),
    referenceRows: document.getElementById('msaReferenceRows'),
    suggestReferences: document.getElementById('suggestMsaReferencesButton'),
    applyReferences: document.getElementById('applyMsaReferencesButton'),
    formHeading: document.getElementById('annotationFormHeading'),
    captureSelection: document.getElementById('captureMolstarSelectionButton'),
    capturedSummary: document.getElementById('capturedSelectionSummary'),
    refreshComponents: document.getElementById('refreshMolstarComponentsButton'),
    importSelectedComponents: document.getElementById('importSelectedMolstarComponentsButton'),
    componentHelp: document.getElementById('molstarComponentHelp'),
    componentList: document.getElementById('molstarComponentList'),
    name: document.getElementById('annotationNameInput'),
    description: document.getElementById('annotationDescriptionInput'),
    representation: document.getElementById('annotationRepresentationSelect'),
    colorTheme: document.getElementById('annotationColorThemeSelect'),
    colorField: document.getElementById('annotationColorField'),
    color: document.getElementById('annotationColorInput'),
    colorText: document.getElementById('annotationColorText'),
    opacity: document.getElementById('annotationOpacityInput'),
    opacityValue: document.getElementById('annotationOpacityValue'),
    componentName: document.getElementById('annotationComponentNameInput'),
    enabled: document.getElementById('annotationEnabledCheckbox'),
    createComponent: document.getElementById('annotationCreateComponentCheckbox'),
    visible: document.getElementById('annotationVisibleCheckbox'),
    tooltip: document.getElementById('annotationTooltipCheckbox'),
    label: document.getElementById('annotationLabelCheckbox'),
    save: document.getElementById('saveAnnotationButton'),
    cancelEdit: document.getElementById('cancelAnnotationEditButton'),
    count: document.getElementById('annotationCount'),
    list: document.getElementById('annotationList'),
    resetDraft: document.getElementById('resetAnnotationDraftButton'),
    applyPreview: document.getElementById('applyAnnotationPreviewButton'),
    downloadYaml: document.getElementById('downloadGeneratedYamlButton'),
    yamlPreview: document.getElementById('generatedYamlPreview')
  };

  let api = null;
  let draft = null;
  let originalDraft = null;
  let capturedGroups = [];
  let editingIndex = null;
  let latestSelection = [];
  let molstarComponents = [];
  let dirty = false;
  let applying = false;
  let regionSerial = 0;
  const referenceSuggestions = new Map();

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function normalizeHex(value, fallback = DEFAULT_REGION_COLOR) {
    const raw = clean(value);
    const upper = raw.toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(upper)) return upper;
    if (/^#[0-9A-F]{3}$/.test(upper)) {
      return `#${upper.slice(1).split('').map(char => char + char).join('')}`;
    }
    if (raw) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#000000';
        context.fillStyle = raw;
        const normalized = String(context.fillStyle || '').toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
      }
    }
    return fallback;
  }

  function setStatus(text, state = 'idle') {
    elements.status.textContent = text;
    elements.status.dataset.state = state;
  }

  function currentViewerState() {
    return api?.getState?.() || null;
  }

  function hasStructure() {
    return Boolean(currentViewerState()?.current);
  }

  function hasMsa() {
    return Boolean(currentViewerState()?.msa);
  }

  function regionFromSnapshot(region) {
    return {
      id: `region-${++regionSerial}`,
      enabled: region.enabled !== false,
      name: clean(region.name) || `Annotation ${regionSerial}`,
      selectionType: region.selectionType === 'positions' ? 'positions' : 'range',
      start: Number.isFinite(Number(region.start)) ? Number(region.start) : null,
      end: Number.isFinite(Number(region.end)) ? Number(region.end) : null,
      positions: Array.isArray(region.positions) ? region.positions.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [],
      numbering: region.numbering === 'label' ? 'label' : 'auth',
      chains: Array.isArray(region.chains) ? region.chains.map(value => String(value)) : [],
      color: normalizeHex(region.color || region.componentColor || DEFAULT_REGION_COLOR),
      description: clean(region.description),
      createComponent: region.createComponent !== false,
      componentName: clean(region.componentName) || clean(region.name),
      componentRepresentation: clean(region.componentRepresentation) || 'cartoon',
      componentRepresentationParams: clone(region.componentRepresentationParams),
      componentColorTheme: clean(region.componentColorTheme) || 'uniform',
      componentColorThemeParams: clone(region.componentColorThemeParams),
      componentColor: normalizeHex(region.componentColor || region.color || DEFAULT_REGION_COLOR),
      componentOpacity: clamp(region.componentOpacity, 0, 1, 1),
      componentVisible: region.componentVisible !== false,
      label: Boolean(region.label),
      tooltip: region.tooltip !== false
    };
  }

  function draftFromSnapshot(annotation) {
    const viewer = clone(annotation?.viewer || {});
    return {
      version: String(annotation?.version || 1),
      title: clean(annotation?.title) || 'Protein structure annotations',
      numbering: annotation?.numbering === 'label' ? 'label' : 'auth',
      defaultChains: Array.isArray(annotation?.defaultChains) ? annotation.defaultChains.map(value => String(value)) : [],
      defaultChain: Array.isArray(annotation?.defaultChains) ? String(annotation.defaultChains[0] || '') : '',
      msaReferences: { ...(annotation?.msaReferences || {}) },
      viewer: {
        style: clean(viewer.style) || 'default',
        postprocessing: clone(viewer.postprocessing),
        background: normalizeHex(viewer.background || '#FFFFFF', '#FFFFFF'),
        showLabels: Boolean(viewer.showLabels),
        showTooltips: viewer.showTooltips !== false,
        createComponents: viewer.createComponents !== false,
        componentRepresentation: clean(viewer.componentRepresentation) || 'cartoon',
        componentRepresentationParams: clone(viewer.componentRepresentationParams),
        componentColorTheme: clean(viewer.componentColorTheme) || 'uniform',
        componentColorThemeParams: clone(viewer.componentColorThemeParams),
        componentColor: normalizeHex(viewer.componentColor || '#CBD5E1', '#CBD5E1'),
        componentsVisible: viewer.componentsVisible !== false,
        componentOpacity: clamp(viewer.componentOpacity, 0, 1, 1),
        baseComponentName: clean(viewer.baseComponentName) || 'Base structure',
        baseColor: normalizeHex(viewer.baseColor || '#CBD5E1', '#CBD5E1'),
        baseOpacity: clamp(viewer.baseOpacity, 0, 1, 1)
      },
      regions: Array.isArray(annotation?.regions) ? annotation.regions.map(regionFromSnapshot) : []
    };
  }

  function syncColorPair(colorInput, textInput, value) {
    const normalized = normalizeHex(value, colorInput.value || '#FFFFFF');
    colorInput.value = normalized;
    textInput.value = normalized;
    return normalized;
  }

  function populateChainSelect() {
    const chains = api?.getStructureChains?.() || [];
    const previous = draft?.defaultChain || '';
    elements.defaultChain.innerHTML = '<option value="">All protein chains</option>';
    for (const chain of chains) {
      const option = document.createElement('option');
      option.value = chain.chain;
      option.textContent = `Chain ${chain.chain || '(blank)'} · ${chain.residueCount} residues`;
      elements.defaultChain.appendChild(option);
    }
    elements.defaultChain.value = chains.some(chain => chain.chain === previous) ? previous : '';
    if (draft && draft.defaultChain !== elements.defaultChain.value) {
      draft.defaultChain = elements.defaultChain.value;
      draft.defaultChains = draft.defaultChain ? [draft.defaultChain] : [];
    }
  }

  function populateGlobalForm() {
    if (!draft) return;
    elements.title.value = draft.title;
    elements.numbering.value = draft.numbering;
    populateChainSelect();
    elements.viewerStyle.value = ['default', 'illustrative'].includes(draft.viewer.style) ? draft.viewer.style : 'default';
    syncColorPair(elements.backgroundColor, elements.backgroundText, draft.viewer.background);
    syncColorPair(elements.baseColor, elements.baseColorText, draft.viewer.baseColor);
    elements.baseOpacity.value = String(draft.viewer.baseOpacity);
    elements.baseOpacityValue.textContent = draft.viewer.baseOpacity.toFixed(2);
  }

  function updateDraftFromGlobalForm(mark = true) {
    if (!draft) return;
    draft.title = clean(elements.title.value) || 'Protein structure annotations';
    draft.numbering = elements.numbering.value === 'label' ? 'label' : 'auth';
    const selectedDefaultChain = elements.defaultChain.value;
    if (selectedDefaultChain !== draft.defaultChain) {
      draft.defaultChain = selectedDefaultChain;
      draft.defaultChains = selectedDefaultChain ? [selectedDefaultChain] : [];
    }
    draft.viewer.style = elements.viewerStyle.value === 'illustrative' ? 'illustrative' : 'default';
    draft.viewer.background = syncColorPair(elements.backgroundColor, elements.backgroundText, elements.backgroundText.value);
    draft.viewer.baseColor = syncColorPair(elements.baseColor, elements.baseColorText, elements.baseColorText.value);
    draft.viewer.baseOpacity = clamp(elements.baseOpacity.value, 0, 1, 1);
    elements.baseOpacityValue.textContent = draft.viewer.baseOpacity.toFixed(2);
    if (mark) markDirty();
  }

  function selectionPositions(region) {
    if (region.selectionType === 'positions') return [...region.positions];
    if (!Number.isFinite(region.start) || !Number.isFinite(region.end)) return [];
    const positions = [];
    const limit = Math.min(region.end, region.start + MAX_PREVIEW_SELECTION - 1);
    for (let position = region.start; position <= limit; position += 1) positions.push(position);
    return positions;
  }

  function selectionText(region) {
    const chainText = region.chains.length ? region.chains.map(chain => chain || '(blank)').join(', ') : 'all chains';
    if (region.selectionType === 'positions') {
      const visible = region.positions.slice(0, 9).join(', ');
      const extra = region.positions.length > 9 ? `, … (+${region.positions.length - 9})` : '';
      return `${region.numbering} chain ${chainText} · positions [${visible}${extra}]`;
    }
    return `${region.numbering} chain ${chainText} · residues ${region.start}–${region.end}`;
  }

  function groupText(group) {
    const region = {
      ...group,
      numbering: group.numbering || draft?.numbering || 'auth'
    };
    return selectionText(region);
  }

  function updateCapturedSummary() {
    if (!capturedGroups.length) {
      const count = latestSelection.length;
      elements.capturedSummary.dataset.state = 'empty';
      elements.capturedSummary.textContent = count
        ? `${count} residue${count === 1 ? '' : 's'} currently selected in Mol*. Click “Capture selection” to use them.`
        : 'Select one or more protein residues in Mol*, then capture the selection.';
      return;
    }
    elements.capturedSummary.dataset.state = 'ready';
    if (capturedGroups.length === 1) {
      elements.capturedSummary.textContent = `Captured ${groupText(capturedGroups[0])}.`;
    } else {
      elements.capturedSummary.textContent =
        `Captured ${capturedGroups.length} chain-specific selections with different residue sets. Saving will create ${capturedGroups.length} compatible YAML regions.`;
    }
  }

  function makeGroupFromPositions(chains, positions, numbering) {
    const sorted = [...new Set(positions.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    const contiguous = sorted.length > 0 && sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
    return contiguous
      ? { selectionType: 'range', start: sorted[0], end: sorted[sorted.length - 1], positions: [], chains: [...chains], numbering }
      : { selectionType: 'positions', start: null, end: null, positions: sorted, chains: [...chains], numbering };
  }

  function groupsFromResidues(residues, numbering) {
    const byChain = new Map();
    let skipped = 0;
    let insertionCodes = 0;
    for (const residue of residues || []) {
      const chain = String(residue.chain || '');
      const position = numbering === 'label' ? Number(residue.labelSeq) : Number(residue.authSeq);
      if (!Number.isFinite(position)) {
        skipped += 1;
        continue;
      }
      if (numbering === 'auth' && clean(residue.insertion)) insertionCodes += 1;
      if (!byChain.has(chain)) byChain.set(chain, new Set());
      byChain.get(chain).add(position);
    }
    const bySignature = new Map();
    for (const [chain, values] of byChain.entries()) {
      const positions = [...values].sort((a, b) => a - b);
      const signature = positions.join(',');
      if (!bySignature.has(signature)) bySignature.set(signature, { positions, chains: [] });
      bySignature.get(signature).chains.push(chain);
    }
    return {
      groups: [...bySignature.values()].map(item => makeGroupFromPositions(item.chains, item.positions, numbering)),
      skipped,
      insertionCodes
    };
  }

  function captureCurrentSelection() {
    if (!api || !hasStructure()) return;
    const residues = api.getCurrentSelectionResidues?.() || [];
    latestSelection = residues;
    if (!residues.length) {
      capturedGroups = [];
      updateCapturedSummary();
      setStatus('No Mol* residues are currently selected', 'error');
      updateFormAvailability();
      return;
    }
    const numbering = elements.numbering.value === 'label' ? 'label' : 'auth';
    const grouped = groupsFromResidues(residues, numbering);
    capturedGroups = grouped.groups;
    if (grouped.skipped) setStatus(`${grouped.skipped} selected residues lacked ${numbering} numbering`, 'error');
    else if (grouped.insertionCodes) setStatus('Captured selection; insertion codes are represented by integer author positions in the current YAML schema', 'dirty');
    else setStatus('Selection captured; add a name and save the annotation', 'dirty');
    updateCapturedSummary();
    updateFormAvailability();
  }

  function representationLabel(value) {
    return ({
      cartoon: 'Cartoon',
      backbone: 'Backbone',
      ball_and_stick: 'Ball and stick',
      line: 'Line',
      spacefill: 'Spacefill',
      carbohydrate: 'Carbohydrate',
      surface: 'Surface',
      putty: 'Putty'
    })[value] || value || 'Representation';
  }

  function candidateMeta(candidate) {
    const chains = candidate.chains?.length
      ? candidate.chains.map(chain => chain || '(blank)').join(', ')
      : 'unknown';
    const theme = candidate.colorTheme === 'uniform'
      ? `uniform ${candidate.color}`
      : candidate.colorTheme;
    return `${candidate.residueCount} residue${candidate.residueCount === 1 ? '' : 's'} · chain ${chains} · ${representationLabel(candidate.representation)} · ${theme} · opacity ${candidate.opacity.toFixed(2)}`;
  }

  function renderMolstarComponents() {
    if (!elements.componentList) return;
    elements.componentList.innerHTML = '';
    if (!hasStructure()) {
      elements.componentHelp.textContent = 'Load a structure, create a selection component in Mol*, and refresh the list.';
      elements.componentList.innerHTML = '<div class="editor-empty">No structure loaded.</div>';
      updateFormAvailability();
      return;
    }
    if (!molstarComponents.length) {
      elements.componentHelp.textContent = 'No importable selection components were found. In Mol*, create a component from a residue selection and choose a main representation, then click Refresh components.';
      elements.componentList.innerHTML = '<div class="editor-empty">Base components and components already generated by the YAML are intentionally omitted.</div>';
      updateFormAvailability();
      return;
    }

    elements.componentHelp.textContent = `${molstarComponents.length} importable representation${molstarComponents.length === 1 ? '' : 's'} found. Each selected row becomes one or more YAML regions, depending on its chain-specific residue sets.`;
    for (const candidate of molstarComponents) {
      const row = document.createElement('div');
      row.className = `component-import-item${candidate.supported ? '' : ' is-unsupported'}`;
      row.dataset.componentId = candidate.id;

      const checkWrap = document.createElement('label');
      checkWrap.className = 'component-import-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = candidate.supported;
      checkbox.disabled = !candidate.supported;
      checkbox.dataset.componentImport = candidate.id;
      checkbox.setAttribute('aria-label', `Import ${candidate.name}`);
      checkbox.addEventListener('change', updateFormAvailability);
      checkWrap.appendChild(checkbox);

      const swatch = document.createElement('span');
      swatch.className = 'component-import-swatch';
      swatch.style.background = candidate.colorTheme === 'uniform' ? candidate.color : '#CBD5E1';
      swatch.title = candidate.colorTheme === 'uniform' ? candidate.color : candidate.colorTheme;

      const copy = document.createElement('div');
      copy.className = 'component-import-copy';
      const title = document.createElement('strong');
      title.textContent = candidate.name;
      const meta = document.createElement('span');
      meta.className = 'component-import-meta';
      meta.textContent = candidateMeta(candidate);
      copy.append(title, meta);
      if (candidate.warnings?.length) {
        const warning = document.createElement('span');
        warning.className = 'component-import-warning';
        warning.textContent = candidate.warnings.join(' ');
        copy.appendChild(warning);
      }

      const actions = document.createElement('div');
      actions.className = 'component-import-actions';
      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.textContent = 'Select';
      selectButton.addEventListener('click', () => {
        api.selectResidues(candidate.residues);
        setStatus(`Selected ${candidate.residueCount} residues from “${candidate.name}” in Mol*`, 'ready');
      });
      const importButton = document.createElement('button');
      importButton.type = 'button';
      importButton.textContent = 'Import';
      importButton.disabled = !candidate.supported;
      importButton.addEventListener('click', () => importMolstarComponents([candidate]));
      actions.append(selectButton, importButton);

      row.append(checkWrap, swatch, copy, actions);
      elements.componentList.appendChild(row);
    }
    updateFormAvailability();
  }

  function refreshMolstarComponents({ silent = false } = {}) {
    if (!api || !hasStructure()) {
      molstarComponents = [];
      renderMolstarComponents();
      return [];
    }
    try {
      molstarComponents = api.getMolstarComponents?.({ includeGenerated: false, includeUnsupported: true }) || [];
      renderMolstarComponents();
      if (!silent) {
        setStatus(
          molstarComponents.length
            ? `Found ${molstarComponents.length} importable Mol* representation${molstarComponents.length === 1 ? '' : 's'}`
            : 'No importable Mol* selection components were found',
          molstarComponents.length ? 'ready' : 'idle'
        );
      }
      return molstarComponents;
    } catch (error) {
      molstarComponents = [];
      renderMolstarComponents();
      setStatus(error?.message || 'Could not inspect Mol* components', 'error');
      return [];
    }
  }

  function groupSignature(group) {
    const chains = [...group.chains].sort().join(',');
    const positions = group.selectionType === 'positions'
      ? group.positions.join(',')
      : `${group.start}-${group.end}`;
    return `${group.numbering}|${chains}|${group.selectionType}|${positions}`;
  }

  function importedRegionSignature(region) {
    return [
      groupSignature(region),
      region.componentRepresentation,
      region.componentColorTheme,
      normalizeHex(region.componentColor || region.color),
      Number(region.componentOpacity).toFixed(3),
      region.componentVisible ? 'visible' : 'hidden'
    ].join('|');
  }

  function regionFromMolstarComponent(candidate, group, suffix = '') {
    const baseName = clean(candidate.name) || 'Mol* component';
    const name = suffix ? `${baseName} — ${suffix}` : baseName;
    const color = normalizeHex(candidate.color || DEFAULT_REGION_COLOR, DEFAULT_REGION_COLOR);
    return {
      id: `region-${++regionSerial}`,
      enabled: true,
      name,
      selectionType: group.selectionType,
      start: group.start,
      end: group.end,
      positions: [...group.positions],
      numbering: group.numbering || draft.numbering,
      chains: [...group.chains],
      color,
      description: '',
      createComponent: true,
      componentName: name,
      componentRepresentation: candidate.representation || 'cartoon',
      componentRepresentationParams: null,
      componentColorTheme: candidate.colorTheme || 'default',
      componentColorThemeParams: clone(candidate.colorThemeParams),
      componentColor: color,
      componentOpacity: clamp(candidate.opacity, 0, 1, 1),
      componentVisible: candidate.visible !== false,
      label: false,
      tooltip: true
    };
  }

  function importMolstarComponents(candidates) {
    if (!draft || !hasStructure()) return;
    const numbering = elements.numbering.value === 'label' ? 'label' : 'auth';
    const existing = new Set(draft.regions.map(importedRegionSignature));
    const imported = [];
    let skippedNumbering = 0;
    let insertionCodes = 0;
    let duplicateCount = 0;

    for (const candidate of candidates || []) {
      if (!candidate?.supported) continue;
      const grouped = groupsFromResidues(candidate.residues, numbering);
      skippedNumbering += grouped.skipped;
      insertionCodes += grouped.insertionCodes;
      grouped.groups.forEach(group => {
        const suffix = grouped.groups.length > 1
          ? `chain ${group.chains.map(chain => chain || '(blank)').join(', ')}`
          : '';
        const region = regionFromMolstarComponent(candidate, group, suffix);
        const signature = importedRegionSignature(region);
        if (existing.has(signature)) {
          duplicateCount += 1;
          return;
        }
        existing.add(signature);
        imported.push(region);
      });
    }

    if (!imported.length) {
      setStatus(
        duplicateCount ? 'The selected Mol* components already exist in the YAML draft' : 'No compatible component selections could be imported',
        duplicateCount ? 'idle' : 'error'
      );
      return;
    }

    draft.regions.push(...imported);
    markDirty();
    renderAnnotationList();
    resetAnnotationForm();
    const details = [];
    if (duplicateCount) details.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped`);
    if (skippedNumbering) details.push(`${skippedNumbering} residue${skippedNumbering === 1 ? '' : 's'} lacked ${numbering} numbering`);
    if (insertionCodes) details.push('author insertion codes use integer positions in the current YAML schema');
    setStatus(
      `Imported ${imported.length} YAML region${imported.length === 1 ? '' : 's'} from Mol*` +
      (details.length ? ` · ${details.join(' · ')}` : ''),
      'dirty'
    );
  }

  function importCheckedMolstarComponents() {
    const selectedIds = new Set(
      [...elements.componentList.querySelectorAll('input[data-component-import]:checked')]
        .map(input => input.dataset.componentImport)
    );
    const selected = molstarComponents.filter(candidate => selectedIds.has(candidate.id));
    if (!selected.length) {
      setStatus('Select at least one Mol* component representation to import', 'error');
      return;
    }
    importMolstarComponents(selected);
  }

  function resetAnnotationForm() {
    editingIndex = null;
    capturedGroups = [];
    elements.formHeading.textContent = 'Add an annotation';
    elements.name.value = '';
    elements.description.value = '';
    elements.representation.value = 'cartoon';
    elements.colorTheme.value = 'uniform';
    syncColorPair(elements.color, elements.colorText, DEFAULT_REGION_COLOR);
    elements.opacity.value = '1';
    elements.opacityValue.textContent = '1.00';
    elements.componentName.value = '';
    elements.enabled.checked = true;
    elements.createComponent.checked = true;
    elements.visible.checked = true;
    elements.tooltip.checked = true;
    elements.label.checked = false;
    elements.save.textContent = 'Add annotation';
    updateColorField();
    updateCapturedSummary();
    updateFormAvailability();
  }

  function loadRegionIntoForm(index) {
    if (!draft?.regions[index]) return;
    const region = draft.regions[index];
    editingIndex = index;
    capturedGroups = [{
      selectionType: region.selectionType,
      start: region.start,
      end: region.end,
      positions: [...region.positions],
      chains: [...region.chains],
      numbering: region.numbering
    }];
    elements.formHeading.textContent = `Edit annotation ${index + 1}`;
    elements.name.value = region.name;
    elements.description.value = region.description;
    elements.representation.value = region.componentRepresentation;
    elements.colorTheme.value = region.componentColorTheme;
    syncColorPair(elements.color, elements.colorText, region.componentColor || region.color);
    elements.opacity.value = String(region.componentOpacity);
    elements.opacityValue.textContent = region.componentOpacity.toFixed(2);
    elements.componentName.value = region.componentName || region.name;
    elements.enabled.checked = region.enabled;
    elements.createComponent.checked = region.createComponent;
    elements.visible.checked = region.componentVisible;
    elements.tooltip.checked = region.tooltip;
    elements.label.checked = region.label;
    elements.save.textContent = 'Update annotation';
    updateColorField();
    updateCapturedSummary();
    updateFormAvailability();
    elements.name.focus();
  }

  function regionFromForm(group, suffix = '') {
    const nameBase = clean(elements.name.value);
    const componentBase = clean(elements.componentName.value) || nameBase;
    const name = suffix ? `${nameBase} — ${suffix}` : nameBase;
    const componentName = suffix ? `${componentBase} — ${suffix}` : componentBase;
    const color = normalizeHex(elements.colorText.value, DEFAULT_REGION_COLOR);
    const colorTheme = elements.colorTheme.value || 'uniform';
    return {
      id: `region-${++regionSerial}`,
      enabled: elements.enabled.checked,
      name,
      selectionType: group.selectionType,
      start: group.start,
      end: group.end,
      positions: [...group.positions],
      numbering: group.numbering || draft.numbering,
      chains: [...group.chains],
      color,
      description: clean(elements.description.value),
      createComponent: elements.createComponent.checked,
      componentName,
      componentRepresentation: elements.representation.value || 'cartoon',
      componentRepresentationParams: null,
      componentColorTheme: colorTheme,
      componentColorThemeParams: null,
      componentColor: color,
      componentOpacity: clamp(elements.opacity.value, 0, 1, 1),
      componentVisible: elements.visible.checked,
      label: elements.label.checked,
      tooltip: elements.tooltip.checked
    };
  }

  function saveAnnotation() {
    if (!draft) return;
    const name = clean(elements.name.value);
    if (!name) {
      setStatus('Enter a name for the annotation', 'error');
      elements.name.focus();
      return;
    }
    if (!capturedGroups.length) {
      setStatus('Capture a Mol* residue selection first', 'error');
      return;
    }
    const regions = capturedGroups.map((group, index) => {
      const suffix = capturedGroups.length > 1
        ? `chain ${group.chains.map(chain => chain || '(blank)').join(', ')}`
        : '';
      return regionFromForm(group, suffix);
    });
    if (Number.isInteger(editingIndex) && editingIndex >= 0 && editingIndex < draft.regions.length) {
      const existing = draft.regions[editingIndex];
      if (regions.length === 1) {
        regions[0].id = existing.id;
        regions[0].componentRepresentationParams = clone(existing.componentRepresentationParams);
        regions[0].componentColorThemeParams = clone(existing.componentColorThemeParams);
      }
      draft.regions.splice(editingIndex, 1, ...regions);
    } else {
      draft.regions.push(...regions);
    }
    markDirty();
    renderAnnotationList();
    resetAnnotationForm();
  }

  function regionToStructureSelections(region) {
    const chains = api?.getStructureChains?.() || [];
    const targetChainIds = region.chains.length
      ? region.chains
      : draft.defaultChains?.length
        ? [...draft.defaultChains]
        : chains.map(chain => chain.chain);
    const positions = selectionPositions(region);
    const selections = [];
    for (const chainId of targetChainIds) {
      const chain = chains.find(item => item.chain === chainId);
      if (!chain) continue;
      if (region.numbering === 'label') {
        const byLabel = new Map(chain.residues.map(residue => [Number(residue.labelSeq), residue]));
        for (const position of positions) {
          const residue = byLabel.get(Number(position));
          if (residue) selections.push({ chain: chainId, residue });
        }
      } else {
        for (const position of positions) selections.push({ chain: chainId, authSeq: position, insertion: '' });
      }
    }
    return selections.slice(0, MAX_PREVIEW_SELECTION);
  }

  function selectRegionInMolstar(index) {
    const region = draft?.regions[index];
    if (!region) return;
    const selections = regionToStructureSelections(region);
    if (!selections.length) {
      setStatus('No residues from this annotation were found in the loaded structure', 'error');
      return;
    }
    api.selectResidues(selections);
    setStatus(`Selected ${selections.length} residue${selections.length === 1 ? '' : 's'} from “${region.name}”`, 'ready');
  }

  function moveRegion(index, delta) {
    const next = index + delta;
    if (!draft || next < 0 || next >= draft.regions.length) return;
    const [region] = draft.regions.splice(index, 1);
    draft.regions.splice(next, 0, region);
    markDirty();
    renderAnnotationList();
  }

  function deleteRegion(index) {
    if (!draft?.regions[index]) return;
    const [removed] = draft.regions.splice(index, 1);
    if (editingIndex === index) resetAnnotationForm();
    markDirty();
    renderAnnotationList();
    setStatus(`Removed “${removed.name}” from the draft`, 'dirty');
  }

  function renderAnnotationList() {
    if (!draft) {
      elements.count.textContent = '0';
      elements.list.innerHTML = '<div class="editor-empty">Load a structure to begin.</div>';
      return;
    }
    elements.count.textContent = String(draft.regions.length);
    if (!draft.regions.length) {
      elements.list.innerHTML = '<div class="editor-empty">No annotations yet. Select residues in Mol*, capture the selection, and add a region.</div>';
      updateGeneratedYamlPreview();
      return;
    }
    elements.list.innerHTML = '';
    draft.regions.forEach((region, index) => {
      const item = document.createElement('div');
      item.className = `annotation-list-item${region.enabled ? '' : ' is-disabled'}`;
      item.innerHTML = `
        <span class="annotation-swatch" style="background:${region.componentColorTheme === 'uniform' ? region.componentColor : '#CBD5E1'}"></span>
        <div class="annotation-list-copy">
          <strong></strong>
          <span class="annotation-list-meta"></span>
        </div>
        <div class="annotation-list-actions">
          <button type="button" data-action="select">Select</button>
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="up" aria-label="Move up">↑</button>
          <button type="button" data-action="down" aria-label="Move down">↓</button>
          <button type="button" data-action="delete">Delete</button>
        </div>`;
      item.querySelector('strong').textContent = region.name;
      item.querySelector('.annotation-list-meta').textContent =
        `${selectionText(region)} · ${region.componentRepresentation} · ${region.componentColorTheme}`;
      item.querySelector('[data-action="select"]').addEventListener('click', () => selectRegionInMolstar(index));
      item.querySelector('[data-action="edit"]').addEventListener('click', () => loadRegionIntoForm(index));
      item.querySelector('[data-action="up"]').addEventListener('click', () => moveRegion(index, -1));
      item.querySelector('[data-action="down"]').addEventListener('click', () => moveRegion(index, 1));
      item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteRegion(index));
      elements.list.appendChild(item);
    });
    updateGeneratedYamlPreview();
  }

  function yamlRegion(region) {
    const output = { name: region.name };
    if (!region.enabled) output.enabled = false;
    if (region.chains.length === 1) output.chain = region.chains[0];
    else if (region.chains.length > 1) output.chains = [...region.chains];
    if (region.numbering !== draft.numbering) output.numbering = region.numbering;
    if (region.selectionType === 'positions') output.positions = [...region.positions];
    else {
      output.start = region.start;
      output.end = region.end;
    }
    if (region.description) output.description = region.description;
    if (!region.createComponent) output.create_component = false;
    if (region.componentName && region.componentName !== region.name) output.component_name = region.componentName;
    output.component_representation = region.componentRepresentation;
    if (region.componentRepresentationParams) output.component_representation_params = clone(region.componentRepresentationParams);
    if (region.componentColorTheme === 'uniform') output.color = normalizeHex(region.componentColor || region.color);
    else {
      output.component_color_theme = region.componentColorTheme;
      if (region.componentColorThemeParams) output.component_color_theme_params = clone(region.componentColorThemeParams);
    }
    if (region.componentOpacity !== 1) output.component_opacity = region.componentOpacity;
    if (!region.componentVisible) output.component_visible = false;
    if (region.label) output.label_3d = true;
    if (!region.tooltip) output.tooltip = false;
    return output;
  }

  function generatedYamlObject() {
    updateDraftFromGlobalForm(false);
    const viewer = {
      style: draft.viewer.style,
      component_representation: draft.viewer.componentRepresentation,
      component_color_theme: draft.viewer.componentColorTheme,
      component_color: draft.viewer.componentColor,
      component_opacity: draft.viewer.componentOpacity,
      components_visible: draft.viewer.componentsVisible,
      background: draft.viewer.background,
      show_labels: draft.viewer.showLabels,
      show_tooltips: draft.viewer.showTooltips,
      create_components: draft.viewer.createComponents,
      base_component_name: draft.viewer.baseComponentName,
      base_color: draft.viewer.baseColor,
      base_opacity: draft.viewer.baseOpacity
    };
    if (draft.viewer.componentRepresentationParams) viewer.component_representation_params = clone(draft.viewer.componentRepresentationParams);
    if (draft.viewer.componentColorThemeParams) viewer.component_color_theme_params = clone(draft.viewer.componentColorThemeParams);
    if (draft.viewer.postprocessing) viewer.postprocessing = clone(draft.viewer.postprocessing);
    const output = {
      version: 1,
      title: draft.title,
      numbering: draft.numbering
    };
    if (draft.defaultChains?.length === 1) output.default_chain = draft.defaultChains[0];
    else if (draft.defaultChains?.length > 1) output.default_chain = [...draft.defaultChains];
    if (Object.keys(draft.msaReferences).length) output.msa = { references: { ...draft.msaReferences } };
    output.viewer = viewer;
    output.regions = draft.regions.map(yamlRegion);
    return output;
  }

  function generateYaml() {
    if (!draft) return '';
    const yamlApi = window.jsyaml || window.jsYaml || window.JSYAML || window['js-yaml'];
    if (!yamlApi?.dump) throw new Error('The YAML serializer is unavailable.');
    const body = yamlApi.dump(generatedYamlObject(), {
      noRefs: true,
      lineWidth: -1,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false
    });
    return `# Generated by EvoSupplement Protein Structure and MSA Editor ${EDITOR_VERSION}\n${body}`;
  }

  function updateGeneratedYamlPreview() {
    if (!draft) {
      elements.yamlPreview.textContent = 'Load a structure to create YAML.';
      return;
    }
    try {
      elements.yamlPreview.textContent = generateYaml();
    } catch (error) {
      elements.yamlPreview.textContent = error?.message || String(error);
    }
  }

  function generatedYamlFilename() {
    const base = clean(draft?.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return `${base || 'protein-annotations'}.yaml`;
  }

  async function applyPreview() {
    if (!draft || !hasStructure()) return;
    updateDraftFromGlobalForm(false);
    const yaml = generateYaml();
    applying = true;
    setStatus('Applying generated YAML to Mol*…', 'busy');
    elements.applyPreview.disabled = true;
    try {
      await api.applyAnnotationYaml(yaml, generatedYamlFilename());
      dirty = false;
      setStatus(`Preview applied · ${draft.regions.length} annotation${draft.regions.length === 1 ? '' : 's'}`, 'ready');
    } catch (error) {
      applying = false;
      setStatus(error?.message || 'Could not apply the generated YAML', 'error');
    } finally {
      updateFormAvailability();
    }
  }

  function downloadYaml() {
    if (!draft) return;
    const yaml = generateYaml();
    api.downloadText(yaml, generatedYamlFilename(), 'application/yaml;charset=utf-8');
    setStatus('Downloaded the generated protein annotation YAML', 'ready');
  }

  function markDirty() {
    if (!draft) return;
    dirty = true;
    setStatus('Draft changed · apply the preview or download the YAML', 'dirty');
    updateGeneratedYamlPreview();
    updateFormAvailability();
  }

  function updateColorField() {
    const uniform = elements.colorTheme.value === 'uniform';
    elements.colorField.hidden = !uniform;
  }

  function updateFormAvailability() {
    const structure = hasStructure();
    elements.captureSelection.disabled = !structure;
    if (elements.refreshComponents) elements.refreshComponents.disabled = !structure;
    if (elements.importSelectedComponents) {
      const selectedComponentCount = elements.componentList
        ? elements.componentList.querySelectorAll('input[data-component-import]:checked:not(:disabled)').length
        : 0;
      elements.importSelectedComponents.disabled = !structure || selectedComponentCount === 0;
    }
    elements.save.disabled = !structure || !capturedGroups.length || !clean(elements.name.value);
    elements.applyPreview.disabled = !structure || applying;
    elements.downloadYaml.disabled = !structure;
    elements.resetDraft.disabled = !structure || !originalDraft;
    const msaReady = structure && hasMsa();
    elements.suggestReferences.disabled = !msaReady;
    elements.applyReferences.disabled = !msaReady;
  }

  function referenceLabel(record) {
    const header = clean(record.header);
    const id = clean(record.id);
    const description = header && header !== id ? header : id;
    return `${description || `Sequence ${record.index + 1}`} · ${record.ungappedLength} aa`;
  }

  function currentReferenceForChain(chain, records) {
    const reference = draft?.msaReferences?.[chain] || '';
    if (!reference) return '';
    const matched = records.find(record => record.id === reference || record.header === reference);
    return matched ? (matched.id || matched.header) : reference;
  }

  function renderReferenceRows() {
    if (!draft || !hasStructure()) {
      elements.referenceRows.innerHTML = '<div class="editor-empty">Load a structure to inspect chains.</div>';
      elements.referenceHelp.textContent = 'Load a structure and an aligned FASTA file. Suggestions rank the best shared sequence segment, but the final chain-to-row choice remains yours.';
      updateFormAvailability();
      return;
    }
    const chains = api.getStructureChains();
    const records = api.getMsaRecords();
    if (!records.length) {
      elements.referenceRows.innerHTML = chains.map(chain => `
        <div class="reference-row">
          <span class="reference-chain">Chain ${escapeHtml(chain.chain || '(blank)')}</span>
          <span class="reference-metrics">${chain.residueCount} observed residues</span>
          <span class="reference-metrics">Load an aligned FASTA file above.</span>
        </div>`).join('');
      elements.referenceHelp.textContent = `${chains.length} structure chain${chains.length === 1 ? '' : 's'} detected. Choose an MSA file to find references.`;
      updateFormAvailability();
      return;
    }
    elements.referenceRows.innerHTML = '';
    for (const chain of chains) {
      const row = document.createElement('div');
      row.className = 'reference-row';
      const chainLabel = document.createElement('span');
      chainLabel.className = 'reference-chain';
      chainLabel.textContent = `Chain ${chain.chain || '(blank)'}`;
      const select = document.createElement('select');
      select.dataset.chain = chain.chain;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Not linked';
      select.appendChild(empty);
      for (const record of records) {
        const option = document.createElement('option');
        option.value = record.id || record.header;
        option.textContent = referenceLabel(record);
        option.title = record.header;
        select.appendChild(option);
      }
      const current = currentReferenceForChain(chain.chain, records);
      if (current && !records.some(record => (record.id || record.header) === current)) {
        const missing = document.createElement('option');
        missing.value = current;
        missing.textContent = `${current} · not found in current MSA`;
        select.appendChild(missing);
      }
      select.value = current;
      const metrics = document.createElement('span');
      metrics.className = 'reference-metrics';
      const updateMetrics = () => {
        const selectedReference = clean(select.value);
        const suggestionGroup = referenceSuggestions.get(chain.chain);
        const suggestions = suggestionGroup?.candidates || [];
        const suggestion = suggestions.find(candidate =>
          candidate.reference === selectedReference || candidate.id === selectedReference || candidate.header === selectedReference
        );
        if (suggestion) {
          metrics.textContent = `${Math.round(suggestion.identity * 100)}% identity · ${suggestion.mappedResidues}/${suggestion.chainLength} structure residues · ${suggestion.method}`;
        } else if (selectedReference) {
          const linked = currentViewerState()?.msa?.linkedChains?.find(item =>
            item.chain === chain.chain && (item.reference === selectedReference || !item.reference)
          );
          metrics.textContent = linked
            ? `${Math.round(linked.identity * 100)}% identity · ${linked.mappedResidues} mapped · ${linked.method}`
            : `${chain.residueCount} observed residues · reference selected`;
        } else if (suggestionGroup && suggestionGroup.proteinLike === false) {
          metrics.textContent = `${chain.residueCount} observed residues · no protein-like sequence extracted`;
        } else {
          metrics.textContent = `${chain.residueCount} observed residues · no reference selected`;
        }
      };
      select.addEventListener('change', () => {
        const value = clean(select.value);
        if (value) draft.msaReferences[chain.chain] = value;
        else delete draft.msaReferences[chain.chain];
        updateMetrics();
        markDirty();
      });
      updateMetrics();
      row.append(chainLabel, select, metrics);
      elements.referenceRows.appendChild(row);
    }
    elements.referenceHelp.textContent = `${chains.length} chain${chains.length === 1 ? '' : 's'} × ${records.length} alignment record${records.length === 1 ? '' : 's'}. Suggestions are permissive because the author confirms the biological relationship.`;
    updateFormAvailability();
  }

  async function suggestReferences() {
    if (!hasStructure() || !hasMsa()) return;
    setStatus('Comparing structure chains with MSA records…', 'busy');
    elements.suggestReferences.disabled = true;
    try {
      const results = await api.suggestMsaReferences({ limit: 5 });
      referenceSuggestions.clear();
      for (const result of results) {
        referenceSuggestions.set(result.chain, result);
        const best = result.candidates[0];
        if (best) draft.msaReferences[result.chain] = best.reference;
      }
      renderReferenceRows();
      markDirty();
      setStatus('Reference suggestions are ready; review them and click Apply references', 'dirty');
    } catch (error) {
      setStatus(error?.message || 'Could not find MSA references', 'error');
    } finally {
      updateFormAvailability();
    }
  }

  function applyReferences() {
    if (!draft || !hasMsa()) return;
    const refs = {};
    for (const select of elements.referenceRows.querySelectorAll('select[data-chain]')) {
      const value = clean(select.value);
      if (value) refs[select.dataset.chain] = value;
    }
    draft.msaReferences = refs;
    const result = api.setMsaReferences(refs);
    markDirty();
    renderReferenceRows();
    setStatus(
      `${result.linkedChains.length} chain${result.linkedChains.length === 1 ? '' : 's'} linked to the alignment` +
      (result.warnings.length ? ` · ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}` : ''),
      result.warnings.length ? 'dirty' : 'ready'
    );
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function syncFromViewer({ preserveOriginal = false } = {}) {
    if (!api) return;
    const annotation = api.getAnnotation?.();
    if (!annotation) {
      draft = null;
      latestSelection = [];
      capturedGroups = [];
      molstarComponents = [];
      renderAnnotationList();
      renderReferenceRows();
      renderMolstarComponents();
      updateFormAvailability();
      setStatus('Load a structure to begin', 'idle');
      return;
    }
    draft = draftFromSnapshot(annotation);
    if (!preserveOriginal || !originalDraft) originalDraft = clone(draft);
    dirty = false;
    applying = false;
    referenceSuggestions.clear();
    populateGlobalForm();
    renderAnnotationList();
    renderReferenceRows();
    resetAnnotationForm();
    refreshMolstarComponents({ silent: true });
    updateGeneratedYamlPreview();
    updateFormAvailability();
    setStatus(
      `Ready · ${draft.regions.length} annotation${draft.regions.length === 1 ? '' : 's'} · ${api.getStructureChains().length} chain${api.getStructureChains().length === 1 ? '' : 's'}`,
      'ready'
    );
  }

  function resetDraft() {
    if (!originalDraft) return;
    draft = clone(originalDraft);
    dirty = false;
    referenceSuggestions.clear();
    populateGlobalForm();
    renderAnnotationList();
    renderReferenceRows();
    resetAnnotationForm();
    setStatus('Restored the annotation draft loaded with this structure', 'ready');
  }

  function bindColorPair(colorInput, textInput, callback) {
    colorInput.addEventListener('input', () => {
      textInput.value = colorInput.value.toUpperCase();
      callback?.(colorInput.value.toUpperCase());
    });
    textInput.addEventListener('change', () => {
      const normalized = syncColorPair(colorInput, textInput, textInput.value);
      callback?.(normalized);
    });
  }

  function bindEvents() {
    for (const element of [elements.title, elements.numbering, elements.defaultChain, elements.viewerStyle]) {
      element.addEventListener('change', () => updateDraftFromGlobalForm(true));
    }
    bindColorPair(elements.backgroundColor, elements.backgroundText, () => updateDraftFromGlobalForm(true));
    bindColorPair(elements.baseColor, elements.baseColorText, () => updateDraftFromGlobalForm(true));
    elements.baseOpacity.addEventListener('input', () => {
      elements.baseOpacityValue.textContent = clamp(elements.baseOpacity.value, 0, 1, 1).toFixed(2);
      updateDraftFromGlobalForm(true);
    });
    elements.captureSelection.addEventListener('click', captureCurrentSelection);
    elements.refreshComponents?.addEventListener('click', () => refreshMolstarComponents({ silent: false }));
    elements.importSelectedComponents?.addEventListener('click', importCheckedMolstarComponents);
    elements.name.addEventListener('input', updateFormAvailability);
    elements.colorTheme.addEventListener('change', updateColorField);
    bindColorPair(elements.color, elements.colorText);
    elements.opacity.addEventListener('input', () => {
      elements.opacityValue.textContent = clamp(elements.opacity.value, 0, 1, 1).toFixed(2);
    });
    elements.save.addEventListener('click', saveAnnotation);
    elements.cancelEdit.addEventListener('click', resetAnnotationForm);
    elements.resetDraft.addEventListener('click', resetDraft);
    elements.applyPreview.addEventListener('click', applyPreview);
    elements.downloadYaml.addEventListener('click', downloadYaml);
    elements.suggestReferences.addEventListener('click', suggestReferences);
    elements.applyReferences.addEventListener('click', applyReferences);

    document.addEventListener('protein-region-viewer:loaded', () => syncFromViewer({ preserveOriginal: false }));
    document.addEventListener('protein-region-viewer:annotation-applied', () => {
      if (applying) syncFromViewer({ preserveOriginal: true });
      else syncFromViewer({ preserveOriginal: false });
    });
    document.addEventListener('protein-region-viewer:msa-loaded', renderReferenceRows);
    document.addEventListener('protein-region-viewer:msa-cleared', renderReferenceRows);
    document.addEventListener('protein-region-viewer:msa-references-changed', renderReferenceRows);
    document.addEventListener('protein-region-viewer:selection-changed', event => {
      latestSelection = Array.isArray(event.detail?.residues) ? event.detail.residues : [];
      if (!capturedGroups.length) updateCapturedSummary();
    });
  }

  function initialize() {
    api = window.ProteinRegionViewer || null;
    if (!api) {
      setStatus('Protein viewer API did not initialize', 'error');
      return;
    }
    bindEvents();
    updateColorField();
    updateCapturedSummary();
    syncFromViewer({ preserveOriginal: false });
  }

  initialize();
})();
