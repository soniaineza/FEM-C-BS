// Metadata-only design review. Run with TYPESAFE_API_KEY in the environment.
// No source, account data, telemetry, or API credentials are sent in state.
const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error('TYPESAFE_API_KEY is required');
  process.exit(1);
}

const state = {
  product: 'Kimu Transport: a Rwanda ride-hailing app with separate rider and driver experiences in English, French, and Kinyarwanda.',
  goal: 'World-class, clean, minimal mobile interface. Riders must see nearby drivers on the map immediately; booking and safety actions stay easy to find. Drivers need clear offers, status, earnings, and account actions.',
  constraints: 'Expo SDK 57, React Native, Android and web. Green brand accent on white/light neutral surfaces. Existing map-focused Home has a compact persistent booking panel. Inter and Poppins font packages are already installed.',
  issues: 'Some account screens need clear request failure and retry states. Saved places must use a geocoded result. Long translated labels and short-phone layouts matter.',
};

const questions = {
  typography: {
    type: 'choice',
    instructions: 'Given the goal and constraints, which typography system best supports a clean, highly readable ride app across three languages?',
    criteria: {
      inter_ui: 'Use Inter consistently for controls, body text, headings, and numbers; keep the brand mark separate.',
      poppins_ui: 'Use Poppins consistently for controls, body text, headings, and numbers.',
      inter_body_poppins_heading: 'Use Inter for body and controls, Poppins for major headings and brand text.',
    },
  },
  home_action_hierarchy: {
    type: 'choice',
    instructions: 'Which Home composition best keeps nearby drivers visible while making booking clear at first glance?',
    criteria: {
      compact_persistent_panel: 'Full map with small always-visible pickup, destination, ride-type choice, and Find Ride panel.',
      search_only: 'Full map with destination search only; reveal pickup and ride choices after tapping search.',
      large_sheet: 'Map behind a half-height booking sheet containing all options immediately.',
    },
  },
  account_screen_states: {
    type: 'choice',
    instructions: 'When an account or earnings screen cannot load server data, which interaction best preserves trust and clarity?',
    criteria: {
      inline_retry: 'Show a concise inline error with a visible Retry action and keep navigation available.',
      empty_state: 'Show the usual empty state without mentioning the loading failure.',
      blocking_dialog: 'Show a modal error that blocks the screen until dismissed.',
    },
  },
  saved_place_entry: {
    type: 'choice',
    instructions: 'Which saved-place entry flow best ensures riders can later use it as a precise pickup?',
    criteria: {
      search_and_select: 'Search for an address, select a geocoded result, and save its coordinates with a custom name.',
      address_only: 'Let riders type any address string and save without checking map coordinates.',
      pin_only: 'Require a map pin without address search before the place can be saved.',
    },
  },
};

const response = await fetch('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'jev-latest', state, questions }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  console.error(`TypeSafe request failed with HTTP ${response.status}`);
  process.exit(1);
}
const result = await response.json();
console.log(JSON.stringify({ model: result.model, answers: result.answers, usage: result.usage }, null, 2));
