const court = document.getElementById("court");
const layout = document.querySelector(".layout");
const controls = document.querySelector(".controls");
const editModeBtn = document.getElementById("editModeBtn");
const updateBtn = document.getElementById("updateBtn");
const copyBtn = document.getElementById("copyBtn");
const deleteBtn = document.getElementById("deleteBtn");
const arrowModeBtn = document.getElementById("arrowModeBtn");
const deleteArrowBtn = document.getElementById("deleteArrowBtn");
const saveLayoutBtn = document.getElementById("saveLayoutBtn");
const downloadLayoutBtn = document.getElementById("downloadLayoutBtn");
const savedLayoutSelect = document.getElementById("savedLayoutSelect");
const loadLayoutBtn = document.getElementById("loadLayoutBtn");
const mirrorSaveToggle = document.getElementById("mirrorSaveToggle");
const layoutName = document.getElementById("layoutName");
const savedLayoutsInfo = document.getElementById("savedLayoutsInfo");
const statusText = document.getElementById("statusText");
const positionNumber = document.getElementById("positionNumber");
const positionTitle = document.getElementById("positionTitle");
const positionNote = document.getElementById("positionNote");
const rephraseBtn = document.getElementById("rephraseBtn");
const newPositionBtn = document.getElementById("newPositionBtn");
const livePreview = document.getElementById("livePreview");
const hoverInfo = document.getElementById("hoverInfo");
const arrowLayer = document.getElementById("arrowLayer");

