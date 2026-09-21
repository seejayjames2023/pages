/**
 * visualizer.js
 * Standalone structural visualizer for the parser's `structure` object.
 *
 * Public API:
 *   visualizeStructure(structure)
 *   visualizeStructure(structure, options)
 *
 * No external libraries. No parser knowledge required beyond the fields
 * present in `structure`.
 */
(function () {
  "use strict";

  const ROOT_ID = "structure-visualizer-root";
  const STYLE_ID = "structure-visualizer-styles";
  const RETURN_ID = "structure-visualizer-return";

  const TYPE_META = {
    headings: {
      label: "Headings",
      singular: "Heading",
      color: "#7dd3fc",
      center: [230, 235]
    },
    paragraphs: {
      label: "Paragraphs",
      singular: "Paragraph",
      color: "#c4b5fd",
      center: [675, 235]
    },
    listItems: {
      label: "List Items",
      singular: "List Item",
      color: "#86efac",
      center: [1125, 235]
    },
    blockquotes: {
      label: "Blockquotes",
      singular: "Blockquote",
      color: "#f9a8d4",
      center: [1570, 235]
    },
    figures: {
      label: "Figures",
      singular: "Figure",
      color: "#fde68a",
      center: [410, 760]
    },
    tables: {
      label: "Tables",
      singular: "Table",
      color: "#fdba74",
      center: [900, 760]
    },
    links: {
      label: "Links",
      singular: "Link",
      color: "#67e8f9",
      center: [1390, 760]
    }
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const BASE_VIEWBOX = { x: 0, y: 0, width: 1800, height: 1100 };

  window.visualizeStructure = function visualizeStructure(structure, options = {}) {
    validateStructure(structure);
    removeExistingVisualizer();
    injectStyles();

    const config = {
      ...options,
      title: options.title || "Structure Visualizer",
      minImportance: clamp(Number(options.minImportance ?? 0), 0, 1),
      showEdges: options.showEdges !== false,
      hoverActive: options.hoverActive !== false
    };

    const nodes = flattenStructure(structure);
    const nodeBySourceRef = new Map();

    for (const node of nodes) {
      if (node.bucket !== "links" && node.sourceRef) {
        nodeBySourceRef.set(node.sourceRef, node);
      }
    }

    const root = el("div", { id: ROOT_ID, className: "sv-root" });
    root.innerHTML = `
      <div class="sv-shell">
        <header class="sv-header">
          <div>
            <h2 class="sv-title">${escapeHTML(config.title)}</h2>
          </div>
          
          <div class="sv-toggle-group">
          <label class="sv-hoverActive-toggle">
            <input type="checkbox" ${config.hoverActive ? "checked" : ""}>
            <span>Hover active</span>
          </label>
          
          <label class="sv-edge-toggle">
            <input type="checkbox" ${config.showEdges ? "checked" : ""}>
            <span>Show edges</span>
          </label>
          </div>

          <div class="sv-header-actions">
            <button class="sv-button" data-action="fit" type="button">Fit</button>
            <button class="sv-button sv-button-primary" data-action="close" type="button">Close</button>
          </div>
        </header>

          

        <div class="sv-toolbar">
          <label class="sv-search-wrap">
            <input class="sv-search" type="search" placeholder="Search labels, IDs, URLs…" autocomplete="off">
          </label>



          <label class="sv-range-wrap">
            <span>Importance ≥ <strong class="sv-importance-value">${config.minImportance.toFixed(2)}</strong></span>
            <input class="sv-range" type="range" min="0" max="1" step="0.05" value="${config.minImportance}">
          </label>


          

          <div class="sv-visible-count"></div>
        </div>

        <div class="sv-type-filters"></div>

        <main class="sv-main">
          <section class="sv-stage-wrap">
            <svg class="sv-stage"
                 viewBox="${BASE_VIEWBOX.x} ${BASE_VIEWBOX.y} ${BASE_VIEWBOX.width} ${BASE_VIEWBOX.height}"
                 aria-label="Interactive structural map">
              <rect class="sv-background" x="0" y="0" width="${BASE_VIEWBOX.width}" height="${BASE_VIEWBOX.height}"></rect>
              <g class="sv-groups-layer"></g>
              <g class="sv-edges-layer"></g>
              <g class="sv-nodes-layer"></g>
            </svg>

            <div class="sv-help">Wheel to zoom · drag empty space to pan · click a node for details</div>
            <div class="sv-tooltip" hidden></div>
          </section>

          <aside class="sv-details">
            <div class="sv-details-empty">
              <div class="sv-details-icon">◎</div>
              <h3>Select a node</h3>
              <p>Hover for a quick label. Click for full details and source actions.</p>
            </div>
          </aside>
        </main>
      </div>
    `;

    document.body.appendChild(root);

    const svg = root.querySelector(".sv-stage");
    const groupsLayer = root.querySelector(".sv-groups-layer");
    const edgesLayer = root.querySelector(".sv-edges-layer");
    const nodesLayer = root.querySelector(".sv-nodes-layer");
    const details = root.querySelector(".sv-details");
    const tooltip = root.querySelector(".sv-tooltip");
    const searchInput = root.querySelector(".sv-search");
    const rangeInput = root.querySelector(".sv-range");
    const importanceValue = root.querySelector(".sv-importance-value");
    const edgeToggle = root.querySelector(".sv-edge-toggle input");
    const hoverActiveToggle = root.querySelector(".sv-hoverActive-toggle input");
    const filterContainer = root.querySelector(".sv-type-filters");
    const visibleCount = root.querySelector(".sv-visible-count");

    const state = {
      activeTypes: new Set(Object.keys(TYPE_META)),
      minImportance: config.minImportance,
      query: "",
      showEdges: config.showEdges,
      hoverActive: config.hoverActive,
      selectedKey: null,
      hoverKey: null,
      viewBox: { ...BASE_VIEWBOX },
      dragging: false,
      dragStart: null,
      startViewBox: null
    };

    const nodeElements = new Map();
    const edgeElements = [];
    const positions = new Map();

    buildTypeFilters();
    buildGroups();
    buildNodes();
    buildEdges();
    applyFilters();

    root.querySelector('[data-action="close"]').addEventListener("click", closeVisualizer);
    root.querySelector('[data-action="fit"]').addEventListener("click", fitView);

    searchInput.addEventListener("input", () => {
      state.query = searchInput.value.trim().toLowerCase();
      applyFilters();
    });

    rangeInput.addEventListener("input", () => {
      state.minImportance = Number(rangeInput.value);
      importanceValue.textContent = state.minImportance.toFixed(2);
      applyFilters();
    });

    edgeToggle.addEventListener("change", () => {
      state.showEdges = edgeToggle.checked;
      applyFilters();
    });

    hoverActiveToggle.addEventListener("change", () => {
      state.hoverActive = hoverActiveToggle.checked;
      applyFilters();
    });

    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    root.addEventListener("keydown", event => {
      if (event.key === "Escape") closeVisualizer();
    });

    requestAnimationFrame(() => searchInput.focus());

    return {
      close: closeVisualizer,
      fit: fitView,
      root
    };

    function buildTypeFilters() {
      for (const [bucket, meta] of Object.entries(TYPE_META)) {
        const count = Array.isArray(structure[bucket]) ? structure[bucket].length : 0;
        const label = el("label", { className: "sv-type-chip" });

        label.innerHTML = `
          <input type="checkbox" data-bucket="${bucket}" checked>
          <span class="sv-dot" style="--sv-type-color:${meta.color}"></span>
          <span>${meta.label}</span>
          <strong>${count}</strong>
        `;

        label.querySelector("input").addEventListener("change", event => {
          if (event.target.checked) state.activeTypes.add(bucket);
          else state.activeTypes.delete(bucket);
          applyFilters();
        });

        filterContainer.appendChild(label);
      }
    }

    function buildGroups() {
      for (const [bucket, meta] of Object.entries(TYPE_META)) {
        const count = structure[bucket]?.length || 0;
        const [cx, cy] = meta.center;
        const radius = clusterRadius(count);

        const group = svgEl("g", {
          class: "sv-group",
          "data-bucket": bucket
        });

        group.appendChild(svgEl("circle", {
          cx, cy, r: radius,
          fill: meta.color,
          class: "sv-group-halo"
        }));

        const label = svgEl("text", {
          x: cx,
          y: cy - radius - 25,
          class: "sv-group-label",
          "text-anchor": "middle"
        });
        label.textContent = `${meta.label} · ${count}`;
        group.appendChild(label);

        groupsLayer.appendChild(group);
      }
    }

    function buildNodes() {
      for (const [bucket, meta] of Object.entries(TYPE_META)) {
        const bucketNodes = nodes.filter(node => node.bucket === bucket);
        const [cx, cy] = meta.center;
        const spacing = spacingForCount(bucketNodes.length);

        bucketNodes.forEach((node, index) => {
          const point = spiralPoint(cx, cy, index, spacing);
          positions.set(node.key, point);

          const radius = nodeRadius(node.importance);
          const circle = svgEl("circle", {
            cx: point.x,
            cy: point.y,
            r: radius,
            fill: meta.color,
            class: "sv-node",
            tabindex: "0",
            role: "button",
            "data-key": node.key,
            "data-bucket": bucket,
            "aria-label": `${meta.singular}: ${node.label || node.id}`
          });

          circle.addEventListener("pointerenter", event => onNodeEnter(event, node));
          circle.addEventListener("pointerleave", onNodeLeave);
          circle.addEventListener("pointermove", moveTooltip);
          circle.addEventListener("click", event => {
            event.stopPropagation();
            selectNode(node);
          });
          circle.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectNode(node);
            }
          });

          if (bucket === "links" && node.href) {
            circle.addEventListener("dblclick", event => {
              event.stopPropagation();
              window.open(node.href, "_blank", "noopener");
            });
          }

          nodesLayer.appendChild(circle);
          nodeElements.set(node.key, circle);
        });
      }
    }

    function buildEdges() {
      for (const linkNode of nodes.filter(node => node.bucket === "links")) {
        if (!linkNode.sourceRef) continue;

        const sourceNode = nodeBySourceRef.get(linkNode.sourceRef);
        if (!sourceNode) continue;

        const a = positions.get(sourceNode.key);
        const b = positions.get(linkNode.key);
        if (!a || !b) continue;

        const path = svgEl("path", {
          d: curvedPath(a, b),
          class: "sv-edge",
          "data-from": sourceNode.key,
          "data-to": linkNode.key
        });

        edgesLayer.appendChild(path);
        edgeElements.push({
          element: path,
          from: sourceNode.key,
          to: linkNode.key
        });
      }
    }

    function applyFilters() {
      let visible = 0;
      const query = state.query;

      for (const node of nodes) {
        const matchesType = state.activeTypes.has(node.bucket);
        const matchesImportance = node.importance >= state.minImportance;
        const haystack = `${node.label} ${node.id} ${node.sourceRef || ""} ${node.href || ""}`.toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        const isVisible = matchesType && matchesImportance && matchesQuery;

        const circle = nodeElements.get(node.key);
        circle.classList.toggle("sv-filtered-out", !isVisible);
        circle.dataset.visible = isVisible ? "true" : "false";

        if (isVisible) visible++;
      }

      for (const [bucket] of Object.entries(TYPE_META)) {
        const group = groupsLayer.querySelector(`[data-bucket="${bucket}"]`);
        group.classList.toggle("sv-filtered-out", !state.activeTypes.has(bucket));
      }

      for (const edge of edgeElements) {
        const fromVisible = nodeElements.get(edge.from)?.dataset.visible === "true";
        const toVisible = nodeElements.get(edge.to)?.dataset.visible === "true";
        const edgeVisible = state.showEdges && fromVisible && toVisible;
        edge.element.classList.toggle("sv-filtered-out", !edgeVisible);
      }

      visibleCount.textContent = `${visible.toLocaleString()} / ${nodes.length.toLocaleString()} nodes`;
      updateEmphasis();

      if (state.selectedKey) {
        const selectedEl = nodeElements.get(state.selectedKey);
        if (selectedEl?.dataset.visible !== "true") {
          state.selectedKey = null;
          showEmptyDetails();
        }
      }
    }

    function onNodeEnter(event, node) {
      state.hoverKey = node.key;
      tooltip.hidden = false;
      tooltip.innerHTML = `
        <strong>${escapeHTML(TYPE_META[node.bucket].singular)}</strong>
        <span>${escapeHTML(truncate(node.label || node.id, 180))}</span>
      `;
      moveTooltip(event);
      updateEmphasis();
      if (state.hoverActive) {
        selectNode(node);
      }
    }

    function onNodeLeave() {
      state.hoverKey = null;
      tooltip.hidden = true;
      updateEmphasis();
    }

    function moveTooltip(event) {
      const rect = root.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left + 16}px`;
      tooltip.style.top = `${event.clientY - rect.top + 16}px`;
    }

    function selectNode(node) {
      state.selectedKey = node.key;
      updateEmphasis();

      const meta = TYPE_META[node.bucket];
      details.innerHTML = `
        <div class="sv-details-card">
          <div class="sv-details-kicker">
            <span class="sv-dot" style="--sv-type-color:${meta.color}"></span>
            ${escapeHTML(meta.singular)}
          </div>

          <h3>${escapeHTML(node.label || "(no label)")}</h3>

          ${node.imageSrc ? `
            <img
              class="sv-details-image"
              src="${escapeHTML(node.imageSrc)}"
              alt="${escapeHTML(node.label || "Figure")}"
            >
          ` : ""}

          <dl class="sv-props">
            ${propertyRow("id", node.id)}
            ${propertyRow("sourceRef", node.sourceRef)}
            ${node.imageSrc ? propertyRow("imageSrc", node.imageSrc, true) : ""}
            ${node.imagePageURL ? propertyRow("imagePageURL", node.imagePageURL, true) : ""}
            ${propertyRow("type", node.type)}
            ${propertyRow("importance", Number(node.importance).toFixed(2))}

          </dl>

          <div class="sv-detail-actions">
            ${node.sourceRef ? `<button class="sv-button sv-button-primary" data-detail-action="source" type="button">Jump to source</button>` : ""}
            ${node.href ? `<button class="sv-button" data-detail-action="open" type="button">Open link</button>` : ""}
          </div>
        </div>
      `;

      details.querySelector('[data-detail-action="source"]')?.addEventListener("click", () => jumpToSource(node));
      details.querySelector('[data-detail-action="open"]')?.addEventListener("click", () => {
        window.open(node.href, "_blank", "noopener");
      });
    }

    function showEmptyDetails() {
      details.innerHTML = `
        <div class="sv-details-empty">
          <div class="sv-details-icon">◎</div>
          <h3>Select a node</h3>
          <p>Hover for a quick label. Click for full details and source actions.</p>
        </div>
      `;
    }

    function updateEmphasis() {
      const focusKey = state.hoverKey || state.selectedKey;
      const connected = new Set();

      if (focusKey) {
        connected.add(focusKey);
        for (const edge of edgeElements) {
          if (edge.from === focusKey) connected.add(edge.to);
          if (edge.to === focusKey) connected.add(edge.from);
        }
      }

      for (const [key, circle] of nodeElements) {
        circle.classList.toggle("sv-selected", key === state.selectedKey);
        circle.classList.toggle("sv-hovered", key === state.hoverKey);
        circle.classList.toggle("sv-dimmed", Boolean(focusKey) && !connected.has(key));
        circle.classList.toggle("sv-connected", Boolean(focusKey) && connected.has(key) && key !== focusKey);
      }

      for (const edge of edgeElements) {
        const active = focusKey && (edge.from === focusKey || edge.to === focusKey);
        edge.element.classList.toggle("sv-edge-active", Boolean(active));
        edge.element.classList.toggle("sv-edge-dimmed", Boolean(focusKey) && !active);
      }
    }

    function jumpToSource(node) {
      const target = node.sourceRef ? document.getElementById(node.sourceRef) : null;

      if (!target) {
        details.insertAdjacentHTML(
          "beforeend",
          `<p class="sv-warning">The source element <code>${escapeHTML(node.sourceRef || "")}</code> is not currently present in the page DOM.</p>`
        );
        return;
      }

      root.classList.add("sv-source-mode");

      const returnButton = el("button", {
        id: RETURN_ID,
        className: "sv-return-button",
        type: "button",
        textContent: "Return to structure map"
      });

      returnButton.addEventListener("click", () => {
        returnButton.remove();
        root.classList.remove("sv-source-mode");
        requestAnimationFrame(() => {
          nodeElements.get(node.key)?.focus();
        });
      });

      document.body.appendChild(returnButton);

      target.classList.add("sv-source-flash");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target.classList.remove("sv-source-flash"), 1800);
    }

    function fitView() {
      state.viewBox = { ...BASE_VIEWBOX };
      applyViewBox();
    }

    function onWheel(event) {
      event.preventDefault();

      const rect = svg.getBoundingClientRect();
      const mouseX = state.viewBox.x + ((event.clientX - rect.left) / rect.width) * state.viewBox.width;
      const mouseY = state.viewBox.y + ((event.clientY - rect.top) / rect.height) * state.viewBox.height;

      const zoom = event.deltaY > 0 ? 1.12 : 0.88;
      const newWidth = clamp(state.viewBox.width * zoom, 450, 4200);
      const newHeight = newWidth * (BASE_VIEWBOX.height / BASE_VIEWBOX.width);

      const xRatio = (mouseX - state.viewBox.x) / state.viewBox.width;
      const yRatio = (mouseY - state.viewBox.y) / state.viewBox.height;

      state.viewBox = {
        x: mouseX - xRatio * newWidth,
        y: mouseY - yRatio * newHeight,
        width: newWidth,
        height: newHeight
      };

      applyViewBox();
    }

    function onPointerDown(event) {
      if (!event.target.classList.contains("sv-background")) return;

      state.dragging = true;
      state.dragStart = { x: event.clientX, y: event.clientY };
      state.startViewBox = { ...state.viewBox };
      svg.setPointerCapture?.(event.pointerId);
      svg.classList.add("sv-dragging");
    }

    function onPointerMove(event) {
      if (!state.dragging) return;

      const rect = svg.getBoundingClientRect();
      const dx = (event.clientX - state.dragStart.x) * (state.startViewBox.width / rect.width);
      const dy = (event.clientY - state.dragStart.y) * (state.startViewBox.height / rect.height);

      state.viewBox.x = state.startViewBox.x - dx;
      state.viewBox.y = state.startViewBox.y - dy;
      applyViewBox();
    }

    function onPointerUp() {
      state.dragging = false;
      svg.classList.remove("sv-dragging");
    }

    function applyViewBox() {
      const v = state.viewBox;
      svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.width} ${v.height}`);
    }

    function closeVisualizer() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.getElementById(RETURN_ID)?.remove();
      root.remove();
    }
  };

  function validateStructure(structure) {
    if (!structure || typeof structure !== "object") {
      throw new TypeError("visualizeStructure(structure): structure must be an object.");
    }

    for (const bucket of Object.keys(TYPE_META)) {
      if (!Array.isArray(structure[bucket])) {
        throw new TypeError(`visualizeStructure(structure): structure.${bucket} must be an array.`);
      }
    }
  }

  function flattenStructure(structure) {
    const nodes = [];

    for (const bucket of Object.keys(TYPE_META)) {
      structure[bucket].forEach((item, index) => {
        nodes.push({
          ...item,
          bucket,
          key: `${bucket}:${item.id ?? index}`,
          id: item.id ?? `${bucket}-${index}`,
          label: String(item.label ?? ""),
          type: item.type ?? bucket,
          sourceRef: item.sourceRef ?? null,
          href: item.href ?? null,
          importance: clamp(Number(item.importance ?? 0.5), 0, 1)
        });
      });
    }

    return nodes;
  }

  function removeExistingVisualizer() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(RETURN_ID)?.remove();
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = el("style", { id: STYLE_ID });
    style.textContent = `
      .sv-root,
      .sv-root * {
        box-sizing: border-box;
      }

      .sv-root {
        --sv-bg: #08101f;
        --sv-panel: #0d1728;
        --sv-panel-2: #111e32;
        --sv-border: rgba(255,255,255,.12);
        --sv-text: #eef5ff;
        --sv-muted: #91a4bd;
        --sv-accent: #7dd3fc;
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background:
          radial-gradient(circle at 20% 10%, rgba(80,120,255,.10), transparent 36%),
          radial-gradient(circle at 85% 80%, rgba(0,220,255,.08), transparent 34%),
          var(--sv-bg);
        color: var(--sv-text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .sv-source-mode {
        display: none !important;
      }

      .sv-shell {
        display: grid;
        grid-template-rows: auto auto auto minmax(0,1fr);
        width: 100%;
        height: 100%;
      }

      .sv-header {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 24px;
        padding: 18px 24px 0px;
      }

      .sv-eyebrow {
        color: var(--sv-accent);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .18em;
      }

      .sv-title {
        margin: 3px 0 0;
        font-size: 24px;
        line-height: 1.15;
      }

      .sv-header-actions,
      .sv-detail-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .sv-button {
        appearance: none;
        border: 1px solid var(--sv-border);
        border-radius: 9px;
        background: rgba(255,255,255,.06);
        color: var(--sv-text);
        padding: 8px 12px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .sv-button:hover {
        background: rgba(255,255,255,.11);
      }

      .sv-button-primary {
        border-color: rgba(125,211,252,.48);
        background: rgba(125,211,252,.14);
      }

      .sv-toolbar {
        display: grid;
        grid-template-columns: minmax(240px,1fr) minmax(220px,.7fr) auto auto;
        gap: 12px;
        align-items: end;
        padding: 0 24px 12px;
      }

      .sv-search-wrap,
      .sv-range-wrap {
        display: grid;
        gap: 5px;
        color: var(--sv-muted);
        font-size: 12px;
        font-weight: 700;
      }

      .sv-search {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--sv-border);
        border-radius: 9px;
        background: rgba(255,255,255,.055);
        color: var(--sv-text);
        outline: none;
        padding: 9px 11px;
        font: inherit;
      }

      .sv-search:focus {
        border-color: rgba(125,211,252,.58);
        box-shadow: 0 0 0 3px rgba(125,211,252,.10);
      }

      .sv-search::placeholder {
        color: #71839a;
      }

      .sv-range {
        width: 60%;
        accent-color: var(--sv-accent);
      }

      .sv-toggle-group {
        display: flex;
        align-items: left;
        justify-content: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }

      .sv-edge-toggle, .sv-hoverActive-toggle {
        display: flex;
        align-items: center;
        gap: 7px;
        color: var(--sv-muted);
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
      }

      .sv-visible-count {
        min-height: 37px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        color: var(--sv-muted);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      .sv-type-filters {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 0 24px 12px;
      }

      .sv-type-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px solid var(--sv-border);
        border-radius: 999px;
        background: rgba(255,255,255,.035);
        padding: 6px 9px;
        color: var(--sv-muted);
        font-size: 12px;
        cursor: pointer;
        user-select: none;
      }

      .sv-type-chip:has(input:not(:checked)) {
        opacity: .42;
      }

      .sv-type-chip input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .sv-type-chip strong {
        color: var(--sv-text);
        font-variant-numeric: tabular-nums;
      }

      .sv-dot {
        width: 9px;
        height: 9px;
        flex: 0 0 9px;
        border-radius: 50%;
        background: var(--sv-type-color);
        box-shadow: 0 0 10px color-mix(in srgb, var(--sv-type-color) 55%, transparent);
      }

      .sv-main {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0,1fr) 330px;
        border-top: 1px solid var(--sv-border);
      }

      .sv-stage-wrap {
        min-width: 0;
        min-height: 0;
        position: relative;
        overflow: hidden;
      }

      .sv-stage {
        width: 100%;
        height: 100%;
        display: block;
        touch-action: none;
        cursor: grab;
        user-select: none;
      }

      .sv-stage.sv-dragging {
        cursor: grabbing;
      }

      .sv-background {
        fill: transparent;
      }

      .sv-group-halo {
        opacity: .035;
        stroke: rgba(255,255,255,.12);
        stroke-width: 1.2;
        vector-effect: non-scaling-stroke;
      }

      .sv-group-label {
        fill: #a6b5c8;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: .02em;
      }

      .sv-node {
        opacity: .76;
        stroke: rgba(255,255,255,.20);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
        cursor: pointer;
        transition: opacity .12s ease, filter .12s ease;
      }

      .sv-node:hover,
      .sv-node.sv-hovered {
        opacity: 1;
        stroke: #fff;
        stroke-width: 2.4;
        filter: drop-shadow(0 0 8px rgba(255,255,255,.55));
      }

      .sv-node.sv-selected {
        opacity: 1;
        stroke: #fff;
        stroke-width: 3.2;
        filter: drop-shadow(0 0 11px rgba(125,211,252,.75));
      }

      .sv-node.sv-connected {
        opacity: 1;
        stroke: rgba(255,255,255,.78);
        stroke-width: 2;
      }

      .sv-node.sv-dimmed {
        opacity: .22;
      }

      .sv-edge {
        fill: none;
        stroke: rgba(159,213,255,.18);
        stroke-width: 1.1;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
        transition: opacity .12s ease, stroke .12s ease;
      }

      .sv-edge.sv-edge-active {
        stroke: rgba(190,235,255,.84);
        stroke-width: 2.1;
      }

      .sv-edge.sv-edge-dimmed {
        opacity: .15;
      }

      .sv-filtered-out {
        display: none !important;
      }

      .sv-help {
        position: absolute;
        left: 18px;
        bottom: 14px;
        border: 1px solid var(--sv-border);
        border-radius: 8px;
        background: rgba(8,16,31,.74);
        backdrop-filter: blur(8px);
        padding: 7px 9px;
        color: var(--sv-muted);
        font-size: 11px;
        pointer-events: none;
      }

      .sv-tooltip {
        position: absolute;
        z-index: 3;
        width: min(340px, calc(100% - 32px));
        border: 1px solid var(--sv-border);
        border-radius: 9px;
        background: rgba(7,14,26,.94);
        box-shadow: 0 12px 35px rgba(0,0,0,.34);
        padding: 9px 11px;
        pointer-events: none;
        transform: translateZ(0);
      }

      .sv-tooltip strong,
      .sv-tooltip span {
        display: block;
      }

      .sv-tooltip strong {
        margin-bottom: 3px;
        color: var(--sv-accent);
        font-size: 10px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .sv-tooltip span {
        color: #e8f1fd;
        font-size: 12px;
        line-height: 1.35;
      }

      .sv-details {
        min-width: 0;
        overflow: auto;
        border-left: 1px solid var(--sv-border);
        background: rgba(10,20,35,.72);
        padding: 20px;
      }

      .sv-details-empty {
        min-height: 100%;
        display: grid;
        place-content: center;
        text-align: center;
        color: var(--sv-muted);
      }

      .sv-details-empty h3 {
        margin: 8px 0 4px;
        color: var(--sv-text);
      }

      .sv-details-empty p {
        max-width: 240px;
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
      }

      .sv-details-icon {
        font-size: 34px;
        color: var(--sv-accent);
      }

      .sv-details-kicker {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--sv-muted);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .09em;
        text-transform: uppercase;
      }

      .sv-details-card h3 {
        margin: 10px 0 18px;
        font-size: 19px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .sv-details-image {
        display: block;
        width: 100%;
        max-height: 260px;
        object-fit: contain;
        margin: 0 0 18px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.5);
      }

      .sv-props {
        display: grid;
        gap: 12px;
        margin: 0 0 18px;
      }

      .sv-props > div {
        display: grid;
        gap: 3px;
      }

      .sv-props dt {
        color: var(--sv-muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .sv-props dd {
        margin: 0;
        color: #e8f1fd;
        font-size: 12px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      .sv-props a {
        color: var(--sv-accent);
      }

      .sv-warning {
        border: 1px solid rgba(251,191,36,.25);
        border-radius: 8px;
        background: rgba(251,191,36,.08);
        padding: 9px 10px;
        color: #fde68a;
        font-size: 12px;
        line-height: 1.45;
      }

      .sv-return-button {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        border: 1px solid rgba(125,211,252,.6);
        border-radius: 10px;
        background: #0d1728;
        color: #eef5ff;
        box-shadow: 0 10px 35px rgba(0,0,0,.35);
        padding: 10px 14px;
        font: 700 13px Inter, ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }

      .sv-source-flash {
        outline: 4px solid #38bdf8 !important;
        outline-offset: 5px !important;
        animation: sv-source-pulse .55s ease-in-out 3 alternate;
      }

      @keyframes sv-source-pulse {
        from { outline-color: rgba(56,189,248,.28); }
        to { outline-color: rgba(56,189,248,1); }
      }

      @media (max-width: 980px) {
        .sv-toolbar {
          grid-template-columns: 1fr 1fr;
        }

        .sv-main {
          grid-template-columns: 1fr;
        }

        .sv-details {
          position: absolute;
          right: 12px;
          bottom: 12px;
          width: min(330px, calc(100% - 24px));
          max-height: 48%;
          border: 1px solid var(--sv-border);
          border-radius: 12px;
          box-shadow: 0 15px 50px rgba(0,0,0,.3);
        }
      }

      @media (max-width: 620px) {
        .sv-header {
          padding-inline: 14px;
        }

        .sv-toolbar,
        .sv-type-filters {
          padding-inline: 14px;
        }

        .sv-toolbar {
          grid-template-columns: 1fr;
        }

        .sv-visible-count {
          justify-content: flex-start;
          min-height: auto;
        }

        .sv-title {
          font-size: 19px;
        }

        .sv-header-actions {
          flex-direction: column;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function spiralPoint(cx, cy, index, spacing) {
    if (index === 0) return { x: cx, y: cy };

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const angle = index * goldenAngle;
    const radius = spacing * Math.sqrt(index);

    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  }

  function spacingForCount(count) {
    if (count > 500) return 12.5;
    if (count > 250) return 13.5;
    if (count > 100) return 15;
    if (count > 40) return 17;
    return 20;
  }

  function clusterRadius(count) {
    return clamp(58 + Math.sqrt(Math.max(1, count)) * 12, 82, 260);
  }

  function nodeRadius(importance) {
    return 4.5 + clamp(importance, 0, 1) * 6.5;
  }

  function curvedPath(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.min(80, length * 0.08);
    const nx = -dy / length;
    const ny = dx / length;
    const cx = mx + nx * bend;
    const cy = my + ny * bend;

    return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  }

  function propertyRow(name, value, asLink = false) {
    if (value == null || value === "") return "";

    const safeName = escapeHTML(name);
    const safeValue = escapeHTML(String(value));

    return `
      <div>
        <dt>${safeName}</dt>
        <dd>${asLink
        ? `<a href="${safeValue}" target="_blank" rel="noopener">${safeValue}</a>`
        : safeValue}
        </dd>
      </div>
    `;
  }

  function el(tag, props = {}) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    return node;
  }

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
      node.setAttribute(name, String(value));
    }
    return node;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function truncate(text, max) {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
