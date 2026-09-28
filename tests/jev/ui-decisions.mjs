// Run with TYPESAFE_API_KEY in the environment. This is a design review,
// not app runtime logic; it prints Jev's probabilities for human review.
const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error('TYPESAFE_API_KEY is required');
  process.exit(1);
}

const state = {
  goal: 'Riders should see nearby drivers directly on the home map. The interface should feel cleaner while pickup, destination, and Find Ride stay reachable on a 390x844 phone.',
  stack: 'Expo SDK 57, React Native 0.86, web and Android, MapLibre map, NativeWind, Reanimated 4, Gesture Handler 2.',
  current_design: 'Full-screen map with a floating greeting/driver-count card and a compact persistent booking panel above the tabs. The panel contains pickup, destination, a ride-type choice and a pinned Find Ride button.',
  alternatives: {
    persistent_compact_panel: 'Keep the current inline panel; the map remains visible on arrival and booking controls are always present.',
    search_only_overlay: 'Show only a floating destination search field on arrival; open booking controls after a tap.',
    large_modal_sheet: 'Use a half-screen modal bottom sheet over the map at launch, expanding for booking.',
  },
  library_facts: 'Expo UI SDK 57 bottom sheets are modal and do not support a persistent inline peek. Gorhom Bottom Sheet 5 has reported Reanimated 4 issues. The app already has NativeWind and Reanimated for compact inline controls.',
};

const questions = {
  home_layout: {
    type: 'choice',
    instructions: 'Which `alternatives` layout best meets the rider goal in `goal`, given `stack` and `library_facts`?',
    criteria: {
      persistent_compact_panel: 'Keep a visible small booking panel and a mostly exposed live driver map.',
      search_only_overlay: 'Prioritize maximum map space, requiring a tap to reach full booking controls.',
      large_modal_sheet: 'Present half-screen booking content immediately, covering more of the map.',
    },
  },
  ride_type_control: {
    type: 'choice',
    instructions: 'For the compact home booking panel in `current_design`, which ride-type control will make the interface easiest to scan and use?',
    criteria: {
      compact_radio_pills: 'Two 48px radio pills for Private and Share, plus one line explaining the selection.',
      full_feature_cards: 'Two tall cards with icons and several feature badges each.',
      separate_page: 'Move ride-type choice to a separate page after destination entry.',
    },
  },
};

const response = await fetch('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'jev-latest', state, questions }),
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) {
  console.error(`TypeSafe request failed with HTTP ${response.status}`);
  process.exit(1);
}
const result = await response.json();
console.log(JSON.stringify({ model: result.model, answers: result.answers, usage: result.usage }, null, 2));