const dialog = document.getElementById("positionDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogBody = document.getElementById("dialogBody");
const closeDialogBtn = document.getElementById("closeDialogBtn");

let isEditMode = false;
let selectedIndex = null;
let selectedArrowIndex = null;
let dragState = null;
let dragArrowState = null;
const positions = [];
const arrows = [];
let isArrowMode = false;
let pendingArrowStart = null;
let pendingArrowCurrent = null;
let suppressNextCourtClick = false;
const savedLayoutsKey = "tennis-doubles-saved-layouts";
const mirrorNumbersOnSave = new Set([0, 1, 2, 4, 6]);

function setStatus(text) {
  statusText.textContent = text;
}

function shouldMirrorOnSave() {
  return Boolean(mirrorSaveToggle?.checked);
}

function isSamePoint(aX, aY, bX, bY, tolerance = 0.0001) {
  return Math.abs(aX - bX) <= tolerance && Math.abs(aY - bY) <= tolerance;
}

function buildMirroredLayoutData(sourcePositions, sourceArrows) {
  const finalPositions = sourcePositions.map((position) => ({ ...position }));
  const finalArrows = sourceArrows.map((arrow) => ({ ...arrow }));

  if (!shouldMirrorOnSave()) {
    return { positions: finalPositions, arrows: finalArrows };
  }

  sourcePositions.forEach((position) => {
    const number = Number(position.number);
    if (!mirrorNumbersOnSave.has(number)) {
      return;
    }

    const mirrored = {
      ...position,
      x: Number((100 - position.x).toFixed(4)),
    };

    const alreadyExists = finalPositions.some(
      (existing) =>
        Number(existing.number) === number &&
        isSamePoint(existing.x, existing.y, mirrored.x, mirrored.y)
    );

    if (!alreadyExists) {
      finalPositions.push(mirrored);
    }
  });

  sourceArrows.forEach((arrow) => {
    const mirrored = {
      x1: Number((100 - arrow.x1).toFixed(4)),
      y1: Number(arrow.y1.toFixed(4)),
      x2: Number((100 - arrow.x2).toFixed(4)),
      y2: Number(arrow.y2.toFixed(4)),
    };

    const alreadyExists = finalArrows.some(
      (existing) =>
        isSamePoint(existing.x1, existing.y1, mirrored.x1, mirrored.y1) &&
        isSamePoint(existing.x2, existing.y2, mirrored.x2, mirrored.y2)
    );

    if (!alreadyExists) {
      finalArrows.push(mirrored);
    }
  });

  return { positions: finalPositions, arrows: finalArrows };
}

function buildLayoutPayload() {
  const providedName = layoutName.value.trim();
  const finalName =
    providedName || `Layout ${new Date().toLocaleString(undefined, { hour12: false })}`;
  const mirrored = buildMirroredLayoutData(positions, arrows);

  return {
    id: `layout-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: finalName,
    savedAt: new Date().toISOString(),
    coordinateMode: "full-court-v2",
    positions: mirrored.positions,
    arrows: mirrored.arrows,
  };
}

function getSavedLayouts() {
  const raw = localStorage.getItem(savedLayoutsKey);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function updateSavedLayoutsInfo() {
  const count = getSavedLayouts().length;
  savedLayoutsInfo.textContent =
    count === 0
      ? "No saved layouts yet."
      : `${count} saved layout${count > 1 ? "s" : ""} in this browser (persists after refresh).`;
}

function getLayoutId(layout, index) {
  return layout.id || `legacy-${index}`;
}

function refreshSavedLayoutOptions(selectedId = "") {
  const layouts = getSavedLayouts();
  savedLayoutSelect.innerHTML = "";

  if (layouts.length === 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No saved layouts";
    savedLayoutSelect.appendChild(emptyOption);
    loadLayoutBtn.disabled = true;
    return;
  }

  layouts.forEach((layout, index) => {
    const option = document.createElement("option");
    option.value = getLayoutId(layout, index);
    const savedLabel = layout.savedAt
      ? new Date(layout.savedAt).toLocaleString()
      : "Unknown time";
    option.textContent = `${layout.name || "Untitled Layout"} (${savedLabel})`;
    savedLayoutSelect.appendChild(option);
  });

  const finalSelectedId = selectedId || getLayoutId(layouts[layouts.length - 1], layouts.length - 1);
  savedLayoutSelect.value = finalSelectedId;
  loadLayoutBtn.disabled = false;
}

function loadLayoutIntoCourt(layout) {
  if (!layout || !Array.isArray(layout.positions)) {
    setStatus("Unable to load this saved layout.");
    return;
  }

  positions.length = 0;
  layout.positions.forEach((position) => {
    if (typeof position.x !== "number" || typeof position.y !== "number") {
      return;
    }
    positions.push({
      number: Number.isFinite(Number(position.number)) ? Number(position.number) : 0,
      title: typeof position.title === "string" ? position.title : "",
      note: typeof position.note === "string" ? position.note : "",
      x: Number(position.x),
      y: Number(position.y),
    });
  });

  // Convert only when an older layout explicitly declares full-court coordinates.
  const isExplicitLegacyFullCourt = layout.coordinateMode === "full-court-v1";
  if (isExplicitLegacyFullCourt) {
    positions.forEach((position) => {
      position.y = Math.min(100, Math.max(0, Number(((position.y - 50) * 2).toFixed(4))));
    });
  }

  arrows.length = 0;
  if (Array.isArray(layout.arrows)) {
    layout.arrows.forEach((arrow) => {
      if (
        typeof arrow.x1 === "number" &&
        typeof arrow.y1 === "number" &&
        typeof arrow.x2 === "number" &&
        typeof arrow.y2 === "number"
      ) {
        arrows.push({
          x1: Number(arrow.x1),
          y1: Number(arrow.y1),
          x2: Number(arrow.x2),
          y2: Number(arrow.y2),
        });
      }
    });
  }

  if (isExplicitLegacyFullCourt && arrows.length > 0) {
    arrows.forEach((arrow) => {
      arrow.y1 = Math.min(100, Math.max(0, Number(((arrow.y1 - 50) * 2).toFixed(4))));
      arrow.y2 = Math.min(100, Math.max(0, Number(((arrow.y2 - 50) * 2).toFixed(4))));
    });
  }

  selectedIndex = null;
  selectedArrowIndex = null;
  pendingArrowStart = null;
  pendingArrowCurrent = null;
  dragArrowState = null;
  isArrowMode = false;
  clearEditorFields();
  renderMarkers();
  syncEditorState();
  setStatus(
    `Loaded saved result "${layout.name || "Untitled Layout"}"${
      isExplicitLegacyFullCourt ? " (auto-adjusted to half-court coordinates)." : "."
    }`
  );
}

async function loadPublishedLayoutFallback() {
  try {
    const response = await fetch("./published-layout.json", { cache: "no-cache" });
    if (!response.ok) {
      return false;
    }
    const publishedLayout = await response.json();
    if (!publishedLayout || !Array.isArray(publishedLayout.positions)) {
      return false;
    }
    loadLayoutIntoCourt(publishedLayout);
    setStatus("Loaded published default layout.");
    return true;
  } catch {
    return false;
  }
}

function professionalizeStrategyText(rawText) {
  const replacements = [
    [/\b(gonna)\b/gi, "going to"],
    [/\b(wanna)\b/gi, "want to"],
    [/\b(cuz|cause)\b/gi, "because"],
    [/\b(don't)\b/gi, "do not"],
    [/\b(can't)\b/gi, "cannot"],
    [/\b(shouldn't)\b/gi, "should not"],
    [/\b(a lot)\b/gi, "frequently"],
    [/\b(try and)\b/gi, "try to"],
    [/\b(kinda|sorta)\b/gi, "somewhat"],
    [/\b(guys)\b/gi, "players"],
  ];

  let normalized = rawText.replace(/\s+/g, " ").trim();
  replacements.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  const rawSentences = normalized.split(/(?<=[.!?])\s+|\s*;\s*/).filter(Boolean);
  const polishedSentences = rawSentences.map((sentence) => {
    let polished = sentence.trim();
    if (!polished) {
      return "";
    }
    polished = polished[0].toUpperCase() + polished.slice(1);
    if (!/[.!?]$/.test(polished)) {
      polished += ".";
    }
    polished = polished.replace(/\b(you)\b/gi, "the player");
    return polished;
  });

  return polishedSentences.filter(Boolean).join(" ");
}

function toPercentPosition(event) {
  return toPercentFromClient(event.clientX, event.clientY);
}

function toPercentFromClient(clientX, clientY) {
  const bounds = court.getBoundingClientRect();
  const rawX = ((clientX - bounds.left) / bounds.width) * 100;
  const rawY = ((clientY - bounds.top) / bounds.height) * 100;
  const x = Math.min(100, Math.max(0, rawX));
  const y = Math.min(100, Math.max(0, rawY));
  return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
}

function offsetNearby(value, delta) {
  return Math.min(98, Math.max(2, Number((value + delta).toFixed(2))));
}

function nudgeSelectedPosition(dxPercent, dyPercent) {
  if (!isEditMode || selectedIndex === null || !positions[selectedIndex]) {
    return false;
  }

  const current = positions[selectedIndex];
  const nextX = Math.min(100, Math.max(0, current.x + dxPercent));
  const nextY = Math.min(100, Math.max(0, current.y + dyPercent));

  positions[selectedIndex] = {
    ...current,
    x: Number(nextX.toFixed(4)),
    y: Number(nextY.toFixed(4)),
  };

  renderMarkers();
  return true;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

function renderLivePreview() {
  if (!isEditMode || selectedIndex === null || !positions[selectedIndex]) {
    livePreview.hidden = true;
    return;
  }

  const position = positions[selectedIndex];
  const title = position.title?.trim() || "Position";
  const note = position.note?.trim() || "No strategy note yet.";

  livePreview.textContent = `#${position.number} ${title}: ${note}`;
  livePreview.style.left = `${position.x}%`;
  livePreview.style.top = `${position.y}%`;
  livePreview.hidden = false;
}

function hideHoverInfo() {
  hoverInfo.hidden = true;
}

function showHoverInfo(position) {
  const title = position.title?.trim() || "Position";
  const note = position.note?.trim() || "No strategy note yet.";
  hoverInfo.textContent = `#${position.number} ${title}: ${note}`;
  hoverInfo.style.left = `${position.x}%`;
  hoverInfo.style.top = `${position.y}%`;
  hoverInfo.hidden = false;
}

function applySelectedEditsFromForm() {
  if (!isEditMode || selectedIndex === null || !positions[selectedIndex]) {
    return;
  }

  const enteredNumber = Number(positionNumber.value);
  const nextNumber =
    Number.isFinite(enteredNumber) && enteredNumber >= 0
      ? enteredNumber
      : positions[selectedIndex].number;

  positions[selectedIndex] = {
    ...positions[selectedIndex],
    number: nextNumber,
    title: positionTitle.value.trim(),
    note: positionNote.value.trim(),
  };

  // Keep strategy fields consistent for all identical numbers by default.
  positions.forEach((position, index) => {
    if (index === selectedIndex) {
      return;
    }
    if (Number(position.number) === Number(nextNumber)) {
      position.title = positions[selectedIndex].title;
      position.note = positions[selectedIndex].note;
    }
  });

  renderMarkers();
}

function renderMarkers() {
  court.querySelectorAll(".marker").forEach((node) => node.remove());
  renderArrows();

  positions.forEach((position, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "marker";
    marker.textContent = position.number;
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    if (selectedIndex === index) {
      marker.classList.add("selected");
    }
    marker.setAttribute("aria-label", `Position ${position.number}`);
    marker.title = isEditMode
      ? "Drag to move, click to edit, double-click to remove"
      : "Click to view strategy";
    marker.addEventListener("mouseenter", () => {
      showHoverInfo(position);
    });
    marker.addEventListener("mousemove", () => {
      showHoverInfo(position);
    });
    marker.addEventListener("mouseleave", () => {
      hideHoverInfo();
    });
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      hideHoverInfo();
      if (dragState?.moved) {
        dragState = null;
        return;
      }
      if (isEditMode) {
        selectedIndex = index;
        populateEditor(position);
        syncEditorState();
        setStatus(
          `Selected #${position.number}. You can save, copy, move, or delete it.`
        );
        renderMarkers();
        return;
      }
      openPositionDialog(index);
    });
    marker.addEventListener("pointerdown", (event) => {
      if (!isEditMode) {
        return;
      }
      event.stopPropagation();
      const markerRect = marker.getBoundingClientRect();
      const markerCenterX = markerRect.left + markerRect.width / 2;
      const markerCenterY = markerRect.top + markerRect.height / 2;
      dragState = {
        index,
        moved: false,
        grabOffsetX: event.clientX - markerCenterX,
        grabOffsetY: event.clientY - markerCenterY,
      };
      marker.setPointerCapture(event.pointerId);
    });
    marker.addEventListener("pointermove", (event) => {
      if (!isEditMode || !dragState || dragState.index !== index) {
        return;
      }
      event.stopPropagation();
      const adjustedCenterX = event.clientX - dragState.grabOffsetX;
      const adjustedCenterY = event.clientY - dragState.grabOffsetY;
      const { x, y } = toPercentFromClient(adjustedCenterX, adjustedCenterY);
      positions[index].x = x;
      positions[index].y = y;
      dragState.moved = true;
      marker.style.left = `${x}%`;
      marker.style.top = `${positions[index].y}%`;
    });
    marker.addEventListener("pointerup", (event) => {
      if (!isEditMode || !dragState || dragState.index !== index) {
        return;
      }
      event.stopPropagation();
      if (dragState.moved) {
        selectedIndex = index;
        populateEditor(positions[index]);
        syncEditorState();
        setStatus(`Moved position #${positions[index].number}.`);
        renderMarkers();
      }
      dragState = null;
    });
    marker.addEventListener("dblclick", (event) => {
      if (!isEditMode) {
        return;
      }
      event.stopPropagation();
      const removed = positions[index];
      positions.splice(index, 1);
      selectedIndex = null;
      clearEditorFields();
      syncEditorState();
      renderMarkers();
      setStatus(`Removed position #${removed.number}.`);
    });
    court.appendChild(marker);

  });

  renderLivePreview();
}

