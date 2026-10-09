(() => {
  'use strict';

  const BUILDER_VERSION = '1.9.0';
  const PROJECT_SCHEMA_VERSION = 1;
  // State archives contain authoring data and original uploads, never Builder code.
  // Keep this version independent of UI/releases; add migrations before changing it.
  const STATE_SCHEMA_VERSION = 1;
  const STATE_FORMAT = 'evosupplement-builder-state';
  const STATE_MANIFEST = 'evosupplement-builder-state.json';
  // This namespace cannot collide with imported item IDs (letters, digits, _ and -).
  const PROJECT_UPLOAD_ID = '@project';
  const COVER_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
  const PORTABLE_TARGETS = {
    windows: { label: 'Windows', launcher: 'Open supplement.lnk', fallbackLauncher: 'Open-supplement.cmd', files: [
      ['launcher/Open-supplement.cmd', 'Open-supplement.cmd'],
      ['launcher/launcher.cs', '_portable/launcher.cs']
    ] },
    macos: { label: 'macOS', launcher: 'Open-supplement.command', files: [
      ['launcher/Open-supplement.command', 'Open-supplement.command', true],
      ['launcher/server.pl', '_portable/server.pl']
    ] },
    'linux-amd64': { label: 'Linux x64', launcher: 'Open-supplement', files: [
      ['bin/linux-amd64/evosupplement', 'Open-supplement', true],
      ['launcher/launcher.c', '_portable/launcher.c']
    ] }
  };
  const MODULE_VERSIONS = {
    protein: '2.13.0',
    neighborhood: '3.4.0',
    phylogeny: '2.1.0',
    network: '1.2.0',
    taxonomy: '1.4.1',
    architecture: '1.0.0',
    multistructure: '1.0.0'
  };

  const MODULE_REGISTRY = {
    protein: {
      label: 'Protein structure + MSA',
      folder: 'protein-viewer',
      template: 'protein-viewer/figure1/index.html',
      readme: 'protein-viewer/README.md',
      shared: [
        'protein-viewer/shared/app.js',
        'protein-viewer/shared/styles.css'
      ]
    },
    neighborhood: {
      label: 'Gene neighborhood',
      folder: 'neighborhood-viewer',
      template: 'neighborhood-viewer/figure1/index.html',
      readme: 'neighborhood-viewer/README.md',
      shared: [
        'neighborhood-viewer/shared/neighborhood-viewer.js',
        'neighborhood-viewer/shared/styles.css'
      ]
    },
    phylogeny: {
      label: 'Phylogeny',
      folder: 'phylogeny-viewer',
      template: 'phylogeny-viewer/figure1/index.html',
      readme: 'phylogeny-viewer/README.md',
      shared: [
        'phylogeny-viewer/shared/phylogeny-viewer.js',
        'phylogeny-viewer/shared/styles.css'
      ]
    },
    network: {
      label: 'Network',
      folder: 'network-viewer',
      template: 'network-viewer/figure1/index.html',
      readme: 'network-viewer/README.md',
      shared: [
        'network-viewer/shared/network-viewer.js',
        'network-viewer/shared/styles.css'
      ]
    },
    taxonomy: {
      label: 'Taxonomy Sankey',
      folder: 'taxonomy-sankey-viewer',
      template: 'taxonomy-sankey-viewer/figure1/index.html',
      readme: 'taxonomy-sankey-viewer/README.md',
      shared: [
        'taxonomy-sankey-viewer/shared/taxonomy-sankey-viewer.js',
        'taxonomy-sankey-viewer/shared/styles.css'
      ]
    },
    architecture: {
      label: 'Protein domain architecture',
      folder: 'domain-architecture-viewer',
      template: 'domain-architecture-viewer/figure1/index.html',
      readme: 'domain-architecture-viewer/README.md',
      shared: [
        'domain-architecture-viewer/shared/domain-architecture-viewer.js',
        'domain-architecture-viewer/shared/styles.css'
      ]
    },
    multistructure: {
      label: 'Multi-structure comparison',
      folder: 'multi-structure-viewer',
      template: 'multi-structure-viewer/figure1/index.html',
      readme: 'multi-structure-viewer/README.md',
      shared: [
        'multi-structure-viewer/shared/multi-structure-viewer.js',
        'multi-structure-viewer/shared/styles.css',
        'multi-structure-viewer/MVT-LICENSE.txt'
      ]
    }
  };

  const KIND_LABELS = {
    file: 'File',
    html: 'HTML',
    protein: 'Structure + MSA',
    neighborhood: 'Neighborhood',
    phylogeny: 'Phylogeny',
    network: 'Network',
    taxonomy: 'Taxonomy Sankey',
    architecture: 'Domain architecture',
    multistructure: 'Multi-structure comparison',
    external: 'External link',
    coming: 'Coming soon'
  };

  const SOURCE_CACHE = new Map();
  const uploadFiles = new Map();
  let state = createInitialState();
  let validationMessages = [];
  let toastTimer = null;
  let coverPreviewFile = null;
  let coverPreviewUrl = '';

  const els = {
    projectTitle: document.getElementById('projectTitle'),
    projectShortTitle: document.getElementById('projectShortTitle'),
    repositoryName: document.getElementById('repositoryName'),
    projectDescription: document.getElementById('projectDescription'),
    projectJournal: document.getElementById('projectJournal'),
    projectYear: document.getElementById('projectYear'),
    projectDoi: document.getElementById('projectDoi'),
    projectLicense: document.getElementById('projectLicense'),
    projectCoverInput: document.getElementById('projectCoverInput'),
    projectCoverAlt: document.getElementById('projectCoverAlt'),
    projectCoverCaption: document.getElementById('projectCoverCaption'),
    projectCoverInfo: document.getElementById('projectCoverInfo'),
    projectCoverPreview: document.getElementById('projectCoverPreview'),
    removeProjectCoverBtn: document.getElementById('removeProjectCoverBtn'),
    authorsHost: document.getElementById('authorsHost'),
    sectionsHost: document.getElementById('sectionsHost'),
    emptySections: document.getElementById('emptySections'),
    portalPreview: document.getElementById('portalPreview'),
    projectSummary: document.getElementById('projectSummary'),
    validationStatus: document.getElementById('validationStatus'),
    validationResults: document.getElementById('validationResults'),
    openProjectInput: document.getElementById('openProjectInput'),
    loadStateInput: document.getElementById('loadStateInput'),
    portablePlatform: document.getElementById('portablePlatform'),
    busyOverlay: document.getElementById('busyOverlay'),
    busyTitle: document.getElementById('busyTitle'),
    busyMessage: document.getElementById('busyMessage'),
    busyProgress: document.getElementById('busyProgress'),
    busyPercent: document.getElementById('busyPercent'),
    toast: document.getElementById('toast')
  };

  function uid(prefix = 'id') {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function createInitialState() {
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      builderVersion: BUILDER_VERSION,
      exportOptions: { portablePlatform: 'windows' },
      project: {
        title: '',
        shortTitle: 'EvoSupplement',
        repositoryName: 'evosupplement',
        repositoryTouched: false,
        description: '',
        journal: '',
        year: String(new Date().getFullYear()),
        doi: '',
        license: 'MIT',
        coverAlt: '',
        coverCaption: '',
        authors: [{ id: uid('author'), name: '', orcid: '' }]
      },
      sections: []
    };
  }

  function defaultItem(kind = 'file') {
    return {
      id: uid('item'),
      title: '',
      description: '',
      slug: '',
      slugTouched: false,
      kind,
      config: defaultConfig(kind)
    };
  }

  function defaultConfig(kind) {
    switch (kind) {
      case 'file':
        return { badge: 'doc' };
      case 'html':
        return { mode: 'single' };
      case 'protein':
        return { defaultLayout: 'canvas' };
      case 'neighborhood':
        return { inputFormat: 'auto', defaultScaleMode: 'fixed', defaultAlignQuery: false, defaultFlipNegativeQueries: true, defaultShowLabels: true, defaultZoom: 1 };
      case 'phylogeny':
        return {
          idColumn: 'id',
          delimiter: 'tab'
        };
      case 'taxonomy':
        return {};
      case 'architecture':
        return {};
      case 'multistructure':
        return {};
      case 'network':
        return {
          minimumCount: 5,
          layout: 'fruchterman-reingold',
          communityMethod: 'none',
          communityResolution: 1,
          communityWeighted: true,
          colorBy: 'function',
          groupLayoutBy: 'function',
          showIsolates: false
        };
      case 'external':
        return { url: '' };
      case 'coming':
        return {};
      default:
        return {};
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function slugify(value, fallback = '') {
    const normalized = String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
    return normalized || fallback;
  }

  function sanitizeFileName(name, fallback = 'file') {
    const raw = String(name || fallback).replace(/\\/g, '/').split('/').pop();
    const lastDot = raw.lastIndexOf('.');
    const base = lastDot > 0 ? raw.slice(0, lastDot) : raw;
    const ext = lastDot > 0 ? raw.slice(lastDot).toLowerCase().replace(/[^.a-z0-9_-]/g, '') : '';
    const safeBase = slugify(base, fallback).slice(0, 120);
    return `${safeBase}${ext}`;
  }

  function extensionOf(name) {
    const match = String(name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unit = units[0];
    for (let i = 1; i < units.length && size >= 1024; i += 1) {
      size /= 1024;
      unit = units[i];
    }
    return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${unit}`;
  }

  function findSection(sectionId) {
    return state.sections.find(section => section.id === sectionId);
  }

  function findItem(sectionId, itemId) {
    return findSection(sectionId)?.items.find(item => item.id === itemId);
  }

  function findItemAnywhere(itemId) {
    for (const section of state.sections) {
      const item = section.items.find(candidate => candidate.id === itemId);
      if (item) return { section, item };
    }
    return null;
  }

  function fileKey(itemId, role) {
    return `${itemId}::${role}`;
  }

  function getUpload(itemId, role) {
    return uploadFiles.get(fileKey(itemId, role)) || null;
  }

  function setUpload(itemId, role, file) {
    if (file) uploadFiles.set(fileKey(itemId, role), file);
    else uploadFiles.delete(fileKey(itemId, role));
  }

  function coverValidationError(file) {
    if (!file.size) return 'The cover image is empty. Choose a PNG, JPG, WebP, GIF or SVG image.';
    const extension = extensionOf(file.name).slice(1);
    if (!Object.prototype.hasOwnProperty.call(COVER_TYPES, extension)) {
      return 'Choose a PNG, JPG, WebP, GIF or SVG file for the cover image.';
    }
    return '';
  }

  function handleCoverUpload(file) {
    if (!file) return;
    const error = coverValidationError(file);
    if (error) { showToast(error); return; }
    setUpload(PROJECT_UPLOAD_ID, 'cover', file);
    updateReview();
    showToast('Cover image added. It will be included in saved states and exported supplements.');
  }

  function clearProjectCover() {
    setUpload(PROJECT_UPLOAD_ID, 'cover', null);
    state.project.coverAlt = '';
    state.project.coverCaption = '';
    syncProjectInputs();
    updateReview();
  }

  function getCoverPreviewUrl() {
    const file = getUpload(PROJECT_UPLOAD_ID, 'cover');
    if (file !== coverPreviewFile) {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      coverPreviewFile = file;
      // Some systems supply an empty/incorrect MIME type, particularly for SVG.
      // Give the preview its image type without changing the original saved File.
      const type = file && COVER_TYPES[extensionOf(file.name).slice(1)];
      coverPreviewUrl = file ? URL.createObjectURL(file.slice(0, file.size, type || file.type)) : '';
    }
    return coverPreviewUrl;
  }

  function renderCoverControls() {
    const file = getUpload(PROJECT_UPLOAD_ID, 'cover');
    const src = getCoverPreviewUrl();
    els.projectCoverInfo.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : 'No cover image selected.';
    els.projectCoverPreview.hidden = !file;
    els.removeProjectCoverBtn.hidden = !file;
    if (src) els.projectCoverPreview.src = src;
    else els.projectCoverPreview.removeAttribute('src');
    els.projectCoverPreview.alt = state.project.coverAlt || 'Supplement cover image';
  }

  function getRequiredRoles(item) {
    switch (item.kind) {
      case 'file': return ['file'];
      case 'html': return ['html'];
      case 'protein': return ['structure', 'annotations'];
      case 'neighborhood': return ['neighborhoods', 'rename', 'colors'];
      case 'phylogeny': return ['tree', 'phylogenyYaml'];
      case 'network': return ['edges'];
      case 'taxonomy': return ['taxonomyResolved', 'taxonomyYaml'];
      case 'architecture': return ['architectureData', 'architectureYaml'];
      case 'multistructure': return ['multiStructurePackage'];
      default: return [];
    }
  }

  function bindStaticEvents() {
    document.getElementById('newProjectButton').addEventListener('click', resetProject);
    document.getElementById('openProjectButton').addEventListener('click', () => els.openProjectInput.click());
    els.openProjectInput.addEventListener('change', handleOpenProject);
    document.getElementById('saveStateButton').addEventListener('click', saveBuilderState);
    document.getElementById('loadStateButton').addEventListener('click', () => els.loadStateInput.click());
    els.loadStateInput.addEventListener('change', handleOpenProject);
    els.projectCoverInput.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      handleCoverUpload(file);
    });
    els.removeProjectCoverBtn.addEventListener('click', clearProjectCover);
    document.getElementById('addAuthorButton').addEventListener('click', () => {
      state.project.authors.push({ id: uid('author'), name: '', orcid: '' });
      renderAuthors();
      updateReview();
    });
    document.getElementById('addSectionButton').addEventListener('click', addSection);
    document.getElementById('validateButton').addEventListener('click', runValidation);
    document.getElementById('downloadButton').addEventListener('click', () => downloadProject());
    document.getElementById('portableDownloadButton').addEventListener('click', () => downloadProject({ portablePlatform: els.portablePlatform.value }));
    els.portablePlatform.addEventListener('change', () => {
      state.exportOptions.portablePlatform = els.portablePlatform.value;
    });

    const projectBindings = [
      [els.projectTitle, 'title'],
      [els.projectShortTitle, 'shortTitle'],
      [els.repositoryName, 'repositoryName'],
      [els.projectDescription, 'description'],
      [els.projectJournal, 'journal'],
      [els.projectYear, 'year'],
      [els.projectDoi, 'doi'],
      [els.projectLicense, 'license'],
      [els.projectCoverAlt, 'coverAlt'],
      [els.projectCoverCaption, 'coverCaption']
    ];

    for (const [element, field] of projectBindings) {
      const eventName = element.tagName === 'SELECT' ? 'change' : 'input';
      element.addEventListener(eventName, () => {
        state.project[field] = element.value;
        if (field === 'repositoryName') state.project.repositoryTouched = true;
        if (field === 'title' && !state.project.repositoryTouched) {
          state.project.repositoryName = slugify(element.value, 'evosupplement');
          els.repositoryName.value = state.project.repositoryName;
        }
        updateReview();
      });
    }

    els.authorsHost.addEventListener('input', handleAuthorInput);
    els.authorsHost.addEventListener('click', handleAuthorClick);
    els.sectionsHost.addEventListener('input', handleDynamicInput);
    els.sectionsHost.addEventListener('change', handleDynamicChange);
    els.sectionsHost.addEventListener('click', handleDynamicClick);
    document.addEventListener('click', event => {
      const addFirst = event.target.closest('[data-action="add-section"]');
      if (addFirst) addSection();
    });
  }

  function resetProject() {
    if (hasProjectContent() && !window.confirm('Start a new project? Unsaved Builder changes will be cleared.')) return;
    state = createInitialState();
    uploadFiles.clear();
    validationMessages = [];
    syncProjectInputs();
    renderAll();
    showToast('New project started.');
  }

  function syncProjectInputs() {
    els.portablePlatform.value = state.exportOptions.portablePlatform;
    els.projectTitle.value = state.project.title || '';
    els.projectShortTitle.value = state.project.shortTitle ?? 'EvoSupplement';
    els.repositoryName.value = state.project.repositoryName ?? 'evosupplement';
    els.projectDescription.value = state.project.description || '';
    els.projectJournal.value = state.project.journal || '';
    els.projectYear.value = state.project.year || '';
    els.projectDoi.value = state.project.doi || '';
    els.projectLicense.value = state.project.license ?? 'MIT';
    els.projectCoverAlt.value = state.project.coverAlt || '';
    els.projectCoverCaption.value = state.project.coverCaption || '';
    els.projectCoverInput.value = '';
  }

  function addSection() {
    const index = state.sections.length + 1;
    state.sections.push({
      id: uid('section'),
      title: index === 1 ? 'Figures' : `Section ${index}`,
      slug: index === 1 ? 'figures' : `section-${index}`,
      slugTouched: false,
      items: []
    });
    renderSections();
    updateReview();
    const last = els.sectionsHost.querySelector('.section-card:last-child input[data-section-field="title"]');
    last?.focus();
    last?.select();
  }

  function handleAuthorInput(event) {
    const input = event.target.closest('[data-author-field]');
    if (!input) return;
    const author = state.project.authors.find(entry => entry.id === input.dataset.authorId);
    if (!author) return;
    author[input.dataset.authorField] = input.value;
    updateReview();
  }

  function handleAuthorClick(event) {
    const button = event.target.closest('[data-action="remove-author"]');
    if (!button) return;
    if (state.project.authors.length === 1) {
      state.project.authors[0].name = '';
      state.project.authors[0].orcid = '';
    } else {
      state.project.authors = state.project.authors.filter(author => author.id !== button.dataset.authorId);
    }
    renderAuthors();
    updateReview();
  }

  function handleDynamicInput(event) {
    const target = event.target;
    if (target.matches('input[type="file"]')) return;

    if (target.dataset.sectionField) {
      const section = findSection(target.dataset.sectionId);
      if (!section) return;
      section[target.dataset.sectionField] = target.value;
      if (target.dataset.sectionField === 'slug') section.slugTouched = true;
      if (target.dataset.sectionField === 'title' && !section.slugTouched) {
        section.slug = slugify(target.value, 'section');
        const slugInput = target.closest('.section-card')?.querySelector('[data-section-field="slug"]');
        if (slugInput) slugInput.value = section.slug;
      }
      updateReview();
      return;
    }

    if (target.dataset.itemField) {
      const item = findItem(target.dataset.sectionId, target.dataset.itemId);
      if (!item) return;
      item[target.dataset.itemField] = target.value;
      if (target.dataset.itemField === 'slug') item.slugTouched = true;
      if (target.dataset.itemField === 'title' && !item.slugTouched) {
        item.slug = slugify(target.value, 'item');
        const slugInput = target.closest('.item-card')?.querySelector('[data-item-field="slug"]');
        if (slugInput) slugInput.value = item.slug;
      }
      const headerTitle = target.closest('.item-card')?.querySelector('.item-header strong');
      if (headerTitle && target.dataset.itemField === 'title') headerTitle.textContent = target.value || 'Untitled item';
      const path = target.closest('.item-card')?.querySelector('.item-path');
      if (path) path.textContent = generatedPathLabel(findSection(target.dataset.sectionId), item);
      updateReview();
      return;
    }

    if (target.dataset.configField) {
      const item = findItem(target.dataset.sectionId, target.dataset.itemId);
      if (!item) return;
      item.config[target.dataset.configField] = coerceInputValue(target);
      updateReview();
    }
  }

  function handleDynamicChange(event) {
    const target = event.target;
    if (target.matches('input[type="file"]')) {
      const file = target.files?.[0] || null;
      setUpload(target.dataset.itemId, target.dataset.fileRole, file);
      renderSections();
      updateReview();
      return;
    }

    if (target.dataset.itemKind) {
      const item = findItem(target.dataset.sectionId, target.dataset.itemId);
      if (!item) return;
      removeItemUploads(item.id);
      item.kind = target.value;
      item.config = defaultConfig(target.value);
      renderSections();
      updateReview();
      return;
    }

    if (target.dataset.configField) {
      const item = findItem(target.dataset.sectionId, target.dataset.itemId);
      if (!item) return;
      item.config[target.dataset.configField] = coerceInputValue(target);
      const requiresRerender = ['mode'].includes(target.dataset.configField);
      if (requiresRerender) renderSections();
      updateReview();
    }
  }

  function coerceInputValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.dataset.valueType === 'number') {
      const value = Number(input.value);
      return Number.isFinite(value) ? value : 0;
    }
    return input.value;
  }

  function handleDynamicClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const sectionId = button.dataset.sectionId;
    const itemId = button.dataset.itemId;

    if (action === 'add-item') {
      const section = findSection(sectionId);
      if (!section) return;
      section.items.push(defaultItem('file'));
      renderSections();
      updateReview();
      const lastTitle = els.sectionsHost.querySelector(`[data-section-id="${CSS.escape(sectionId)}"] .item-card:last-child [data-item-field="title"]`);
      lastTitle?.focus();
      return;
    }

    if (action === 'remove-section') {
      const section = findSection(sectionId);
      if (!section) return;
      if (!window.confirm(`Remove the section “${section.title || 'Untitled'}” and all its items?`)) return;
      for (const item of section.items) removeItemUploads(item.id);
      state.sections = state.sections.filter(candidate => candidate.id !== sectionId);
      renderSections();
      updateReview();
      return;
    }

    if (action === 'remove-item') {
      const section = findSection(sectionId);
      const item = findItem(sectionId, itemId);
      if (!section || !item) return;
      if (!window.confirm(`Remove “${item.title || 'Untitled item'}”?`)) return;
      removeItemUploads(item.id);
      section.items = section.items.filter(candidate => candidate.id !== itemId);
      renderSections();
      updateReview();
      return;
    }

    if (action === 'move-section-up' || action === 'move-section-down') {
      moveInArray(state.sections, sectionId, action.endsWith('up') ? -1 : 1);
      renderSections();
      updateReview();
      return;
    }

    if (action === 'move-item-up' || action === 'move-item-down') {
      const section = findSection(sectionId);
      if (!section) return;
      moveInArray(section.items, itemId, action.endsWith('up') ? -1 : 1);
      renderSections();
      updateReview();
      return;
    }

    if (action === 'clear-file') {
      setUpload(itemId, button.dataset.fileRole, null);
      renderSections();
      updateReview();
    }
  }

  function moveInArray(array, id, delta) {
    const index = array.findIndex(entry => entry.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= array.length) return;
    [array[index], array[next]] = [array[next], array[index]];
  }

  function removeItemUploads(itemId) {
    for (const key of [...uploadFiles.keys()]) {
      if (key.startsWith(`${itemId}::`)) uploadFiles.delete(key);
    }
  }

  function renderAll() {
    renderAuthors();
    renderSections();
    updateReview();
  }

  function renderAuthors() {
    els.authorsHost.innerHTML = state.project.authors.map((author, index) => `
      <div class="author-row">
        <label class="field">
          <span>Author ${index + 1} <b aria-hidden="true">*</b></span>
          <input type="text" value="${escapeAttribute(author.name)}" data-author-id="${author.id}" data-author-field="name" placeholder="Full name">
        </label>
        <label class="field">
          <span>ORCID <small>optional</small></span>
          <input type="text" value="${escapeAttribute(author.orcid)}" data-author-id="${author.id}" data-author-field="orcid" placeholder="0000-0000-0000-0000">
        </label>
        <button class="button button-icon button-danger" type="button" data-action="remove-author" data-author-id="${author.id}" aria-label="Remove author">×</button>
      </div>`).join('');
  }

  function renderSections() {
    els.emptySections.hidden = state.sections.length > 0;
    els.sectionsHost.innerHTML = state.sections.map((section, sectionIndex) => renderSection(section, sectionIndex)).join('');
  }

  function renderSection(section, sectionIndex) {
    return `
      <article class="section-card" data-section-id="${section.id}">
        <div class="section-toolbar">
          <div class="section-toolbar-main">
            <label class="field">
              <span>Section name <b aria-hidden="true">*</b></span>
              <input type="text" value="${escapeAttribute(section.title)}" data-section-id="${section.id}" data-section-field="title" placeholder="Figures">
            </label>
            <label class="field">
              <span>Folder slug</span>
              <input type="text" value="${escapeAttribute(section.slug)}" data-section-id="${section.id}" data-section-field="slug" placeholder="figures">
            </label>
          </div>
          <div class="toolbar-actions">
            <button class="button button-icon button-ghost" type="button" data-action="move-section-up" data-section-id="${section.id}" aria-label="Move section up" ${sectionIndex === 0 ? 'disabled' : ''}>↑</button>
            <button class="button button-icon button-ghost" type="button" data-action="move-section-down" data-section-id="${section.id}" aria-label="Move section down" ${sectionIndex === state.sections.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="button button-icon button-danger" type="button" data-action="remove-section" data-section-id="${section.id}" aria-label="Remove section">×</button>
          </div>
        </div>
        <div class="items-list">
          ${section.items.length ? section.items.map((item, itemIndex) => renderItem(section, item, itemIndex)).join('') : '<div class="preview-empty">This section has no items yet.</div>'}
        </div>
        <div class="add-item-row">
          <button class="button button-secondary" type="button" data-action="add-item" data-section-id="${section.id}">Add item</button>
        </div>
      </article>`;
  }

  function renderItem(section, item, itemIndex) {
    const title = item.title || 'Untitled item';
    return `
      <article class="item-card" data-item-id="${item.id}">
        <header class="item-header">
          <div class="item-header-title">
            <span class="item-kind-badge">${escapeHtml(KIND_LABELS[item.kind] || item.kind)}</span>
            <strong>${escapeHtml(title)}</strong>
          </div>
          <div class="toolbar-actions">
            <button class="button button-icon button-ghost" type="button" data-action="move-item-up" data-section-id="${section.id}" data-item-id="${item.id}" aria-label="Move item up" ${itemIndex === 0 ? 'disabled' : ''}>↑</button>
            <button class="button button-icon button-ghost" type="button" data-action="move-item-down" data-section-id="${section.id}" data-item-id="${item.id}" aria-label="Move item down" ${itemIndex === section.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="button button-icon button-danger" type="button" data-action="remove-item" data-section-id="${section.id}" data-item-id="${item.id}" aria-label="Remove item">×</button>
          </div>
        </header>
        <div class="item-body">
          <div class="item-common-grid">
            <label class="field">
              <span>Title / label <b aria-hidden="true">*</b></span>
              <input type="text" value="${escapeAttribute(item.title)}" data-section-id="${section.id}" data-item-id="${item.id}" data-item-field="title" placeholder="Figure S1">
            </label>
            <label class="field">
              <span>Item type</span>
              <select data-section-id="${section.id}" data-item-id="${item.id}" data-item-kind="true">
                ${kindOptions(item.kind)}
              </select>
            </label>
            <label class="field field-wide">
              <span>Description <small>optional</small></span>
              <textarea rows="2" data-section-id="${section.id}" data-item-id="${item.id}" data-item-field="description" placeholder="One-line explanation shown on the portal.">${escapeHtml(item.description)}</textarea>
            </label>
            <label class="field field-wide">
              <span>Folder slug</span>
              <input type="text" value="${escapeAttribute(item.slug)}" data-section-id="${section.id}" data-item-id="${item.id}" data-item-field="slug" placeholder="figure-s1">
            </label>
          </div>
          <div class="item-specific">
            ${renderItemSpecific(section, item)}
          </div>
          <div class="item-footer">
            <span class="item-path">${escapeHtml(generatedPathLabel(section, item))}</span>
            <div class="item-actions"></div>
          </div>
        </div>
      </article>`;
  }

  function kindOptions(selected) {
    const kinds = ['file', 'html', 'protein', 'neighborhood', 'phylogeny', 'network', 'taxonomy', 'architecture', 'multistructure', 'external', 'coming'];
    return kinds.map(kind => `<option value="${kind}" ${selected === kind ? 'selected' : ''}>${escapeHtml(KIND_LABELS[kind])}</option>`).join('');
  }

  function renderItemSpecific(section, item) {
    const attrs = `data-section-id="${section.id}" data-item-id="${item.id}"`;
    switch (item.kind) {
      case 'file':
        return `
          <h4>Uploaded file</h4>
          <div class="specific-grid">
            <label class="field">
              <span>Portal badge</span>
              <select ${attrs} data-config-field="badge">
                ${selectOptions([
                  ['doc','Document'], ['pdf','PDF'], ['image','Image'], ['table','Table'], ['dataset','Dataset']
                ], item.config.badge)}
              </select>
            </label>
            <div class="field">
              <span>File <b aria-hidden="true">*</b></span>
              ${renderFilePicker(item, 'file', 'Choose file', '*/*')}
            </div>
          </div>`;
      case 'html': {
        const isPackage = item.config.mode === 'package';
        return `
          <h4>HTML material</h4>
          <div class="specific-grid">
            <label class="field">
              <span>Input mode</span>
              <select ${attrs} data-config-field="mode">
                ${selectOptions([['single','Single self-contained HTML'], ['package','ZIP package with index.html']], item.config.mode)}
              </select>
              <small class="field-help">Use a ZIP when the page depends on local scripts, styles, images, or data files.</small>
            </label>
            <div class="field">
              <span>${isPackage ? 'HTML package ZIP' : 'HTML file'} <b aria-hidden="true">*</b></span>
              ${renderFilePicker(item, 'html', isPackage ? 'Choose ZIP' : 'Choose HTML', isPackage ? '.zip,application/zip' : '.html,text/html')}
            </div>
          </div>`;
      }
      case 'protein':
        return `
          <h4>Protein Structure and MSA Viewer inputs</h4>
          <div class="specific-grid">
            <div class="field"><span>Structure PDB/mmCIF <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'structure', 'Choose structure', '.pdb,.ent,.cif,.mmcif')}</div>
            <div class="field"><span>Region annotation YAML <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'annotations', 'Choose YAML', '.yaml,.yml,text/yaml')}<small class="field-help">Create this file visually in the Protein Structure and MSA Editor when needed.</small></div>
            <div class="field"><span>Aligned FASTA / MSA <small>optional</small></span>${renderFilePicker(item, 'msa', 'Choose alignment', '.fa,.faa,.fasta,.aln,text/plain')}</div>
            <label class="field">
              <span>Initial Mol* layout</span>
              <select ${attrs} data-config-field="defaultLayout">
                ${selectOptions([['canvas','Canvas'], ['sequence','Sequence'], ['controls','Controls'], ['sequence-controls','Sequence + controls'], ['full','Full']], item.config.defaultLayout)}
              </select>
            </label>
          </div>`;
      case 'neighborhood':
        return `
          <h4>Gene Neighborhood Viewer inputs</h4>
          <div class="specific-grid">
            <div class="field"><span>Neighborhood input <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'neighborhoods', 'Choose input', '')}<small class="field-help">Accepts the standard row-per-domain TSV or the compact architecture format.</small></div>
            <div class="field"><span>Domain rename YAML <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'rename', 'Choose rename YAML', '.yaml,.yml,text/yaml')}</div>
            <div class="field"><span>Domain color YAML <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'colors', 'Choose color YAML', '.yaml,.yml,text/yaml')}</div>
            <label class="field">
              <span>Input format</span>
              <select ${attrs} data-config-field="inputFormat">
                ${selectOptions([['auto','Auto-detect'], ['standard','Standard neighborhood TSV'], ['compact','Compact architecture']], item.config.inputFormat || 'auto')}
              </select>
            </label>
            <label class="field">
              <span>Initial sizing</span>
              <select ${attrs} data-config-field="defaultScaleMode">
                ${selectOptions([['fixed','Fixed domain width'], ['fit','Fit window']], item.config.defaultScaleMode)}
              </select>
            </label>
            <label class="checkbox-field"><input type="checkbox" ${attrs} data-config-field="defaultAlignQuery" ${item.config.defaultAlignQuery ? 'checked' : ''}> Align query genes initially</label>
            <label class="checkbox-field"><input type="checkbox" ${attrs} data-config-field="defaultShowLabels" ${item.config.defaultShowLabels ? 'checked' : ''}> Show domain labels initially</label>
          </div>`;
      case 'phylogeny':
        return `
          <h4>Phylogeny Viewer inputs</h4>
          <div class="specific-grid">
            <div class="field"><span>Newick tree <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'tree', 'Choose tree', '.tree,.tre,.nwk,.newick,text/plain')}</div>
            <div class="field"><span>Phylogeny YAML <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'phylogenyYaml', 'Choose phylogeny YAML', '.yaml,.yml,text/yaml')}<small class="field-help">Create supports, clade groups, rooting, layouts, and labels in the Phylogeny Editor.</small></div>
            <div class="field"><span>Tip annotation table <small>optional</small></span>${renderFilePicker(item, 'annotations', 'Choose table', '.tsv,.txt,.info,.csv,text/plain')}</div>
            <label class="field"><span>Fallback tip ID column</span><input type="text" value="${escapeAttribute(item.config.idColumn)}" ${attrs} data-config-field="idColumn" placeholder="id"><small class="field-help">The YAML label configuration takes priority when present.</small></label>
            <label class="field"><span>Annotation delimiter</span><select ${attrs} data-config-field="delimiter">${selectOptions([['tab','Tab'],['comma','Comma']], item.config.delimiter)}</select></label>
          </div>`;
      case 'network':
        return `
          <h4>Network Viewer inputs</h4>
          <div class="specific-grid">
            <div class="field"><span>Edge TSV <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'edges', 'Choose edge TSV', '.tsv,.txt,text/tab-separated-values')}</div>
            <div class="field"><span>Node YAML <small>optional</small></span>${renderFilePicker(item, 'nodes', 'Choose node YAML', '.yaml,.yml,text/yaml')}</div>
            <div class="field"><span>Group colors YAML <small>optional</small></span>${renderFilePicker(item, 'colors', 'Choose color YAML', '.yaml,.yml,text/yaml')}</div>
            <label class="field"><span>Minimum total edge count</span><input type="number" min="0" step="1" value="${escapeAttribute(item.config.minimumCount)}" ${attrs} data-config-field="minimumCount" data-value-type="number"></label>
            <label class="field"><span>Initial layout</span><select ${attrs} data-config-field="layout">${selectOptions([
              ['fruchterman-reingold','Fruchterman–Reingold'], ['spring-eades','Spring — Eades'], ['kamada-kawai','Kamada–Kawai'], ['grouped-spring','Grouped spring'], ['circle','Circle'], ['concentric','Concentric'], ['grid','Grid']
            ], item.config.layout)}</select></label>
            <label class="field"><span>Community method</span><select ${attrs} data-config-field="communityMethod">${selectOptions([['none','None'],['louvain','Louvain'],['leiden','Leiden']], item.config.communityMethod)}</select></label>
            <label class="field"><span>Community resolution</span><input type="number" min="0.05" max="10" step="0.05" value="${escapeAttribute(item.config.communityResolution)}" ${attrs} data-config-field="communityResolution" data-value-type="number"></label>
            <label class="field"><span>Color nodes by</span><select ${attrs} data-config-field="colorBy">${selectOptions([['function','YAML function'],['community','Detected community']], item.config.colorBy)}</select></label>
            <label class="field"><span>Group layout by</span><select ${attrs} data-config-field="groupLayoutBy">${selectOptions([['none','None'],['function','YAML function'],['community','Detected community']], item.config.groupLayoutBy)}</select></label>
            <label class="checkbox-field"><input type="checkbox" ${attrs} data-config-field="communityWeighted" ${item.config.communityWeighted ? 'checked' : ''}> Weight communities by edge count</label>
            <label class="checkbox-field"><input type="checkbox" ${attrs} data-config-field="showIsolates" ${item.config.showIsolates ? 'checked' : ''}> Show isolated nodes initially</label>
          </div>`;
      case 'taxonomy':
        return `
          <h4>Taxonomy Flow Viewer inputs</h4>
          <div class="specific-grid">
            <div class="field"><span>Resolved taxonomy TSV <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'taxonomyResolved', 'Choose resolved TSV', '.tsv,.txt,text/tab-separated-values')}<small class="field-help">Generate this frozen lineage table in the Taxonomy Sankey Editor.</small></div>
            <div class="field"><span>Curation YAML <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'taxonomyYaml', 'Choose curation YAML', '.yaml,.yml,text/yaml')}</div>
            <div class="field"><span>Taxonomy color YAML <small>optional</small></span>${renderFilePicker(item, 'taxonomyColors', 'Choose color YAML', '.yaml,.yml,text/yaml')}</div>
            <div class="field"><span>Original protein taxonomy TSV <small>optional</small></span>${renderFilePicker(item, 'taxonomyInput', 'Choose input TSV', '.tsv,.txt,text/tab-separated-values')}<small class="field-help">Included for transparency and reader download; it is not used to resolve taxonomy in the published figure.</small></div>
          </div>`;
      case 'architecture':
        return `
          <h4>Protein Domain Architecture Viewer inputs</h4>
          <div class="specific-grid">
            <div class="field"><span>Domain TSV <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'architectureData', 'Choose domain TSV', '.tsv,.txt,text/tab-separated-values')}<small class="field-help">One row per domain or feature; required columns are pid, domain, start, end, and plen.</small></div>
            <div class="field"><span>Architecture YAML <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'architectureYaml', 'Choose architecture YAML', '.yaml,.yml,text/yaml')}<small class="field-help">Create colors, shapes, compact layouts, labels, sorting, and hover fields in the Domain Architecture Editor.</small></div>
          </div>`;
      case 'multistructure':
        return `
          <h4>Multi-Structure Comparison Viewer input</h4>
          <div class="specific-grid">
            <div class="field field-wide"><span>Publication package ZIP <b aria-hidden="true">*</b></span>${renderFilePicker(item, 'multiStructurePackage', 'Choose publication package', '.zip,application/zip')}<small class="field-help">Create this ZIP in the Multi-Structure Comparison Editor. It contains the fixed panel set, MOLX scenes, labels, layouts, optional structure downloads, and initial camera synchronization setting.</small></div>
          </div>`;
      case 'external':
        return `
          <h4>External resource</h4>
          <label class="field">
            <span>Full URL <b aria-hidden="true">*</b></span>
            <input type="url" value="${escapeAttribute(item.config.url)}" ${attrs} data-config-field="url" placeholder="https://…">
          </label>`;
      case 'coming':
        return `
          <h4>Placeholder</h4>
          <p class="field-help">The portal will show this item as “Coming soon” without a clickable link. No files are required.</p>`;
      default:
        return '';
    }
  }

  function selectOptions(options, selected) {
    return options.map(([value, label]) => `<option value="${escapeAttribute(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function renderFilePicker(item, role, buttonLabel, accept) {
    const file = getUpload(item.id, role);
    const inputId = `file-${item.id}-${role}`;
    const acceptAttribute = accept ? ` accept="${escapeAttribute(accept)}"` : '';
    return `
      <div class="file-picker ${file ? '' : 'file-missing'}">
        <label class="file-button" for="${inputId}">${escapeHtml(file ? 'Replace' : buttonLabel)}</label>
        <input id="${inputId}" type="file"${acceptAttribute} data-item-id="${item.id}" data-file-role="${role}">
        <div class="file-meta">
          <span class="file-name">${escapeHtml(file?.name || 'No file selected')}</span>
          <span class="file-size">${file ? formatBytes(file.size) : 'Stored only in this browser session'}</span>
        </div>
        ${file ? `<button class="button button-small button-ghost" type="button" data-action="clear-file" data-item-id="${item.id}" data-file-role="${role}">Clear</button>` : ''}
      </div>`;
  }

  function generatedPathLabel(section, item) {
    const slug = slugify(item.slug || item.title, 'item');
    switch (item.kind) {
      case 'file': return `files/${slugify(section.slug || section.title, 'section')}/${slug}/…`;
      case 'html': return `html/${slug}/`;
      case 'protein': return `protein-viewer/${slug}/`;
      case 'neighborhood': return `neighborhood-viewer/${slug}/`;
      case 'phylogeny': return `phylogeny-viewer/${slug}/`;
      case 'network': return `network-viewer/${slug}/`;
      case 'taxonomy': return `taxonomy-sankey-viewer/${slug}/`;
      case 'architecture': return `domain-architecture-viewer/${slug}/`;
      case 'multistructure': return `multi-structure-viewer/${slug}/`;
      case 'external': return item.config.url || 'https://…';
      case 'coming': return 'No path — Coming soon';
      default: return '';
    }
  }

  function updateReview() {
    renderCoverControls();
    renderSummary();
    renderPortalPreview();
    const quick = validateFast();
    renderValidationStatus(quick, false);
  }

  function renderSummary() {
    const sectionCount = state.sections.length;
    const itemCount = state.sections.reduce((sum, section) => sum + section.items.length, 0);
    const bytes = [...uploadFiles.values()].reduce((sum, file) => sum + (file?.size || 0), 0);
    els.projectSummary.innerHTML = `
      <div><strong>${sectionCount}</strong><span>sections</span></div>
      <div><strong>${itemCount}</strong><span>items</span></div>
      <div><strong>${formatBytes(bytes)}</strong><span>uploads</span></div>`;
  }

  function renderPortalPreview() {
    const authors = state.project.authors.map(author => author.name.trim()).filter(Boolean).join(', ');
    const coverUrl = getCoverPreviewUrl();
    const coverHtml = coverUrl ? `<figure class="cover-preview">
      <img src="${escapeAttribute(coverUrl)}" alt="${escapeAttribute(state.project.coverAlt || 'Supplement cover image')}">
      ${state.project.coverCaption ? `<figcaption>${escapeHtml(state.project.coverCaption)}</figcaption>` : ''}
    </figure>` : '';
    const sectionsHtml = state.sections.map(section => {
      if (!section.items.length) return '';
      return `
        <section class="preview-section">
          <h4>${escapeHtml(section.title || 'Untitled section')}</h4>
          <div class="preview-items">
            ${section.items.map(item => `
              <div class="preview-item">
                <span class="preview-badge">${escapeHtml(previewBadge(item))}</span>
                <div>
                  <strong>${escapeHtml(item.title || 'Untitled item')}</strong>
                  <small>${escapeHtml(item.description || generatedPathLabel(section, item))}</small>
                </div>
              </div>`).join('')}
          </div>
        </section>`;
    }).join('');

    els.portalPreview.innerHTML = `
      <h3 class="preview-project-title">${escapeHtml(state.project.title || 'Supplementary material')}</h3>
      ${authors ? `<p class="preview-authors">${escapeHtml(authors)}</p>` : ''}
      ${state.project.description ? `<p class="preview-description">${escapeHtml(state.project.description)}</p>` : ''}
      ${coverHtml}
      ${sectionsHtml || '<div class="preview-empty">Add sections and items to preview the manifest.</div>'}`;
  }

  function previewBadge(item) {
    if (item.kind === 'coming') return 'Soon';
    if (item.kind === 'file') return item.config.badge || 'File';
    if (item.kind === 'external') return 'External';
    return item.kind === 'html' ? 'HTML' : 'Viewer';
  }

  function validateFast() {
    const messages = [];
    const error = (text, location = '') => messages.push({ level: 'error', text, location });
    const warning = (text, location = '') => messages.push({ level: 'warning', text, location });
    const info = (text, location = '') => messages.push({ level: 'info', text, location });

    if (!state.project.title.trim()) error('Enter a supplement title.', 'Project information');
    if (!state.project.authors.some(author => author.name.trim())) error('Add at least one author.', 'Project information');
    if (!slugify(state.project.repositoryName, '')) error('Enter a valid repository / ZIP name.', 'Project information');
    if (!state.sections.length) error('Add at least one section.', 'Sections');
    const cover = getUpload(PROJECT_UPLOAD_ID, 'cover');
    if (cover && coverValidationError(cover)) error(coverValidationError(cover), 'Cover image');

    const paths = new Map();
    for (const section of state.sections) {
      const sectionLabel = section.title || 'Untitled section';
      if (!section.title.trim()) error('A section is missing its name.', sectionLabel);
      if (!section.items.length) warning('This section has no items and will not appear on the portal.', sectionLabel);
      for (const item of section.items) {
        const location = `${sectionLabel} / ${item.title || 'Untitled item'}`;
        if (!item.title.trim()) error('Enter an item title.', location);
        if (!slugify(item.slug || item.title, '')) error('Enter a valid item slug.', location);
        for (const role of getRequiredRoles(item)) {
          if (!getUpload(item.id, role)) error(`Missing required ${roleLabel(role)} file.`, location);
        }
        if (item.kind === 'external') {
          try {
            const url = new URL(item.config.url);
            if (!/^https?:$/.test(url.protocol)) throw new Error('protocol');
          } catch {
            error('Enter a valid http(s) URL.', location);
          }
        }

        const href = generatedHref(section, item);
        if (href) {
          if (paths.has(href)) error(`Generated path conflicts with “${paths.get(href)}”: ${href}`, location);
          else paths.set(href, location);
        }
      }
    }

    const totalBytes = [...uploadFiles.values()].reduce((sum, file) => sum + (file?.size || 0), 0);
    if (totalBytes > 400 * 1024 * 1024) warning('The selected uploads exceed 400 MB. Browser-side ZIP generation may require substantial memory.', 'Project');
    else if (totalBytes > 150 * 1024 * 1024) warning('The selected uploads exceed 150 MB. ZIP generation may take some time.', 'Project');

    const usedModules = usedModuleKinds();
    if (usedModules.size) info(`The generated project will include ${[...usedModules].map(kind => MODULE_REGISTRY[kind].label).join(', ')}.`, 'Modules');
    return messages;
  }

  async function validateDeep() {
    const messages = validateFast();
    if (messages.some(message => message.level === 'error')) return messages;

    const error = (text, location = '') => messages.push({ level: 'error', text, location });
    const warning = (text, location = '') => messages.push({ level: 'warning', text, location });
    const info = (text, location = '') => messages.push({ level: 'info', text, location });

    for (const section of state.sections) {
      for (const item of section.items) {
        const location = `${section.title || 'Section'} / ${item.title || 'Item'}`;
        try {
          if (item.kind === 'html') {
            const file = getUpload(item.id, 'html');
            if (file && item.config.mode === 'single') {
              const text = await readTextLimited(file, 2 * 1024 * 1024);
              if (!/<html\b|<!doctype\s+html/i.test(text)) warning('The selected file does not look like a complete HTML document.', location);
            } else if (file && item.config.mode === 'package') {
              const inspected = await inspectHtmlPackage(file);
              if (!inspected.indexPath) error('The HTML package does not contain an index.html entry point.', location);
              if (inspected.entries.length > 5000) warning(`The HTML package contains ${inspected.entries.length.toLocaleString()} files.`, location);
            }
          }

          if (item.kind === 'protein') {
            const structure = getUpload(item.id, 'structure');
            const yaml = getUpload(item.id, 'annotations');
            const msa = getUpload(item.id, 'msa');
            if (structure && structure.size === 0) error('The structure file is empty.', location);
            if (yaml) {
              const text = await readTextLimited(yaml, 3 * 1024 * 1024);
              if (!/^\s*(version|title|msa|numbering|viewer|regions)\s*:/m.test(text)) warning('The annotation file does not show the usual Protein Viewer YAML keys.', location);
              if (!/^\s*regions\s*:/m.test(text)) warning('No regions block was detected. The structure can still load, but no custom regions may be shown.', location);
            }
            if (msa) {
              const text = await readTextLimited(msa, 3 * 1024 * 1024);
              if (!/^>/m.test(text)) error('The MSA file does not appear to be FASTA-formatted.', location);
            }
          }

          if (item.kind === 'neighborhood') {
            const table = getUpload(item.id, 'neighborhoods');
            if (table) {
              const text = await readTextLimited(table, 2 * 1024 * 1024);
              const requestedFormat = ['standard', 'compact'].includes(item.config.inputFormat) ? item.config.inputFormat : 'auto';
              const detectedFormat = detectNeighborhoodInputFormat(text);
              if (detectedFormat === 'unknown') {
                error('The neighborhood input is neither the standard TSV nor the compact architecture format.', location);
              } else if (requestedFormat !== 'auto' && requestedFormat !== detectedFormat) {
                warning(`The selected input format is ${requestedFormat}, but the file looks like ${detectedFormat}.`, location);
              }
              const effectiveFormat = requestedFormat === 'auto' ? detectedFormat : requestedFormat;
              if (effectiveFormat === 'standard') {
                const headers = firstNonEmptyLine(text).split('\t').map(value => value.trim().toLowerCase());
                const required = ['block_id', 'pid', 'nucleotide', 'start', 'end', 'strand', 'query', 'dom', 'domp'];
                const missing = required.filter(name => !headers.includes(name));
                if (missing.length) error(`The standard neighborhood TSV is missing: ${missing.join(', ')}.`, location);
              } else if (effectiveFormat === 'compact') {
                const sample = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 25);
                const invalid = sample.find(line => {
                  const values = line.split('\t');
                  return values.length < 4 || !/(?:->|<-|\|\|)/.test(values[1] || '') || !/__/.test(values.slice(3).join('\t'));
                });
                if (invalid) error('A compact neighborhood line must contain four tab-separated fields, orientation syntax, and PID__domain details.', location);
                if (sample.some(line => !/\*/.test((line.split('\t')[1] || '')))) warning('At least one compact line lacks a starred query domain.', location);
              }
            }
          }

          if (item.kind === 'phylogeny') {
            const tree = getUpload(item.id, 'tree');
            const yaml = getUpload(item.id, 'phylogenyYaml');
            const annotations = getUpload(item.id, 'annotations');
            let yamlIdColumn = '';
            if (tree) {
              const text = (await readTextLimited(tree, 5 * 1024 * 1024)).trim();
              if (!text.includes('(') || !text.includes(')')) error('The tree does not look like Newick.', location);
              if (!text.endsWith(';')) warning('The Newick tree does not end with a semicolon.', location);
            }
            if (yaml) {
              const text = await readTextLimited(yaml, 3 * 1024 * 1024);
              if (!/^\s*(version|title|layout|root|supports|groups|labels)\s*:/m.test(text)) error('The phylogeny YAML does not look like a Phylogeny Editor curation file.', location);
              if (!/^\s*layout\s*:/m.test(text)) warning('The phylogeny YAML does not contain a layout block.', location);
              if (!/^\s*supports\s*:/m.test(text)) warning('The phylogeny YAML does not contain a marked-supports block.', location);
              if (!/^\s*groups\s*:/m.test(text)) warning('The phylogeny YAML does not contain a clade-groups block.', location);
              const idMatch = text.match(/^\s*id_column\s*:\s*["']?([^"'#\r\n]+)["']?\s*$/m);
              yamlIdColumn = idMatch ? idMatch[1].trim() : '';
            }
            if (annotations) {
              const text = await readTextLimited(annotations, 2 * 1024 * 1024);
              const delimiter = item.config.delimiter === 'comma' ? ',' : '\t';
              const headers = firstNonEmptyLine(text).split(delimiter).map(value => value.trim());
              const expectedIdColumn = yamlIdColumn || item.config.idColumn || 'id';
              if (!headers.includes(expectedIdColumn)) warning(`The annotation header does not contain the configured ID column “${expectedIdColumn}”.`, location);
            }
          }

          if (item.kind === 'network') {
            const edges = getUpload(item.id, 'edges');
            if (edges) {
              const text = await readTextLimited(edges, 3 * 1024 * 1024);
              const lines = text.split(/\r?\n/).filter(line => line.trim());
              const headers = (lines[0] || '').split('\t').map(value => value.trim());
              const required = ['source', 'target', 'edge_type', 'edge_count'];
              const missing = required.filter(column => !headers.includes(column));
              if (missing.length) error(`The edge table is missing: ${missing.join(', ')}.`, location);
              const countIndex = headers.indexOf('edge_count');
              if (countIndex >= 0) {
                const invalid = lines.slice(1, 102).filter(line => {
                  const value = line.split('\t')[countIndex];
                  return value !== undefined && value.trim() !== '' && !Number.isFinite(Number(value));
                });
                if (invalid.length) warning('Some sampled edge_count values are not numeric.', location);
              }
            }
          }

          if (item.kind === 'taxonomy') {
            const resolved = getUpload(item.id, 'taxonomyResolved');
            const yaml = getUpload(item.id, 'taxonomyYaml');
            if (resolved) {
              const text = await readTextLimited(resolved, 8 * 1024 * 1024);
              const headers = firstNonEmptyLine(text).split('\t').map(value => value.trim());
              const required = ['pid', 'input_taxid', 'resolved_taxid', 'status', 'lineage_taxids', 'lineage_names', 'lineage_ranks'];
              const missing = required.filter(column => !headers.includes(column));
              if (missing.length) error(`The resolved taxonomy table is missing: ${missing.join(', ')}.`, location);
            }
            if (yaml) {
              const text = await readTextLimited(yaml, 2 * 1024 * 1024);
              if (!/^\s*layout\s*:/m.test(text)) warning('The taxonomy curation YAML does not contain a layout block.', location);
              if (!/^\s*(version|title|source|layout|overrides)\s*:/m.test(text)) error('The taxonomy YAML does not look like a Taxonomy Sankey curation file.', location);
            }
          }

          if (item.kind === 'architecture') {
            const table = getUpload(item.id, 'architectureData');
            const yaml = getUpload(item.id, 'architectureYaml');
            if (table) {
              const text = await readTextLimited(table, 8 * 1024 * 1024);
              const lines = text.split(/\r?\n/).filter(line => line.trim());
              const headers = (lines[0] || '').split('\t').map(value => value.trim());
              const required = ['pid', 'domain', 'start', 'end', 'plen'];
              const missing = required.filter(column => !headers.includes(column));
              if (missing.length) error(`The domain table is missing: ${missing.join(', ')}.`, location);
              const indexes = Object.fromEntries(required.map(column => [column, headers.indexOf(column)]));
              const invalid = lines.slice(1, 202).filter(line => {
                const cells = line.split('\t');
                const start = Number(cells[indexes.start]);
                const end = Number(cells[indexes.end]);
                const plen = Number(cells[indexes.plen]);
                return !cells[indexes.pid]?.trim() || !cells[indexes.domain]?.trim() || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(plen) || start < 1 || end < start || end > plen;
              });
              if (invalid.length) warning(`${invalid.length} sampled domain rows contain missing identifiers or invalid coordinates.`, location);
            }
            if (yaml) {
              const text = await readTextLimited(yaml, 3 * 1024 * 1024);
              if (!/^\s*layout\s*:/m.test(text)) warning('The architecture YAML does not contain a layout block.', location);
              if (!/^\s*(version|title|layout|metadata|styles|special_features)\s*:/m.test(text)) error('The YAML does not look like a Domain Architecture Editor file.', location);
            }
          }

          if (item.kind === 'multistructure') {
            const packageFile = getUpload(item.id, 'multiStructurePackage');
            if (packageFile) {
              const inspected = await inspectMultiStructurePackage(packageFile);
              if (!inspected.definitionPath) error('The package does not contain multi-structure.json.', location);
              else {
                const definition = inspected.definition;
                const panels = Array.isArray(definition?.panels) ? definition.panels : [];
                if (!panels.length) error('The multi-structure definition contains no panels.', location);
                if (panels.length > 12) warning(`The comparison contains ${panels.length} panels and may require substantial GPU memory.`, location);
                const normalizePackagePath = value => `${inspected.prefix}${String(value || '').replace(/^\.\//, '')}`;
                const missingMolx = panels.filter(panel => !panel?.molx || !inspected.names.has(normalizePackagePath(panel.molx)));
                if (missingMolx.length) error(`${missingMolx.length} panel MOLX file${missingMolx.length === 1 ? ' is' : 's are'} missing from the package.`, location);
                const missingStructures = panels.filter(panel => panel?.structure && !inspected.names.has(normalizePackagePath(panel.structure)));
                if (missingStructures.length) warning(`${missingStructures.length} optional structure download${missingStructures.length === 1 ? ' is' : 's are'} missing from the package.`, location);
              }
            }
          }

          for (const role of [...getRequiredRoles(item), ...optionalRoles(item)]) {
            const file = getUpload(item.id, role);
            if (file?.size > 100 * 1024 * 1024) warning(`${roleLabel(role)} is ${formatBytes(file.size)}. Confirm that GitHub Pages and the reader's browser can handle it.`, location);
          }
        } catch (cause) {
          error(`Could not inspect one of the inputs: ${cause.message}`, location);
        }
      }
    }

    info('All files will be packaged locally in the browser; the Builder does not upload them.', 'Privacy');
    return messages;
  }

  function optionalRoles(item) {
    switch (item.kind) {
      case 'protein': return ['msa'];
      case 'phylogeny': return ['annotations'];
      case 'network': return ['nodes', 'colors'];
      case 'taxonomy': return ['taxonomyColors', 'taxonomyInput'];
      case 'architecture': return [];
      case 'multistructure': return [];
      default: return [];
    }
  }

  function roleLabel(role) {
    return ({
      file: 'uploaded', html: 'HTML', structure: 'structure', annotations: 'annotation', msa: 'alignment',
      neighborhoods: 'neighborhood input', rename: 'rename YAML', colors: 'color YAML', tree: 'tree', phylogenyYaml: 'phylogeny YAML',
      edges: 'edge TSV', nodes: 'node YAML', taxonomyResolved: 'resolved taxonomy TSV', taxonomyYaml: 'taxonomy curation YAML', taxonomyColors: 'taxonomy color YAML', taxonomyInput: 'original taxonomy TSV', architectureData: 'domain TSV', architectureYaml: 'architecture YAML', multiStructurePackage: 'multi-structure publication package ZIP'
    })[role] || role;
  }

  function detectNeighborhoodInputFormat(text) {
    const first = firstNonEmptyLine(text);
    if (!first) return 'unknown';
    const values = first.split('\t');
    const headers = new Set(values.map(value => value.trim().toLowerCase()));
    const required = ['block_id', 'pid', 'nucleotide', 'start', 'end', 'strand', 'query', 'dom', 'domp'];
    if (required.every(name => headers.has(name))) return 'standard';
    if (values.length >= 4 && /(?:->|<-|\|\|)/.test(values[1] || '') && /__/.test(values.slice(3).join('\t'))) return 'compact';
    return 'unknown';
  }

  function firstNonEmptyLine(text) {
    return String(text || '').split(/\r?\n/).find(line => line.trim()) || '';
  }

  async function readTextLimited(file, maxBytes) {
    if (file.size > maxBytes) {
      const blob = file.slice(0, maxBytes);
      return blob.text();
    }
    return file.text();
  }

  function renderValidationStatus(messages, detailed) {
    const errorCount = messages.filter(message => message.level === 'error').length;
    const warningCount = messages.filter(message => message.level === 'warning').length;
    els.validationStatus.className = 'validation-status';
    if (errorCount) {
      els.validationStatus.classList.add('validation-bad');
      els.validationStatus.innerHTML = `<strong>${errorCount} blocking issue${errorCount === 1 ? '' : 's'}</strong><span>Resolve the errors before downloading the project.</span>`;
    } else if (warningCount) {
      els.validationStatus.classList.add('validation-warning');
      els.validationStatus.innerHTML = `<strong>${warningCount} warning${warningCount === 1 ? '' : 's'}</strong><span>The project can be generated, but review the notes first.</span>`;
    } else if (state.sections.length) {
      els.validationStatus.classList.add('validation-good');
      els.validationStatus.innerHTML = `<strong>${detailed ? 'Validation passed' : 'Basic checks passed'}</strong><span>${detailed ? 'The project is ready to package.' : 'Run full validation to inspect the selected files.'}</span>`;
    } else {
      els.validationStatus.classList.add('validation-neutral');
      els.validationStatus.innerHTML = '<strong>Not ready yet</strong><span>Add project information, sections, and materials.</span>';
    }
    if (detailed) renderValidationMessages(messages);
  }

  function renderValidationMessages(messages) {
    const ordered = [...messages].sort((a, b) => levelOrder(a.level) - levelOrder(b.level));
    els.validationResults.innerHTML = ordered.slice(0, 30).map(message => `
      <div class="validation-message ${message.level}">
        <span aria-hidden="true">${message.level === 'error' ? '×' : message.level === 'warning' ? '!' : 'i'}</span>
        <div>${message.location ? `<strong>${escapeHtml(message.location)}:</strong> ` : ''}${escapeHtml(message.text)}</div>
      </div>`).join('');
    if (ordered.length > 30) {
      els.validationResults.insertAdjacentHTML('beforeend', `<div class="validation-message info"><span>i</span><div>${ordered.length - 30} additional messages are not shown.</div></div>`);
    }
  }

  function levelOrder(level) {
    return level === 'error' ? 0 : level === 'warning' ? 1 : 2;
  }

  async function runValidation() {
    setBusy(true, 'Validating project', 'Inspecting files…', 12);
    try {
      validationMessages = await validateDeep();
      renderValidationStatus(validationMessages, true);
      const errors = validationMessages.filter(message => message.level === 'error').length;
      const warnings = validationMessages.filter(message => message.level === 'warning').length;
      showToast(errors ? `Validation found ${errors} blocking issue${errors === 1 ? '' : 's'}.` : warnings ? `Validation passed with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'Validation passed.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadProject(options = {}) {
    setBusy(true, 'Validating project', 'Inspecting files before packaging…', 5);
    try {
      validationMessages = await validateDeep();
      renderValidationStatus(validationMessages, true);
      if (validationMessages.some(message => message.level === 'error')) {
        showToast('Fix the validation errors before downloading the ZIP.');
        return;
      }

      setBusy(true, options.portablePlatform ? 'Building portable supplement' : 'Building project', 'Preparing the portal and viewer modules…', 12);
      const { blob, fileName } = await buildProjectZip((progress, message) => {
        setBusyProgress(15 + Math.round(progress * 85), message || (progress < 0.45 ? 'Copying templates and uploads…' : 'Compressing project…'));
      }, options);
      triggerDownload(blob, fileName);
      setBusyProgress(100, 'Download ready.');
      showToast(`${fileName} was generated successfully.`);
    } catch (error) {
      console.error(error);
      validationMessages = [{ level: 'error', location: 'Builder', text: error.message }];
      renderValidationStatus(validationMessages, true);
      showToast(`Could not build the project: ${error.message}`);
    } finally {
      window.setTimeout(() => setBusy(false), 220);
    }
  }

  async function buildProjectZip(onProgress, { portablePlatform = '' } = {}) {
    if (typeof JSZip === 'undefined') throw new Error('The ZIP library did not load. Reload the Builder page.');
    if (portablePlatform && !Object.prototype.hasOwnProperty.call(PORTABLE_TARGETS, portablePlatform)) throw new Error('Choose a supported portable platform.');
    const zip = new JSZip();
    const repositoryName = slugify(state.project.repositoryName, 'evosupplement');
    const root = zip.folder(repositoryName);
    const assetRecords = [];
    const manifest = {
      paper: {
        title: state.project.title.trim(),
        authors: state.project.authors.map(author => author.name.trim()).filter(Boolean).join(', '),
        description: state.project.description.trim(),
        journal: state.project.journal.trim(),
        year: state.project.year.trim(),
        doi: normalizeDoi(state.project.doi)
      },
      sections: []
    };

    const portalTemplate = await fetchSourceText('builder/templates/publication-portal.html');
    root.file('index.html', preparePortalIndex(portalTemplate));
    root.file('.nojekyll', '');
    root.file('.gitattributes', await fetchSourceText('builder/templates/gitattributes.txt'));
    root.file('.github/workflows/pages.yml', await fetchSourceText('builder/templates/pages.yml'));

    if (state.project.license === 'MIT') root.file('LICENSE', generateMitLicense());

    const cover = getUpload(PROJECT_UPLOAD_ID, 'cover');
    if (cover) {
      const error = coverValidationError(cover);
      if (error) throw new Error(error);
      // A fixed basename avoids launcher-reserved names in portable servers.
      // The recipe retains the original filename for a lossless import.
      const path = `assets/cover/cover${extensionOf(cover.name)}`;
      root.file(path, cover);
      manifest.paper.cover = {
        src: `./${path}`,
        alt: state.project.coverAlt.trim() || 'Supplement cover image',
        caption: state.project.coverCaption.trim()
      };
      assetRecords.push({
        scope: 'project', role: 'cover', kind: 'file', path,
        originalName: cover.name, mime: cover.type, size: cover.size, lastModified: cover.lastModified
      });
    }

    const copiedModules = new Set();
    let completedItems = 0;
    const totalItems = Math.max(1, state.sections.reduce((sum, section) => sum + section.items.length, 0));

    for (const section of state.sections) {
      const manifestSection = { title: section.title.trim(), items: [] };
      for (const item of section.items) {
        const manifestItem = await packageItem({ root, section, item, copiedModules, assetRecords, portablePlatform });
        manifestSection.items.push(manifestItem);
        completedItems += 1;
        onProgress?.(Math.min(0.45, (completedItems / totalItems) * 0.45));
      }
      if (manifestSection.items.length) manifest.sections.push(manifestSection);
    }

    root.file('manifest.js', generateManifestJs(manifest));
    root.file('README.md', (portablePlatform ? `# Open this portable supplement\n\nExtract the entire ZIP and open **${PORTABLE_TARGETS[portablePlatform].launcher}**. Keep its window open while viewing. Read **OPEN-SUPPLEMENT.txt** for instructions.\n\n` : '') + generateReadme(manifest));
    root.file('DEPLOYMENT.md', generateDeploymentGuide());
    root.file('CITATION.cff', generateCitationCff());

    const recipe = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      builder: { name: 'EvoSupplement Builder', version: BUILDER_VERSION },
      generatedAt: new Date().toISOString(),
      moduleVersions: MODULE_VERSIONS,
      project: serializeState(),
      assets: assetRecords
    };
    if (portablePlatform) {
      recipe.portable = { version: 1, platform: portablePlatform, launcher: PORTABLE_TARGETS[portablePlatform].launcher };
      await addPortableFiles(root, portablePlatform, onProgress);
    }
    root.file('evosupplement-project.json', JSON.stringify(recipe, null, 2));

    const compressionStart = portablePlatform ? 0.65 : 0.45;
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'UNIX'
    }, metadata => onProgress?.(compressionStart + (metadata.percent / 100) * (1 - compressionStart)));

    return { blob, fileName: `${repositoryName}${portablePlatform ? `-portable-${portablePlatform}` : ''}.zip` };
  }

  async function packageItem(context) {
    const { root, section, item, copiedModules, assetRecords, portablePlatform } = context;
    const slug = slugify(item.slug || item.title, 'item');
    const common = {
      id: `${slugify(section.slug || section.title, 'section')}-${slug}`,
      title: item.title.trim(),
      description: item.description.trim(),
      type: manifestType(item),
      href: ''
    };

    if (item.kind === 'coming') return common;
    if (item.kind === 'external') return { ...common, type: 'external', href: item.config.url.trim(), external: true };

    if (item.kind === 'file') {
      const file = getUpload(item.id, 'file');
      const path = `files/${slugify(section.slug || section.title, 'section')}/${slug}/${sanitizeFileName(file.name)}`;
      root.file(path, file);
      assetRecords.push(assetRecord(item, 'file', path, file));
      return { ...common, type: item.config.badge || inferBadge(file.name), href: `./${path}` };
    }

    if (item.kind === 'html') {
      const file = getUpload(item.id, 'html');
      const basePath = `html/${slug}`;
      if (item.config.mode === 'package') {
        const inspected = await inspectHtmlPackage(file);
        const generatedFiles = [];
        for (const entry of inspected.entries) {
          const relative = stripZipPrefix(entry.name, inspected.prefix);
          if (!relative || !isSafeRelativePath(relative)) continue;
          const bytes = await entry.async('uint8array');
          const path = `${basePath}/${relative}`;
          root.file(path, bytes, { binary: true });
          generatedFiles.push(path);
        }
        assetRecords.push({
          itemId: item.id,
          role: 'html',
          kind: 'package',
          originalName: file.name,
          mime: file.type || 'application/zip',
          basePath,
          files: generatedFiles
        });
      } else {
        const path = `${basePath}/index.html`;
        root.file(path, file);
        assetRecords.push(assetRecord(item, 'html', path, file));
      }
      return { ...common, type: 'viewer', href: `./${basePath}/` };
    }

    if (MODULE_REGISTRY[item.kind]) {
      await copyModuleAssets(root, item.kind, copiedModules);
      const module = MODULE_REGISTRY[item.kind];
      const itemBase = `${module.folder}/${slug}`;
      const template = await fetchSourceText(module.template);
      root.file(`${itemBase}/index.html`, portablePlatform ? portableFigureHtml(template) : template);
      root.file(`${itemBase}/config.js`, generateModuleConfig(item));
      await addModuleInputs(root, itemBase, item, assetRecords);
      return { ...common, type: 'viewer', href: `./${itemBase}/` };
    }

    throw new Error(`Unsupported item type: ${item.kind}`);
  }

  async function copyModuleAssets(root, kind, copiedModules) {
    if (copiedModules.has(kind)) return;
    const module = MODULE_REGISTRY[kind];
    for (const path of module.shared) root.file(path, await fetchSourceBytes(path), { binary: true });
    root.file(`${module.folder}/README.md`, await fetchSourceText(module.readme));
    copiedModules.add(kind);
  }

  function portableFigureHtml(source) {
    const dependencies = window.EvoSupplementPortableVendor;
    if (!dependencies) throw new Error('The portable export helper did not load. Reload the Builder.');
    let html = source.replace(/\s*<link\b[^>]*\brel=["'](?:preconnect|dns-prefetch)["'][^>]*>/gi, '');
    for (const asset of dependencies.assets) {
      html = html.split(asset.sourceUrl).join(`../../${asset.path}`);
    }
    if (/<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:)?\/\//i.test(html)) {
      throw new Error('A built-in figure has an unbundled remote script or stylesheet. Portable export stopped.');
    }
    return html.replace('</head>', '  <script>window.EVOSUPPLEMENT_PORTABLE = true;</script>\n</head>');
  }

  async function addPortableFiles(root, platform, onProgress) {
    const target = PORTABLE_TARGETS[platform];
    onProgress?.(0.46, 'Adding the local supplement launcher…');
    for (const [source, path, executable] of target.files) {
      const bytes = await fetchSourceBytes(`builder/portable/${source}`);
      if (!bytes.length) throw new Error(`The portable launcher file is empty: ${source}`);
      if (source.endsWith('/evosupplement') && !(bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46)) {
        throw new Error('The Linux launcher is missing or invalid. Reinstall the complete Builder package.');
      }
      root.file(path, bytes, { binary: true, unixPermissions: executable ? 0o100755 : 0o100644 });
    }
    if (platform === 'windows') {
      if (!window.EvoSupplementPortableShortcut) throw new Error('The Windows shortcut helper did not load. Reload the Builder.');
      root.file(target.launcher, window.EvoSupplementPortableShortcut.createWindowsShortcut(), { binary: true });
    }
    root.file('_portable/LICENSE.txt', await fetchSourceText('LICENSE'));
    const dependencies = window.EvoSupplementPortableVendor;
    if (!dependencies) throw new Error('The portable export helper did not load. Reload the Builder.');
    const assets = await dependencies.collect(usedModuleKinds(), progress => {
      onProgress?.(0.48 + (progress.completed / Math.max(1, progress.total)) * 0.16, progress.label);
    });
    for (const asset of assets) root.file(asset.path, asset.bytes, { binary: true });
    root.file('OPEN-SUPPLEMENT.txt', portableInstructions(platform));
    root.file('_portable/package.json', JSON.stringify({
      format: 'evosupplement-portable', schemaVersion: 1, builderVersion: BUILDER_VERSION,
      platform, launcher: target.launcher, ...(target.fallbackLauncher ? { fallbackLauncher: target.fallbackLauncher } : {}), entryPoint: 'index.html',
      network: '127.0.0.1 only, with an automatically selected local port',
      dependencies: assets.map(asset => asset.path)
    }, null, 2));
    onProgress?.(0.65, 'Compressing the portable supplement…');
  }

  function portableInstructions(platform) {
    const target = PORTABLE_TARGETS[platform];
    const requirements = {
      windows: 'Windows 10/11 with its included Windows PowerShell and .NET Framework. No Python installation is needed. The launcher compiles its included C# server in memory. Managed computers may restrict PowerShell or Add-Type; follow your organization’s policy if blocked.',
      macos: 'macOS with /usr/bin/perl and its core networking modules (provided by supported macOS installations). No Python installation is needed. The launcher checks for Perl and reports a clear error if it is unavailable. macOS may request permission to open a downloaded launcher.',
      'linux-amd64': 'Linux on an Intel/AMD x64 processor with system glibc 2.34 or newer, a graphical desktop, a browser and a terminal application. The launcher uses the existing system library; Python is not needed. When opened from a file manager, it starts a desktop terminal. Your file manager may ask whether to execute the file. This build is not for ARM processors.'
    };
    return `EVOSUPPLEMENT — PORTABLE SUPPLEMENT (${target.label})\n\n` +
      `HOW TO OPEN\n1. Extract the entire ZIP. Keep the files and folders together.\n2. Open ${target.launcher}; do not run it from inside the ZIP.\n3. Your browser opens the local supplement. Keep the launcher window open.\n4. Close that window or press Ctrl+C there to stop the local server. Closing a browser tab alone does not stop it.\n\n` +
      (target.fallbackLauncher ? `WINDOWS SHORTCUT\nOpen supplement is a Windows shortcut with a built-in Windows icon. Its target is relative to this folder. Keep it beside ${target.fallbackLauncher}. If the shortcut does not open, double-click ${target.fallbackLauncher} directly.\n\n` : '') +
      `REQUIREMENTS\n${requirements[platform]}\n\n` +
      `IF THE BROWSER DOES NOT OPEN\nCopy the http://127.0.0.1:... address printed in the launcher window into your browser. The address changes each time. Do not open index.html directly. Do not move or rename the _portable folder.\n\n` +
      `OFFLINE CONTENT\nBuilt-in viewer scripts, styles, licenses and uploaded figure data are included. No Git account, publication server or internet connection is needed to read the packaged local figures. The Builder may need internet while creating this ZIP to download the pinned Mol* and YAML libraries.\n\n` +
      `External links (including DOI/NCBI links) need internet when opened. Uploaded HTML pages may refer to remote scripts, fonts or data. MOLX snapshots must contain their data; remote-only structures, maps or other references inside a snapshot are not made local by this export. Verify your own figures offline before sharing.\n\n` +
      `LOCAL PROCESSING\nThe launcher serves only this extracted supplement folder on 127.0.0.1 using an automatically chosen port. It does not publish the supplement or send its files to a remote service. No administrator permissions or permanent system changes are required.\n\n` +
      `EDITING\nTo edit the supplement, reopen this ZIP with Open project ZIP in EvoSupplement Builder. Save state / Load state remain available for drafts. To distribute a different platform, select it in the Builder and export another portable ZIP.\n`;
  }

  async function addModuleInputs(root, itemBase, item, assetRecords) {
    if (item.kind === 'protein') {
      const structure = getUpload(item.id, 'structure');
      const annotations = getUpload(item.id, 'annotations');
      const msa = getUpload(item.id, 'msa');
      const structureExt = ['.pdb','.ent','.cif','.mmcif'].includes(extensionOf(structure.name)) ? extensionOf(structure.name) : '.pdb';
      const structurePath = `${itemBase}/pdb/structure${structureExt}`;
      const annotationPath = `${itemBase}/annotations/regions.yaml`;
      root.file(structurePath, structure);
      root.file(annotationPath, annotations);
      assetRecords.push(assetRecord(item, 'structure', structurePath, structure));
      assetRecords.push(assetRecord(item, 'annotations', annotationPath, annotations));
      if (msa) {
        const msaExt = ['.fa','.faa','.fasta','.aln'].includes(extensionOf(msa.name)) ? extensionOf(msa.name) : '.fasta';
        const msaPath = `${itemBase}/annotations/alignment${msaExt}`;
        root.file(msaPath, msa);
        assetRecords.push(assetRecord(item, 'msa', msaPath, msa));
      }
      return;
    }

    if (item.kind === 'neighborhood') {
      const mappings = [
        ['neighborhoods', 'data/neighborhoods.tsv'],
        ['rename', 'data/domain_rename.yaml'],
        ['colors', 'data/color_dic.yaml']
      ];
      for (const [role, relative] of mappings) {
        const file = getUpload(item.id, role);
        const path = `${itemBase}/${relative}`;
        root.file(path, file);
        assetRecords.push(assetRecord(item, role, path, file));
      }
      return;
    }

    if (item.kind === 'phylogeny') {
      const tree = getUpload(item.id, 'tree');
      const yaml = getUpload(item.id, 'phylogenyYaml');
      const annotations = getUpload(item.id, 'annotations');
      const treeExt = ['.tree','.tre','.nwk','.newick'].includes(extensionOf(tree.name)) ? extensionOf(tree.name) : '.tree';
      const treePath = `${itemBase}/data/tree${treeExt}`;
      const yamlPath = `${itemBase}/data/phylogeny.yaml`;
      root.file(treePath, tree);
      root.file(yamlPath, yaml);
      assetRecords.push(assetRecord(item, 'tree', treePath, tree));
      assetRecords.push(assetRecord(item, 'phylogenyYaml', yamlPath, yaml));
      if (annotations) {
        const annotationExt = ['.tsv','.txt','.info','.csv'].includes(extensionOf(annotations.name)) ? extensionOf(annotations.name) : '.tsv';
        const annotationPath = `${itemBase}/data/annotations${annotationExt}`;
        root.file(annotationPath, annotations);
        assetRecords.push(assetRecord(item, 'annotations', annotationPath, annotations));
      }
      return;
    }

    if (item.kind === 'network') {
      const edges = getUpload(item.id, 'edges');
      const nodes = getUpload(item.id, 'nodes');
      const colors = getUpload(item.id, 'colors');
      const edgePath = `${itemBase}/data/interactions.tsv`;
      root.file(edgePath, edges);
      assetRecords.push(assetRecord(item, 'edges', edgePath, edges));
      if (nodes) {
        const path = `${itemBase}/data/nodes.yaml`;
        root.file(path, nodes);
        assetRecords.push(assetRecord(item, 'nodes', path, nodes));
      }
      if (colors) {
        const path = `${itemBase}/data/group-colors.yaml`;
        root.file(path, colors);
        assetRecords.push(assetRecord(item, 'colors', path, colors));
      }
      return;
    }

    if (item.kind === 'taxonomy') {
      const resolved = getUpload(item.id, 'taxonomyResolved');
      const yaml = getUpload(item.id, 'taxonomyYaml');
      const colors = getUpload(item.id, 'taxonomyColors');
      const input = getUpload(item.id, 'taxonomyInput');
      const resolvedPath = `${itemBase}/data/taxonomy-resolved.tsv`;
      const yamlPath = `${itemBase}/data/taxonomy-sankey.yaml`;
      root.file(resolvedPath, resolved);
      root.file(yamlPath, yaml);
      assetRecords.push(assetRecord(item, 'taxonomyResolved', resolvedPath, resolved));
      assetRecords.push(assetRecord(item, 'taxonomyYaml', yamlPath, yaml));
      if (colors) {
        const path = `${itemBase}/data/taxonomy-colors.yaml`;
        root.file(path, colors);
        assetRecords.push(assetRecord(item, 'taxonomyColors', path, colors));
      }
      if (input) {
        const path = `${itemBase}/data/taxonomy-input.tsv`;
        root.file(path, input);
        assetRecords.push(assetRecord(item, 'taxonomyInput', path, input));
      }
         return;
    }

    if (item.kind === 'architecture') {
      const table = getUpload(item.id, 'architectureData');
      const yaml = getUpload(item.id, 'architectureYaml');
      const tablePath = `${itemBase}/data/domain.tsv`;
      const yamlPath = `${itemBase}/data/domain-architecture.yaml`;
      root.file(tablePath, table);
      root.file(yamlPath, yaml);
      assetRecords.push(assetRecord(item, 'architectureData', tablePath, table));
      assetRecords.push(assetRecord(item, 'architectureYaml', yamlPath, yaml));
      return;
    }

    if (item.kind === 'multistructure') {
      const packageFile = getUpload(item.id, 'multiStructurePackage');
      const inspected = await inspectMultiStructurePackage(packageFile);
      const generatedFiles = [];
      for (const entry of inspected.entries) {
        const relative = stripZipPrefix(entry.name, inspected.prefix);
        if (!relative || !isSafeRelativePath(relative)) continue;
        const path = `${itemBase}/data/${relative}`;
        root.file(path, await entry.async('uint8array'), { binary: true });
        generatedFiles.push(path);
      }
      assetRecords.push({
        itemId: item.id,
        role: 'multiStructurePackage',
        kind: 'package',
        originalName: packageFile.name,
        mime: packageFile.type || 'application/zip',
        basePath: `${itemBase}/data`,
        files: generatedFiles
      });
      return;
    }
  }

  function assetRecord(item, role, path, file) {
    return {
      itemId: item.id,
      role,
      kind: 'file',
      path,
      originalName: file.name,
      mime: file.type || 'application/octet-stream'
    };
  }

  function generateModuleConfig(item) {
    const title = item.title.trim();
    const paperTitle = state.project.title.trim();
    if (item.kind === 'protein') {
      const structure = getUpload(item.id, 'structure');
      const msa = getUpload(item.id, 'msa');
      const ext = ['.pdb','.ent','.cif','.mmcif'].includes(extensionOf(structure.name)) ? extensionOf(structure.name) : '.pdb';
      const msaExt = msa && ['.fa','.faa','.fasta','.aln'].includes(extensionOf(msa.name)) ? extensionOf(msa.name) : '.fasta';
      return configScript('PROTEIN_REGION_VIEWER_CONFIG', {
        title,
        paperTitle,
        figureTitle: title,
        autoLoad: true,
        pdbUrl: `./pdb/structure${ext}`,
        yamlUrl: './annotations/regions.yaml',
        msaUrl: msa ? `./annotations/alignment${msaExt}` : '',
        defaultLayout: item.config.defaultLayout || 'canvas'
      }, 'Protein Structure and MSA Viewer');
    }

    if (item.kind === 'neighborhood') {
      return configScript('NEIGHBORHOOD_VIEWER_CONFIG', {
        title,
        paperTitle,
        figureTitle: title,
        inputFormat: item.config.inputFormat || 'auto',
        dataUrl: './data/neighborhoods.tsv',
        colorUrl: './data/color_dic.yaml',
        renameUrl: './data/domain_rename.yaml',
        includePlaceholder: 'Include by domain, PFAM, organism, taxonomy, PID…',
        excludePlaceholder: 'Exclude by the same syntax…',
        defaultScaleMode: item.config.defaultScaleMode || 'fixed',
        defaultAlignQuery: Boolean(item.config.defaultAlignQuery),
        defaultFlipNegativeQueries: item.config.defaultFlipNegativeQueries !== false,
        defaultShowLabels: item.config.defaultShowLabels !== false,
        defaultZoom: Number(item.config.defaultZoom) || 1,
        fixedDomainWidth: 64,
        fixedDomainWidths: {},
        fixedGeneGap: 10,
        fixedMarkerOnlyGeneWidth: 34,
        unknownDomainColor: '#d7dce2',
        markerDomains: {
          TM: { width: 4, color: '#f4cf3a', position: 'ordered' },
          SIG: { width: 5, color: '#d62828', position: 'start' },
          SIF: { width: 5, color: '#d62828', position: 'start' }
        },
        geneBackgroundColor: '#f4f6f8',
        maxDataBytes: 67108864
      }, 'Gene Neighborhood Viewer');
    }

    if (item.kind === 'phylogeny') {
      const tree = getUpload(item.id, 'tree');
      const annotations = getUpload(item.id, 'annotations');
      const treeExt = ['.tree','.tre','.nwk','.newick'].includes(extensionOf(tree.name)) ? extensionOf(tree.name) : '.tree';
      const annotationExt = annotations && ['.tsv','.txt','.info','.csv'].includes(extensionOf(annotations.name)) ? extensionOf(annotations.name) : '.tsv';
      return configScript('PHYLOGENY_VIEWER_CONFIG', {
        title,
        subtitle: item.description.trim() || 'Curated phylogeny with marked supports, clade groups, and optional annotations',
        paperTitle,
        figureTitle: title,
        authoring: false,
        autoLoad: true,
        treeUrl: `./data/tree${treeExt}`,
        annotationUrl: annotations ? `./data/annotations${annotationExt}` : '',
        curationUrl: './data/phylogeny.yaml',
        idColumn: item.config.idColumn || 'id',
        delimiter: item.config.delimiter === 'comma' ? ',' : '\t',
        defaultColorBy: '',
        defaultLayout: 'unrooted',
        defaultUseBranchLengths: true,
        colorColumn: 'color',
        colorTargetColumn: '',
        columnLabels: {},
        tooltipColumns: [],
        filterAliases: {},
        includePlaceholder: 'Include by tip identifier or annotation…',
        excludePlaceholder: 'Exclude by the same fields…',
        defaultAlignLabels: true,
        defaultBranchScale: 1,
        defaultTipSpacing: 22,
        defaultFitMode: 'all',
        defaultViewZoom: 1,
        defaultSupportDisplay: 'circle',
        defaultSupportColor: '#172033',
        defaultSupportSize: 5,
        defaultSupportNumberSize: 9,
        maxFileBytes: 33554432,
        maxTips: 10000,
        showDownloads: true
      }, 'Phylogeny Viewer');
    }

    if (item.kind === 'network') {
      const hasNodes = Boolean(getUpload(item.id, 'nodes'));
      const hasColors = Boolean(getUpload(item.id, 'colors'));
      return configScript('NETWORK_VIEWER_CONFIG', {
        title,
        subtitle: item.description.trim() || 'Interactive association network',
        paperTitle,
        figureTitle: title,
        autoLoad: true,
        edgeUrl: './data/interactions.tsv',
        nodeUrl: hasNodes ? './data/nodes.yaml' : '',
        colorUrl: hasColors ? './data/group-colors.yaml' : '',
        delimiter: '\t',
        edgeColumns: { source: 'source', target: 'target', type: 'edge_type', count: 'edge_count' },
        nodeFields: { label: 'Display_name', include: 'Include', group: 'Function', notes: 'Notes' },
        defaultMinimumCount: Math.max(0, Number(item.config.minimumCount) || 0),
        defaultLayout: item.config.layout || 'fruchterman-reingold',
        defaultNodeSize: 'weighted-degree',
        defaultShowLabels: true,
        defaultShowIsolates: Boolean(item.config.showIsolates),
        defaultOnlyIncluded: hasNodes,
        defaultCommunityMethod: item.config.communityMethod || 'none',
        defaultCommunityResolution: Number(item.config.communityResolution) || 1,
        defaultCommunityWeighted: item.config.communityWeighted !== false,
        defaultCommunitySeed: 42,
        defaultCommunityIterations: 20,
        defaultColorBy: item.config.colorBy || 'function',
        defaultGroupLayoutBy: item.config.groupLayoutBy || 'function',
        layoutSeed: 20260929,
        fitAfterLayout: true,
        maxFileBytes: 33554432,
        maxNodes: 5000,
        maxAggregatedEdges: 30000,
        showDownloads: true
      }, 'Network Viewer');
    }

    if (item.kind === 'taxonomy') {
      const hasColors = Boolean(getUpload(item.id, 'taxonomyColors'));
      const hasInput = Boolean(getUpload(item.id, 'taxonomyInput'));
      return configScript('TAXONOMY_SANKEY_CONFIG', {
        title: 'Taxonomy Flow Viewer',
        subtitle: item.description.trim() || 'Interactive taxonomic Sankey',
        paperTitle,
        figureTitle: title,
        autoLoad: true,
        inputUrl: hasInput ? './data/taxonomy-input.tsv' : '',
        resolvedUrl: './data/taxonomy-resolved.tsv',
        yamlUrl: './data/taxonomy-sankey.yaml',
        colorUrl: hasColors ? './data/taxonomy-colors.yaml' : '',
        pidColumn: 'pid',
        taxidColumn: 'taxid',
        classificationColumn: 'classification',
        maxFileBytes: 67108864,
        maxRows: 250000,
        showDownloads: true
      }, 'Taxonomy Flow Viewer');
    }

    if (item.kind === 'architecture') {
      return configScript('DOMAIN_ARCHITECTURE_CONFIG', {
        title: 'Protein Domain Architecture Viewer',
        subtitle: item.description.trim() || 'Interactive comparison of protein domain architectures',
        paperTitle,
        figureTitle: title,
        authoring: false,
        autoLoad: true,
        dataUrl: './data/domain.tsv',
        yamlUrl: './data/domain-architecture.yaml',
        fitOnLoad: true,
        maxFileBytes: 67108864,
        maxRows: 500000,
        showDownloads: true
      }, 'Protein Domain Architecture Viewer');
    }

    if (item.kind === 'multistructure') {
      return configScript('MULTI_STRUCTURE_VIEWER_CONFIG', {
        title: title || 'Multi-Structure Comparison Viewer',
        editorMode: false,
        autoLoad: true,
        definitionUrl: './data/multi-structure.json',
        syncOnLoad: false,
        showDownloads: true,
        maxPanels: 64
      }, 'Multi-Structure Comparison Viewer');
    }

    return '';
  }

  function configScript(globalName, object, label) {
    return `/**\n * Generated by EvoSupplement Builder ${BUILDER_VERSION}.\n * ${label} publication configuration.\n */\nwindow.${globalName} = ${JSON.stringify(object, null, 2)};\n`;
  }

  function preparePortalIndex(source) {
    let html = source;
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(state.project.title.trim() || 'Supplementary Material')}</title>`);
    html = html.replace(/<strong>EvoSupplement<\/strong>/, `<strong>${escapeHtml(state.project.shortTitle.trim() || 'EvoSupplement')}</strong>`);
    html = html.replace(/<small>Structures · genomic context · phylogeny · networks<\/small>/, '<small>Interactive supplementary material</small>');
    html = html.replace(/\s*<a[^>]*data-builder-link[^>]*>[\s\S]*?<\/a>/i, '');
    return html;
  }

  function generateManifestJs(manifest) {
    return `/**\n * Generated by EvoSupplement Builder ${BUILDER_VERSION}.\n * Edit this file to change portal metadata, sections, labels, and links.\n */\nwindow.SUPPLEMENTARY_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`;
  }

  function generateReadme(manifest) {
    const authors = state.project.authors.map(author => author.name.trim()).filter(Boolean).join(', ');
    const moduleKinds = [...usedModuleKinds()];
    const contents = manifest.sections.flatMap(section => section.items.map(item => ({ section: section.title, ...item })));
    const tableRows = contents.map(item => `| ${escapeMarkdown(item.section)} | ${escapeMarkdown(item.title)} | ${escapeMarkdown(item.type)} | ${item.href ? `\`${item.href}\`` : 'Coming soon'} |`).join('\n');
    const moduleLines = moduleKinds.length
      ? moduleKinds.map(kind => `- **${MODULE_REGISTRY[kind].label}** — viewer ${MODULE_VERSIONS[kind]}`).join('\n')
      : '- No EvoSupplement viewer module is included in this project.';

    return `# ${state.project.title.trim()}\n\n${state.project.description.trim() || 'Interactive supplementary material generated with EvoSupplement Builder.'}\n\n## Citation information\n\n- **Authors:** ${authors}\n- **Journal / venue:** ${state.project.journal.trim() || 'Not specified'}\n- **Year:** ${state.project.year.trim() || 'Not specified'}\n- **DOI:** ${normalizeDoi(state.project.doi) || 'Not specified'}\n\n## Contents\n\n| Section | Item | Type | Path |\n|---|---|---|---|\n${tableRows || '| — | — | — | — |'}\n\n## Included interactive modules\n\n${moduleLines}\n\nShared JavaScript and CSS are included only for modules used by this project. Each publication page loads its own local configuration and data files.\n\n## Preview locally\n\nServe the repository root over HTTP. For example:\n\n\`\`\`bash\npython3 -m http.server 8000\n\`\`\`\n\nThen open \`http://localhost:8000/\`. Opening the HTML files directly through \`file://\` may prevent browsers from loading local data files.\n\n## Publish with GitHub Pages\n\nSee [DEPLOYMENT.md](./DEPLOYMENT.md). A GitHub Actions workflow is already included under \`.github/workflows/pages.yml\`.\n\n## Edit or rebuild\n\n- Edit \`manifest.js\` for portal-only changes.\n- Edit the \`config.js\` inside a viewer item for initial viewer settings.\n- Reopen this generated ZIP in **EvoSupplement Builder** to restore the project form and attached assets. The recipe is stored in \`evosupplement-project.json\`.\n\n## Generated project\n\n- EvoSupplement Builder: ${BUILDER_VERSION}\n- Generated: ${new Date().toISOString()}\n`;
  }

  function generateDeploymentGuide() {
    const repo = slugify(state.project.repositoryName, 'evosupplement');
    return `# Publish this supplement with GitHub Pages\n\nThis project is a static website. No server-side application or build command is required.\n\n## 1. Extract the ZIP\n\nExtract \`${repo}.zip\`. The archive contains a top-level folder named \`${repo}\`. Upload the **contents of that folder** to the root of the repository. Do not upload only the ZIP file.\n\n## 2. Create a GitHub repository\n\n1. Sign in to GitHub.\n2. Create a new empty repository.\n3. Use the same name as the generated folder if convenient: \`${repo}\`.\n4. Do not initialize it with a different README if you plan to upload the generated files directly.\n\n## 3. Upload the generated files\n\nUpload all files and folders, including hidden paths such as \`.github\` and the empty \`.nojekyll\` file. You can use the GitHub web interface or Git from the command line.\n\n## 4. Enable GitHub Pages\n\n1. Open the repository **Settings**.\n2. Open **Pages**.\n3. Under **Build and deployment**, choose **GitHub Actions**.\n4. Push to the \`main\` branch.\n5. The included workflow will publish the repository root.\n\n## 5. Verify the published site\n\nOpen the Pages URL shown by GitHub and test:\n\n- the portal cards;\n- every uploaded file;\n- every interactive viewer;\n- source-file downloads;\n- desktop and narrow-screen layouts.\n\n## Local testing before publication\n\n\`\`\`bash\ncd ${repo}\npython3 -m http.server 8000\n\`\`\`\n\nOpen \`http://localhost:8000/\`.\n\n## Common problems\n\n- **A viewer page is empty:** confirm that its \`config.js\` paths match the packaged files.\n- **The portal opens but a card is broken:** check the corresponding \`href\` in \`manifest.js\`.\n- **Files work locally but not on GitHub:** GitHub paths are case-sensitive. Check capitalization.\n- **Pages does not deploy:** confirm that the repository uses the \`main\` branch and Pages is set to GitHub Actions.\n`;
  }

  function generateCitationCff() {
    const authors = state.project.authors.map(author => authorToCff(author)).filter(Boolean);
    const lines = [
      'cff-version: 1.2.0',
      `message: ${yamlString('Please cite the associated paper and this supplementary resource.')}`,
      `title: ${yamlString(state.project.title.trim())}`,
      'type: dataset',
      'authors:'
    ];
    if (authors.length) {
      for (const author of authors) {
        lines.push(`  - family-names: ${yamlString(author.family)}`);
        if (author.given) lines.push(`    given-names: ${yamlString(author.given)}`);
        if (author.orcid) lines.push(`    orcid: ${yamlString(`https://orcid.org/${author.orcid}`)}`);
      }
    } else {
      lines.push(`  - name: ${yamlString('Supplement authors')}`);
    }
    if (state.project.year.trim()) lines.push(`date-released: ${yamlString(`${state.project.year.trim()}-01-01`)}`);
    const doi = normalizeDoi(state.project.doi);
    if (doi) {
      lines.push('identifiers:');
      lines.push('  - type: doi');
      lines.push(`    value: ${yamlString(doi)}`);
    }
    lines.push(`abstract: ${yamlString(state.project.description.trim() || 'Interactive supplementary material.')}`);
    lines.push('');
    return lines.join('\n');
  }

  function authorToCff(author) {
    const name = author.name.trim();
    if (!name) return null;
    const parts = name.split(/\s+/);
    const family = parts.length > 1 ? parts.pop() : parts[0];
    return { family, given: parts.length > 1 || (parts.length === 1 && parts[0] !== family) ? parts.join(' ') : (name === family ? '' : parts.join(' ')), orcid: normalizeOrcid(author.orcid) };
  }

  function generateMitLicense() {
    const year = state.project.year.trim() || String(new Date().getFullYear());
    const authors = state.project.authors.map(author => author.name.trim()).filter(Boolean).join(', ') || 'EvoSupplement project contributors';
    return `MIT License\n\nCopyright (c) ${year} ${authors}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
  }

  function authorNames() {
    return state.project.authors.map(author => author.name.trim()).filter(Boolean);
  }

  function normalizeDoi(value) {
    return String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  }

  function normalizeOrcid(value) {
    const cleaned = String(value || '').trim().replace(/^https?:\/\/orcid\.org\//i, '');
    return /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/i.test(cleaned) ? cleaned : '';
  }

  function yamlString(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function escapeMarkdown(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  }

  function manifestType(item) {
    if (item.kind === 'file') return item.config.badge || 'doc';
    if (item.kind === 'external') return 'external';
    if (item.kind === 'coming') return 'doc';
    return 'viewer';
  }

  function inferBadge(fileName) {
    const ext = extensionOf(fileName);
    if (ext === '.pdf') return 'pdf';
    if (['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(ext)) return 'image';
    if (['.csv','.tsv','.xls','.xlsx'].includes(ext)) return 'table';
    if (['.zip','.tar','.gz','.tgz','.fasta','.fa','.tree','.nwk'].includes(ext)) return 'dataset';
    return 'doc';
  }

  function generatedHref(section, item) {
    const slug = slugify(item.slug || item.title, 'item');
    switch (item.kind) {
      case 'file': {
        const file = getUpload(item.id, 'file');
        return file ? `./files/${slugify(section.slug || section.title, 'section')}/${slug}/${sanitizeFileName(file.name)}` : '';
      }
      case 'html': return `./html/${slug}/`;
      case 'protein': return `./protein-viewer/${slug}/`;
      case 'neighborhood': return `./neighborhood-viewer/${slug}/`;
      case 'phylogeny': return `./phylogeny-viewer/${slug}/`;
      case 'network': return `./network-viewer/${slug}/`;
      case 'taxonomy': return `./taxonomy-sankey-viewer/${slug}/`;
      case 'architecture': return `./domain-architecture-viewer/${slug}/`;
      case 'multistructure': return `./multi-structure-viewer/${slug}/`;
      case 'external': return item.config.url || '';
      default: return '';
    }
  }

  function usedModuleKinds() {
    const used = new Set();
    for (const section of state.sections) {
      for (const item of section.items) if (MODULE_REGISTRY[item.kind]) used.add(item.kind);
    }
    return used;
  }

  function serializeState() {
    return JSON.parse(JSON.stringify({
      ...state,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      builderVersion: BUILDER_VERSION,
      project: state.project,
      sections: state.sections
    }));
  }

  async function saveBuilderState() {
    setBusy(true, 'Saving Builder state', 'Collecting settings and original uploads…', 5);
    try {
      if (typeof JSZip === 'undefined') throw new Error('The ZIP library did not load. Reload the Builder page.');
      // Capture before the first await. Drafts need no publication validation or templates.
      const savedState = serializeState();
      const files = [...uploadFiles.entries()];
      const zip = new JSZip();
      const assets = files.map(([key, file], index) => {
        const separator = key.indexOf('::');
        const path = `uploads/${String(index + 1).padStart(6, '0')}/${sanitizeFileName(file.name)}`;
        zip.file(path, file);
        return {
          ...(key === fileKey(PROJECT_UPLOAD_ID, 'cover') ? { scope: 'project' } : { itemId: key.slice(0, separator) }),
          role: key.slice(separator + 2),
          kind: 'file',
          path,
          originalName: file.name,
          mime: file.type,
          size: file.size,
          lastModified: file.lastModified
        };
      });
      const savedAt = new Date().toISOString();
      zip.file(STATE_MANIFEST, JSON.stringify({
        format: STATE_FORMAT,
        schemaVersion: STATE_SCHEMA_VERSION,
        builder: { name: 'EvoSupplement Builder', version: BUILDER_VERSION },
        savedAt,
        moduleVersions: MODULE_VERSIONS,
        project: savedState,
        assets
      }, null, 2));
      const blob = await zip.generateAsync({
        type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX'
      }, metadata => setBusyProgress(10 + metadata.percent * 0.9, `Saving ${files.length} attached file${files.length === 1 ? '' : 's'}…`));
      const timestamp = savedAt.replace(/[:.]/g, '-');
      const fileName = `${slugify(savedState.project.repositoryName, 'evosupplement')}-builder-state-${timestamp}.zip`;
      triggerDownload(blob, fileName);
      showToast('Builder state saved with all attached files. Use Load state to resume.');
    } catch (error) {
      console.error(error);
      showToast(`Could not save the Builder state: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function fetchSourceText(path) {
    const key = `text:${path}`;
    if (SOURCE_CACHE.has(key)) return SOURCE_CACHE.get(key);
    const response = await fetch(`../${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load Builder template: ${path} (${response.status})`);
    const text = await response.text();
    SOURCE_CACHE.set(key, text);
    return text;
  }

  async function fetchSourceBytes(path) {
    const key = `bytes:${path}`;
    if (SOURCE_CACHE.has(key)) return SOURCE_CACHE.get(key);
    const response = await fetch(`../${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load Builder asset: ${path} (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    SOURCE_CACHE.set(key, bytes);
    return bytes;
  }

  async function inspectMultiStructurePackage(file) {
    const packageZip = await JSZip.loadAsync(file);
    const entries = Object.values(packageZip.files).filter(entry => !entry.dir && !entry.name.startsWith('__MACOSX/') && !entry.name.endsWith('/.DS_Store') && isSafeRelativePath(entry.name));
    const namesArray = entries.map(entry => entry.name.replace(/^\.\//, ''));
    let prefix = '';
    let definitionPath = namesArray.find(name => name.toLowerCase() === 'multi-structure.json') || '';
    if (!definitionPath) {
      const candidates = namesArray.filter(name => /(^|\/)multi-structure\.json$/i.test(name));
      const topFolders = new Set(namesArray.filter(name => name.includes('/')).map(name => name.split('/')[0]));
      if (candidates.length === 1 && topFolders.size === 1) {
        prefix = `${[...topFolders][0]}/`;
        definitionPath = candidates[0];
      }
    }
    let definition = null;
    if (definitionPath) {
      const definitionEntry = packageZip.file(definitionPath);
      if (!definitionEntry) throw new Error('Could not read multi-structure.json from the package.');
      definition = JSON.parse(await definitionEntry.async('string'));
    }
    return { zip: packageZip, entries, prefix, definitionPath, definition, names: new Set(namesArray) };
  }

  async function inspectHtmlPackage(file) {
    const packageZip = await JSZip.loadAsync(file);
    const entries = Object.values(packageZip.files).filter(entry => !entry.dir && !entry.name.startsWith('__MACOSX/') && !entry.name.endsWith('/.DS_Store') && isSafeRelativePath(entry.name));
    const names = entries.map(entry => entry.name.replace(/^\.\//, ''));
    let prefix = '';
    let indexPath = names.find(name => name.toLowerCase() === 'index.html') || '';
    if (!indexPath) {
      const topFolders = new Set(names.filter(name => name.includes('/')).map(name => name.split('/')[0]));
      const candidates = names.filter(name => /(^|\/)index\.html$/i.test(name));
      if (topFolders.size === 1 && candidates.length === 1) {
        prefix = `${[...topFolders][0]}/`;
        indexPath = candidates[0];
      }
    }
    return { zip: packageZip, entries, prefix, indexPath };
  }

  function stripZipPrefix(path, prefix) {
    const clean = path.replace(/^\.\//, '').replace(/\\/g, '/');
    return prefix && clean.startsWith(prefix) ? clean.slice(prefix.length) : clean;
  }

  function isSafeRelativePath(path) {
    const clean = String(path || '').replace(/\\/g, '/');
    if (!clean || clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return false;
    return !clean.split('/').some(part => part === '..');
  }

  async function handleOpenProject(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true, 'Loading saved work', 'Checking the ZIP and its attached files…', 5);
    try {
      const projectZip = await JSZip.loadAsync(file, { checkCRC32: true });
      const candidates = Object.values(projectZip.files).filter(entry => !entry.dir &&
        /(^|\/)(evosupplement-builder-state|evosupplement-project)\.json$/i.test(entry.name));
      candidates.sort((a, b) => a.name.split('/').length - b.name.split('/').length);
      if (!candidates.length) throw new Error('Choose a saved Builder state ZIP or a project ZIP generated by the Builder.');
      if (candidates[1] && candidates[0].name.split('/').length === candidates[1].name.split('/').length) {
        throw new Error('This ZIP contains multiple project manifests. Open one saved state or project at a time.');
      }
      const recipePath = candidates[0].name;
      requireArchiveEntry(projectZip, recipePath);
      const prefix = recipePath.slice(0, recipePath.lastIndexOf('/') + 1);
      const recipe = JSON.parse(await projectZip.file(recipePath).async('string'));
      const isSnapshot = recipePath.toLowerCase().endsWith(STATE_MANIFEST);
      requireObject(recipe, 'saved project');
      if (isSnapshot && recipe.format !== STATE_FORMAT) throw new Error('This is not an EvoSupplement Builder state.');
      const supportedVersion = isSnapshot ? STATE_SCHEMA_VERSION : PROJECT_SCHEMA_VERSION;
      if (Number(recipe.schemaVersion) !== supportedVersion) {
        throw new Error(`Unsupported ${isSnapshot ? 'Builder state' : 'project recipe'} schema version: ${recipe.schemaVersion}. Use a compatible Builder version.`);
      }
      const imported = normalizeImportedState(recipe.project);
      const restoredFiles = new Map();
      const itemIds = new Set(imported.sections.flatMap(section => section.items.map(item => item.id)));
      if (!Array.isArray(recipe.assets)) throw new Error('The saved project has no valid attached-file inventory.');
      const assets = recipe.assets;
      let done = 0;
      for (const asset of assets) {
        requireObject(asset, 'attached file');
        const isCover = asset.scope === 'project';
        if (isCover ? (asset.role !== 'cover' || asset.kind !== 'file' || asset.itemId !== undefined) :
          (asset.scope !== undefined || !itemIds.has(asset.itemId) || typeof asset.role !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(asset.role))) {
          throw new Error('An attached file has an invalid item or file role.');
        }
        const key = fileKey(isCover ? PROJECT_UPLOAD_ID : asset.itemId, asset.role);
        if (restoredFiles.has(key)) throw new Error('The saved project contains duplicate file attachments.');
        if (asset.mime !== undefined && typeof asset.mime !== 'string') throw new Error('An attached file has an invalid MIME type.');
        if (asset.originalName !== undefined && typeof asset.originalName !== 'string') throw new Error('An attached file has an invalid name.');
        if (asset.lastModified !== undefined && (!Number.isSafeInteger(asset.lastModified) || asset.lastModified < 0)) {
          throw new Error('An attached file has an invalid modification date.');
        }
        const fileOptions = { type: asset.mime ?? 'application/octet-stream' };
        if (asset.lastModified !== undefined) fileOptions.lastModified = asset.lastModified;
        if (asset.kind === 'package') {
          if (isSnapshot) throw new Error('Builder states must contain original uploads, including original ZIP packages.');
          if (!Array.isArray(asset.files) || !asset.files.length || !isArchivePath(asset.basePath)) {
            throw new Error('The saved project contains an invalid package inventory.');
          }
          const packageZip = new JSZip();
          const packagePaths = new Set();
          for (const generatedPath of asset.files || []) {
            if (typeof generatedPath !== 'string' || !generatedPath.startsWith(`${asset.basePath}/`)) {
              throw new Error('An attached package contains an invalid file path.');
            }
            const entry = requireArchiveEntry(projectZip, `${prefix}${generatedPath}`);
            const relative = generatedPath.slice(asset.basePath.length + 1);
            if (!isArchivePath(relative) || packagePaths.has(relative)) throw new Error('An attached package contains an invalid or duplicate file path.');
            packagePaths.add(relative);
            packageZip.file(relative, await entry.async('uint8array'));
          }
          const blob = await packageZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          fileOptions.type = asset.mime || 'application/zip';
          restoredFiles.set(key, new File([blob], asset.originalName || 'package.zip', fileOptions));
        } else {
          if (asset.kind !== 'file' || !isArchivePath(asset.path)) throw new Error('An attached file has an invalid type or path.');
          if (isSnapshot && (!asset.path.startsWith('uploads/') || typeof asset.originalName !== 'string' || !Number.isSafeInteger(asset.size) || asset.size < 0)) {
            throw new Error('The Builder state contains an invalid original-file inventory.');
          }
          const entry = requireArchiveEntry(projectZip, `${prefix}${asset.path}`);
          const bytes = await entry.async('uint8array');
          if (asset.size !== undefined && bytes.byteLength !== asset.size) throw new Error(`The attached file “${asset.originalName || asset.path}” has the wrong size.`);
          restoredFiles.set(key, new File([bytes], asset.originalName ?? asset.path.split('/').pop(), fileOptions));
        }
        if (isCover) {
          const error = coverValidationError(restoredFiles.get(key));
          if (error) throw new Error(error);
        }
        done += 1;
        setBusyProgress(10 + Math.round((done / Math.max(1, assets.length)) * 75), `Restoring attached files (${done}/${assets.length})…`);
      }

      // No session mutation until the entire archive has been checked and restored.
      if (hasProjectContent() && !window.confirm('Replace the current Builder work with this saved state or project? Cancel to save your current state first.')) return;
      state = imported;
      uploadFiles.clear();
      for (const [key, value] of restoredFiles) uploadFiles.set(key, value);
      validationMessages = [];
      syncProjectInputs();
      renderAll();
      setBusyProgress(100, 'Project restored.');
      showToast(`Loaded ${file.name} with ${restoredFiles.size} attached file${restoredFiles.size === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error(error);
      showToast(`Could not load the ZIP: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function isArchivePath(path) {
    return typeof path === 'string' && isSafeRelativePath(path) && !/[\\\x00-\x1f]/.test(path) &&
      !path.split('/').some(part => !part || part === '.');
  }

  function requireArchiveEntry(zip, path) {
    if (!isArchivePath(path)) throw new Error('The archive contains an unsafe file path.');
    const entry = zip.file(path);
    if (!entry) throw new Error(`The archive is missing an attached file: ${path}`);
    if (entry.unsafeOriginalName && entry.unsafeOriginalName !== path) throw new Error('The archive contains an unsafe original file path.');
    return entry;
  }

  function hasProjectContent() {
    const defaults = createInitialState().project;
    return Boolean(state.sections.length || uploadFiles.size || state.exportOptions.portablePlatform !== 'windows' ||
      state.project.authors.some(author => author.name || author.orcid) || state.project.authors.length > 1 ||
      Object.keys(defaults).some(key => key !== 'authors' && state.project[key] !== defaults[key]));
  }

  function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The ${label} is invalid.`);
    return value;
  }

  function importFields(value, defaults, label) {
    requireObject(value, label);
    const result = { ...defaults, ...value };
    for (const [key, fallback] of Object.entries(defaults)) {
      if (typeof result[key] !== typeof fallback || (typeof fallback === 'number' && !Number.isFinite(result[key]))) {
        throw new Error(`The ${label} field “${key}” is invalid.`);
      }
    }
    return result;
  }

  function normalizeImportedState(project) {
    requireObject(project, 'project state');
    if (project.schemaVersion !== undefined && Number(project.schemaVersion) !== PROJECT_SCHEMA_VERSION) {
      throw new Error(`Unsupported project state schema version: ${project.schemaVersion}. Use a compatible Builder version.`);
    }
    const imported = JSON.parse(JSON.stringify(project));
    imported.schemaVersion = PROJECT_SCHEMA_VERSION;
    imported.builderVersion = BUILDER_VERSION;
    imported.exportOptions = importFields(imported.exportOptions ?? {}, { portablePlatform: 'windows' }, 'export options');
    if (!Object.prototype.hasOwnProperty.call(PORTABLE_TARGETS, imported.exportOptions.portablePlatform)) {
      throw new Error('This saved export platform is not supported. Use a compatible Builder version.');
    }
    // Defaults apply only to absent fields. Empty strings and false are draft data.
    // Preserve extension fields so compatible schema-1 releases can round-trip them.
    imported.project = importFields(imported.project, {
      title: '', shortTitle: 'EvoSupplement', repositoryName: 'evosupplement', repositoryTouched: true,
      description: '', journal: '', year: '', doi: '', license: 'MIT', coverAlt: '', coverCaption: ''
    }, 'project information');
    const identifiers = new Set();
    const importId = (value, prefix) => {
      const id = value === undefined ? uid(prefix) : value;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || identifiers.has(id)) {
        throw new Error('The saved project contains an invalid or duplicate identifier.');
      }
      identifiers.add(id);
      return id;
    };
    const authors = imported.project.authors ?? [{ name: '', orcid: '' }];
    if (!Array.isArray(authors)) throw new Error('The saved author list is invalid.');
    imported.project.authors = authors.map(author => {
      const normalized = importFields(author, { name: '', orcid: '' }, 'author');
      return { ...normalized, id: importId(author.id, 'author') };
    });
    if (!Array.isArray(imported.sections)) throw new Error('The saved section list is invalid.');
    imported.sections = imported.sections.map(section => {
      requireObject(section, 'section');
      const normalized = importFields(section, { title: '', slug: slugify(section.title, 'section'), slugTouched: true }, 'section');
      normalized.id = importId(section.id, 'section');
      if (!Array.isArray(section.items)) throw new Error('A saved item list is invalid.');
      normalized.items = section.items.map(item => {
        requireObject(item, 'item');
        if (typeof item.kind !== 'string' || !Object.prototype.hasOwnProperty.call(KIND_LABELS, item.kind)) {
          throw new Error(`Unsupported saved item type: ${item.kind}. Use a compatible Builder version.`);
        }
        const normalizedItem = importFields(item, {
          title: '', description: '', slug: slugify(item.title, 'item'), slugTouched: true
        }, 'item');
        normalizedItem.id = importId(item.id, 'item');
        normalizedItem.config = importFields(item.config ?? {}, defaultConfig(item.kind), 'item configuration');
        return normalizedItem;
      });
      return normalized;
    });
    return imported;
  }

  function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function setBusy(visible, title = '', message = '', percent = 0) {
    els.busyOverlay.hidden = !visible;
    // Block keyboard edits as well as pointer edits while capturing/restoring a state.
    document.querySelector('.app-header').inert = visible;
    document.querySelector('main').inert = visible;
    if (visible) {
      els.busyTitle.textContent = title;
      els.busyMessage.textContent = message;
      setBusyProgress(percent, message);
    }
  }

  function setBusyProgress(percent, message) {
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    els.busyProgress.style.width = `${clamped}%`;
    els.busyPercent.textContent = `${Math.round(clamped)}%`;
    if (message) els.busyMessage.textContent = message;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 4200);
  }

  function checkRuntime() {
    if (typeof JSZip === 'undefined') {
      validationMessages = [{ level: 'error', location: 'Builder', text: 'JSZip did not load. The Builder cannot create archives.' }];
      renderValidationStatus(validationMessages, true);
      for (const id of ['downloadButton', 'portableDownloadButton', 'saveStateButton', 'loadStateButton', 'openProjectButton']) {
        document.getElementById(id).disabled = true;
      }
    }
    if (!window.EvoSupplementPortableVendor) {
      document.getElementById('portableDownloadButton').disabled = true;
    }
    if (location.protocol === 'file:') {
      validationMessages = [{ level: 'warning', location: 'Builder', text: 'Serve the repository over HTTP. Browser security may block template loading from file://.' }];
      renderValidationStatus(validationMessages, true);
    }
  }

  syncProjectInputs();
  bindStaticEvents();
  renderAll();
  checkRuntime();
})();
