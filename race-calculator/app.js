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


// ============================================================
// 3. PAGE CODE
// ============================================================

const form = document.getElementById('race-form');
const messagesBox = document.getElementById('messages');
const resultsSection = document.getElementById('results');
const paceOutput = document.getElementById('pace-output');
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

// Show error messages, or clear them when the list is empty.
function showErrors(errors) {
  // Build one <li> per error. map() turns each message into HTML text,
  // join('') glues them together into one string.
  messagesBox.innerHTML = errors.length
    ? `<ul>${errors.map((error) => `<li>${error}</li>`).join('')}</ul>`
    : '';
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

  renderPace(inputs, calculatePace(inputs));
  resultsSection.hidden = false;
});

// "input" fires on every keystroke in any field of the form.
form.addEventListener('input', updateMixTotal);

// Show the correct total as soon as the page opens.
updateMixTotal();