function populateEditor(position) {
  positionNumber.value = position.number;
  positionTitle.value = position.title || "";
  positionNote.value = position.note || "";
}

function renderArrows() {
  arrowLayer.innerHTML = "";

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "arrow-head");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "7.2");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "3.2");
  marker.setAttribute("markerHeight", "3.2");
  marker.setAttribute("orient", "auto-start-reverse");
  const headPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  headPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  headPath.setAttribute("fill", "#ffffff");
  marker.appendChild(headPath);
  defs.appendChild(marker);
  arrowLayer.appendChild(defs);

  arrows.forEach((arrow, index) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(arrow.x1));
    line.setAttribute("y1", String(arrow.y1));
    line.setAttribute("x2", String(arrow.x2));
    line.setAttribute("y2", String(arrow.y2));
    line.setAttribute("stroke", "#ffffff");
    line.setAttribute("stroke-width", selectedArrowIndex === index ? "0.65" : "0.5");
    line.setAttribute("stroke-dasharray", "1.2 1.1");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", selectedArrowIndex === index ? "1" : "0.9");
    line.setAttribute("marker-end", "url(#arrow-head)");
    line.style.cursor = isEditMode && !isArrowMode ? "grab" : "pointer";
    line.addEventListener("pointerdown", (event) => {
      if (!isEditMode || isArrowMode) {
        return;
      }
      event.stopPropagation();
      const point = toPercentPosition(event);
      dragArrowState = {
        index,
        moved: false,
        lastX: point.x,
        lastY: point.y,
      };
      selectedArrowIndex = index;
      selectedIndex = null;
      suppressNextCourtClick = true;
      line.setPointerCapture(event.pointerId);
      syncEditorState();
      renderMarkers();
    });
    line.addEventListener("pointermove", (event) => {
      if (!dragArrowState || dragArrowState.index !== index) {
        return;
      }
      event.stopPropagation();
      const point = toPercentPosition(event);
      const dx = point.x - dragArrowState.lastX;
      const dy = point.y - dragArrowState.lastY;
      dragArrowState.lastX = point.x;
      dragArrowState.lastY = point.y;

      const current = arrows[index];
      current.x1 = clampPercent(current.x1 + dx);
      current.y1 = clampPercent(current.y1 + dy);
      current.x2 = clampPercent(current.x2 + dx);
      current.y2 = clampPercent(current.y2 + dy);
      dragArrowState.moved = true;
      renderMarkers();
    });
    line.addEventListener("pointerup", (event) => {
      if (!dragArrowState || dragArrowState.index !== index) {
        return;
      }
      event.stopPropagation();
      if (dragArrowState.moved) {
        setStatus(`Moved movement arrow ${index + 1}.`);
      }
      dragArrowState = null;
    });
    line.addEventListener("pointercancel", () => {
      if (dragArrowState && dragArrowState.index === index) {
        dragArrowState = null;
      }
    });
    line.addEventListener("click", (event) => {
      if (!isEditMode) {
        return;
      }
      event.stopPropagation();
      if (dragArrowState?.moved) {
        dragArrowState = null;
        return;
      }
      selectedArrowIndex = index;
      selectedIndex = null;
      isArrowMode = false;
      pendingArrowStart = null;
      syncEditorState();
      renderMarkers();
      setStatus(`Selected movement arrow ${index + 1}.`);
    });
    line.addEventListener("dblclick", (event) => {
      if (!isEditMode) {
        return;
      }
      event.stopPropagation();
      arrows.splice(index, 1);
      selectedArrowIndex = null;
      renderMarkers();
      syncEditorState();
      setStatus("Deleted movement arrow.");
    });
    arrowLayer.appendChild(line);
  });

  if (isEditMode && pendingArrowStart) {
    const startDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    startDot.setAttribute("cx", String(pendingArrowStart.x));
    startDot.setAttribute("cy", String(pendingArrowStart.y));
    startDot.setAttribute("r", "0.8");
    startDot.setAttribute("fill", "#ffffff");
    arrowLayer.appendChild(startDot);
  }

  if (isEditMode && pendingArrowStart && pendingArrowCurrent) {
    const previewLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    previewLine.setAttribute("x1", String(pendingArrowStart.x));
    previewLine.setAttribute("y1", String(pendingArrowStart.y));
    previewLine.setAttribute("x2", String(pendingArrowCurrent.x));
    previewLine.setAttribute("y2", String(pendingArrowCurrent.y));
    previewLine.setAttribute("stroke", "#ffffff");
    previewLine.setAttribute("stroke-width", "0.5");
    previewLine.setAttribute("stroke-dasharray", "1.2 1.1");
    previewLine.setAttribute("stroke-linecap", "round");
    previewLine.setAttribute("opacity", "0.8");
    previewLine.setAttribute("marker-end", "url(#arrow-head)");
    arrowLayer.appendChild(previewLine);
  }
}

