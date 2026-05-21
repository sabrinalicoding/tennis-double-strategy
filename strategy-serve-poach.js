const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const poachToggle = document.getElementById("poachToggle");
const phaseText = document.getElementById("phaseText");

const server = document.getElementById("server");
const you = document.getElementById("you");
const returner = document.getElementById("returner");
const oppNet = document.getElementById("oppNet");
const ball = document.getElementById("ball");

const serverLabel = document.getElementById("serverLabel");
const youLabel = document.getElementById("youLabel");
const returnerLabel = document.getElementById("returnerLabel");
const oppNetLabel = document.getElementById("oppNetLabel");
const marker0 = document.getElementById("marker0");
const marker1 = document.getElementById("marker1");
const marker4 = document.getElementById("marker4");
const label0 = document.getElementById("label0");
const label1 = document.getElementById("label1");
const label4 = document.getElementById("label4");

const anchor = {
  server: { x: 24.8, y: 71.8 },
  you4: { x: 10.6, y: 45.7 },
  you1: { x: 16.1, y: 41.9 },
  you0: { x: 9.8, y: 51.8 },
  returner: { x: 12.2, y: 6.8 },
  oppNet: { x: 26.4, y: 30.5 },
};
const savedLayoutsKey = "tennis-doubles-saved-layouts";
const savedLayoutViewBox = {
  minX: 0,
  minY: -8,
  width: 36,
  height: 94,
};

const rallyPoach = [
  {
    phase: "Partner serves/starts cross-court rally",
    duration: 0.95,
    from: "server",
    to: { x: 11.4, y: 12.3 },
    youRange: 0.2,
  },
  {
    phase: "Returner drives back cross-court",
    duration: 0.95,
    from: { x: 11.4, y: 12.3 },
    to: { x: 24.7, y: 68.6 },
    youRange: 0.45,
  },
  {
    phase: "Partner keeps rally cross-court",
    duration: 0.95,
    from: { x: 24.7, y: 68.6 },
    to: { x: 12.1, y: 14.8 },
    youRange: 0.58,
  },
  {
    phase: "Return not too angled: poach trigger",
    duration: 0.85,
    from: { x: 12.1, y: 14.8 },
    to: { x: 17.1, y: 47.3 },
    moveToPoach: true,
  },
  {
    phase: "Poach and finish: put-away winner",
    duration: 0.85,
    from: { x: 17.1, y: 47.3 },
    to: { x: 28.3, y: 9.7 },
    atPoach: true,
  },
];

const rallyNoPoach = [
  {
    phase: "Partner serves/starts cross-court rally",
    duration: 0.95,
    from: "server",
    to: { x: 11.4, y: 12.3 },
    youRange: 0.2,
  },
  {
    phase: "Returner drives back cross-court",
    duration: 0.95,
    from: { x: 11.4, y: 12.3 },
    to: { x: 24.7, y: 68.6 },
    youRange: 0.45,
  },
  {
    phase: "Partner keeps rally cross-court",
    duration: 0.95,
    from: { x: 24.7, y: 68.6 },
    to: { x: 12.1, y: 14.8 },
    youRange: 0.55,
  },
  {
    phase: "Return angle is big: hold your lane",
    duration: 0.95,
    from: { x: 12.1, y: 14.8 },
    to: { x: 8.8, y: 55.4 },
    youRange: 0.05,
  },
  {
    phase: "Rally continues cross-court",
    duration: 0.95,
    from: { x: 8.8, y: 55.4 },
    to: { x: 12.0, y: 16.4 },
    youRange: 0.35,
  },
];

let running = true;
let stepIndex = 0;
let elapsedInStep = 0;
let lastTs = 0;
const youPos = { x: anchor.you4.x, y: anchor.you4.y };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getPoint(value) {
  if (typeof value === "string") {
    return anchor[value];
  }
  return value;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function percentToScenePoint(position) {
  return {
    x: savedLayoutViewBox.minX + (position.x / 100) * savedLayoutViewBox.width,
    y: savedLayoutViewBox.minY + (position.y / 100) * savedLayoutViewBox.height,
  };
}

function chooseClosestPosition(layoutPositions, number, fallbackPoint) {
  const candidates = layoutPositions
    .filter(
      (position) =>
        Number(position.number) === number &&
        typeof position.x === "number" &&
        typeof position.y === "number"
    )
    .map((position) => percentToScenePoint(position));
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, current) =>
    distance(current, fallbackPoint) < distance(best, fallbackPoint) ? current : best
  );
}

