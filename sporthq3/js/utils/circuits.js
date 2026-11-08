// circuits.js — groups of exercises done together, round after round (step 38).
//
// Example: 3 × (10 push-ups / 60 s gainage). In the exercise list, each line
// of a circuit carries the same `block` number and the circuit's `rounds`:
//   { name: "Push-ups", reps: "10",  block: 1, rounds: 3 }
//   { name: "Gainage",  reps: "60s", block: 1, rounds: 3 }
//   { name: "Squat", sets: 3, reps: "10" }          <- a normal exercise
// Lines of one circuit always sit next to each other.
//
// Older recipes have one `rounds` for the WHOLE session (the whole list is
// a circuit). withCircuits() turns that into one circuit, so new code only
// has to know about circuits.

// Lines of the same circuit: next to each other, same block number.
function sameCircuit(a, b) {
  return a && b && a.block != null && a.block === b.block;
}

// Is this line part of a circuit?
export function inCircuit(line) {
  return line && line.block != null && Number(line.rounds) > 0;
}

// The list cut into groups, in order:
//   [{ circuit: true, rounds: 3, indexes: [0, 1] }, { circuit: false, indexes: [2] }]
export function groupLines(lines) {
  const groups = [];
  lines.forEach((line, i) => {
    const last = groups[groups.length - 1];
    if (last && last.circuit && sameCircuit(lines[i - 1], line)) {
      last.indexes.push(i);
    } else if (inCircuit(line)) {
      groups.push({ circuit: true, rounds: Number(line.rounds), indexes: [i] });
    } else {
      groups.push({ circuit: false, indexes: [i] });
    }
  });
  return groups;
}

// The group (see groupLines) that holds line `index`.
export function groupOf(lines, index) {
  return groupLines(lines).find((g) => g.indexes.includes(index)) || null;
}

// A session's exercise lines, with an old session-wide `rounds` turned into
// one circuit. (One exercise with rounds = just that many sets.)
export function withCircuits(details) {
  const lines = ((details && details.exercises) || []).map((e) => ({ ...e }));
  const rounds = details && details.rounds;
  if (!rounds || lines.some(inCircuit)) return lines;
  if (lines.length === 1) {
    lines[0].sets = rounds;
    return lines;
  }
  return lines.map((e) => {
    const { sets, ...rest } = e; // in a circuit, rounds decide
    return { ...rest, block: 1, rounds };
  });
}

// How many sets the session has (a circuit line counts once per round).
export function totalSets(details) {
  return withCircuits(details).reduce(
    (sum, e) => sum + (inCircuit(e) ? Number(e.rounds) : Number(e.sets) || 0), 0);
}

// How many circuits the session has.
export function circuitCount(details) {
  return groupLines(withCircuits(details)).filter((g) => g.circuit).length;
}