function clearEditorFields() {
  positionNumber.value = 0;
  positionTitle.value = "";
  positionNote.value = "";
}

function startNewPositionDraft() {
  selectedIndex = null;
  selectedArrowIndex = null;
  isArrowMode = false;
  pendingArrowStart = null;
  pendingArrowCurrent = null;
  dragArrowState = null;
  clearEditorFields();
  hideHoverInfo();
  syncEditorState();
  renderMarkers();
  setStatus("New number draft ready. Fill fields, then click the court to place.");
}

function syncEditorState() {
  editModeBtn.textContent = isEditMode ? "Done Editing" : "Edit Layout";
  court.classList.toggle("edit-active", isEditMode);
  editModeBtn.classList.toggle("is-active", isEditMode);
  layout.classList.toggle("edit-open", isEditMode);
  controls.classList.toggle("visible", isEditMode);
  arrowModeBtn.classList.toggle("is-active", isEditMode && isArrowMode);
  updateBtn.disabled = !isEditMode || selectedIndex === null;
  copyBtn.disabled = !isEditMode || selectedIndex === null;
  deleteBtn.disabled = !isEditMode || selectedIndex === null;
  deleteArrowBtn.disabled = !isEditMode || selectedArrowIndex === null;
  newPositionBtn.disabled = !isEditMode;
  arrowModeBtn.disabled = !isEditMode;
  positionNumber.disabled = !isEditMode;
  positionTitle.disabled = !isEditMode;
  positionNote.disabled = !isEditMode;
  rephraseBtn.disabled = !isEditMode;
  renderLivePreview();
}