function chooseTacticalFour(layoutPositions, fallbackPoint) {
  const allFours = layoutPositions
    .filter(
      (position) =>
        Number(position.number) === 4 &&
        typeof position.x === "number" &&
        typeof position.y === "number"
    )
    .map((position) => percentToScenePoint(position));
  if (allFours.length === 0) {
    return null;
  }
  // Prefer left-half 4 if present for this scenario orientation.
  const centerX = savedLayoutViewBox.minX + savedLayoutViewBox.width / 2;
  const leftSide = allFours.filter((position) => position.x <= centerX);
  const pool = leftSide.length > 0 ? leftSide : allFours;
  return pool.reduce((best, current) =>
    distance(current, fallbackPoint) < distance(best, fallbackPoint) ? current : best
  );
}

function chooseTacticalOne(layoutPositions, fallbackPoint, chosenFour) {
  const allOnes = layoutPositions
    .filter(
      (position) =>
        Number(position.number) === 1 &&
        typeof position.x === "number" &&
        typeof position.y === "number"
    )
    .map((position) => percentToScenePoint(position));
  if (allOnes.length === 0) {
    return null;
  }

  const centerX = savedLayoutViewBox.minX + savedLayoutViewBox.width / 2;
  // Keep 1 on the same side as selected 4 when possible.
  const sameSide = chosenFour
    ? allOnes.filter((position) => (position.x - centerX) * (chosenFour.x - centerX) >= 0)
    : allOnes;

  // Prefer poach-forward 1 (closer to net than 4) if available.
  const forward = chosenFour
    ? sameSide.filter((position) => position.y <= chosenFour.y + 0.8)
    : sameSide;

  const pool = forward.length > 0 ? forward : sameSide.length > 0 ? sameSide : allOnes;
  return pool.reduce((best, current) =>
    distance(current, fallbackPoint) < distance(best, fallbackPoint) ? current : best
  );
}

function applyScenarioPositionsFromSavedLayout() {
  const raw = localStorage.getItem(savedLayoutsKey);
  if (!raw) {
    return;
  }

  let layouts;
  try {
    layouts = JSON.parse(raw);
  } catch {
    return;
  }

  if (!Array.isArray(layouts) || layouts.length === 0) {
    return;
  }

  const latest = layouts[layouts.length - 1];
  if (!latest || !Array.isArray(latest.positions)) {
    return;
  }

  const p0 = chooseClosestPosition(latest.positions, 0, anchor.you0);
  const p4 = chooseTacticalFour(latest.positions, anchor.you4);
  const p1 = chooseTacticalOne(latest.positions, anchor.you1, p4);

  if (p0) {
    anchor.you0 = { x: p0.x, y: p0.y };
  }
  if (p4) {
    anchor.you4 = { x: p4.x, y: p4.y };
  }
  if (p1) {
    anchor.you1 = { x: p1.x, y: p1.y };
  }
}

function renderTacticalMarkers() {
  marker0.setAttribute("cx", String(anchor.you0.x));
  marker0.setAttribute("cy", String(anchor.you0.y));
  marker4.setAttribute("cx", String(anchor.you4.x));
  marker4.setAttribute("cy", String(anchor.you4.y));
  marker1.setAttribute("cx", String(anchor.you1.x));
  marker1.setAttribute("cy", String(anchor.you1.y));

  label0.setAttribute("x", String(anchor.you0.x));
  label0.setAttribute("y", String(anchor.you0.y));
  label4.setAttribute("x", String(anchor.you4.x));
  label4.setAttribute("y", String(anchor.you4.y));
  label1.setAttribute("x", String(anchor.you1.x));
  label1.setAttribute("y", String(anchor.you1.y));
}

