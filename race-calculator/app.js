// Race Pace & Fuelling Calculator
// ------------------------------------------------------------
// The file is split in three parts:
//   1. Time helpers     – convert between seconds and "h:mm:ss"
//   2. Calculations     – pure maths, no knowledge of the page
//   3. Page code        – read the form, show results and errors
// ------------------------------------------------------------


// ============================================================
// 1. TIME HELPERS
// ============================================================

// Turn hours, minutes and seconds into one number of seconds.
// Working in seconds everywhere keeps the maths simple.
function toSeconds(hours, minutes, seconds) {
  return hours * 3600 + minutes * 60 + seconds;
}

// Add a leading zero to single digits: 7 -> "07".
function pad2(number) {
  return String(number).padStart(2, '0');
}

// Format seconds as "h:mm:ss" (e.g. 12600 -> "3:30:00").
function formatDuration(totalSeconds) {
  // Round first, then split. Rounding after splitting can give
  // impossible results like "4:60" when seconds = 59.6.
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60); // % = remainder after division
  const seconds = rounded % 60;
  return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
}

// Format a pace in seconds per km as "m:ss /km" (e.g. 298.6 -> "4:59 /km").
function formatPace(secondsPerKm) {
  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${pad2(seconds)} /km`;
}

// Turn a time-of-day "HH:MM" (from <input type="time">) into seconds after midnight.
// Returns null when the field is empty, meaning "no start time given".
function clockToSeconds(clockText) {
  if (clockText === '') return null;
  // split(':') cuts "07:30" into ["07", "30"]; map(Number) turns them into numbers.
  const [hours, minutes] = clockText.split(':').map(Number);
  return toSeconds(hours, minutes, 0);
}

// Format seconds after midnight as a clock time "HH:MM".
// Races can run past midnight, so we also return how many days later it is.
function formatClock(secondsAfterMidnight) {
  const secondsPerDay = 24 * 3600;
  const rounded = Math.round(secondsAfterMidnight);
  const dayOffset = Math.floor(rounded / secondsPerDay);
  const timeOfDay = rounded % secondsPerDay; // wrap back into 0:00–23:59
  const text = `${pad2(Math.floor(timeOfDay / 3600))}:${pad2(Math.floor((timeOfDay % 3600) / 60))}`;
  return dayOffset > 0 ? `${text} (+${dayOffset}d)` : text;
}

// Show a distance without useless decimals: 5 -> "5", 2.5 -> "2.5", 42.195 -> "42.2".
function formatKm(km) {
  // toFixed(1) gives text like "5.0"; Number() then String drops the ".0".
  return String(Number(km.toFixed(1)));
}


// ============================================================
// 2. CALCULATIONS
// ============================================================

// Average pace and flat-equivalent pace.
// Flat-equivalent distance = distance + (D+ / 100) × factor.
// Example: 42 km, 1500 m D+, factor 1 -> 42 + 15 = 57 flat km.
function calculatePace(inputs) {
  const flatEquivalentKm =
    inputs.distance + (inputs.elevation / 100) * inputs.elevationFactor;

  return {
    averagePace: inputs.targetSeconds / inputs.distance,
    flatEquivalentKm: flatEquivalentKm,
    flatEquivalentPace: inputs.targetSeconds / flatEquivalentKm,
  };
}


// Split table: one row every `interval` km, plus a final row at the finish.
// Assumes even pace (we don't know where the climbs are yet).
function calculateSplits(distance, interval, averagePace) {
  const splits = [];

  // Multiply (i × interval) instead of adding interval again and again:
  // repeated adding of decimals slowly builds up rounding errors (0.1 + 0.2 = 0.30000000000000004).
  // The small 0.001 margin avoids a duplicate row when the distance is an exact multiple.
  for (let i = 1; i * interval < distance - 0.001; i++) {
    const km = i * interval;
    splits.push({ km: km, elapsed: km * averagePace, isFinish: false });
  }

  splits.push({ km: distance, elapsed: distance * averagePace, isFinish: true });
  return splits;
}

// The four fuel types. `isSolid` drives the long-race rule.
// Keeping them in one list means the rest of the code just loops over it.
const FUEL_ITEMS = [
  { key: 'compote', label: 'Compote', isSolid: false },
  { key: 'gel', label: 'Gel', isSolid: false },
  { key: 'bar', label: 'Energy bar', isSolid: true },
  { key: 'candy', label: 'Candy', isSolid: true },
];

// Build the fuelling timeline, packing counts and summary figures.
// All times here are in seconds since the race start.
function calculateFuelPlan(inputs, averagePace) {
  const raceSeconds = inputs.targetSeconds;
  const isLongRace = raceSeconds > inputs.longRaceThreshold * 3600;
  const solidsFromSeconds = inputs.solidsFrom * 60;
  const lastAllowedSeconds = raceSeconds - inputs.noFuelEnd * 60;
  const intervalSeconds = inputs.fuelInterval * 60;
  const gramsPerStop = inputs.carbsPerHour * inputs.fuelInterval / 60;

  const usedItems = inputs.mix.filter((item) => item.pct > 0);

  // "Credit" per item: how far behind its share each item is.
  // Every stop, each item earns its % as credit. The eligible item with the most credit
  // gets the stop and pays 100 back. Over time each item gets its % of the stops,
  // spread out evenly instead of grouped.
  const credit = {};
  usedItems.forEach((item) => { credit[item.key] = 0; });

  const fuelStops = [];
  let skippedStops = 0;

  for (let i = 0; ; i++) {
    const time = inputs.firstFuel * 60 + i * intervalSeconds;
    if (time > lastAllowedSeconds) break; // no fuel in the last X minutes

    // Long-race rule: before "solids allowed from", only liquid/semi-liquid items qualify.
    const solidsBlocked = isLongRace && time < solidsFromSeconds;
    const eligible = usedItems.filter((item) => !(solidsBlocked && item.isSolid));

    if (eligible.length === 0) {
      skippedStops++; // nothing allowed at this stop (e.g. only solids in the mix)
      continue;
    }

    usedItems.forEach((item) => { credit[item.key] += item.pct; });

    // Pick the eligible item with the highest credit (first in the list wins a tie).
    let chosen = eligible[0];
    eligible.forEach((item) => {
      if (credit[item.key] > credit[chosen.key]) chosen = item;
    });
    credit[chosen.key] -= 100;

    // Whole items closest to the target, but always at least 1.
    const quantity = Math.max(1, Math.round(gramsPerStop / chosen.carbs));

    fuelStops.push({
      time: time,
      item: chosen,
      quantity: quantity,
      grams: quantity * chosen.carbs,
    });
  }

  // Electrolyte reminders: every X minutes, also not in the last X minutes.
  const electrolyteTimes = [];
  if (inputs.electrolyteInterval > 0) {
    const step = inputs.electrolyteInterval * 60;
    for (let time = step; time <= lastAllowedSeconds; time += step) {
      electrolyteTimes.push(time);
    }
  }

  // Merge fuel stops and electrolyte reminders into one timeline.
  // When both happen at the same minute, they share one row.
  const rowsByTime = {};
  const rowAt = (time) => {
    if (!rowsByTime[time]) {
      rowsByTime[time] = { time: time, km: time / averagePace, fuel: null, electrolyte: false };
    }
    return rowsByTime[time];
  };
  fuelStops.forEach((stop) => { rowAt(stop.time).fuel = stop; });
  electrolyteTimes.forEach((time) => { rowAt(time).electrolyte = true; });

  // Object.values() turns the object into a list; sort() orders it by time.
  // The compare function returns a negative number when a should come before b.
  const timeline = Object.values(rowsByTime).sort((a, b) => a.time - b.time);

  // Packing counts and mix check per item.
  const packing = usedItems.map((item) => {
    const stopsForItem = fuelStops.filter((stop) => stop.item.key === item.key);
    return {
      item: item,
      quantity: stopsForItem.reduce((sum, stop) => sum + stop.quantity, 0),
      actualPct: fuelStops.length ? (stopsForItem.length / fuelStops.length) * 100 : 0,
    };
  });

  const fuelGrams = fuelStops.reduce((sum, stop) => sum + stop.grams, 0);
  const tabletCount = electrolyteTimes.length;
  const tabletGrams = tabletCount * inputs.electrolyteCarbs;

  // Carbs per hour at your rhythm: average grams per stop, scaled to one hour,
  // plus electrolyte carbs at their own rhythm. This is the figure to compare with the target.
  const gramsPerStopActual = fuelStops.length ? fuelGrams / fuelStops.length : 0;
  let rhythmPerHour = gramsPerStopActual * (60 / inputs.fuelInterval);
  if (inputs.electrolyteInterval > 0) {
    rhythmPerHour += inputs.electrolyteCarbs * (60 / inputs.electrolyteInterval);
  }

  return {
    isLongRace: isLongRace,
    gramsPerStop: gramsPerStop,
    timeline: timeline,
    packing: packing,
    tabletCount: tabletCount,
    skippedStops: skippedStops,
    fuelStopCount: fuelStops.length,
    totalGrams: fuelGrams + tabletGrams,
    wholeRacePerHour: (fuelGrams + tabletGrams) / (raceSeconds / 3600),
    rhythmPerHour: rhythmPerHour,
  };
}


// ============================================================
// 3. PAGE CODE
// ============================================================

const form = document.getElementById('race-form');
const messagesBox = document.getElementById('messages');
const resultsSection = document.getElementById('results');
const paceOutput = document.getElementById('pace-output');
const splitsOutput = document.getElementById('splits-output');
const fuelOutput = document.getElementById('fuel-output');
const packingOutput = document.getElementById('packing-output');
const mixTotalCell = document.getElementById('mix-total');

// Read one form field as a number.
// form.elements.distance finds the input with name="distance".
// An empty field gives NaN ("Not a Number"), which validation catches.
function readNumber(name) {
  const value = form.elements[name].value.trim();
  return value === '' ? NaN : Number(value);
}

// Collect every input we need into one object.
function readInputs() {
  const targetH = readNumber('targetH');
  const targetM = readNumber('targetM');
  const targetS = readNumber('targetS');

  return {
    distance: readNumber('distance'),
    elevation: readNumber('elevation'),
    elevationFactor: readNumber('elevationFactor'),
    targetH: targetH,
    targetM: targetM,
    targetS: targetS,
    targetSeconds: toSeconds(targetH, targetM, targetS),
    splitInterval: readNumber('splitInterval'),
    // Seconds after midnight, or null when no start time is given.
    startClock: clockToSeconds(form.elements.startTime.value),

    // Fuelling
    carbsPerHour: readNumber('carbsPerHour'),
    fuelInterval: readNumber('fuelInterval'),
    electrolyteInterval: readNumber('electrolyteInterval'),
    electrolyteCarbs: readNumber('electrolyteCarbs'),
    firstFuel: readNumber('firstFuel'),
    noFuelEnd: readNumber('noFuelEnd'),
    longRaceThreshold: readNumber('longRaceThreshold'),
    solidsFrom: readNumber('solidsFrom'),
    // One entry per fuel type. "...item" (spread syntax) copies key, label and isSolid,
    // then we add the two values typed in the form.
    mix: FUEL_ITEMS.map((item) => ({
      ...item,
      pct: readNumber(`${item.key}Pct`),
      carbs: readNumber(`${item.key}Carbs`),
    })),
  };
}

// Check the inputs and return a list of problems (empty list = all good).
function validate(inputs) {
  const errors = [];

  if (!(inputs.distance > 0)) {
    errors.push('Distance must be more than 0 km.');
  }
  if (!(inputs.elevation >= 0)) {
    errors.push('Elevation gain must be 0 or more.');
  }
  if (!(inputs.elevationFactor >= 0)) {
    errors.push('Elevation adjustment must be 0 or more.');
  }
  if (!(inputs.splitInterval > 0)) {
    errors.push('Split interval must be more than 0 km.');
  }

  // Number.isInteger rejects decimals and NaN in one go.
  const timeIsValid =
    Number.isInteger(inputs.targetH) && inputs.targetH >= 0 &&
    Number.isInteger(inputs.targetM) && inputs.targetM >= 0 && inputs.targetM <= 59 &&
    Number.isInteger(inputs.targetS) && inputs.targetS >= 0 && inputs.targetS <= 59;

  if (!timeIsValid) {
    errors.push('Target time: use whole numbers, minutes and seconds between 0 and 59.');
  } else if (inputs.targetSeconds === 0) {
    errors.push('Target time must be more than 0.');
  }

  return errors;
}

// Fuelling checks are separate: a bad fuel input hides only the fuel plan,
// pace and splits still show.
function validateFuel(inputs) {
  const errors = [];

  if (!(inputs.carbsPerHour > 0)) errors.push('Carbs per hour must be more than 0.');
  if (!(inputs.fuelInterval > 0)) errors.push('Fuel stop interval must be more than 0 min.');
  if (!(inputs.electrolyteInterval >= 0)) errors.push('Electrolyte interval must be 0 or more.');
  if (!(inputs.electrolyteCarbs >= 0)) errors.push('Carbs per electrolyte tablet must be 0 or more.');
  if (!(inputs.firstFuel >= 0)) errors.push('First fuel stop must be 0 min or more.');
  if (!(inputs.noFuelEnd >= 0)) errors.push('"No fuel in the last" must be 0 min or more.');
  if (!(inputs.longRaceThreshold >= 0)) errors.push('Long race threshold must be 0 h or more.');
  if (!(inputs.solidsFrom >= 0)) errors.push('"Solids allowed from" must be 0 min or more.');

  let totalPct = 0;
  inputs.mix.forEach((item) => {
    if (!(item.pct >= 0)) {
      errors.push(`${item.label}: % must be 0 or more.`);
    } else {
      totalPct += item.pct;
      if (item.pct > 0 && !(item.carbs > 0)) {
        errors.push(`${item.label}: carbs per item must be more than 0.`);
      }
    }
  });
  if (totalPct !== 100) {
    errors.push(`Fuel mix adds up to ${totalPct}%, it must be 100%.`);
  }

  return errors;
}

// Turn a list of messages into an HTML <ul>.
// map() turns each message into HTML text, join('') glues them into one string.
function listHtml(messages) {
  return `<ul>${messages.map((message) => `<li>${message}</li>`).join('')}</ul>`;
}

// Show error messages, or clear them when the list is empty.
function showErrors(errors) {
  messagesBox.innerHTML = errors.length ? listHtml(errors) : '';
}

function renderPace(inputs, pace) {
  // A <dl> (description list) is the HTML element for label/value pairs.
  paceOutput.innerHTML = `
    <dl class="stats">
      <div>
        <dt>Average pace</dt>
        <dd>${formatPace(pace.averagePace)}</dd>
      </div>
      <div>
        <dt>Flat-equivalent pace</dt>
        <dd>${formatPace(pace.flatEquivalentPace)}</dd>
      </div>
      <div>
        <dt>Flat-equivalent distance</dt>
        <dd>${pace.flatEquivalentKm.toFixed(1)} km</dd>
      </div>
      <div>
        <dt>Target time</dt>
        <dd>${formatDuration(inputs.targetSeconds)}</dd>
      </div>
    </dl>`;
}

function renderSplits(inputs, splits) {
  const hasClock = inputs.startClock !== null;

  // Build one table row per split.
  const rows = splits.map((split) => {
    const label = split.isFinish ? `Finish (${formatKm(split.km)})` : formatKm(split.km);
    const clockCell = hasClock
      ? `<td>${formatClock(inputs.startClock + split.elapsed)}</td>`
      : '';
    return `
      <tr${split.isFinish ? ' class="finish"' : ''}>
        <th scope="row">${label}</th>
        <td>${formatDuration(split.elapsed)}</td>
        ${clockCell}
      </tr>`;
  }).join('');

  // The wrapper lets the table scroll sideways on its own if it ever gets too wide,
  // instead of making the whole page scroll.
  splitsOutput.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">km</th>
            <th scope="col">Elapsed</th>
            ${hasClock ? '<th scope="col">Clock</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hint">Even pace assumed: on hilly courses, real splits will be slower on climbs and faster on descents.</p>`;
}