function openPositionDialog(index) {
  const item = positions[index];
  dialogTitle.textContent = `#${item.number} - ${item.title || "Position"}`;
  dialogBody.textContent =
    item.note || "No strategy note provided for this position yet.";
  dialog.showModal();
}

editModeBtn.addEventListener("click", () => {
  isEditMode = !isEditMode;
  selectedIndex = null;
  selectedArrowIndex = null;
  isArrowMode = false;
  pendingArrowStart = null;
  pendingArrowCurrent = null;
  dragArrowState = null;
  hideHoverInfo();

  if (isEditMode) {
    setStatus(
      "Edit mode enabled. Click court to add numbers, or use Add Movement Arrow to draw direction."
    );
  } else {
    selectedIndex = null;
    selectedArrowIndex = null;
    pendingArrowStart = null;
    pendingArrowCurrent = null;
    renderMarkers();
    setStatus("View mode enabled. Click a marker to read strategy notes.");
  }

  clearEditorFields();
  syncEditorState();
  renderMarkers();
});

newPositionBtn.addEventListener("click", () => {
  if (!isEditMode) {
    setStatus("Enable Edit Mode first.");
    return;
  }
  startNewPositionDraft();
});

arrowModeBtn.addEventListener("click", () => {
  if (!isEditMode) {
    setStatus("Enable Edit Mode first.");
    return;
  }
  isArrowMode = !isArrowMode;
  pendingArrowStart = null;
  pendingArrowCurrent = null;
  dragArrowState = null;
  selectedArrowIndex = null;
  if (isArrowMode) {
    selectedIndex = null;
    setStatus("Arrow mode on: press, drag, and release to draw movement.");
  } else {
    setStatus("Arrow mode off.");
  }
  syncEditorState();
  renderMarkers();
});

