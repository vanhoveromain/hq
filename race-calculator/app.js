// Race Pace & Fuelling Calculator
// Step 1: skeleton only. Calculations are added in later steps.

// Grab the form once, so later steps can read its values.
const form = document.getElementById('race-form');

// Stop the form from reloading the page when "Calculate" is pressed.
// (A form's default behaviour is to send its data to a server and reload.)
form.addEventListener('submit', (event) => {
  event.preventDefault();
  // Calculation code comes in step 2.
});