function renderFuel(inputs, plan) {
  const hasClock = inputs.startClock !== null;

  // Warnings: things the plan could not do exactly as asked.
  const warnings = [];
  plan.packing.forEach((line) => {
    if (line.quantity === 0) {
      warnings.push(`${line.item.label}: asked ${line.item.pct}% but no stop got it (too few stops, or solids not allowed yet).`);
    }
  });
  if (plan.skippedStops > 0) {
    warnings.push(`${plan.skippedStops} stop(s) skipped: only solids in the mix, and solids are not allowed yet.`);
  }
  if (plan.fuelStopCount === 0) {
    warnings.push('No fuel stops fit in this race with the current settings.');
  }

  const rows = plan.timeline.map((row) => {
    const take = [];
    if (row.fuel) {
      take.push(`${row.fuel.quantity} × ${row.fuel.item.label} <span class="muted">(${row.fuel.grams} g)</span>`);
    }
    if (row.electrolyte) {
      take.push('Electrolyte tablet');
    }
    return `
      <tr>
        <th scope="row">${formatDuration(row.time)}</th>
        <td>${row.km.toFixed(1)}</td>
        ${hasClock ? `<td>${formatClock(inputs.startClock + row.time)}</td>` : ''}
        <td>${take.join('<br>')}</td>
      </tr>`;
  }).join('');

  const longRaceNote = plan.isLongRace
    ? `<p class="hint">Long race (over ${inputs.longRaceThreshold} h): only compote and gel before ${formatDuration(inputs.solidsFrom * 60)}.</p>`
    : '';

  fuelOutput.innerHTML = `
    <dl class="stats">
      <div>
        <dt>Target per stop</dt>
        <dd>${Math.round(plan.gramsPerStop)} g</dd>
      </div>
      <div>
        <dt>Total carbs</dt>
        <dd>${Math.round(plan.totalGrams)} g</dd>
      </div>
      <div>
        <dt>Carbs/h at your rhythm <span class="muted">(target ${inputs.carbsPerHour})</span></dt>
        <dd>${Math.round(plan.rhythmPerHour)} g/h</dd>
      </div>
      <div>
        <dt>Carbs/h over the whole race</dt>
        <dd>${Math.round(plan.wholeRacePerHour)} g/h</dd>
      </div>
    </dl>
    <p class="hint">"Whole race" is lower because nothing is taken before the first stop or in the last ${inputs.noFuelEnd} min.</p>
    ${longRaceNote}
    ${warnings.length ? `<div class="warning">${listHtml(warnings)}</div>` : ''}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">~km</th>
            ${hasClock ? '<th scope="col">Clock</th>' : ''}
            <th scope="col">Take</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderPacking(plan) {
  const rows = plan.packing.map((line) => `
    <tr>
      <th scope="row">${line.item.label}</th>
      <td>${line.quantity}</td>
      <td>${line.item.pct}%</td>
      <td>${Math.round(line.actualPct)}%</td>
    </tr>`).join('');

  const tabletRow = plan.tabletCount > 0
    ? `<tr><th scope="row">Electrolyte tablet</th><td>${plan.tabletCount}</td><td>–</td><td>–</td></tr>`
    : '';

  packingOutput.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
            <th scope="col">Asked</th>
            <th scope="col">Actual</th>
          </tr>
        </thead>
        <tbody>${rows}${tabletRow}</tbody>
      </table>
    </div>
    <p class="hint">Asked/Actual = share of fuel stops. With few stops, rounding makes them differ.</p>`;
}