deleteArrowBtn.addEventListener("click", () => {
  if (!isEditMode || selectedArrowIndex === null) {
    return;
  }
  arrows.splice(selectedArrowIndex, 1);
  selectedArrowIndex = null;
  renderMarkers();
  syncEditorState();
  setStatus("Deleted selected movement arrow.");
});

court.addEventListener("pointerdown", (event) => {
  if (!isEditMode || !isArrowMode) {
    return;
  }
  event.stopPropagation();
  const { x, y } = toPercentPosition(event);
  pendingArrowStart = { x, y };
  pendingArrowCurrent = { x, y };
  suppressNextCourtClick = true;
  renderArrows();
});

court.addEventListener("pointermove", (event) => {
  if (!isEditMode || !isArrowMode || !pendingArrowStart) {
    return;
  }
  const { x, y } = toPercentPosition(event);
  pendingArrowCurrent = { x, y };
  renderArrows();
});

court.addEventListener("pointerup", (event) => {
  if (!isEditMode || !isArrowMode || !pendingArrowStart || !pendingArrowCurrent) {
    return;
  }
  event.stopPropagation();
  const dx = pendingArrowCurrent.x - pendingArrowStart.x;
  const dy = pendingArrowCurrent.y - pendingArrowStart.y;
  const movedEnough = Math.hypot(dx, dy) > 0.6;

  if (movedEnough) {
    arrows.push({
      x1: pendingArrowStart.x,
      y1: pendingArrowStart.y,
      x2: pendingArrowCurrent.x,
      y2: pendingArrowCurrent.y,
    });
    selectedArrowIndex = arrows.length - 1;
    selectedIndex = null;
    setStatus("Movement arrow added.");
  } else {
    setStatus("Drag a bit longer to create an arrow.");
  }

  pendingArrowStart = null;
  pendingArrowCurrent = null;
  renderMarkers();
  syncEditorState();
});