function setNode(node, x, y) {
  if (node.tagName.toLowerCase() === "g") {
    node.setAttribute("transform", `translate(${x} ${y})`);
    return;
  }
  node.setAttribute("cx", String(x));
  node.setAttribute("cy", String(y));
}

function setLabel(node, x, y) {
  node.setAttribute("x", String(x + 1.1));
  node.setAttribute("y", String(y - 1.2));
}

function resetPlayers() {
  setNode(server, anchor.server.x, anchor.server.y);
  youPos.x = anchor.you4.x;
  youPos.y = anchor.you4.y;
  setNode(you, youPos.x, youPos.y);
  setNode(returner, anchor.returner.x, anchor.returner.y);
  setNode(oppNet, anchor.oppNet.x, anchor.oppNet.y);
  setNode(ball, anchor.server.x, anchor.server.y);

  setLabel(serverLabel, anchor.server.x, anchor.server.y);
  setLabel(youLabel, youPos.x, youPos.y);
  setLabel(returnerLabel, anchor.returner.x, anchor.returner.y);
  setLabel(oppNetLabel, anchor.oppNet.x, anchor.oppNet.y);
}

function updateFrame(dt) {
  const flow = poachToggle.checked ? rallyPoach : rallyNoPoach;
  const step = flow[stepIndex % flow.length];
  elapsedInStep += dt;
  const progress = Math.min(1, elapsedInStep / step.duration);

  const from = getPoint(step.from);
  const to = getPoint(step.to);
  const bx = lerp(from.x, to.x, progress);
  const by = lerp(from.y, to.y, progress);
  setNode(ball, bx, by);

  let targetX = anchor.you4.x;
  let targetY = anchor.you4.y;

  if (step.moveToPoach) {
    targetX = lerp(anchor.you4.x, anchor.you1.x, progress);
    targetY = lerp(anchor.you4.y, anchor.you1.y, progress);
  } else if (step.atPoach) {
    targetX = anchor.you1.x;
    targetY = anchor.you1.y;
  } else {
    const movingTowardPartner = to.y > from.y;
    // Rule: if ball is going to partner and has passed you, recover to 0.
    if (movingTowardPartner && by >= youPos.y + 0.15) {
      targetX = anchor.you0.x;
      targetY = anchor.you0.y;
    } else {
      // Otherwise hold/shift up to 4 as the active net pressure position.
      targetX = anchor.you4.x;
      targetY = anchor.you4.y;
    }
  }

  // Smoothly track between 0 and 4 (or to 1 on poach chance).
  youPos.x = lerp(youPos.x, targetX, 0.22);
  youPos.y = lerp(youPos.y, targetY, 0.22);
  setNode(you, youPos.x, youPos.y);
  setLabel(youLabel, youPos.x, youPos.y);

  phaseText.textContent = step.phase;

  if (progress >= 1) {
    stepIndex += 1;
    elapsedInStep = 0;
  }
}

function tick(ts) {
  if (!lastTs) {
    lastTs = ts;
  }
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;

  if (running) {
    updateFrame(Math.min(dt, 0.05));
  }
  requestAnimationFrame(tick);
}

playPauseBtn.addEventListener("click", () => {
  running = !running;
  playPauseBtn.textContent = running ? "Pause" : "Play";
});

resetBtn.addEventListener("click", () => {
  stepIndex = 0;
  elapsedInStep = 0;
  resetPlayers();
  phaseText.textContent = "Reset complete: rally restarts.";
});

poachToggle.addEventListener("change", () => {
  stepIndex = 0;
  elapsedInStep = 0;
  phaseText.textContent = poachToggle.checked
    ? "Poach enabled: jump when return angle is manageable."
    : "Poach disabled: hold 0/4 lane on wide returns.";
});

resetPlayers();
applyScenarioPositionsFromSavedLayout();
renderTacticalMarkers();
resetPlayers();
phaseText.textContent = "Live simulation: serve flow in progress.";
requestAnimationFrame(tick);