// Show fuel errors inside the fuelling section and clear the packing list.
function renderFuelErrors(errors) {
  fuelOutput.innerHTML = `<div class="messages">${listHtml(errors)}</div>`;
  packingOutput.innerHTML = '<p class="hint">Fix the fuelling inputs above to see the packing list.</p>';
}

// Live total for the fuel mix percentages.
function updateMixTotal() {
  const names = ['compotePct', 'gelPct', 'barPct', 'candyPct'];
  // reduce() walks through the list and keeps a running total.
  // "|| 0" treats an empty box as 0 while typing.
  const total = names.reduce((sum, name) => sum + (readNumber(name) || 0), 0);

  mixTotalCell.textContent = `${total}%`;
  // classList.toggle adds the class when the condition is true, removes it otherwise.
  mixTotalCell.classList.toggle('is-wrong', total !== 100);
}

// "submit" fires when Calculate is pressed (or Enter in a field).
form.addEventListener('submit', (event) => {
  event.preventDefault(); // stop the page from reloading

  const inputs = readInputs();
  const errors = validate(inputs);
  showErrors(errors);

  if (errors.length > 0) {
    resultsSection.hidden = true;
    return; // stop here: no results with bad inputs
  }

  const pace = calculatePace(inputs);
  renderPace(inputs, pace);
  renderSplits(inputs, calculateSplits(inputs.distance, inputs.splitInterval, pace.averagePace));

  const fuelErrors = validateFuel(inputs);
  if (fuelErrors.length > 0) {
    renderFuelErrors(fuelErrors);
  } else {
    const plan = calculateFuelPlan(inputs, pace.averagePace);
    renderFuel(inputs, plan);
    renderPacking(plan);
  }

  resultsSection.hidden = false;
});

// "input" fires on every keystroke in any field of the form.
form.addEventListener('input', updateMixTotal);

// Show the correct total as soon as the page opens.
updateMixTotal();