court.addEventListener("pointercancel", () => {
  pendingArrowStart = null;
  pendingArrowCurrent = null;
  renderArrows();
});

updateBtn.addEventListener("click", () => {
  if (!isEditMode || selectedIndex === null) {
    return;
  }

  const number = Number(positionNumber.value);
  const title = positionTitle.value.trim();
  const note = positionNote.value.trim();

  if (!Number.isFinite(number) || number < 0) {
    setStatus("Please enter a valid number (0-99).");
    return;
  }

  const current = positions[selectedIndex];
  positions[selectedIndex] = { ...current, number, title, note };

  positions.forEach((position, index) => {
    if (index === selectedIndex) {
      return;
    }
    if (Number(position.number) === Number(number)) {
      position.title = title;
      position.note = note;
    }
  });

  setStatus(`Updated position #${number}.`);
  renderMarkers();
});

copyBtn.addEventListener("click", () => {
  if (!isEditMode || selectedIndex === null) {
    return;
  }
  const source = positions[selectedIndex];
  if (!source) {
    setStatus("Select a valid position first.");
    return;
  }

  const copied = {
    number: source.number,
    title: source.title,
    note: source.note,
    x: offsetNearby(source.x, 3),
    y: offsetNearby(source.y, 3),
  };
  positions.push(copied);
  selectedIndex = positions.length - 1;
  populateEditor(copied);
  renderMarkers();
  syncEditorState();
  setStatus(`Copied #${source.number} nearby with the same details. Drag it to refine location.`);
});

deleteBtn.addEventListener("click", () => {
  if (!isEditMode || selectedIndex === null) {
    return;
  }

  const removed = positions[selectedIndex];
  positions.splice(selectedIndex, 1);
  selectedIndex = null;
  syncEditorState();
  clearEditorFields();
  renderMarkers();
  setStatus(`Deleted position #${removed.number}.`);
});

rephraseBtn.addEventListener("click", () => {
  const note = positionNote.value.trim();
  if (!note) {
    setStatus("Type a strategy note first, then click Rephrase Strategy.");
    return;
  }
  const polished = professionalizeStrategyText(note);
  positionNote.value = polished;
  applySelectedEditsFromForm();
  setStatus("Strategy note rephrased for clearer, professional wording.");
});

positionNumber.addEventListener("input", applySelectedEditsFromForm);
positionTitle.addEventListener("input", applySelectedEditsFromForm);
positionNote.addEventListener("input", applySelectedEditsFromForm);

document.addEventListener("keydown", (event) => {
  const isTypingField =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement;

  if (isTypingField) {
    return;
  }

  const step = event.shiftKey ? 1.5 : 0.35;
  let moved = false;

  switch (event.key) {
    case "ArrowUp":
      moved = nudgeSelectedPosition(0, -step);
      break;
    case "ArrowDown":
      moved = nudgeSelectedPosition(0, step);
      break;
    case "ArrowLeft":
      moved = nudgeSelectedPosition(-step, 0);
      break;
    case "ArrowRight":
      moved = nudgeSelectedPosition(step, 0);
      break;
    default:
      return;
  }

  if (moved) {
    event.preventDefault();
    setStatus(
      `Adjusted #${positions[selectedIndex].number} with keyboard arrows (${event.shiftKey ? "large" : "fine"} step).`
    );
  }
});

saveLayoutBtn.addEventListener("click", () => {
  if (positions.length === 0) {
    setStatus("Add at least one position before saving.");
    return;
  }

  const payload = buildLayoutPayload();
  const layouts = getSavedLayouts();
  layouts.push(payload);
  localStorage.setItem(savedLayoutsKey, JSON.stringify(layouts));
  updateSavedLayoutsInfo();
  refreshSavedLayoutOptions(payload.id);
  setStatus(
    `Saved layout "${payload.name}" with ${payload.positions.length} positions${
      shouldMirrorOnSave() ? " (mirrored)." : "."
    }`
  );
});

loadLayoutBtn.addEventListener("click", () => {
  const selectedId = savedLayoutSelect.value;
  if (!selectedId) {
    setStatus("No saved result selected.");
    return;
  }

  const layouts = getSavedLayouts();
  const selectedLayout = layouts.find(
    (layout, index) => getLayoutId(layout, index) === selectedId
  );

  if (!selectedLayout) {
    setStatus("Selected saved result was not found.");
    refreshSavedLayoutOptions();
    return;
  }

  loadLayoutIntoCourt(selectedLayout);
});

downloadLayoutBtn.addEventListener("click", () => {
  if (positions.length === 0) {
    setStatus("Add at least one position before downloading.");
    return;
  }

  const payload = buildLayoutPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = payload.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.href = url;
  link.download = `${safeName || "tennis-layout"}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`Downloaded layout JSON for "${payload.name}".`);
});

court.addEventListener("click", (event) => {
  if (!isEditMode) {
    return;
  }

  if (suppressNextCourtClick) {
    suppressNextCourtClick = false;
    return;
  }

  if (dragState?.moved) {
    dragState = null;
    return;
  }

  const { x, y } = toPercentPosition(event);

  if (isArrowMode) {
    setStatus("Arrow mode is active: press, drag, and release to draw.");
    return;
  }

  const number = Number(positionNumber.value);
  const title = positionTitle.value.trim();
  const note = positionNote.value.trim();

  if (!Number.isFinite(number) || number < 0) {
    setStatus("Please enter a valid number (0-99).");
    return;
  }

  positions.push({
    number,
    title,
    note,
    x,
    y,
  });

  const newIndex = positions.length - 1;
  selectedIndex = newIndex;
  selectedArrowIndex = null;
  populateEditor(positions[newIndex]);
  renderMarkers();
  syncEditorState();
  setStatus(`Position #${number} added and selected. Rephrase or edit, then click Save Selected Position.`);
});

closeDialogBtn.addEventListener("click", () => dialog.close());
court.addEventListener("mouseleave", hideHoverInfo);

dialog.addEventListener("click", (event) => {
  const dialogRect = dialog.getBoundingClientRect();
  const clickedInside =
    event.clientX >= dialogRect.left &&
    event.clientX <= dialogRect.right &&
    event.clientY >= dialogRect.top &&
    event.clientY <= dialogRect.bottom;
  if (!clickedInside) {
    dialog.close();
  }
});

renderMarkers();
syncEditorState();
updateSavedLayoutsInfo();
refreshSavedLayoutOptions();

async function initializeLayouts() {
  const initialLayouts = getSavedLayouts();
  if (initialLayouts.length > 0) {
    const latestLayout = initialLayouts[initialLayouts.length - 1];
    loadLayoutIntoCourt(latestLayout);
    refreshSavedLayoutOptions(getLayoutId(latestLayout, initialLayouts.length - 1));
  } else {
    loadPublishedLayoutFallback();
  }
}

initializeLayouts();
